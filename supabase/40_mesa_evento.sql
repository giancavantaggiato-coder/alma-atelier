-- 40: Quem leva o quê (16/11/2026)
-- Em eventos com "divisao_mesa", cada inscrito escolhe uma categoria (salgado, doce ou vinho) e diz o que leva.
-- As vagas vêm do número de inscritos dividido por três; a sobra vai primeiro para salgado, depois doce.
-- Quem ainda não se inscreveu só pode escolher a categoria que está faltando (a de menos gente) e, ao escolher,
-- já fica inscrito. A equipe pode definir ou tirar a escolha de qualquer inscrito.

alter table public.eventos add column if not exists divisao_mesa boolean not null default false;

create table if not exists public.evento_mesa (
  evento_id     uuid not null,
  pessoa_id     uuid not null,
  categoria     text not null check (categoria in ('salgado','doce','vinho')),
  item          text not null check (char_length(trim(item)) between 1 and 120),
  atualizado_em timestamptz not null default now(),
  primary key (evento_id, pessoa_id),
  foreign key (evento_id, pessoa_id) references public.inscricoes (evento_id, pessoa_id) on delete cascade
);
alter table public.evento_mesa enable row level security;   -- acesso só pelas funções abaixo
revoke all on public.evento_mesa from anon, authenticated;

-- vagas de uma categoria para n inscritos
create or replace function public.mesa_limite(p_n int, p_cat text) returns int
language sql immutable as $$
  select p_n / 3 + case when p_cat = 'salgado' and p_n % 3 >= 1 then 1
                        when p_cat = 'doce'    and p_n % 3 >= 2 then 1 else 0 end
$$;

-- estado da divisão: categorias, vagas, quem leva o quê e a minha escolha
create or replace function public.mesa_evento(p_evento uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_inscrito_id(); v_n int; v_insc boolean; v_min int; r json;
begin
  if not (v_eu is not null or public.meu_visitante_id() is not null or public.sou_equipe()) then return null; end if;
  if not exists (select 1 from public.eventos where id = p_evento and divisao_mesa and (publicado or public.sou_equipe())) then return null; end if;
  select count(*) into v_n from public.inscricoes where evento_id = p_evento and not public.eh_fantasma(pessoa_id);
  v_insc := exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu);
  select min(t) into v_min from (
    select (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = c and not public.eh_fantasma(m.pessoa_id)) t
      from unnest(array['salgado','doce','vinho']) c) z;
  select json_build_object(
    'inscritos', v_n,
    'inscrito', v_insc,
    'categorias', (select json_agg(json_build_object('k', c.k, 'total', c.t, 'limite', public.mesa_limite(v_n, c.k),
                      'aberta', case when v_insc then c.t_sem_eu < public.mesa_limite(v_n, c.k) else c.t = v_min end) order by c.o)
                     from (select k, o,
                             (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = k and not public.eh_fantasma(m.pessoa_id)) t,
                             (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = k and not public.eh_fantasma(m.pessoa_id) and m.pessoa_id is distinct from v_eu) t_sem_eu
                             from unnest(array['salgado','doce','vinho']) with ordinality as u(k, o)) c),
    'itens', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p), 'avatar_url', p.avatar_url,
                      'categoria', m.categoria, 'item', m.item, 'sou_eu', p.id = v_eu) order by m.atualizado_em)
                     from public.evento_mesa m join public.pessoas p on p.id = m.pessoa_id
                    where m.evento_id = p_evento and (not p.fantasma or p.id = v_eu)), '[]'::json),
    'faltam', case when public.sou_equipe() then coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p)) order by i.criado_em)
                     from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma
                    where i.evento_id = p_evento and not exists (select 1 from public.evento_mesa m where m.evento_id = p_evento and m.pessoa_id = p.id)), '[]'::json) end,
    'minha', (select json_build_object('categoria', categoria, 'item', item) from public.evento_mesa where evento_id = p_evento and pessoa_id = v_eu)
  ) into r;
  return r;
end $$;

create or replace function public.escolher_mesa(p_evento uuid, p_categoria text, p_item text)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_inscrito_id(); v_n int; v_t int; v_min int; e public.eventos;
begin
  if v_eu is null then raise exception 'Cadastro não encontrado'; end if;
  p_item := trim(coalesce(p_item, ''));
  if p_item = '' then raise exception 'Diga o que vai levar'; end if;
  if char_length(p_item) > 120 then raise exception 'Escreva em até 120 caracteres'; end if;
  if p_categoria not in ('salgado','doce','vinho') then raise exception 'Escolha salgado, doce ou vinho'; end if;
  select * into e from public.eventos where id = p_evento and publicado and divisao_mesa for update;
  if not found then raise exception 'Evento indisponível'; end if;

  if not exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu) then
    -- quem não confirmou entra no que está faltando
    select min(t) into v_min from (
      select (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = c and not public.eh_fantasma(m.pessoa_id)) t
        from unnest(array['salgado','doce','vinho']) c) z;
    select count(*) into v_t from public.evento_mesa where evento_id = p_evento and categoria = p_categoria and not public.eh_fantasma(pessoa_id);
    if v_t > v_min then raise exception 'Essa categoria já tem gente suficiente. Escolha a que está faltando.'; end if;
    perform public.inscrever_evento(p_evento);
  else
    select count(*) into v_n from public.inscricoes where evento_id = p_evento and not public.eh_fantasma(pessoa_id);
    select count(*) into v_t from public.evento_mesa
     where evento_id = p_evento and categoria = p_categoria and pessoa_id <> v_eu and not public.eh_fantasma(pessoa_id);
    if v_t >= public.mesa_limite(v_n, p_categoria) and not public.eh_fantasma(v_eu) then
      raise exception 'As vagas de % já estão completas', p_categoria;
    end if;
  end if;

  insert into public.evento_mesa (evento_id, pessoa_id, categoria, item) values (p_evento, v_eu, p_categoria, p_item)
  on conflict (evento_id, pessoa_id) do update set categoria = excluded.categoria, item = excluded.item, atualizado_em = now();
end $$;

create or replace function public.sair_mesa(p_evento uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.evento_mesa where evento_id = p_evento and pessoa_id = public.meu_inscrito_id()
$$;

-- equipe define (ou tira, com categoria nula) a escolha de qualquer inscrito, sem trava de vagas
create or replace function public.equipe_definir_mesa(p_evento uuid, p_pessoa uuid, p_categoria text, p_item text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  if p_categoria is null then
    delete from public.evento_mesa where evento_id = p_evento and pessoa_id = p_pessoa; return;
  end if;
  if not exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = p_pessoa) then
    raise exception 'Essa pessoa não está inscrita no evento';
  end if;
  insert into public.evento_mesa (evento_id, pessoa_id, categoria, item) values (p_evento, p_pessoa, p_categoria, trim(p_item))
  on conflict (evento_id, pessoa_id) do update set categoria = excluded.categoria, item = excluded.item, atualizado_em = now();
end $$;

-- eventos em que estou inscrito e ainda não escolhi o que levo (aviso no Hoje)
create or replace function public.mesa_pendentes()
returns table (evento_id uuid, titulo text, inicia_em timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.inicia_em
    from public.eventos e
    join public.inscricoes i on i.evento_id = e.id and i.pessoa_id = public.meu_inscrito_id()
   where e.divisao_mesa and e.publicado and e.inicia_em > now()
     and not exists (select 1 from public.evento_mesa m where m.evento_id = e.id and m.pessoa_id = i.pessoa_id)
   order by e.inicia_em
$$;

revoke all on function public.mesa_evento(uuid) from public, anon;
revoke all on function public.escolher_mesa(uuid, text, text) from public, anon;
revoke all on function public.sair_mesa(uuid) from public, anon;
revoke all on function public.equipe_definir_mesa(uuid, uuid, text, text) from public, anon;
revoke all on function public.mesa_pendentes() from public, anon;
grant execute on function public.mesa_evento(uuid) to authenticated;
grant execute on function public.escolher_mesa(uuid, text, text) to authenticated;
grant execute on function public.sair_mesa(uuid) to authenticated;
grant execute on function public.equipe_definir_mesa(uuid, uuid, text, text) to authenticated;
grant execute on function public.mesa_pendentes() to authenticated;

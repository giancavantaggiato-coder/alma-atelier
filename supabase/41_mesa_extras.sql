-- 41: Quem leva o quê, mais de uma opção (19/11/2026)
-- Cada inscrito continua com uma escolha principal, que é a que ocupa vaga.
-- Além dela, pode levar algo a mais em outra categoria (ex.: doce e também vinho).
-- O que é a mais não ocupa vaga nem tira a vez de ninguém. Uma linha por pessoa e categoria.

alter table public.evento_mesa add column if not exists extra boolean not null default false;
alter table public.evento_mesa drop constraint if exists evento_mesa_pkey;
alter table public.evento_mesa add constraint evento_mesa_pkey primary key (evento_id, pessoa_id, categoria);
create unique index if not exists evento_mesa_principal on public.evento_mesa (evento_id, pessoa_id) where not extra;

create or replace function public.mesa_evento(p_evento uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_inscrito_id(); v_n int; v_insc boolean; v_min int; r json;
begin
  if not (v_eu is not null or public.meu_visitante_id() is not null or public.sou_equipe()) then return null; end if;
  if not exists (select 1 from public.eventos where id = p_evento and divisao_mesa and (publicado or public.sou_equipe())) then return null; end if;
  select count(*) into v_n from public.inscricoes where evento_id = p_evento and not public.eh_fantasma(pessoa_id);
  v_insc := exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu);
  select min(t) into v_min from (
    select (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = c and not m.extra and not public.eh_fantasma(m.pessoa_id)) t
      from unnest(array['salgado','doce','vinho']) c) z;
  select json_build_object(
    'inscritos', v_n,
    'inscrito', v_insc,
    'categorias', (select json_agg(json_build_object('k', c.k, 'total', c.t, 'limite', public.mesa_limite(v_n, c.k),
                      'aberta', case when v_insc then c.t_sem_eu < public.mesa_limite(v_n, c.k) else c.t = v_min end) order by c.o)
                     from (select k, o,
                             (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = k and not m.extra and not public.eh_fantasma(m.pessoa_id)) t,
                             (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = k and not m.extra and not public.eh_fantasma(m.pessoa_id) and m.pessoa_id is distinct from v_eu) t_sem_eu
                             from unnest(array['salgado','doce','vinho']) with ordinality as u(k, o)) c),
    'itens', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p), 'avatar_url', p.avatar_url,
                      'categoria', m.categoria, 'item', m.item, 'extra', m.extra, 'sou_eu', p.id = v_eu) order by m.atualizado_em)
                     from public.evento_mesa m join public.pessoas p on p.id = m.pessoa_id
                    where m.evento_id = p_evento and (not p.fantasma or p.id = v_eu)), '[]'::json),
    'faltam', case when public.sou_equipe() then coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p)) order by i.criado_em)
                     from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma
                    where i.evento_id = p_evento and not exists (select 1 from public.evento_mesa m where m.evento_id = p_evento and m.pessoa_id = p.id)), '[]'::json) end,
    'minha', (select json_build_object('categoria', categoria, 'item', item) from public.evento_mesa where evento_id = p_evento and pessoa_id = v_eu and not extra),
    'extras', coalesce((select json_agg(json_build_object('categoria', categoria, 'item', item) order by atualizado_em)
                     from public.evento_mesa where evento_id = p_evento and pessoa_id = v_eu and extra), '[]'::json)
  ) into r;
  return r;
end $$;

-- grava a escolha principal (a que ocupa vaga)
create or replace function public.mesa_gravar_principal(p_evento uuid, p_pessoa uuid, p_categoria text, p_item text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.evento_mesa where evento_id = p_evento and pessoa_id = p_pessoa and categoria = p_categoria and extra;
  update public.evento_mesa set categoria = p_categoria, item = p_item, atualizado_em = now()
   where evento_id = p_evento and pessoa_id = p_pessoa and not extra;
  if not found then
    insert into public.evento_mesa (evento_id, pessoa_id, categoria, item, extra) values (p_evento, p_pessoa, p_categoria, p_item, false);
  end if;
end $$;
revoke all on function public.mesa_gravar_principal(uuid, uuid, text, text) from public, anon, authenticated;

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
    select min(t) into v_min from (
      select (select count(*) from public.evento_mesa m where m.evento_id = p_evento and m.categoria = c and not m.extra and not public.eh_fantasma(m.pessoa_id)) t
        from unnest(array['salgado','doce','vinho']) c) z;
    select count(*) into v_t from public.evento_mesa where evento_id = p_evento and categoria = p_categoria and not extra and not public.eh_fantasma(pessoa_id);
    if v_t > v_min then raise exception 'Essa categoria já tem gente suficiente. Escolha a que está faltando.'; end if;
    perform public.inscrever_evento(p_evento);
  else
    select count(*) into v_n from public.inscricoes where evento_id = p_evento and not public.eh_fantasma(pessoa_id);
    select count(*) into v_t from public.evento_mesa
     where evento_id = p_evento and categoria = p_categoria and not extra and pessoa_id <> v_eu and not public.eh_fantasma(pessoa_id);
    if v_t >= public.mesa_limite(v_n, p_categoria) and not public.eh_fantasma(v_eu) then
      raise exception 'As vagas de % já estão completas', p_categoria;
    end if;
  end if;

  perform public.mesa_gravar_principal(p_evento, v_eu, p_categoria, p_item);
end $$;

-- algo a mais, em outra categoria, sem trava de vagas (p_item nulo tira)
create or replace function public.mesa_extra(p_evento uuid, p_categoria text, p_item text)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_inscrito_id();
begin
  if v_eu is null then raise exception 'Cadastro não encontrado'; end if;
  if not exists (select 1 from public.eventos where id = p_evento and publicado and divisao_mesa and inicia_em > now()) then
    raise exception 'Evento indisponível'; end if;
  if p_item is null then
    delete from public.evento_mesa where evento_id = p_evento and pessoa_id = v_eu and categoria = p_categoria and extra; return;
  end if;
  p_item := trim(p_item);
  if p_item = '' then raise exception 'Diga o que vai levar'; end if;
  if char_length(p_item) > 120 then raise exception 'Escreva em até 120 caracteres'; end if;
  if p_categoria not in ('salgado','doce','vinho') then raise exception 'Escolha salgado, doce ou vinho'; end if;
  if not exists (select 1 from public.evento_mesa where evento_id = p_evento and pessoa_id = v_eu and not extra) then
    raise exception 'Escolha primeiro o que você leva'; end if;
  if exists (select 1 from public.evento_mesa where evento_id = p_evento and pessoa_id = v_eu and categoria = p_categoria and not extra) then
    raise exception 'Você já leva %', p_categoria; end if;
  insert into public.evento_mesa (evento_id, pessoa_id, categoria, item, extra) values (p_evento, v_eu, p_categoria, p_item, true)
  on conflict (evento_id, pessoa_id, categoria) do update set item = excluded.item, atualizado_em = now();
end $$;

-- equipe: p_extra falso mexe na escolha principal (categoria nula tira tudo da pessoa);
-- p_extra verdadeiro grava ou tira (item nulo) algo a mais naquela categoria
drop function if exists public.equipe_definir_mesa(uuid, uuid, text, text);
create or replace function public.equipe_definir_mesa(p_evento uuid, p_pessoa uuid, p_categoria text, p_item text, p_extra boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  if not p_extra and p_categoria is null then
    delete from public.evento_mesa where evento_id = p_evento and pessoa_id = p_pessoa; return;
  end if;
  if p_extra and p_item is null then
    delete from public.evento_mesa where evento_id = p_evento and pessoa_id = p_pessoa and categoria = p_categoria and extra; return;
  end if;
  if not exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = p_pessoa) then
    raise exception 'Essa pessoa não está inscrita no evento';
  end if;
  if p_categoria not in ('salgado','doce','vinho') then raise exception 'Escolha salgado, doce ou vinho'; end if;
  p_item := trim(coalesce(p_item, ''));
  if p_item = '' then raise exception 'Diga o que a pessoa vai levar'; end if;
  if not p_extra then
    perform public.mesa_gravar_principal(p_evento, p_pessoa, p_categoria, p_item);
  else
    if exists (select 1 from public.evento_mesa where evento_id = p_evento and pessoa_id = p_pessoa and categoria = p_categoria and not extra) then
      raise exception 'Essa já é a escolha principal da pessoa'; end if;
    if not exists (select 1 from public.evento_mesa where evento_id = p_evento and pessoa_id = p_pessoa and not extra) then
      raise exception 'Defina primeiro a escolha principal'; end if;
    insert into public.evento_mesa (evento_id, pessoa_id, categoria, item, extra) values (p_evento, p_pessoa, p_categoria, p_item, true)
    on conflict (evento_id, pessoa_id, categoria) do update set item = excluded.item, atualizado_em = now();
  end if;
end $$;

-- sair_mesa já apaga tudo da pessoa; mesa_pendentes segue igual (qualquer escolha conta)

revoke all on function public.mesa_extra(uuid, text, text) from public, anon;
revoke all on function public.equipe_definir_mesa(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.mesa_extra(uuid, text, text) to authenticated;
grant execute on function public.equipe_definir_mesa(uuid, uuid, text, text, boolean) to authenticated;

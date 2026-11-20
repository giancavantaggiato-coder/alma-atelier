-- 44: Dicas para o presente (amigo secreto) (20/11/2026)
-- Em eventos com "dicas_presente", cada inscrito escreve dicas do que gostaria de ganhar.
-- Todos os inscritos veem as dicas de todos. Enquanto a pessoa não escreve as dela, o app mostra
-- a pendência no Hoje toda vez que ela entra.

alter table public.eventos add column if not exists dicas_presente boolean not null default false;

create table if not exists public.evento_dicas (
  evento_id     uuid not null,
  pessoa_id     uuid not null,
  texto         text not null check (char_length(trim(texto)) between 1 and 500),
  atualizado_em timestamptz not null default now(),
  primary key (evento_id, pessoa_id),
  foreign key (evento_id, pessoa_id) references public.inscricoes (evento_id, pessoa_id) on delete cascade
);
alter table public.evento_dicas enable row level security;   -- acesso só pelas funções abaixo
revoke all on public.evento_dicas from anon, authenticated;

create or replace function public.dicas_evento(p_evento uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_inscrito_id(); r json;
begin
  if not (v_eu is not null or public.sou_equipe()) then return null; end if;
  if not exists (select 1 from public.eventos where id = p_evento and dicas_presente and (publicado or public.sou_equipe())) then return null; end if;
  select json_build_object(
    'inscrito', exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu),
    'minha', (select texto from public.evento_dicas where evento_id = p_evento and pessoa_id = v_eu),
    'itens', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p), 'texto', d.texto, 'sou_eu', p.id = v_eu)
                         order by public.nome_curto(p))
                        from public.evento_dicas d join public.pessoas p on p.id = d.pessoa_id
                       where d.evento_id = p_evento and (not p.fantasma or p.id = v_eu)), '[]'::json),
    'faltam', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p)) order by public.nome_curto(p))
                         from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma
                        where i.evento_id = p_evento
                          and not exists (select 1 from public.evento_dicas d where d.evento_id = p_evento and d.pessoa_id = p.id)), '[]'::json)
  ) into r;
  return r;
end $$;

create or replace function public.salvar_dicas(p_evento uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_inscrito_id();
begin
  if v_eu is null then raise exception 'Cadastro não encontrado'; end if;
  if not exists (select 1 from public.eventos where id = p_evento and publicado and dicas_presente) then raise exception 'Evento indisponível'; end if;
  if not exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu) then
    raise exception 'Só quem está participando escreve dicas';
  end if;
  p_texto := trim(coalesce(p_texto, ''));
  if p_texto = '' then
    delete from public.evento_dicas where evento_id = p_evento and pessoa_id = v_eu; return;
  end if;
  if char_length(p_texto) > 500 then raise exception 'Escreva em até 500 caracteres'; end if;
  insert into public.evento_dicas (evento_id, pessoa_id, texto) values (p_evento, v_eu, p_texto)
  on conflict (evento_id, pessoa_id) do update set texto = excluded.texto, atualizado_em = now();
end $$;

-- eventos em que estou inscrito e ainda não escrevi as dicas (aviso no Hoje)
create or replace function public.dicas_pendentes()
returns table (evento_id uuid, titulo text, inicia_em timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.inicia_em
    from public.eventos e
    join public.inscricoes i on i.evento_id = e.id and i.pessoa_id = public.meu_inscrito_id()
   where e.dicas_presente and e.publicado and e.inicia_em > now()
     and not exists (select 1 from public.evento_dicas d where d.evento_id = e.id and d.pessoa_id = i.pessoa_id)
   order by e.inicia_em
$$;

-- avisa no celular todos os inscritos que ainda não escreveram as dicas
create or replace function public.avisar_dicas(p_evento uuid)
returns int language plpgsql security definer set search_path = public as $$
declare e public.eventos; n int := 0; r record;
begin
  if auth.uid() is not null then perform public.exigir_equipe(); end if;
  select * into e from public.eventos where id = p_evento and dicas_presente and publicado;
  if not found then raise exception 'Evento indisponível'; end if;
  for r in select i.pessoa_id from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma
            where i.evento_id = p_evento
              and not exists (select 1 from public.evento_dicas d where d.evento_id = p_evento and d.pessoa_id = i.pessoa_id) loop
    perform public.notificar(r.pessoa_id, e.titulo, 'Escreva suas dicas de presente para quem tirar você.',
      './?evento=' || p_evento, 'dicas:' || p_evento || ':' || r.pessoa_id || ':' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD'));
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.dicas_evento(uuid) from public, anon;
revoke all on function public.salvar_dicas(uuid, text) from public, anon;
revoke all on function public.dicas_pendentes() from public, anon;
revoke all on function public.avisar_dicas(uuid) from public, anon;
grant execute on function public.dicas_evento(uuid) to authenticated;
grant execute on function public.salvar_dicas(uuid, text) to authenticated;
grant execute on function public.dicas_pendentes() to authenticated;
grant execute on function public.avisar_dicas(uuid) to authenticated;

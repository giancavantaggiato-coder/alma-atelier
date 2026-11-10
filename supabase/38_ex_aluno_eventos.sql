-- Alma · ex-alunos com acesso ao app podem se inscrever nos eventos
-- (aluno suspenso continua sem inscrição; marcar aula e reposição seguem só para alunos ativos)

-- Quem pode se inscrever: aluno ativo (ou o fantasma da equipe) e ex-aluno com acesso ao app
create or replace function public.meu_inscrito_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_aluno_id(),
    (select id from public.pessoas where auth_user_id = auth.uid() and vinculo = 'ex_aluno' and acesso_app))
$$;
revoke execute on function public.meu_inscrito_id() from public, anon;
grant execute on function public.meu_inscrito_id() to authenticated;

create or replace function public.inscrever_evento(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.eventos; v_pessoa uuid := public.meu_inscrito_id(); n int;
begin
  if v_pessoa is null then raise exception 'Cadastro não encontrado'; end if;
  select * into e from public.eventos where id = p_evento and publicado for update;
  if not found then raise exception 'Evento indisponível'; end if;
  if e.inicia_em <= now() then raise exception 'O evento já começou'; end if;
  if e.inscricoes_ate is not null and now() > e.inscricoes_ate then raise exception 'As inscrições para este evento foram encerradas'; end if;
  select count(*) into n from public.inscricoes where evento_id = p_evento and not public.eh_fantasma(pessoa_id);
  if e.vagas is not null and n >= e.vagas and not public.eh_fantasma(v_pessoa) then raise exception 'Não há mais vagas'; end if;
  insert into public.inscricoes (evento_id, pessoa_id) values (p_evento, v_pessoa) on conflict do nothing;
end $$;

create or replace function public.cancelar_inscricao(p_evento uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.inscricoes where evento_id = p_evento and pessoa_id = public.meu_inscrito_id()
$$;

create or replace function public.eventos_lista()
returns table (id uuid, tipo text, titulo text, descricao text, inicia_em timestamptz, termina_em timestamptz, local text,
               vagas integer, preco_texto text, publicado boolean, inscritos integer, inscrito boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.tipo, e.titulo, e.descricao, e.inicia_em, e.termina_em, e.local, e.vagas, e.preco_texto, e.publicado,
         (select count(*) from public.inscricoes i where i.evento_id = e.id and not public.eh_fantasma(i.pessoa_id))::int,
         exists (select 1 from public.inscricoes i where i.evento_id = e.id and i.pessoa_id = public.meu_inscrito_id())
  from public.eventos e
  where auth.uid() is not null and (e.publicado or public.sou_equipe())
    and e.termina_em > now() - interval '1 day'
  order by e.inicia_em
$$;

create or replace function public.inscritos_eventos()
returns table (evento_id uuid, nome text, avatar_url text, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select i.evento_id, public.nome_curto(p), p.avatar_url, p.id = public.meu_inscrito_id()
    from public.inscricoes i
    join public.pessoas p on p.id = i.pessoa_id and (not p.fantasma or p.id = public.meu_aluno_id())
   where public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe()
   order by i.evento_id, (p.id = public.meu_inscrito_id()) desc, i.criado_em
$$;

create or replace function public.inscritos_eventos_perfil()
returns table (evento_id uuid, pessoa_id uuid, nome text, avatar_url text, sou_eu boolean, cargo text)
language sql stable security definer set search_path = public as $$
  select i.evento_id, p.id, public.nome_curto(p), p.avatar_url, p.id = public.meu_inscrito_id(), p.cargo_publico
    from public.inscricoes i
    join public.pessoas p on p.id = i.pessoa_id and (not p.fantasma or p.id = public.meu_aluno_id())
   where public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe()
   order by i.evento_id, (p.id = public.meu_inscrito_id()) desc, i.criado_em
$$;

drop policy if exists le_inscricoes on public.inscricoes;
create policy le_inscricoes on public.inscricoes for select
  using (pessoa_id = public.meu_inscrito_id() or public.sou_equipe());

-- Alma · alma-cadastros · última parte do banco
-- Cole tudo no SQL Editor do Supabase e clique em Run.
-- Se aparecer um aviso sobre "destructive operation", confirme: são regras do app
-- (desmarcar aula, sair de turma, cancelar inscrição), nada é apagado agora.

-- Mudança de vínculo: entrada como aluno marca a data; saída fecha as turmas e libera as vagas futuras
create or replace function public.ao_mudar_vinculo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.vinculo = 'aluno' and new.aluno_desde is null then new.aluno_desde := current_date; end if;
  if new.aceita_comunicacao and (tg_op = 'INSERT' or not old.aceita_comunicacao) then new.aceita_comunicacao_em := now(); end if;
  if not new.aceita_comunicacao then new.aceita_comunicacao_em := null; end if;
  if tg_op = 'UPDATE' and old.vinculo in ('aluno','pausado') and coalesce(new.vinculo,'') not in ('aluno','pausado') then
    new.saida_em := coalesce(new.saida_em, current_date);
    update public.matriculas set ate = current_date where aluno_id = new.id and ate is null;
    delete from public.reservas r using public.aulas a
     where r.aula_id = a.id and r.aluno_id = new.id and r.status = 'confirmada' and a.inicia_em > now();
  end if;
  if tg_op = 'UPDATE' and new.vinculo in ('aluno','pausado') and coalesce(old.vinculo,'') not in ('aluno','pausado') then
    new.saida_em := null; new.motivo_saida := null;
  end if;
  return new;
end $$;
drop trigger if exists pessoas_vinculo on public.pessoas;
create trigger pessoas_vinculo before insert or update on public.pessoas
  for each row execute function public.ao_mudar_vinculo();

-- Aluno desmarca uma aula
create or replace function public.desmarcar(p_reserva uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.reservas; a public.aulas; v_aluno uuid := public.meu_aluno_id(); v_ativos int; v_dia date;
begin
  select * into r from public.reservas where id = p_reserva and aluno_id = v_aluno for update;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if r.status <> 'confirmada' then raise exception 'Esta aula não pode mais ser desmarcada'; end if;
  select * into a from public.aulas where id = r.aula_id;
  if a.cancelada then raise exception 'Esta aula foi cancelada pelo atelier'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;

  if a.inicia_em - now() < interval '4 hours' then
    update public.reservas set status = 'ausencia_tardia', atualizado_em = now() where id = r.id;
    return 'ausencia_sem_credito';
  end if;

  if r.tipo = 'reposicao' then
    update public.creditos set usado_em_reserva_id = null where usado_em_reserva_id = r.id;
    delete from public.reservas where id = r.id;
    return 'credito_devolvido';
  end if;

  update public.reservas set status = 'desmarcada', atualizado_em = now() where id = r.id;
  select count(*) into v_ativos from public.creditos
   where aluno_id = v_aluno and usado_em_reserva_id is null and expira_em >= current_date;
  if v_ativos >= 8 then return 'limite_de_creditos'; end if;

  v_dia := (a.inicia_em at time zone 'America/Sao_Paulo')::date;
  insert into public.creditos (aluno_id, reserva_origem_id, data_falta, expira_em)
  values (v_aluno, r.id, v_dia, (v_dia + interval '1 year')::date);
  return 'credito_gerado';
end $$;

-- Aluno cancela a inscrição num evento
create or replace function public.cancelar_inscricao(p_evento uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.inscricoes where evento_id = p_evento and pessoa_id = public.meu_aluno_id()
$$;

-- Equipe tira um aluno de uma turma e libera as vagas futuras
create or replace function public.desmatricular(p_aluno uuid, p_turma uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  update public.matriculas set ate = current_date where aluno_id = p_aluno and turma_id = p_turma and ate is null;
  delete from public.reservas r using public.aulas a
   where r.aula_id = a.id and a.turma_id = p_turma and r.aluno_id = p_aluno
     and r.tipo = 'fixa' and r.status = 'confirmada' and a.inicia_em > now();
end $$;

-- Aluno pode trocar/remover as próprias fotos
drop policy if exists perfis_apaga on storage.objects;
create policy perfis_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Permissões: só quem está logado usa as funções do app
revoke execute on function public.desmarcar(uuid) from public, anon;
revoke execute on function public.cancelar_inscricao(uuid) from public, anon;
revoke execute on function public.desmatricular(uuid, uuid) from public, anon;
grant execute on function public.desmarcar(uuid) to authenticated;
grant execute on function public.cancelar_inscricao(uuid) to authenticated;
grant execute on function public.desmatricular(uuid, uuid) to authenticated;
revoke execute on function public.ao_mudar_vinculo() from public, anon, authenticated;

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

select 'Pronto: banco do Alma completo' as resultado;

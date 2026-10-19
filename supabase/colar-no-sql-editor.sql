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

select 'Pronto: banco do Alma completo' as resultado;

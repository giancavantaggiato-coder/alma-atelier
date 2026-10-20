-- Alma · plano livre: aluno sem dias fixos, marca as aulas que quiser (sem gastar reposição)
alter table public.pessoas add column if not exists plano text not null default 'fixo';
alter table public.pessoas add constraint pessoas_plano_valido check (plano in ('fixo','livre')) not valid;

create or replace function public.marcar_reposicao(p_aula uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.aulas; v_aluno uuid := public.meu_aluno_id(); v_ocup int; v_cred uuid; v_res uuid; v_exist public.reservas; v_livre boolean;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into a from public.aulas where id = p_aula for update;
  if not found or a.cancelada then raise exception 'Aula indisponível'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;
  if (select vinculo from public.pessoas where id = v_aluno) <> 'aluno' then raise exception 'Sua matrícula está pausada'; end if;
  select plano = 'livre' into v_livre from public.pessoas where id = v_aluno;
  select * into v_exist from public.reservas where aula_id = p_aula and aluno_id = v_aluno;
  if found and v_exist.status in ('confirmada','presente') then raise exception 'Você já está nesta aula'; end if;
  select count(*) into v_ocup from public.reservas where aula_id = p_aula and status in ('confirmada','presente') and not public.eh_fantasma(aluno_id);
  if v_ocup >= a.capacidade and not public.eh_fantasma(v_aluno) then raise exception 'Turma completa neste dia'; end if;
  if not v_livre then
    select id into v_cred from public.creditos
     where aluno_id = v_aluno and usado_em_reserva_id is null and expira_em >= current_date
     order by data_falta limit 1 for update;
    if v_cred is null then raise exception 'Você não tem reposições disponíveis'; end if;
  end if;
  if v_exist.id is not null then
    update public.reservas set tipo = 'reposicao', status = 'confirmada', atualizado_em = now() where id = v_exist.id returning id into v_res;
  else
    insert into public.reservas (aula_id, aluno_id, tipo) values (p_aula, v_aluno, 'reposicao') returning id into v_res;
  end if;
  if v_cred is not null then
    update public.creditos set usado_em_reserva_id = v_res where id = v_cred;
  end if;
  return v_res;
end $$;

create or replace function public.completar_cadastro(p_nome text, p_sobrenome text, p_whatsapp text, p_desde date, p_frequencia int, p_horarios uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.meu_aluno_id(); v_p public.pessoas; v_tem int; h uuid; t public.turmas; v_ocup int;
begin
  if v_id is null then raise exception 'Cadastro não encontrado'; end if;
  select * into v_p from public.pessoas where id = v_id for update;
  if coalesce(trim(p_nome),'') = '' or coalesce(trim(p_sobrenome),'') = '' then raise exception 'Preencha nome e sobrenome'; end if;
  if length(regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g')) < 10 then raise exception 'Confira o telefone, com DDD'; end if;
  if p_desde is null or p_desde > current_date then raise exception 'Informe desde quando você faz aula no Alma'; end if;
  if v_p.plano = 'livre' then
    update public.pessoas
       set nome = trim(p_nome) || ' ' || trim(p_sobrenome), sobrenome = trim(p_sobrenome),
           whatsapp = trim(p_whatsapp), aluno_desde = date_trunc('month', p_desde)::date,
           frequencia_semanal = null, cadastro_completo_em = now()
     where id = v_id;
    return;
  end if;
  if p_frequencia is null or p_frequencia < 1 or p_frequencia > 7 then raise exception 'Escolha a frequência'; end if;
  select count(*) into v_tem from public.matriculas where aluno_id = v_id and ate is null;
  if v_tem = 0 and v_p.vinculo = 'aluno' then
    p_horarios := array(select distinct unnest(coalesce(p_horarios, '{}')));
    if cardinality(p_horarios) <> p_frequencia then
      raise exception 'Escolha % dia(s) do atelier', p_frequencia;
    end if;
    foreach h in array p_horarios loop
      select * into t from public.turmas where id = h and ativa for update;
      if not found then raise exception 'Horário indisponível'; end if;
      select count(*) into v_ocup from public.matriculas m join public.pessoas p on p.id = m.aluno_id and p.vinculo = 'aluno' and not p.fantasma
       where m.turma_id = h and m.ate is null;
      if v_ocup >= t.capacidade and not v_p.fantasma then raise exception 'O horário de % já está completo. Escolha outro dia.', (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[t.dia_semana + 1]; end if;
      perform public.aulas_do_horario(h, (current_date + interval '10 weeks')::date);
      insert into public.matriculas (aluno_id, turma_id) values (v_id, h) on conflict do nothing;
      insert into public.reservas (aula_id, aluno_id, tipo)
      select a.id, v_id, 'fixa' from public.aulas a
       where a.turma_id = h and a.inicia_em > now() and not a.cancelada
      on conflict do nothing;
    end loop;
  end if;
  update public.pessoas
     set nome = trim(p_nome) || ' ' || trim(p_sobrenome), sobrenome = trim(p_sobrenome),
         whatsapp = trim(p_whatsapp), aluno_desde = date_trunc('month', p_desde)::date,
         frequencia_semanal = p_frequencia, cadastro_completo_em = now()
   where id = v_id;
end $$;

-- Carol: plano livre
insert into public.pessoas (email, vinculo, acesso_app, plano, observacoes)
values ('caarol.lenc@gmail.com', 'aluno', true, 'livre', 'Plano livre: vem em dias específicos e marca as aulas que quiser.')
on conflict (email) do update set vinculo = 'aluno', acesso_app = true, plano = 'livre';

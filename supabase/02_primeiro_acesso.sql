-- Alma · primeiro acesso
-- E-mail cadastrado como aluno entra direto (acesso_app vira "bloquear acesso", ligado por padrão).
-- No primeiro acesso o aluno completa nome, sobrenome, frequência e os dias do atelier.

alter table public.pessoas alter column nome drop not null;
alter table public.pessoas alter column acesso_app set default true;
update public.pessoas set acesso_app = true where vinculo in ('aluno','pausado') and not acesso_app and auth_user_id is null;
alter table public.pessoas add column if not exists sobrenome text;
alter table public.pessoas add column if not exists frequencia_semanal smallint check (frequencia_semanal between 1 and 7);
alter table public.pessoas add column if not exists cadastro_completo_em timestamptz;

-- Horários que o aluno pode escolher, com as vagas fixas que ainda restam
create or replace function public.horarios_para_escolher()
returns table (id uuid, dia_semana smallint, inicio time, fim time, capacidade smallint, ocupados int, meu boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.dia_semana, t.inicio, t.fim, t.capacidade,
         (select count(*)::int from public.matriculas m join public.pessoas p on p.id = m.aluno_id and p.vinculo = 'aluno'
           where m.turma_id = t.id and m.ate is null and m.aluno_id is distinct from public.meu_aluno_id()),
         exists (select 1 from public.matriculas m where m.turma_id = t.id and m.ate is null and m.aluno_id = public.meu_aluno_id())
    from public.turmas t
   where t.ativa and public.meu_aluno_id() is not null
   order by case when t.dia_semana = 0 then 7 else t.dia_semana end, t.inicio
$$;

-- Cria as aulas de um horário até a data (uso interno)
create or replace function public.aulas_do_horario(p_turma uuid, p_ate date)
returns void language plpgsql security definer set search_path = public as $$
declare t public.turmas; d date;
begin
  select * into t from public.turmas where id = p_turma and ativa;
  if not found then return; end if;
  for d in select g::date from generate_series(current_date, p_ate, interval '1 day') g where extract(dow from g) = t.dia_semana loop
    insert into public.aulas (turma_id, inicia_em, termina_em, capacidade)
    values (t.id, (d + t.inicio) at time zone 'America/Sao_Paulo', (d + t.fim) at time zone 'America/Sao_Paulo', t.capacidade)
    on conflict (turma_id, inicia_em) do nothing;
  end loop;
end $$;

-- Primeiro acesso: o aluno completa o cadastro e escolhe os dias fixos
create or replace function public.completar_cadastro(p_nome text, p_sobrenome text, p_frequencia int, p_horarios uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.meu_aluno_id(); v_p public.pessoas; v_tem int; h uuid; t public.turmas; v_ocup int;
begin
  if v_id is null then raise exception 'Cadastro não encontrado'; end if;
  select * into v_p from public.pessoas where id = v_id for update;
  if coalesce(trim(p_nome),'') = '' or coalesce(trim(p_sobrenome),'') = '' then raise exception 'Preencha nome e sobrenome'; end if;
  if p_frequencia is null or p_frequencia < 1 or p_frequencia > 7 then raise exception 'Escolha a frequência'; end if;

  select count(*) into v_tem from public.matriculas where aluno_id = v_id and ate is null;
  -- quem já tem dias definidos pelo atelier mantém os dias; só quem ainda não tem escolhe agora
  if v_tem = 0 and v_p.vinculo = 'aluno' then
    p_horarios := array(select distinct unnest(coalesce(p_horarios, '{}')));
    if cardinality(p_horarios) <> p_frequencia then
      raise exception 'Escolha % dia(s) do atelier', p_frequencia;
    end if;
    foreach h in array p_horarios loop
      select * into t from public.turmas where id = h and ativa for update;
      if not found then raise exception 'Horário indisponível'; end if;
      select count(*) into v_ocup from public.matriculas m join public.pessoas p on p.id = m.aluno_id and p.vinculo = 'aluno'
       where m.turma_id = h and m.ate is null;
      if v_ocup >= t.capacidade then raise exception 'O horário de % já está completo. Escolha outro dia.', (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[t.dia_semana + 1]; end if;
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
         frequencia_semanal = p_frequencia, cadastro_completo_em = now()
   where id = v_id;
end $$;

-- Equipe: ao colocar um aluno num dia fixo, as aulas das próximas semanas já são criadas
create or replace function public.matricular(p_aluno uuid, p_turma uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  perform public.aulas_do_horario(p_turma, (current_date + interval '10 weeks')::date);
  insert into public.matriculas (aluno_id, turma_id) values (p_aluno, p_turma) on conflict do nothing;
  insert into public.reservas (aula_id, aluno_id, tipo)
  select a.id, p_aluno, 'fixa' from public.aulas a
   where a.turma_id = p_turma and a.inicia_em > now() and not a.cancelada
  on conflict do nothing;
end $$;

-- Mantém sempre 10 semanas de aulas abertas, com cada aluno nos seus dias fixos (roda toda segunda)
create or replace function public.manter_aulas()
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in select id from public.turmas where ativa loop
    perform public.aulas_do_horario(t.id, (current_date + interval '10 weeks')::date);
  end loop;
  insert into public.reservas (aula_id, aluno_id, tipo)
  select a.id, m.aluno_id, 'fixa'
    from public.aulas a
    join public.matriculas m on m.turma_id = a.turma_id and m.ate is null
    join public.pessoas p on p.id = m.aluno_id and p.vinculo = 'aluno'
   where a.inicia_em > now() and not a.cancelada
     and (a.inicia_em at time zone 'America/Sao_Paulo')::date >= m.desde
  on conflict do nothing;
end $$;

revoke execute on function public.manter_aulas() from public, anon, authenticated;
revoke execute on function public.aulas_do_horario(uuid, date) from public, anon, authenticated;
revoke execute on function public.horarios_para_escolher() from public, anon;
revoke execute on function public.completar_cadastro(text, text, int, uuid[]) from public, anon;
grant execute on function public.horarios_para_escolher() to authenticated;
grant execute on function public.completar_cadastro(text, text, int, uuid[]) to authenticated;

create extension if not exists pg_cron;
select cron.schedule('alma-manter-aulas', '0 9 * * 1', 'select public.manter_aulas()');
select public.manter_aulas();

-- Quem ainda não completou o cadastro aparece pelo e-mail na chamada, e como "Aluno" para os colegas
create or replace function public.equipe_dia(p_dia date)
returns table (aula_id uuid, turma_nome text, inicia_em timestamptz, termina_em timestamptz, capacidade int,
               cancelada boolean, reserva_id uuid, aluno_id uuid, aluno_nome text, tipo text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query
  select a.id, t.nome, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada, r.id, al.id, coalesce(al.nome, al.email), r.tipo, r.status
  from public.aulas a join public.turmas t on t.id = a.turma_id
  left join public.reservas r on r.aula_id = a.id
  left join public.pessoas al on al.id = r.aluno_id
  where a.inicia_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicia_em <  ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicia_em, coalesce(al.nome, al.email);
end $$;

create or replace function public.em_aula_agora()
returns table (nome text, tipo text, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(split_part(al.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(al.nome,' ',2),1),'') || '.', '')), ''), 'Aluno'),
         r.tipo, al.id = public.meu_aluno_id()
  from public.aulas a
  join public.reservas r on r.aula_id = a.id and r.status in ('confirmada','presente')
  join public.pessoas al on al.id = r.aluno_id
  where auth.uid() is not null and now() >= a.inicia_em and now() < a.termina_em and not a.cancelada
  order by (al.id = public.meu_aluno_id()) desc, al.nome
$$;

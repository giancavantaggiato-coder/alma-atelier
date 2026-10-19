-- Alma · login fantasma
-- Uma pessoa marcada como fantasma usa o app como aluno, mas não aparece para ninguém:
-- não ocupa vaga, não aparece em "alunos em aula", na chamada, nem nas contagens de eventos.

alter table public.pessoas add column if not exists fantasma boolean not null default false;

create or replace function public.eh_fantasma(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select fantasma from public.pessoas where id = p_id), false)
$$;

create or replace function public.agenda(p_de date, p_ate date)
returns table (aula_id uuid, turma_nome text, inicia_em timestamptz, termina_em timestamptz, capacidade int, cancelada boolean,
               ocupadas int, reserva_id uuid, reserva_tipo text, reserva_status text)
language sql stable security definer set search_path = public as $$
  select a.id, t.nome, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada,
         (select count(*) from public.reservas r where r.aula_id = a.id and r.status in ('confirmada','presente') and not public.eh_fantasma(r.aluno_id))::int,
         m.id, m.tipo, m.status
  from public.aulas a
  join public.turmas t on t.id = a.turma_id
  left join public.reservas m on m.aula_id = a.id and m.aluno_id = public.meu_aluno_id()
  where auth.uid() is not null
    and a.inicia_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
    and a.inicia_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicia_em
$$;

create or replace function public.em_aula_agora()
returns table (nome text, tipo text, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(split_part(al.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(al.nome,' ',2),1),'') || '.', '')), ''), 'Aluno'),
         r.tipo, al.id = public.meu_aluno_id()
  from public.aulas a
  join public.reservas r on r.aula_id = a.id and r.status in ('confirmada','presente')
  join public.pessoas al on al.id = r.aluno_id and (not al.fantasma or al.id = public.meu_aluno_id())
  where auth.uid() is not null and now() >= a.inicia_em and now() < a.termina_em and not a.cancelada
  order by (al.id = public.meu_aluno_id()) desc, al.nome
$$;

create or replace function public.equipe_dia(p_dia date)
returns table (aula_id uuid, turma_nome text, inicia_em timestamptz, termina_em timestamptz, capacidade int,
               cancelada boolean, reserva_id uuid, aluno_id uuid, aluno_nome text, tipo text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query
  select a.id, t.nome, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada, r.id, al.id, coalesce(al.nome, al.email), r.tipo, r.status
  from public.aulas a join public.turmas t on t.id = a.turma_id
  left join (public.reservas r join public.pessoas al on al.id = r.aluno_id and not al.fantasma) on r.aula_id = a.id
  where a.inicia_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicia_em <  ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicia_em, coalesce(al.nome, al.email);
end $$;

create or replace function public.eventos_lista()
returns table (id uuid, tipo text, titulo text, descricao text, inicia_em timestamptz, termina_em timestamptz, local text,
               vagas int, preco_texto text, publicado boolean, inscritos int, inscrito boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.tipo, e.titulo, e.descricao, e.inicia_em, e.termina_em, e.local, e.vagas, e.preco_texto, e.publicado,
         (select count(*) from public.inscricoes i where i.evento_id = e.id and not public.eh_fantasma(i.pessoa_id))::int,
         exists (select 1 from public.inscricoes i where i.evento_id = e.id and i.pessoa_id = public.meu_aluno_id())
  from public.eventos e
  where auth.uid() is not null and (e.publicado or public.sou_equipe())
    and e.termina_em > now() - interval '1 day'
  order by e.inicia_em
$$;

create or replace function public.inscrever_evento(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.eventos; v_aluno uuid := public.meu_aluno_id(); n int;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into e from public.eventos where id = p_evento and publicado for update;
  if not found then raise exception 'Evento indisponível'; end if;
  if e.inicia_em <= now() then raise exception 'O evento já começou'; end if;
  select count(*) into n from public.inscricoes where evento_id = p_evento and not public.eh_fantasma(pessoa_id);
  if e.vagas is not null and n >= e.vagas and not public.eh_fantasma(v_aluno) then raise exception 'Não há mais vagas'; end if;
  insert into public.inscricoes (evento_id, pessoa_id) values (p_evento, v_aluno) on conflict do nothing;
end $$;

create or replace function public.marcar_reposicao(p_aula uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.aulas; v_aluno uuid := public.meu_aluno_id(); v_ocup int; v_cred uuid; v_res uuid; v_exist public.reservas;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into a from public.aulas where id = p_aula for update;
  if not found or a.cancelada then raise exception 'Aula indisponível'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;
  if (select vinculo from public.pessoas where id = v_aluno) <> 'aluno' then raise exception 'Sua matrícula está pausada'; end if;
  select * into v_exist from public.reservas where aula_id = p_aula and aluno_id = v_aluno;
  if found and v_exist.status in ('confirmada','presente') then raise exception 'Você já está nesta aula'; end if;
  select count(*) into v_ocup from public.reservas where aula_id = p_aula and status in ('confirmada','presente') and not public.eh_fantasma(aluno_id);
  if v_ocup >= a.capacidade and not public.eh_fantasma(v_aluno) then raise exception 'Turma completa neste dia'; end if;
  select id into v_cred from public.creditos
   where aluno_id = v_aluno and usado_em_reserva_id is null and expira_em >= current_date
   order by data_falta limit 1 for update;
  if v_cred is null then raise exception 'Você não tem reposições disponíveis'; end if;
  if v_exist.id is not null then
    update public.reservas set tipo = 'reposicao', status = 'confirmada', atualizado_em = now() where id = v_exist.id returning id into v_res;
  else
    insert into public.reservas (aula_id, aluno_id, tipo) values (p_aula, v_aluno, 'reposicao') returning id into v_res;
  end if;
  update public.creditos set usado_em_reserva_id = v_res where id = v_cred;
  return v_res;
end $$;

create or replace function public.horarios_para_escolher()
returns table (id uuid, dia_semana smallint, inicio time, fim time, capacidade smallint, ocupados int, meu boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.dia_semana, t.inicio, t.fim, t.capacidade,
         case when public.eh_fantasma(public.meu_aluno_id()) then 0 else
         (select count(*)::int from public.matriculas m join public.pessoas p on p.id = m.aluno_id and p.vinculo = 'aluno' and not p.fantasma
           where m.turma_id = t.id and m.ate is null and m.aluno_id is distinct from public.meu_aluno_id()) end,
         exists (select 1 from public.matriculas m where m.turma_id = t.id and m.ate is null and m.aluno_id = public.meu_aluno_id())
    from public.turmas t
   where t.ativa and public.meu_aluno_id() is not null
   order by case when t.dia_semana = 0 then 7 else t.dia_semana end, t.inicio
$$;

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
         frequencia_semanal = p_frequencia, cadastro_completo_em = now()
   where id = v_id;
end $$;

revoke execute on function public.eh_fantasma(uuid) from public, anon, authenticated;

-- O login fantasma do Giancarlo
insert into public.pessoas (email, vinculo, acesso_app, fantasma, observacoes)
values ('gianc.avantaggiato@gmail.com', 'aluno', true, true, 'Login fantasma: vê o app como aluno, sem aparecer para ninguém.')
on conflict (email) do update set vinculo = 'aluno', acesso_app = true, fantasma = true;

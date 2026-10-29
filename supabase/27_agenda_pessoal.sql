-- Alma · agenda pessoal da equipe
-- Tarefas e compromissos de cada pessoa da equipe, com horário opcional, repetição
-- (todo dia, toda semana, todo mês) e lembrete no celular X minutos antes.
-- Só quem criou vê: a regra de acesso exige ser da equipe e ser o dono. Alunos nunca enxergam.

create table if not exists public.agenda_pessoal (
  id           uuid primary key default gen_random_uuid(),
  dono         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo       text not null check (length(trim(titulo)) between 1 and 200),
  notas        text,
  dia          date not null,                         -- data (ou primeira data, se repete)
  hora         time,                                  -- vazio = sem horário (dia todo)
  hora_fim     time,
  repetir      text not null default '' check (repetir in ('','diario','semanal','mensal')),
  repetir_ate  date,
  lembrar_min  int check (lembrar_min is null or lembrar_min between 0 and 10080),
  feitos       date[] not null default '{}',          -- ocorrências marcadas como feitas
  pulados      date[] not null default '{}',          -- ocorrências apagadas só naquele dia
  criado_em    timestamptz not null default now()
);
create index if not exists agenda_pessoal_dono on public.agenda_pessoal (dono, dia);

alter table public.agenda_pessoal enable row level security;
create policy agenda_pessoal_dono on public.agenda_pessoal for all to authenticated
  using (dono = auth.uid() and public.sou_equipe())
  with check (dono = auth.uid() and public.sou_equipe());
grant select, insert, update, delete on public.agenda_pessoal to authenticated;

-- a tarefa acontece neste dia?
create or replace function public.agenda_cai_no_dia(t public.agenda_pessoal, d date)
returns boolean language sql immutable set search_path = public as $$
  select d >= t.dia
     and (t.repetir_ate is null or d <= t.repetir_ate)
     and not (d = any(t.pulados))
     and case t.repetir
           when '' then d = t.dia
           when 'diario' then true
           when 'semanal' then extract(dow from d) = extract(dow from t.dia)
           when 'mensal' then extract(day from d) = least(extract(day from t.dia),
                               extract(day from (date_trunc('month', d) + interval '1 month - 1 day')))
         end
$$;

-- avisos para um login específico (a agenda é de quem criou, não da equipe toda):
-- o aviso entra como destino 'equipe' com auth_user_id preenchido, e a enviar-push manda só para esse login.
alter table public.notificacoes add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

-- lembretes da agenda pessoal: roda a cada minuto e manda o que venceu nos últimos 15 min
create or replace function public.gerar_lembretes_agenda()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in
    select t.id, t.dono, t.titulo, t.hora, t.lembrar_min, d::date as dia,
           ((d::date + coalesce(t.hora, time '08:00')) at time zone 'America/Sao_Paulo') as quando
      from public.agenda_pessoal t
      cross join generate_series(v_hoje - 1, v_hoje + 8, interval '1 day') d
     where t.lembrar_min is not null
       and public.agenda_cai_no_dia(t, d::date)
       and not (d::date = any(t.feitos))
       and ((d::date + coalesce(t.hora, time '08:00')) at time zone 'America/Sao_Paulo') - make_interval(mins => t.lembrar_min)
           between now() - interval '15 minutes' and now()
  loop
    insert into public.notificacoes (destino, auth_user_id, titulo, corpo, url, chave)
    values ('equipe', r.dono, r.titulo,
      case when r.hora is null then 'Hoje, sem horário marcado.'
           when r.lembrar_min = 0 then 'Agora, ' || public.hora_txt(r.quando) || '.'
           when (r.quando at time zone 'America/Sao_Paulo')::date = v_hoje then 'Hoje às ' || public.hora_txt(r.quando) || '.'
           else public.cap_dia(r.quando) end,
      './?ir=eqhoje', 'agenda:' || r.id || ':' || r.dia || ':' || r.lembrar_min)
    on conflict (chave) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.gerar_lembretes_agenda() from public, anon, authenticated;

-- "Amanhã às 14h" ou "Sábado, 31/10 às 14h"
create or replace function public.cap_dia(p timestamptz) returns text
language sql stable set search_path = public as $$
  select case when (p at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date + 1
              then 'Amanhã às ' || public.hora_txt(p)
              else upper(left(public.quando_txt(p), 1)) || substr(public.quando_txt(p), 2) end || '.'
$$;

select cron.schedule('alma-agenda-lembretes', '* * * * *', $$select public.gerar_lembretes_agenda()$$);

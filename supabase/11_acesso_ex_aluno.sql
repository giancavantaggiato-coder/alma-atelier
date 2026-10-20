-- Alma · acesso reduzido para ex-alunos liberados pela equipe
-- Ex-aluno com "acesso ao app" ligado entra, vê quantos alunos vêm em cada dia e os eventos,
-- mas não vê nomes, não marca aula e não se inscreve.

create or replace function public.meu_visitante_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.pessoas where auth_user_id = auth.uid() and vinculo = 'ex_aluno' and acesso_app
$$;

create or replace function public.pode_entrar(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pessoas
                  where email = lower(trim(p_email)) and acesso_app and vinculo in ('aluno','pausado','ex_aluno'))
      or exists (select 1 from public.equipe where email = lower(trim(p_email)))
$$;

-- Quantos alunos por aula (sem nomes), para alunos, ex-alunos liberados e equipe
create or replace function public.agenda_contagem(p_de date, p_ate date)
returns table (aula_id uuid, inicia_em timestamptz, termina_em timestamptz, capacidade int, cancelada boolean, ocupadas int)
language sql stable security definer set search_path = public as $$
  select a.id, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada,
         (select count(*) from public.reservas r where r.aula_id = a.id and r.status in ('confirmada','presente') and not public.eh_fantasma(r.aluno_id))::int
    from public.aulas a
   where (public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe())
     and a.inicia_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
     and a.inicia_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
   order by a.inicia_em
$$;

-- Quantos estão no atelier agora (sem nomes)
create or replace function public.agora_contagem() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.aulas a
    join public.reservas r on r.aula_id = a.id and r.status in ('confirmada','presente')
   where (public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe())
     and now() >= a.inicia_em and now() < a.termina_em and not a.cancelada and not public.eh_fantasma(r.aluno_id)
$$;

-- Nomes de quem está em aula: só para alunos e equipe
create or replace function public.em_aula_agora()
returns table (nome text, tipo text, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(split_part(al.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(al.nome,' ',2),1),'') || '.', '')), ''), 'Aluno'),
         r.tipo, al.id = public.meu_aluno_id()
  from public.aulas a
  join public.reservas r on r.aula_id = a.id and r.status in ('confirmada','presente')
  join public.pessoas al on al.id = r.aluno_id and (not al.fantasma or al.id = public.meu_aluno_id())
  where (public.meu_aluno_id() is not null or public.sou_equipe())
    and now() >= a.inicia_em and now() < a.termina_em and not a.cancelada
  order by (al.id = public.meu_aluno_id()) desc, al.nome
$$;

revoke execute on function public.meu_visitante_id() from public, anon;
revoke execute on function public.agenda_contagem(date, date) from public, anon;
revoke execute on function public.agora_contagem() from public, anon;
grant execute on function public.meu_visitante_id() to authenticated;
grant execute on function public.agenda_contagem(date, date) to authenticated;
grant execute on function public.agora_contagem() to authenticated;
grant execute on function public.pode_entrar(text) to anon, authenticated;

-- Cler: ex-aluna com acesso reduzido
insert into public.pessoas (email, nome, vinculo, acesso_app, observacoes)
values ('zemrosicler@gmail.com', 'Cler', 'ex_aluno', true, 'Acesso reduzido ao app (ex-aluna, pensando em voltar).')
on conflict (email) do update set vinculo = 'ex_aluno', acesso_app = true;

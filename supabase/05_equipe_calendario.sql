-- Alma · calendário da equipe (visão do mês)
create or replace function public.equipe_mes(p_de date, p_ate date)
returns table (aula_id uuid, inicia_em timestamptz, termina_em timestamptz, capacidade int, cancelada boolean, ocupadas int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query
  select a.id, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada,
         (select count(*) from public.reservas r join public.pessoas p on p.id = r.aluno_id and not p.fantasma
           where r.aula_id = a.id and r.status in ('confirmada','presente'))::int
    from public.aulas a
   where a.inicia_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
     and a.inicia_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
   order by a.inicia_em;
end $$;
revoke execute on function public.equipe_mes(date, date) from public, anon;
grant execute on function public.equipe_mes(date, date) to authenticated;

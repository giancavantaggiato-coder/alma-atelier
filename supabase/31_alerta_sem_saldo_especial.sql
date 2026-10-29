-- Alma · alerta "perto do limite de reposições" ignora quem tem saldo acima de 8
-- (só acontece quando a equipe dá um saldo especial, como o acumulado de anos da Érika)
create or replace function public.equipe_alertas()
returns table (tipo text, aluno_id uuid, nome text, valor int, detalhe text, dia date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query
  with nomes as (
    select p.id, coalesce(nullif(trim(coalesce(p.nome,'') || ' ' || coalesce(p.sobrenome,'')), ''), p.email) as nome, p.plano, p.reposicao_livre
      from public.pessoas p where p.vinculo = 'aluno' and not p.fantasma
  ),
  cred as (
    select c.aluno_id, count(*)::int as n from public.creditos c
     where c.usado_em_reserva_id is null and c.expira_em >= current_date group by 1
  ),
  passadas as (
    select rs.aluno_id, rs.status, a.inicia_em,
           row_number() over (partition by rs.aluno_id order by a.inicia_em desc) as rn
      from public.reservas rs join public.aulas a on a.id = rs.aula_id
     where a.termina_em <= now() and a.inicia_em > now() - interval '120 days' and not a.cancelada
       and rs.status <> 'aula_cancelada' and not (rs.tipo = 'reposicao' and rs.status = 'desmarcada')
  ),
  seq as (
    select ps.aluno_id,
           coalesce(min(ps.rn) filter (where ps.status in ('confirmada','presente')) - 1, count(*))::int as seguidas,
           max(ps.inicia_em) filter (where ps.status in ('confirmada','presente')) as ultima
      from passadas ps group by 1
  ),
  espera as (
    select le.aula_id, count(*)::int as n, a.inicia_em
      from public.lista_espera le join public.aulas a on a.id = le.aula_id
     where a.inicia_em > now() and not a.cancelada and not public.eh_fantasma(le.aluno_id)
     group by le.aula_id, a.inicia_em
  )
  select 'faltas'::text, s.aluno_id, n.nome, s.seguidas,
         s.seguidas || ' aulas seguidas sem vir' || coalesce('. Veio pela última vez em ' || to_char(s.ultima at time zone 'America/Sao_Paulo', 'DD/MM'), ''),
         null::date
    from seq s join nomes n on n.id = s.aluno_id
   where s.seguidas >= 2
  union all
  select 'reposicoes', c.aluno_id, n.nome, c.n,
         c.n || ' de 8 reposições acumuladas' || case when c.n >= 8 then '. No limite, não ganha mais' else '' end,
         null::date
    from cred c join nomes n on n.id = c.aluno_id
   where c.n between 6 and 8 and not n.reposicao_livre and coalesce(n.plano, 'fixo') <> 'livre'
  union all
  select 'espera', null::uuid, public.quando_txt(e.inicia_em), e.n,
         e.n || case when e.n = 1 then ' pessoa' else ' pessoas' end || ' na lista de espera',
         (e.inicia_em at time zone 'America/Sao_Paulo')::date
    from espera e
  order by 1, 4 desc;
end $$;

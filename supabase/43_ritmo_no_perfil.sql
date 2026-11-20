-- "Semanas mantendo o ritmo" passa a aparecer no perfil público (20/11/2026).
-- O cálculo sai de meu_resumo para uma função por pessoa, usada pelos dois.

create or replace function public.semanas_ritmo(p_aluno uuid)
returns int
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_ultima_falta timestamptz; v_inicio timestamptz;
begin
  select max(a.inicia_em) into v_ultima_falta
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.aluno_id = p_aluno and r.status in ('falta','ausencia_tardia') and a.inicia_em <= now();

  select min(a.inicia_em) into v_inicio
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.aluno_id = p_aluno and r.status in ('confirmada','presente') and not a.cancelada
    and a.inicia_em <= now() and (v_ultima_falta is null or a.inicia_em > v_ultima_falta);

  return case when v_inicio is null then 0
              else greatest(1, round(extract(epoch from now() - v_inicio) / 604800))::int end;
end $$;
revoke all on function public.semanas_ritmo(uuid) from public, anon, authenticated;

create or replace function public.meu_resumo()
 returns table(aulas_total integer, presenca_90d integer, semanas_ritmo integer, creditos_ativos integer)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_aluno uuid := public.meu_aluno_id();
  v_pres int; v_prev int; v_ant int;
begin
  if v_aluno is null then return; end if;
  select aulas_anteriores into v_ant from public.pessoas where id = v_aluno;

  select count(*) filter (where r.status in ('confirmada','presente') and a.termina_em <= now() and a.inicia_em > now() - interval '90 days'),
         count(*) filter (where r.tipo = 'fixa' and r.status <> 'aula_cancelada' and a.termina_em <= now() and a.inicia_em > now() - interval '90 days')
    into v_pres, v_prev
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.aluno_id = v_aluno and not a.cancelada;

  return query select
    (v_ant + (select count(*) from public.reservas r join public.aulas a on a.id = r.aula_id
              where r.aluno_id = v_aluno and r.status in ('confirmada','presente') and a.termina_em <= now() and not a.cancelada))::int,
    case when v_prev = 0 then null else least(100, round(100.0 * v_pres / v_prev))::int end,
    public.semanas_ritmo(v_aluno),
    (select count(*) from public.creditos c where c.aluno_id = v_aluno and c.usado_em_reserva_id is null and c.expira_em >= current_date)::int;
end $function$;

drop function if exists public.perfil_publico(uuid);
create function public.perfil_publico(p_pessoa uuid)
 returns table(id uuid, nome text, avatar_url text, capa_url text, cargo text, dias text, aluno_desde date, sou_eu boolean, semanas_ritmo integer)
 language sql stable security definer set search_path to 'public'
as $function$
  select p.id, public.nome_curto(p),
         p.avatar_url, p.capa_url, p.cargo_publico,
         (select string_agg(
                   (array['Domingos','Segundas','Terças','Quartas','Quintas','Sextas','Sábados'])[t.dia_semana + 1]
                   || ', ' || to_char(t.inicio, 'FMHH24') || 'h'
                   || case when m.quinzenal then ', semana sim, semana não' else '' end,
                   '; ' order by case when t.dia_semana = 0 then 7 else t.dia_semana end, t.inicio)
            from public.matriculas m join public.turmas t on t.id = m.turma_id
           where m.aluno_id = p.id and m.ate is null and t.ativa),
         case when p.vinculo in ('aluno','pausado') then p.aluno_desde end,
         p.id = public.meu_aluno_id(),
         case when p.vinculo = 'aluno' then public.semanas_ritmo(p.id) end
    from public.pessoas p
   where p.id = p_pessoa
     and (public.meu_aluno_id() is not null or public.sou_equipe())
     and (not p.fantasma or p.id = public.meu_aluno_id())
     and (p.vinculo in ('aluno','pausado') or p.cargo_publico is not null)
$function$;
revoke all on function public.perfil_publico(uuid) from public, anon;
grant execute on function public.perfil_publico(uuid) to authenticated, service_role;

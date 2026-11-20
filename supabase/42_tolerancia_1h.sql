-- Tolerância para desmarcar com reposição passa de 4h para 1h (20/11/2026).
-- Já aplicado no banco. Substitui as versões de desmarcar, voltar_dias_fixos
-- e do aviso à equipe que estavam em 01, 06/08 e 33.

CREATE OR REPLACE FUNCTION public.desmarcar(p_reserva uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.reservas; a public.aulas; v_aluno uuid := public.meu_aluno_id(); v_ativos int; v_dia date;
begin
  select * into r from public.reservas where id = p_reserva and aluno_id = v_aluno for update;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if r.status <> 'confirmada' then raise exception 'Esta aula não pode mais ser desmarcada'; end if;
  select * into a from public.aulas where id = r.aula_id;
  if a.cancelada then raise exception 'Esta aula foi cancelada pelo atelier'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;

  if a.inicia_em - now() < interval '1 hour' then
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
end $function$;

CREATE OR REPLACE FUNCTION public.voltar_dias_fixos()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_aluno uuid := public.meu_aluno_id(); r record; n_rep int := 0; n_fixa int := 0; n_pulo int := 0;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  for r in select rs.id from public.reservas rs join public.aulas a on a.id = rs.aula_id
            where rs.aluno_id = v_aluno and rs.tipo = 'reposicao' and rs.status = 'confirmada'
              and not a.cancelada and a.inicia_em > now() + interval '1 hour'
            for update of rs loop
    update public.creditos set usado_em_reserva_id = null where usado_em_reserva_id = r.id;
    update public.reservas set status = 'desmarcada', atualizado_em = now() where id = r.id;
    n_rep := n_rep + 1;
  end loop;
  for r in select rs.id from public.reservas rs join public.aulas a on a.id = rs.aula_id
            where rs.aluno_id = v_aluno and rs.tipo = 'fixa' and rs.status = 'desmarcada'
              and not a.cancelada and a.inicia_em > now() + interval '1 hour'
            order by a.inicia_em loop
    begin
      perform public.remarcar_aula(r.id);
      n_fixa := n_fixa + 1;
    exception when others then
      n_pulo := n_pulo + 1;
    end;
  end loop;
  return json_build_object('reposicoes', n_rep, 'fixas', n_fixa, 'puladas', n_pulo);
end $function$;

CREATE OR REPLACE FUNCTION public.desmarcacao_avisa_equipe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.reservas; a public.aulas; v_nome text; v_corpo text;
begin
  if tg_op = 'DELETE' then
    r := old;
    if r.tipo <> 'reposicao' or r.status <> 'confirmada' then return null; end if;
  else
    r := new;
    if old.status <> 'confirmada' or new.status not in ('desmarcada','ausencia_tardia') then return null; end if;
  end if;
  if public.eh_fantasma(r.aluno_id) or public.sou_equipe() then return null; end if;
  select * into a from public.aulas where id = r.aula_id;
  if a.cancelada or a.inicia_em <= now() then return null; end if;
  select coalesce(nullif(trim(coalesce(nome,'') || ' ' || coalesce(sobrenome,'')), ''), email) into v_nome from public.pessoas where id = r.aluno_id;
  v_corpo := v_nome || ' desmarcou ' || case when r.tipo = 'reposicao' then 'a reposição de ' else 'a aula de ' end
             || public.quando_txt(a.inicia_em)
             || case when tg_op = 'UPDATE' and new.status = 'ausencia_tardia' then '. Avisou com menos de 1h, sem reposição.' else '.' end;
  perform public.notificar(null, 'Aula desmarcada', v_corpo, './?ir=eqhoje',
    'desm:' || r.id || ':' || extract(epoch from now())::bigint);
  return null;
end $function$;

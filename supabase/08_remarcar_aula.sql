-- Alma · remarcar uma aula fixa desmarcada (uma por vez) e correção do "reverter"
-- O crédito gerado pela falta é consumido ao remarcar; créditos que já foram consumidos
-- pela própria aula (num remarcar anterior) são ignorados.

create or replace function public.remarcar_aula(p_reserva uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_aluno uuid := public.meu_aluno_id(); r public.reservas; a public.aulas; v_cred public.creditos; v_ocup int;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into r from public.reservas where id = p_reserva and aluno_id = v_aluno for update;
  if not found then raise exception 'Aula não encontrada'; end if;
  if r.tipo <> 'fixa' or r.status not in ('desmarcada','ausencia_tardia') then raise exception 'Esta aula não está desmarcada'; end if;
  select * into a from public.aulas where id = r.aula_id;
  if a.cancelada then raise exception 'Esta aula foi cancelada pelo atelier'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;

  select * into v_cred from public.creditos
   where reserva_origem_id = r.id and aluno_id = v_aluno and usado_em_reserva_id is distinct from r.id
   order by (usado_em_reserva_id is null) desc, criado_em desc limit 1;
  if found and v_cred.usado_em_reserva_id is not null then
    raise exception 'A reposição desta falta já foi usada em outro dia. Desmarque aquela reposição antes de remarcar esta aula.';
  end if;

  select count(*) into v_ocup from public.reservas x
   where x.aula_id = r.aula_id and x.status in ('confirmada','presente') and not public.eh_fantasma(x.aluno_id);
  if v_ocup >= a.capacidade and not public.eh_fantasma(v_aluno) then raise exception 'Este horário já está lotado'; end if;

  update public.reservas set status = 'confirmada', atualizado_em = now() where id = r.id;
  if v_cred.id is not null then
    update public.creditos set usado_em_reserva_id = r.id where id = v_cred.id;
  end if;
end $$;
revoke execute on function public.remarcar_aula(uuid) from public, anon;
grant execute on function public.remarcar_aula(uuid) to authenticated;

create or replace function public.voltar_dias_fixos()
returns json language plpgsql security definer set search_path = public as $$
declare v_aluno uuid := public.meu_aluno_id(); r record; n_rep int := 0; n_fixa int := 0; n_pulo int := 0;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  for r in select rs.id from public.reservas rs join public.aulas a on a.id = rs.aula_id
            where rs.aluno_id = v_aluno and rs.tipo = 'reposicao' and rs.status = 'confirmada'
              and not a.cancelada and a.inicia_em > now() + interval '4 hours'
            for update of rs loop
    update public.creditos set usado_em_reserva_id = null where usado_em_reserva_id = r.id;
    update public.reservas set status = 'desmarcada', atualizado_em = now() where id = r.id;
    n_rep := n_rep + 1;
  end loop;
  for r in select rs.id from public.reservas rs join public.aulas a on a.id = rs.aula_id
            where rs.aluno_id = v_aluno and rs.tipo = 'fixa' and rs.status = 'desmarcada'
              and not a.cancelada and a.inicia_em > now() + interval '4 hours'
            order by a.inicia_em loop
    begin
      perform public.remarcar_aula(r.id);
      n_fixa := n_fixa + 1;
    exception when others then
      n_pulo := n_pulo + 1;
    end;
  end loop;
  return json_build_object('reposicoes', n_rep, 'fixas', n_fixa, 'puladas', n_pulo);
end $$;
revoke execute on function public.voltar_dias_fixos() from public, anon;
grant execute on function public.voltar_dias_fixos() to authenticated;

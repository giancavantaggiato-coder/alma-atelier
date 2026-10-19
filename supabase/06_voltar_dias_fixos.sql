-- Alma · aluno volta aos seus dias fixos
-- Para aulas que começam daqui a mais de 4h:
--  1) reposições marcadas são desfeitas e o crédito volta;
--  2) aulas fixas desmarcadas são remarcadas e a reposição gerada por elas é consumida.
create or replace function public.voltar_dias_fixos()
returns json language plpgsql security definer set search_path = public as $$
declare v_aluno uuid := public.meu_aluno_id(); r record; v_cred public.creditos; v_ocup int; n_rep int := 0; n_fixa int := 0; n_pulo int := 0;
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

  for r in select rs.id, rs.aula_id, a.capacidade from public.reservas rs join public.aulas a on a.id = rs.aula_id
            where rs.aluno_id = v_aluno and rs.tipo = 'fixa' and rs.status = 'desmarcada'
              and not a.cancelada and a.inicia_em > now() + interval '4 hours'
            order by a.inicia_em for update of rs loop
    select * into v_cred from public.creditos where reserva_origem_id = r.id and aluno_id = v_aluno limit 1;
    if found and v_cred.usado_em_reserva_id is not null then n_pulo := n_pulo + 1; continue; end if;
    select count(*) into v_ocup from public.reservas x
     where x.aula_id = r.aula_id and x.status in ('confirmada','presente') and not public.eh_fantasma(x.aluno_id);
    if v_ocup >= r.capacidade and not public.eh_fantasma(v_aluno) then n_pulo := n_pulo + 1; continue; end if;
    update public.reservas set status = 'confirmada', atualizado_em = now() where id = r.id;
    if v_cred.id is not null then
      update public.creditos set usado_em_reserva_id = r.id where id = v_cred.id;
    end if;
    v_cred := null;
    n_fixa := n_fixa + 1;
  end loop;

  return json_build_object('reposicoes', n_rep, 'fixas', n_fixa, 'puladas', n_pulo);
end $$;
revoke execute on function public.voltar_dias_fixos() from public, anon;
grant execute on function public.voltar_dias_fixos() to authenticated;

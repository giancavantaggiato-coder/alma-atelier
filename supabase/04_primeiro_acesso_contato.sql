-- Alma · primeiro acesso com telefone e data de início
create or replace function public.completar_cadastro(p_nome text, p_sobrenome text, p_whatsapp text, p_desde date, p_frequencia int, p_horarios uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.meu_aluno_id(); v_p public.pessoas; v_tem int; h uuid; t public.turmas; v_ocup int;
begin
  if v_id is null then raise exception 'Cadastro não encontrado'; end if;
  select * into v_p from public.pessoas where id = v_id for update;
  if coalesce(trim(p_nome),'') = '' or coalesce(trim(p_sobrenome),'') = '' then raise exception 'Preencha nome e sobrenome'; end if;
  if length(regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g')) < 10 then raise exception 'Confira o telefone, com DDD'; end if;
  if p_desde is null or p_desde > current_date then raise exception 'Informe desde quando você faz aula no Alma'; end if;
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
         whatsapp = trim(p_whatsapp), aluno_desde = date_trunc('month', p_desde)::date,
         frequencia_semanal = p_frequencia, cadastro_completo_em = now()
   where id = v_id;
end $$;
revoke execute on function public.completar_cadastro(text, text, text, date, int, uuid[]) from public, anon;
grant execute on function public.completar_cadastro(text, text, text, date, int, uuid[]) to authenticated;
-- a versão antiga (sem telefone) deixa de poder ser chamada pelo app
revoke execute on function public.completar_cadastro(text, text, int, uuid[]) from public, anon, authenticated;

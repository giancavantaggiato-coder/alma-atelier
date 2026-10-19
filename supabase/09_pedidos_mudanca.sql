-- Alma · pedido de mudança de frequência/dias (aluno pede, equipe aprova)
create table if not exists public.pedidos_mudanca (
  id                 uuid primary key default gen_random_uuid(),
  aluno_id           uuid not null references public.pessoas(id) on delete cascade,
  frequencia_atual   smallint,
  horarios_atuais    uuid[] not null default '{}',
  frequencia_nova    smallint not null check (frequencia_nova between 1 and 7),
  horarios_novos     uuid[] not null,
  observacao_aluno   text,
  status             text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado')),
  resposta_equipe    text,
  criado_em          timestamptz not null default now(),
  decidido_em        timestamptz
);
create index if not exists pedidos_mudanca_pendentes on public.pedidos_mudanca (status, criado_em);
alter table public.pedidos_mudanca enable row level security;
create policy pedidos_le_proprio on public.pedidos_mudanca for select to authenticated
  using (aluno_id = public.meu_aluno_id() or public.sou_equipe());

-- Aluno pede a mudança (um pedido aberto por vez; um novo substitui o anterior)
create or replace function public.pedir_mudanca(p_frequencia int, p_horarios uuid[], p_obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_aluno uuid := public.meu_aluno_id(); v_p public.pessoas; v_atuais uuid[]; v_id uuid; h uuid;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into v_p from public.pessoas where id = v_aluno;
  if v_p.vinculo <> 'aluno' then raise exception 'Sua matrícula está pausada. Fale com o atelier.'; end if;
  p_horarios := array(select distinct unnest(coalesce(p_horarios, '{}')));
  if p_frequencia is null or p_frequencia < 1 or p_frequencia > 7 then raise exception 'Escolha a frequência'; end if;
  if cardinality(p_horarios) <> p_frequencia then raise exception 'Escolha % dia(s) do atelier', p_frequencia; end if;
  foreach h in array p_horarios loop
    if not exists (select 1 from public.turmas where id = h and ativa) then raise exception 'Horário indisponível'; end if;
  end loop;
  select coalesce(array_agg(turma_id order by turma_id), '{}') into v_atuais from public.matriculas where aluno_id = v_aluno and ate is null;
  if (select array_agg(x order by x) from unnest(p_horarios) x) = v_atuais then raise exception 'Esses já são os seus dias'; end if;
  update public.pedidos_mudanca set status = 'cancelado', decidido_em = now() where aluno_id = v_aluno and status = 'pendente';
  insert into public.pedidos_mudanca (aluno_id, frequencia_atual, horarios_atuais, frequencia_nova, horarios_novos, observacao_aluno)
  values (v_aluno, coalesce(v_p.frequencia_semanal, cardinality(v_atuais)), v_atuais, p_frequencia, p_horarios, nullif(trim(p_obs), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancelar_pedido_mudanca()
returns void language sql security definer set search_path = public as $$
  update public.pedidos_mudanca set status = 'cancelado', decidido_em = now()
   where aluno_id = public.meu_aluno_id() and status = 'pendente'
$$;

-- Equipe: pedidos com nomes legíveis
create or replace function public.equipe_pedidos()
returns table (id uuid, aluno_id uuid, aluno_nome text, frequencia_atual smallint, dias_atuais text, frequencia_nova smallint, dias_novos text,
               observacao_aluno text, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query
  select pm.id, pm.aluno_id, coalesce(p.nome, p.email), pm.frequencia_atual,
         (select string_agg(t.nome, ', ' order by case when t.dia_semana = 0 then 7 else t.dia_semana end, t.inicio) from public.turmas t where t.id = any(pm.horarios_atuais)),
         pm.frequencia_nova,
         (select string_agg(t.nome || case when (select count(*) from public.matriculas m join public.pessoas q on q.id = m.aluno_id and q.vinculo = 'aluno' and not q.fantasma
                                                   where m.turma_id = t.id and m.ate is null and m.aluno_id <> pm.aluno_id) >= t.capacidade then ' (lotado)' else '' end,
                            ', ' order by case when t.dia_semana = 0 then 7 else t.dia_semana end, t.inicio) from public.turmas t where t.id = any(pm.horarios_novos)),
         pm.observacao_aluno, pm.criado_em
    from public.pedidos_mudanca pm join public.pessoas p on p.id = pm.aluno_id
   where pm.status = 'pendente'
   order by pm.criado_em;
end $$;

-- Equipe aprova: sai dos dias que não quer mais, entra nos novos (as aulas futuras se ajustam)
create or replace function public.aprovar_mudanca(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pm public.pedidos_mudanca; h uuid; t public.turmas; v_ocup int; m record;
begin
  perform public.exigir_equipe();
  select * into pm from public.pedidos_mudanca where id = p_pedido and status = 'pendente' for update;
  if not found then raise exception 'Pedido não encontrado ou já decidido'; end if;
  foreach h in array pm.horarios_novos loop
    select * into t from public.turmas where id = h;
    if not t.ativa then raise exception 'O horário de % não está mais ativo', t.nome; end if;
    select count(*) into v_ocup from public.matriculas mm join public.pessoas q on q.id = mm.aluno_id and q.vinculo = 'aluno' and not q.fantasma
     where mm.turma_id = h and mm.ate is null and mm.aluno_id <> pm.aluno_id;
    if v_ocup >= t.capacidade and not public.eh_fantasma(pm.aluno_id) then raise exception '% está lotado', t.nome; end if;
  end loop;
  for m in select turma_id from public.matriculas where aluno_id = pm.aluno_id and ate is null and not (turma_id = any(pm.horarios_novos)) loop
    perform public.desmatricular(pm.aluno_id, m.turma_id);
  end loop;
  foreach h in array pm.horarios_novos loop
    perform public.matricular(pm.aluno_id, h);
  end loop;
  update public.pessoas set frequencia_semanal = pm.frequencia_nova where id = pm.aluno_id;
  update public.pedidos_mudanca set status = 'aprovado', decidido_em = now() where id = pm.id;
end $$;

create or replace function public.recusar_mudanca(p_pedido uuid, p_resposta text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  update public.pedidos_mudanca set status = 'recusado', resposta_equipe = nullif(trim(p_resposta), ''), decidido_em = now()
   where id = p_pedido and status = 'pendente';
  if not found then raise exception 'Pedido não encontrado ou já decidido'; end if;
end $$;

revoke execute on function public.pedir_mudanca(int, uuid[], text) from public, anon;
revoke execute on function public.cancelar_pedido_mudanca() from public, anon;
revoke execute on function public.equipe_pedidos() from public, anon;
revoke execute on function public.aprovar_mudanca(uuid) from public, anon;
revoke execute on function public.recusar_mudanca(uuid, text) from public, anon;
grant execute on function public.pedir_mudanca(int, uuid[], text) to authenticated;
grant execute on function public.cancelar_pedido_mudanca() to authenticated;
grant execute on function public.equipe_pedidos() to authenticated;
grant execute on function public.aprovar_mudanca(uuid) to authenticated;
grant execute on function public.recusar_mudanca(uuid, text) to authenticated;
grant select on public.pedidos_mudanca to authenticated;

-- 24: matrícula quinzenal, aviso de desmarcação para a equipe, perfil público
-- (já aplicado no projeto alma-cadastros em 30/10/2026)

-- Matrícula quinzenal: a semana do "desde" é de aula, a seguinte é folga
alter table public.matriculas add column if not exists quinzenal boolean not null default false;

create or replace function public.reserva_fixa_quinzenal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dia date; v_folga boolean;
begin
  if new.tipo <> 'fixa' then return new; end if;
  select (a.inicia_em at time zone 'America/Sao_Paulo')::date into v_dia from public.aulas a where a.id = new.aula_id;
  select exists (
    select 1 from public.matriculas m join public.aulas a on a.turma_id = m.turma_id and a.id = new.aula_id
     where m.aluno_id = new.aluno_id and m.quinzenal
       and m.desde <= v_dia and (m.ate is null or m.ate >= v_dia)
       and mod(((v_dia - m.desde) / 7), 2) = 1
  ) into v_folga;
  if v_folga then return null; end if;
  return new;
end $$;
create trigger reserva_fixa_quinzenal before insert on public.reservas
for each row execute function public.reserva_fixa_quinzenal();

-- Aviso para a equipe quando um aluno desmarca
create or replace function public.desmarcacao_avisa_equipe()
returns trigger language plpgsql security definer set search_path = public as $$
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
             || case when tg_op = 'UPDATE' and new.status = 'ausencia_tardia' then '. Avisou com menos de 4h, sem reposição.' else '.' end;
  perform public.notificar(null, 'Aula desmarcada', v_corpo, './?ir=eqhoje',
    'desm:' || r.id || ':' || extract(epoch from now())::bigint);
  return null;
end $$;
create trigger desmarcacao_avisa_equipe after update or delete on public.reservas
for each row execute function public.desmarcacao_avisa_equipe();

-- Perfil público (foto, capa, dias, tempo de atelier, cargo)
alter table public.pessoas add column if not exists cargo_publico text;

create or replace function public.perfil_publico(p_pessoa uuid)
returns table (id uuid, nome text, avatar_url text, capa_url text, cargo text, dias text, aluno_desde date, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(trim(split_part(p.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(p.nome,' ',2),1),'') || '.', '')), ''), 'Aluno'),
         p.avatar_url, p.capa_url, p.cargo_publico,
         (select string_agg(
                   (array['Domingos','Segundas','Terças','Quartas','Quintas','Sextas','Sábados'])[t.dia_semana + 1]
                   || ', ' || to_char(t.inicio, 'FMHH24') || 'h'
                   || case when m.quinzenal then ', semana sim, semana não' else '' end,
                   '; ' order by case when t.dia_semana = 0 then 7 else t.dia_semana end, t.inicio)
            from public.matriculas m join public.turmas t on t.id = m.turma_id
           where m.aluno_id = p.id and m.ate is null and t.ativa),
         case when p.vinculo in ('aluno','pausado') then p.aluno_desde end,
         p.id = public.meu_aluno_id()
    from public.pessoas p
   where p.id = p_pessoa
     and (public.meu_aluno_id() is not null or public.sou_equipe())
     and (not p.fantasma or p.id = public.meu_aluno_id())
     and (p.vinculo in ('aluno','pausado') or p.cargo_publico is not null)
$$;
revoke all on function public.perfil_publico(uuid) from public, anon;
grant execute on function public.perfil_publico(uuid) to authenticated;

create or replace function public.inscritos_eventos_perfil()
returns table (evento_id uuid, pessoa_id uuid, nome text, avatar_url text, sou_eu boolean, cargo text)
language sql stable security definer set search_path = public as $$
  select i.evento_id, p.id,
         coalesce(nullif(trim(split_part(p.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(p.nome,' ',2),1),'') || '.', '')), ''), 'Aluno'),
         p.avatar_url, p.id = public.meu_aluno_id(), p.cargo_publico
    from public.inscricoes i
    join public.pessoas p on p.id = i.pessoa_id and (not p.fantasma or p.id = public.meu_aluno_id())
   where public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe()
   order by i.evento_id, (p.id = public.meu_aluno_id()) desc, i.criado_em
$$;
revoke all on function public.inscritos_eventos_perfil() from public, anon;
grant execute on function public.inscritos_eventos_perfil() to authenticated;

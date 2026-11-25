-- 46: Saída travada depois do fim das inscrições + reações nas dicas do presente (24/11/2026)
-- 1. Depois que as inscrições de um evento fecham (ou o evento começou), o aluno não consegue mais
--    cancelar a própria inscrição pelo app. Para sair, fala com a equipe.
-- 2. Nas dicas do amigo secreto, cada participante pode reagir às dicas dos outros (uma reação por dica).
-- 3. Caio volta para o Amigo Secreto (saiu sem querer em 24/11).

create or replace function public.cancelar_inscricao(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.eventos
              where id = p_evento
                and (inicia_em <= now() or (inscricoes_ate is not null and inscricoes_ate < now()))) then
    raise exception 'As inscrições deste evento já fecharam. Para sair, fale com a equipe.';
  end if;
  delete from public.inscricoes where evento_id = p_evento and pessoa_id = public.meu_inscrito_id();
end $$;
revoke all on function public.cancelar_inscricao(uuid) from public, anon;
grant execute on function public.cancelar_inscricao(uuid) to authenticated;

create table if not exists public.dica_reacoes (
  evento_id  uuid not null,
  dono_id    uuid not null,             -- quem escreveu a dica
  pessoa_id  uuid not null,             -- quem reagiu
  emoji      text not null,
  criado_em  timestamptz not null default now(),
  primary key (evento_id, dono_id, pessoa_id),
  foreign key (evento_id, dono_id) references public.evento_dicas (evento_id, pessoa_id) on delete cascade,
  foreign key (evento_id, pessoa_id) references public.inscricoes (evento_id, pessoa_id) on delete cascade
);
alter table public.dica_reacoes enable row level security;
revoke all on public.dica_reacoes from anon, authenticated;

-- toca no mesmo emoji de novo: tira a reação; outro emoji: troca
create or replace function public.reagir_dica(p_evento uuid, p_dono uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_participante_id();
begin
  if v_eu is null then raise exception 'Cadastro não encontrado'; end if;
  if v_eu = p_dono then raise exception 'Reaja às dicas dos outros participantes'; end if;
  if p_emoji is null or char_length(p_emoji) > 16 then raise exception 'Reação inválida'; end if;
  if not exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu) then
    raise exception 'Só quem está participando reage às dicas';
  end if;
  if not exists (select 1 from public.evento_dicas where evento_id = p_evento and pessoa_id = p_dono) then
    raise exception 'Dica não encontrada';
  end if;
  if exists (select 1 from public.dica_reacoes where evento_id = p_evento and dono_id = p_dono and pessoa_id = v_eu and emoji = p_emoji) then
    delete from public.dica_reacoes where evento_id = p_evento and dono_id = p_dono and pessoa_id = v_eu;
  else
    insert into public.dica_reacoes (evento_id, dono_id, pessoa_id, emoji) values (p_evento, p_dono, v_eu, p_emoji)
    on conflict (evento_id, dono_id, pessoa_id) do update set emoji = excluded.emoji, criado_em = now();
  end if;
end $$;
revoke all on function public.reagir_dica(uuid, uuid, text) from public, anon;
grant execute on function public.reagir_dica(uuid, uuid, text) to authenticated;

-- dicas_evento passa a trazer as reações de cada dica
create or replace function public.dicas_evento(p_evento uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_participante_id(); r json;
begin
  if not (public.meu_inscrito_id() is not null or public.sou_equipe()) then return null; end if;
  if not exists (select 1 from public.eventos where id = p_evento and dicas_presente and (publicado or public.sou_equipe())) then return null; end if;
  select json_build_object(
    'inscrito', exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu),
    'minha', (select texto from public.evento_dicas where evento_id = p_evento and pessoa_id = v_eu),
    'eu', v_eu,
    'total', (select count(*) from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma where i.evento_id = p_evento),
    'itens', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p), 'texto', d.texto, 'sou_eu', p.id = v_eu,
                         'reacoes', coalesce((select json_agg(json_build_object('emoji', x.emoji, 'total', x.total, 'minha', x.minha, 'nomes', x.nomes) order by x.primeiro)
                                                from (select dr.emoji, count(*) as total, bool_or(dr.pessoa_id = v_eu) as minha, min(dr.criado_em) as primeiro,
                                                             json_agg(case when dr.pessoa_id = v_eu then 'você' else public.nome_curto(q) end order by dr.criado_em) as nomes
                                                        from public.dica_reacoes dr join public.pessoas q on q.id = dr.pessoa_id
                                                       where dr.evento_id = p_evento and dr.dono_id = p.id and (not q.fantasma or q.id = v_eu)
                                                       group by dr.emoji) x), '[]'::json))
                         order by public.nome_curto(p))
                        from public.evento_dicas d join public.pessoas p on p.id = d.pessoa_id
                       where d.evento_id = p_evento and (not p.fantasma or p.id = v_eu)), '[]'::json),
    'faltam', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p)) order by public.nome_curto(p))
                         from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma
                        where i.evento_id = p_evento and p.id is distinct from v_eu
                          and not exists (select 1 from public.evento_dicas d where d.evento_id = p_evento and d.pessoa_id = p.id)), '[]'::json)
  ) into r;
  return r;
end $$;

-- Caio de volta ao Amigo Secreto
insert into public.inscricoes (evento_id, pessoa_id)
select 'a8b96a3f-31d8-4a24-87af-e542d526c1ae', 'd49fcb9b-890b-4c28-9576-2af699c793ad'
on conflict do nothing;

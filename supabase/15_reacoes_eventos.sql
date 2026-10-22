-- DESATIVADO em 21/10/2026: as reações foram retiradas do app. Tabelas e funções seguem no banco, sem uso.
-- Reações com emoji nos eventos (segurar o evento no app abre a barra de emojis).
-- Uma reação por pessoa em cada evento; tocar no mesmo emoji de novo tira a reação.
create table if not exists public.reacoes_evento (
  evento_id uuid not null references public.eventos(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','😍','👏','🎨','🔥','😂')),
  criado_em timestamptz not null default now(),
  primary key (evento_id, pessoa_id)
);
alter table public.reacoes_evento enable row level security;
revoke all on public.reacoes_evento from anon, authenticated;

create or replace function public.reagir_evento(p_evento uuid, p_emoji text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.meu_aluno_id(); v_atual text;
begin
  if v_id is null then raise exception 'Reações são para alunos do atelier.'; end if;
  if p_emoji not in ('❤️','😍','👏','🎨','🔥','😂') then raise exception 'Emoji inválido'; end if;
  if not exists (select 1 from public.eventos where id = p_evento and publicado) then raise exception 'Evento não encontrado'; end if;
  select emoji into v_atual from public.reacoes_evento where evento_id = p_evento and pessoa_id = v_id;
  if v_atual = p_emoji then
    delete from public.reacoes_evento where evento_id = p_evento and pessoa_id = v_id;
    return null;
  end if;
  insert into public.reacoes_evento (evento_id, pessoa_id, emoji) values (p_evento, v_id, p_emoji)
  on conflict (evento_id, pessoa_id) do update set emoji = excluded.emoji, criado_em = now();
  return p_emoji;
end $$;

create or replace function public.reacoes_eventos()
returns table (evento_id uuid, emoji text, total int, minha boolean)
language sql stable security definer set search_path = public as $$
  select r.evento_id, r.emoji, count(*)::int, bool_or(r.pessoa_id = public.meu_aluno_id())
    from public.reacoes_evento r
    join public.pessoas p on p.id = r.pessoa_id and (not p.fantasma or p.id = public.meu_aluno_id())
   where public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe()
   group by r.evento_id, r.emoji
$$;

revoke all on function public.reagir_evento(uuid, text) from public, anon;
revoke all on function public.reacoes_eventos() from public, anon;
grant execute on function public.reagir_evento(uuid, text) to authenticated;
grant execute on function public.reacoes_eventos() to authenticated;

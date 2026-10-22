-- DESATIVADO em 21/10/2026: as reações foram retiradas do app. Tabelas e funções seguem no banco, sem uso.
-- Reações passam a ser por login (tabela public.reacoes), para a equipe também reagir.
-- A tabela antiga reacoes_evento fica sem uso (nada foi apagado). A ficha do evento mostra quem reagiu.
create table if not exists public.reacoes (
  evento_id uuid not null references public.eventos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','😍','👏','🎨','🔥','😂')),
  criado_em timestamptz not null default now(),
  primary key (evento_id, user_id)
);
alter table public.reacoes enable row level security;
revoke all on public.reacoes from anon, authenticated;
comment on table public.reacoes_evento is 'Substituída por public.reacoes (por login). Não é mais usada.';

create or replace function public.login_fantasma(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pessoas where auth_user_id = p_user and fantasma)
$$;

-- reagir_evento(p_evento, p_emoji): alunos ativos e equipe; mesmo emoji de novo tira a reação.
-- reacoes_eventos(): contagem por evento e emoji (fantasma só aparece para ele mesmo).
-- quem_reagiu(p_evento): primeiro nome + inicial (alunos) ou nome da equipe, com o emoji.
-- Corpo completo dessas funções: migração 16_reacoes_equipe aplicada no Supabase em 21/10/2026.

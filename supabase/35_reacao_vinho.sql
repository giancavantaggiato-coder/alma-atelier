-- 35: emoji de vinho nas reações dos eventos (já aplicado em 30/10/2026)
alter table public.reacoes drop constraint reacoes_emoji_check;
alter table public.reacoes add constraint reacoes_emoji_check check (emoji in ('❤️','😍','👏','🎨','🔥','😂','🍷'));
-- reagir_evento: lista de emojis aceitos passou a incluir '🍷'

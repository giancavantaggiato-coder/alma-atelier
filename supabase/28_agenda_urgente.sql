-- Alma · agenda pessoal: marcar como urgente (deslizar para a direita)
alter table public.agenda_pessoal add column if not exists urgente boolean not null default false;

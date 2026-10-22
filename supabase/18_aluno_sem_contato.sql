-- Aluno que não usa o app pode ficar só com o nome (a equipe completa o contato depois).
alter table public.pessoas drop constraint if exists pessoas_check;
alter table public.pessoas add constraint pessoas_contato_check
  check (email is not null or whatsapp is not null or (vinculo in ('aluno','pausado') and not acesso_app));

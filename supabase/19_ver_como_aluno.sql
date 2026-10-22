-- Alma · ver como aluno dentro do app da equipe
-- A equipe liga o "modo aluno" no próprio app (sem trocar de aba nem de login).
-- Nesse modo o app manda o cabeçalho x-alma-ver-como: aluno e o banco trata a pessoa
-- da equipe como o seu cadastro fantasma (equipe.fantasma_id).

alter table public.equipe add column if not exists fantasma_id uuid references public.pessoas(id) on delete set null;

update public.equipe e set fantasma_id = p.id
  from public.pessoas p
 where e.email = 'giancarlo@almaestudosvisuais.com.br' and p.email = 'gianc.avantaggiato@gmail.com' and p.fantasma;

create or replace function public.vendo_como_aluno() returns boolean
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-alma-ver-como', '') = 'aluno'
$$;

create or replace function public.meu_aluno_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.pessoas where auth_user_id = auth.uid() and vinculo = 'aluno' and acesso_app),
    (select e.fantasma_id from public.equipe e
       join public.pessoas f on f.id = e.fantasma_id and f.fantasma
      where e.auth_user_id = auth.uid() and public.vendo_como_aluno())
  )
$$;

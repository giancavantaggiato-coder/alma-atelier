-- Alma · aluno suspenso com acesso ao app também se inscreve nos eventos
create or replace function public.meu_inscrito_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_aluno_id(),
    (select id from public.pessoas where auth_user_id = auth.uid() and vinculo in ('ex_aluno','pausado') and acesso_app))
$$;

-- Entrada sem código (exceção liberada pela equipe para um aluno).
-- Quando o e-mail demora a chegar, a equipe libera a pessoa por um prazo.
-- No primeiro acesso dentro do prazo ela entra só com o e-mail; o celular vira
-- aparelho conhecido e a liberação é consumida (vale uma vez).
alter table public.pessoas add column if not exists entrar_sem_codigo_ate timestamptz;

create or replace function public.conferir_aparelho(p_email text, p_token text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_uid uuid; v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
begin
  if not public.pode_entrar(p_email) then return 'nao_liberado'; end if;
  if public.e_email_equipe(p_email) then return 'equipe'; end if;
  select a.user_id into v_uid from public.aparelhos_app a join auth.users u on u.id = a.user_id
   where a.token_hash = v_hash and lower(u.email) = lower(trim(p_email));
  if v_uid is not null then
    update public.aparelhos_app set usado_em = now() where token_hash = v_hash;
    return 'ok';
  end if;
  -- liberação da equipe: registra este aparelho e consome a liberação
  select u.id into v_uid from public.pessoas p join auth.users u on lower(u.email) = p.email
   where p.email = lower(trim(p_email)) and p.vinculo = 'aluno' and p.acesso_app
     and p.entrar_sem_codigo_ate > now() and length(coalesce(p_token,'')) >= 32;
  if v_uid is null then return 'desconhecido'; end if;
  insert into public.aparelhos_app (token_hash, user_id) values (v_hash, v_uid) on conflict do nothing;
  update public.pessoas set entrar_sem_codigo_ate = null where email = lower(trim(p_email));
  return 'ok';
end $$;
revoke all on function public.conferir_aparelho(text, text) from public, anon, authenticated;
grant execute on function public.conferir_aparelho(text, text) to service_role;

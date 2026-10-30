-- Aparelho conhecido: o aluno entra só com o e-mail no celular onde já entrou antes.
-- Celular novo continua recebendo o código por e-mail. A equipe continua com a senha de 4 números.
-- O app guarda um token aleatório no aparelho; o banco guarda só o hash (sha256).
-- A verificação só pode ser chamada pelo servidor (Edge Function entrar-aparelho).

create table if not exists public.aparelhos_app (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  usado_em timestamptz not null default now()
);
create index if not exists aparelhos_app_user on public.aparelhos_app(user_id);
alter table public.aparelhos_app enable row level security;
revoke all on public.aparelhos_app from anon, authenticated;

create or replace function public.e_email_equipe(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where email = lower(trim(p_email)))
$$;

-- O usuário logado (aluno) registra este aparelho. Equipe não registra.
create or replace function public.registrar_aparelho(p_token text) returns boolean
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_email text;
begin
  if auth.uid() is null or length(coalesce(p_token,'')) < 32 then return false; end if;
  select email into v_email from auth.users where id = auth.uid();
  if public.sou_equipe() or public.e_email_equipe(v_email) then return false; end if;
  insert into public.aparelhos_app (token_hash, user_id)
  values (encode(digest(p_token, 'sha256'), 'hex'), auth.uid())
  on conflict (token_hash) do update set usado_em = now() where aparelhos_app.user_id = auth.uid();
  return true;
end $$;

-- Só o servidor: este token pertence a este e-mail, liberado e fora da equipe?
create or replace function public.conferir_aparelho(p_email text, p_token text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_uid uuid;
begin
  if not public.pode_entrar(p_email) then return 'nao_liberado'; end if;
  if public.e_email_equipe(p_email) then return 'equipe'; end if;
  select a.user_id into v_uid from public.aparelhos_app a join auth.users u on u.id = a.user_id
   where a.token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
     and lower(u.email) = lower(trim(p_email));
  if v_uid is null then return 'desconhecido'; end if;
  update public.aparelhos_app set usado_em = now() where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  return 'ok';
end $$;

-- Senha de 4 números agora só para a equipe; aluno entra por aparelho conhecido ou código.
create or replace function public.como_entrar(p_email text) returns text
language sql stable security definer set search_path = public, auth as $$
  select case
    when not public.pode_entrar(p_email) then null
    when public.e_email_equipe(p_email) and exists (select 1 from public.senhas_app s join auth.users u on u.id = s.user_id
                  where lower(u.email) = lower(trim(p_email)) and not s.bloqueada) then 'senha'
    else 'codigo' end
$$;

-- tenho_senha: aluno nunca é obrigado a criar senha
create or replace function public.tenho_senha() returns boolean
language sql stable security definer set search_path = public as $$
  select not public.sou_equipe()
      or exists (select 1 from public.senhas_app where user_id = auth.uid() and not bloqueada)
$$;

revoke all on function public.e_email_equipe(text) from public, anon, authenticated;
revoke all on function public.registrar_aparelho(text) from public, anon;
revoke all on function public.conferir_aparelho(text, text) from public, anon, authenticated;
grant execute on function public.registrar_aparelho(text) to authenticated;
grant execute on function public.conferir_aparelho(text, text) to service_role;

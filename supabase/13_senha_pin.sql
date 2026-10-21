-- Senha de 4 números para entrar no app sem precisar do código por e-mail.
-- O código por e-mail continua existindo: primeiro acesso, "esqueci a senha" e depois de 5 erros.
-- A senha fica guardada só como hash (bcrypt). Nada aqui é lido diretamente pelo app:
-- tudo passa por funções. A verificação da senha só pode ser chamada pelo servidor (Edge Function entrar-pin).

create table if not exists public.senhas_app (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  erros smallint not null default 0,
  bloqueada boolean not null default false,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
alter table public.senhas_app enable row level security;
revoke all on public.senhas_app from anon, authenticated;

-- O usuário logado cria ou troca a própria senha
create or replace function public.definir_senha(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Entre no app para criar a senha.'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'A senha tem 4 números.'; end if;
  insert into public.senhas_app (user_id, pin_hash)
  values (auth.uid(), crypt(p_pin, gen_salt('bf', 8)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, erros = 0, bloqueada = false, atualizada_em = now();
end $$;

-- O usuário logado já tem senha válida?
create or replace function public.tenho_senha() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.senhas_app where user_id = auth.uid() and not bloqueada)
$$;

-- Tela de login: este e-mail entra com senha ou com código?
-- Retorna 'senha', 'codigo' ou null (e-mail não liberado).
create or replace function public.como_entrar(p_email text) returns text
language sql stable security definer set search_path = public, auth as $$
  select case
    when not public.pode_entrar(p_email) then null
    when exists (select 1 from public.senhas_app s join auth.users u on u.id = s.user_id
                  where lower(u.email) = lower(trim(p_email)) and not s.bloqueada) then 'senha'
    else 'codigo' end
$$;

-- Só o servidor: confere a senha e conta os erros. 5 erros bloqueiam a senha
-- (a pessoa entra pelo código do e-mail e cria uma nova).
create or replace function public.conferir_senha(p_email text, p_pin text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_uid uuid; v public.senhas_app;
begin
  if not public.pode_entrar(p_email) then return 'nao_liberado'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null then return 'sem_senha'; end if;
  select * into v from public.senhas_app where user_id = v_uid for update;
  if not found then return 'sem_senha'; end if;
  if v.bloqueada then return 'bloqueada'; end if;
  if v.pin_hash = crypt(coalesce(p_pin,''), v.pin_hash) then
    update public.senhas_app set erros = 0 where user_id = v_uid;
    return 'ok';
  end if;
  update public.senhas_app set erros = erros + 1, bloqueada = (erros + 1 >= 5) where user_id = v_uid;
  return case when v.erros + 1 >= 5 then 'bloqueada' else 'errada:' || (5 - (v.erros + 1)) end;
end $$;

revoke all on function public.definir_senha(text) from public, anon;
revoke all on function public.tenho_senha() from public, anon;
revoke all on function public.conferir_senha(text, text) from public, anon, authenticated;
grant execute on function public.definir_senha(text) to authenticated;
grant execute on function public.tenho_senha() to authenticated;
grant execute on function public.como_entrar(text) to anon, authenticated;
grant execute on function public.conferir_senha(text, text) to service_role;

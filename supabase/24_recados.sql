-- Alma · recados
-- Um aluno manda um recado curto para outro aluno ou para o professor (equipe), e a equipe
-- também pode mandar para um aluno. O recado chega como notificação no celular e fica no
-- Hoje de quem recebeu até a pessoa dar "ok". Só remetente e destinatário veem o recado.

create table if not exists public.recados (
  id           uuid primary key default gen_random_uuid(),
  de_pessoa    uuid references public.pessoas(id) on delete cascade,
  de_equipe    text references public.equipe(email) on delete set null,
  para_pessoa  uuid references public.pessoas(id) on delete cascade,
  para_equipe  boolean not null default false,
  texto        text not null check (char_length(trim(texto)) between 1 and 280),
  criado_em    timestamptz not null default now(),
  lido_em      timestamptz,
  arquivado_em timestamptz,
  check (para_equipe or para_pessoa is not null)
);
create index if not exists recados_para on public.recados (para_pessoa, criado_em desc) where arquivado_em is null;
create index if not exists recados_equipe on public.recados (criado_em desc) where para_equipe and arquivado_em is null;
alter table public.recados enable row level security;   -- acesso só pelas funções abaixo

-- nome curto: "Ana S."
create or replace function public.nome_curto(p public.pessoas) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(trim(split_part(coalesce(p.nome,''),' ',1) || ' ' ||
         coalesce(nullif(left(coalesce(nullif(p.sobrenome,''), split_part(coalesce(p.nome,''),' ',2)),1),'') || '.', '')), ''), 'Aluno')
$$;

-- para quem posso mandar
create or replace function public.recado_destinatarios()
returns table (id uuid, nome text, avatar_url text, equipe boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_aluno_id();
begin
  if v_eu is null and not public.sou_equipe() then raise exception 'Entre no app primeiro'; end if;
  if v_eu is not null then
    return query select null::uuid, coalesce(split_part((select e.nome from public.equipe e order by e.criado_em limit 1), ' ', 1), 'Atelier') || ', professor', null::text, true;
  end if;
  return query
    select p.id, public.nome_curto(p), p.avatar_url, false
      from public.pessoas p
     where p.vinculo = 'aluno' and p.acesso_app and p.auth_user_id is not null and not p.fantasma
       and p.id is distinct from v_eu
     order by p.nome;
end $$;

create or replace function public.enviar_recado(p_para uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_aluno_id(); v_eq public.equipe; v_id uuid; v_de text; n int; d public.pessoas;
begin
  p_texto := trim(coalesce(p_texto, ''));
  if p_texto = '' then raise exception 'Escreva o recado'; end if;
  if char_length(p_texto) > 280 then raise exception 'O recado pode ter até 280 caracteres'; end if;
  if v_eu is null then
    select * into v_eq from public.equipe where auth_user_id = auth.uid();
    if not found then raise exception 'Entre no app primeiro'; end if;
    if p_para is null then raise exception 'Escolha um aluno'; end if;
  elsif (select vinculo from public.pessoas where id = v_eu) <> 'aluno' then
    raise exception 'Recados ficam disponíveis para alunos ativos';
  end if;
  select count(*) into n from public.recados
   where criado_em > now() - interval '1 day'
     and ((v_eu is not null and de_pessoa = v_eu) or (v_eu is null and de_equipe = v_eq.email));
  if n >= 30 then raise exception 'Você já mandou muitos recados hoje. Tente amanhã.'; end if;
  if p_para is not null then
    select * into d from public.pessoas where id = p_para and vinculo = 'aluno' and acesso_app;
    if not found then raise exception 'Este aluno não está disponível'; end if;
    if p_para = v_eu then raise exception 'Escolha outra pessoa'; end if;
  end if;

  insert into public.recados (de_pessoa, de_equipe, para_pessoa, para_equipe, texto)
  values (v_eu, case when v_eu is null then v_eq.email end, p_para, p_para is null, p_texto)
  returning id into v_id;

  v_de := case when v_eu is null then 'do professor' else 'de ' || public.nome_curto((select p from public.pessoas p where p.id = v_eu)) end;
  perform public.notificar(p_para, 'Recado ' || v_de, left(p_texto, 180), './?ir=hoje', 'recado:' || v_id);
  return v_id;
end $$;

-- recados que chegaram para mim (ainda no Hoje)
create or replace function public.meus_recados()
returns table (id uuid, de_id uuid, de_nome text, de_avatar text, de_equipe boolean, texto text, criado_em timestamptz, lido boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_aluno_id();
begin
  if v_eu is null and not public.sou_equipe() then return; end if;
  return query
    select r.id, r.de_pessoa,
           case when r.de_pessoa is null then 'Professor' else public.nome_curto(p) end,
           case when r.de_pessoa is null then (select e.avatar_url from public.equipe e where e.email = r.de_equipe) else p.avatar_url end,
           r.de_pessoa is null, r.texto, r.criado_em, r.lido_em is not null
      from public.recados r left join public.pessoas p on p.id = r.de_pessoa
     where r.arquivado_em is null
       and ((v_eu is not null and r.para_pessoa = v_eu) or (v_eu is null and r.para_equipe))
     order by r.criado_em desc
     limit 30;
end $$;

create or replace function public.arquivar_recado(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_aluno_id();
begin
  update public.recados set arquivado_em = now(), lido_em = coalesce(lido_em, now())
   where id = p_id and ((v_eu is not null and para_pessoa = v_eu) or (v_eu is null and para_equipe and public.sou_equipe()));
end $$;

create or replace function public.ler_recados()
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_aluno_id();
begin
  update public.recados set lido_em = now()
   where lido_em is null and ((v_eu is not null and para_pessoa = v_eu) or (v_eu is null and para_equipe and public.sou_equipe()));
end $$;

-- O recado da equipe aparece com o primeiro nome (ex.: "Giancarlo") e vem primeiro no Hoje.
create or replace function public.nome_equipe(p_email text default null) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(e.nome, ' ', 1), ''), 'Atelier')
    from public.equipe e where p_email is null or e.email = p_email
   order by e.criado_em limit 1
$$;
-- (recado_destinatarios, enviar_recado e meus_recados foram refeitas com nome_equipe; ver migração 24b no projeto)

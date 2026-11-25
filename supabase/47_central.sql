-- Alma · Central (fase 0)
-- Área de gestão dentro do admin, só para a direção: conteúdo, financeiro (lançamentos à mão
-- até o Asaas e o Inter entrarem) e fornecedores da loja.
-- Ninguém além da direção lê ou escreve estas tabelas: nem alunos, nem o resto da equipe.

-- quem é direção
alter table public.equipe add column if not exists direcao boolean not null default false;
update public.equipe set direcao = true where lower(email) = 'giancarlo@almaestudosvisuais.com.br';

create or replace function public.sou_direcao() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where auth_user_id = auth.uid() and direcao)
$$;
grant execute on function public.sou_direcao() to authenticated;

-- ---------------- Conteúdo ----------------
-- cada post, story, reels ou texto do blog, do rascunho à publicação
create table if not exists public.cont_pecas (
  id             uuid primary key default gen_random_uuid(),
  conta          text not null default 'atelier' check (conta in ('atelier','loja','blog')),
  formato        text not null default 'feed' check (formato in ('feed','carrossel','stories','reels','blog')),
  titulo         text not null check (length(trim(titulo)) between 1 and 200),
  texto          text,
  dia            date,                       -- vazio = ainda sem data (banco de ideias)
  hora           time,
  estado         text not null default 'ideia'
                 check (estado in ('ideia','texto','arte','revisao','aprovado','agendado','publicado')),
  link_figma     text,
  link_publicado text,
  notas          text,
  publicado_em   timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists cont_pecas_dia on public.cont_pecas (dia);

create or replace function public.cont_pecas_tocar() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.estado = 'publicado' and new.publicado_em is null then new.publicado_em := now(); end if;
  if new.estado <> 'publicado' then new.publicado_em := null; end if;
  return new;
end $$;
drop trigger if exists cont_pecas_tocar on public.cont_pecas;
create trigger cont_pecas_tocar before insert or update on public.cont_pecas
  for each row execute function public.cont_pecas_tocar();

-- ---------------- Loja: fornecedores ----------------
create table if not exists public.loja_fornecedores (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(trim(nome)) between 1 and 120),
  contato         text,
  email           text,
  whatsapp        text,
  prazo_dias      int check (prazo_dias is null or prazo_dias between 0 and 365),
  pedido_minimo   numeric(12,2) check (pedido_minimo is null or pedido_minimo >= 0),
  condicao        text,                      -- ex.: boleto 28 dias, Pix antecipado
  notas           text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------------- Financeiro ----------------
-- lançamentos à mão (contas fixas, fornecedores, entradas avulsas). O Asaas, a Shopify e o Inter
-- vão gravar aqui também quando forem ligados (coluna origem).
create table if not exists public.fin_contas (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'pagar' check (tipo in ('pagar','receber')),
  descricao      text not null check (length(trim(descricao)) between 1 and 160),
  categoria      text not null default 'outros',
  frente         text not null default 'geral' check (frente in ('atelier','loja','circulo','geral')),
  valor          numeric(12,2) not null check (valor >= 0),
  vencimento     date not null,
  pago_em        date,
  mensal         boolean not null default false,   -- ao pagar, a do mês seguinte é criada sozinha
  fornecedor_id  uuid references public.loja_fornecedores(id) on delete set null,
  origem         text not null default 'manual' check (origem in ('manual','asaas','shopify','bling','inter','ton')),
  externo_id     text,
  notas          text,
  criado_em      timestamptz not null default now(),
  unique (origem, externo_id)
);
create index if not exists fin_contas_venc on public.fin_contas (vencimento) where pago_em is null;

-- conta mensal paga: cria a do mês seguinte (uma vez só)
create or replace function public.fin_contas_mensal() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prox date;
begin
  if new.mensal and new.pago_em is not null and (tg_op = 'INSERT' or old.pago_em is null) then
    v_prox := (new.vencimento + interval '1 month')::date;
    if not exists (select 1 from public.fin_contas
                    where mensal and descricao = new.descricao and tipo = new.tipo and vencimento = v_prox) then
      insert into public.fin_contas (tipo, descricao, categoria, frente, valor, vencimento, mensal, fornecedor_id, notas)
      values (new.tipo, new.descricao, new.categoria, new.frente, new.valor, v_prox, true, new.fornecedor_id, new.notas);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists fin_contas_mensal on public.fin_contas;
create trigger fin_contas_mensal after insert or update of pago_em on public.fin_contas
  for each row execute function public.fin_contas_mensal();

-- ---------------- acesso: só direção ----------------
alter table public.cont_pecas enable row level security;
alter table public.loja_fornecedores enable row level security;
alter table public.fin_contas enable row level security;
drop policy if exists cont_pecas_direcao on public.cont_pecas;
drop policy if exists loja_fornecedores_direcao on public.loja_fornecedores;
drop policy if exists fin_contas_direcao on public.fin_contas;
create policy cont_pecas_direcao on public.cont_pecas for all to authenticated
  using (public.sou_direcao()) with check (public.sou_direcao());
create policy loja_fornecedores_direcao on public.loja_fornecedores for all to authenticated
  using (public.sou_direcao()) with check (public.sou_direcao());
create policy fin_contas_direcao on public.fin_contas for all to authenticated
  using (public.sou_direcao()) with check (public.sou_direcao());
grant select, insert, update, delete on public.cont_pecas, public.loja_fornecedores, public.fin_contas to authenticated;

-- ---------------- avisos da Central no celular ----------------
-- 7h: resumo do dia, só quando há o que dizer. 18h: peça de amanhã que ainda não está pronta.
create or replace function public.avisos_central(p_momento text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; d record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pecas int; v_pagar int; v_atraso int; v_valor numeric; v_aulas int; v_partes text[]; v_amanha int;
begin
  for d in select auth_user_id from public.equipe where direcao and auth_user_id is not null loop
    if p_momento = 'manha' then
      select count(*) into v_aulas from public.aulas
       where not cancelada and (inicia_em at time zone 'America/Sao_Paulo')::date = v_hoje;
      select count(*) into v_pecas from public.cont_pecas where dia = v_hoje and estado <> 'publicado';
      select count(*), coalesce(sum(valor),0) into v_pagar, v_valor from public.fin_contas
       where tipo = 'pagar' and pago_em is null and vencimento between v_hoje and v_hoje + 3;
      select count(*) into v_atraso from public.fin_contas where pago_em is null and vencimento < v_hoje;
      v_partes := array_remove(array[
        case when v_aulas > 0 then v_aulas || case when v_aulas = 1 then ' aula' else ' aulas' end || ' no atelier' end,
        case when v_pecas > 0 then v_pecas || case when v_pecas = 1 then ' publicação prevista' else ' publicações previstas' end end,
        case when v_pagar > 0 then v_pagar || case when v_pagar = 1 then ' conta' else ' contas' end || ' a pagar até ' || to_char(v_hoje + 3, 'DD/MM') end,
        case when v_atraso > 0 then v_atraso || case when v_atraso = 1 then ' conta em atraso' else ' contas em atraso' end end
      ], null);
      if array_length(v_partes, 1) > 0 then
        insert into public.notificacoes (destino, auth_user_id, titulo, corpo, url, chave)
        values ('equipe', d.auth_user_id, 'Seu dia', array_to_string(v_partes, ', ') || '.',
                './?ir=central', 'central:manha:' || d.auth_user_id || ':' || v_hoje)
        on conflict (chave) do nothing;
        if found then n := n + 1; end if;
      end if;
    elsif p_momento = 'tarde' then
      select count(*) into v_amanha from public.cont_pecas
       where dia = v_hoje + 1 and estado not in ('aprovado','agendado','publicado');
      if v_amanha > 0 then
        insert into public.notificacoes (destino, auth_user_id, titulo, corpo, url, chave)
        values ('equipe', d.auth_user_id, 'Conteúdo de amanhã',
                case when v_amanha = 1 then '1 publicação de amanhã ainda não está aprovada.'
                     else v_amanha || ' publicações de amanhã ainda não estão aprovadas.' end,
                './?ir=central', 'central:tarde:' || d.auth_user_id || ':' || v_hoje)
        on conflict (chave) do nothing;
        if found then n := n + 1; end if;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.avisos_central(text) from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('alma-central-manha','alma-central-tarde');
select cron.schedule('alma-central-manha', '0 10 * * *', $$select public.avisos_central('manha')$$);  -- 7h em São Paulo
select cron.schedule('alma-central-tarde', '0 21 * * *', $$select public.avisos_central('tarde')$$);  -- 18h em São Paulo

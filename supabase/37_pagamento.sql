-- Alma · mensalidade: valores, isenção, dia de vencimento e forma de pagamento
-- (a cobrança em si fica no Asaas; aqui fica o que o aluno escolheu e o valor do plano)

-- Tabela de valores (a equipe pode ajustar sem mexer no app)
create table if not exists public.precos (
  chave  text primary key,
  rotulo text not null,
  valor  numeric(10,2) not null check (valor >= 0),
  ordem  smallint not null default 0
);
alter table public.precos enable row level security;
drop policy if exists precos_le on public.precos;
create policy precos_le on public.precos for select to authenticated using (true);
drop policy if exists precos_equipe on public.precos;
create policy precos_equipe on public.precos for all to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

insert into public.precos (chave, rotulo, valor, ordem) values
  ('semanal_1', '1x por semana', 420, 1),
  ('semanal_2', '2x por semana', 500, 2),
  ('semanal_3', '3x por semana', 600, 3),
  ('mes_2',     '2 aulas por mês', 280, 4),
  ('mes_3',     '3 aulas por mês', 380, 5),
  ('mes_4',     '4 aulas por mês', 420, 6),
  ('avulsa',    'Aula avulsa', 150, 7)
on conflict (chave) do update set rotulo = excluded.rotulo, valor = excluded.valor, ordem = excluded.ordem;

-- Campos da mensalidade na pessoa
alter table public.pessoas
  add column if not exists isento boolean not null default false,
  add column if not exists isento_motivo text,
  add column if not exists vencimento_dia smallint,
  add column if not exists forma_pagamento text,
  add column if not exists pagamento_aderiu_em timestamptz,
  add column if not exists vencimento_pedido smallint,
  add column if not exists vencimento_pedido_em timestamptz,
  add column if not exists asaas_subscription_id text;

alter table public.pessoas drop constraint if exists pessoas_vencimento_dia_check;
alter table public.pessoas add constraint pessoas_vencimento_dia_check check (vencimento_dia between 1 and 28);
alter table public.pessoas drop constraint if exists pessoas_vencimento_pedido_check;
alter table public.pessoas add constraint pessoas_vencimento_pedido_check check (vencimento_pedido between 1 and 28);
alter table public.pessoas drop constraint if exists pessoas_forma_pagamento_check;
alter table public.pessoas add constraint pessoas_forma_pagamento_check check (forma_pagamento in ('pix','boleto','cartao','pix_automatico'));

-- Qual valor vale para a pessoa
create or replace function public.plano_da_pessoa(p public.pessoas)
returns table (chave text, rotulo text, valor numeric)
language sql stable security definer set search_path = public as $$
  with k as (
    select case
      when p.isento then 'isento'
      when p.plano = 'livre' then 'avulsa'
      when exists (select 1 from public.matriculas m where m.aluno_id = p.id and m.ate is null and m.quinzenal) then 'mes_2'
      when p.frequencia_semanal between 1 and 3 then 'semanal_' || p.frequencia_semanal
      else null end as chave)
  select k.chave,
         case when k.chave = 'isento' then 'Sem mensalidade' else pr.rotulo end,
         case when k.chave = 'isento' then 0 else pr.valor end
    from k left join public.precos pr on pr.chave = k.chave
$$;

-- Aluno: a própria mensalidade
create or replace function public.minha_mensalidade()
returns table (chave text, rotulo text, valor numeric, isento boolean, vencimento_dia smallint, forma text,
               aderiu_em timestamptz, vencimento_pedido smallint, status text, proximo_vencimento date)
language plpgsql stable security definer set search_path = public as $$
declare v public.pessoas;
begin
  select * into v from public.pessoas where id = public.meu_aluno_id();
  if not found then return; end if;
  return query
  select pl.chave, pl.rotulo, pl.valor, v.isento, v.vencimento_dia, v.forma_pagamento,
         v.pagamento_aderiu_em, v.vencimento_pedido, v.pagamento_status, v.pagamento_proximo_vencimento
    from public.plano_da_pessoa(v) pl;
end $$;

-- Aluno: escolhe dia e forma (primeira vez) ou troca a forma depois
create or replace function public.configurar_pagamento(p_dia int, p_forma text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pessoas;
begin
  select * into v from public.pessoas where id = public.meu_aluno_id() for update;
  if not found then raise exception 'Cadastro não encontrado'; end if;
  if v.vinculo <> 'aluno' then raise exception 'Sua matrícula não está ativa. Fale com o atelier.'; end if;
  if v.isento then raise exception 'Você não tem mensalidade a pagar'; end if;
  if p_forma is null or p_forma not in ('pix','boleto','cartao','pix_automatico') then raise exception 'Escolha a forma de pagamento'; end if;
  if v.vencimento_dia is null then
    if p_dia is null or p_dia < 1 or p_dia > 28 then raise exception 'Escolha um dia entre 1 e 28'; end if;
    update public.pessoas set vencimento_dia = p_dia, forma_pagamento = p_forma, pagamento_aderiu_em = now() where id = v.id;
    if not v.fantasma then
      perform public.notificar(null, 'Mensalidade configurada',
        coalesce(public.nome_curto(v), 'Um aluno') || ' escolheu pagar todo dia ' || p_dia || '.', './?ir=painel',
        'pag-adesao:' || v.id);
    end if;
  else
    update public.pessoas set forma_pagamento = p_forma where id = v.id;
  end if;
end $$;

-- Aluno: pede para trocar o dia de vencimento (o atelier aprova)
create or replace function public.pedir_troca_vencimento(p_dia int)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pessoas;
begin
  select * into v from public.pessoas where id = public.meu_aluno_id() for update;
  if not found then raise exception 'Cadastro não encontrado'; end if;
  if v.vencimento_dia is null then raise exception 'Configure o pagamento primeiro'; end if;
  if p_dia is null or p_dia < 1 or p_dia > 28 then raise exception 'Escolha um dia entre 1 e 28'; end if;
  if p_dia = v.vencimento_dia then raise exception 'Esse já é o seu dia'; end if;
  update public.pessoas set vencimento_pedido = p_dia, vencimento_pedido_em = now() where id = v.id;
  if not v.fantasma then
    perform public.notificar(null, 'Pedido de troca de vencimento',
      coalesce(public.nome_curto(v), 'Um aluno') || ' pediu para trocar o vencimento do dia ' || v.vencimento_dia || ' para o dia ' || p_dia || '.',
      './?ir=painel', 'pag-venc:' || v.id || ':' || extract(epoch from now())::bigint);
  end if;
end $$;

create or replace function public.cancelar_troca_vencimento()
returns void language sql security definer set search_path = public as $$
  update public.pessoas set vencimento_pedido = null, vencimento_pedido_em = null where id = public.meu_aluno_id()
$$;

-- Equipe: pedidos de troca de vencimento abertos
create or replace function public.equipe_pedidos_vencimento()
returns table (pessoa_id uuid, nome text, dia_atual smallint, dia_novo smallint, pedido_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query select p.id, coalesce(p.nome, p.email), p.vencimento_dia, p.vencimento_pedido, p.vencimento_pedido_em
    from public.pessoas p where p.vencimento_pedido is not null order by p.vencimento_pedido_em;
end $$;

-- Equipe: aprova ou recusa
create or replace function public.decidir_troca_vencimento(p_pessoa uuid, p_aprovar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pessoas;
begin
  perform public.exigir_equipe();
  select * into v from public.pessoas where id = p_pessoa and vencimento_pedido is not null for update;
  if not found then raise exception 'Pedido não encontrado ou já decidido'; end if;
  update public.pessoas
     set vencimento_dia = case when p_aprovar then vencimento_pedido else vencimento_dia end,
         vencimento_pedido = null, vencimento_pedido_em = null
   where id = v.id;
  perform public.notificar(v.id,
    case when p_aprovar then 'Vencimento alterado' else 'Pedido de vencimento' end,
    case when p_aprovar then 'Sua mensalidade passa a vencer todo dia ' || v.vencimento_pedido || '.'
         else 'Seu pedido de troca do dia de vencimento não foi aprovado. Fale com o atelier.' end,
    './?ir=voce', 'pag-venc-dec:' || v.id || ':' || extract(epoch from now())::bigint);
end $$;

revoke execute on function public.plano_da_pessoa(public.pessoas) from anon, public;
revoke execute on function public.minha_mensalidade() from anon, public;
revoke execute on function public.configurar_pagamento(int, text) from anon, public;
revoke execute on function public.pedir_troca_vencimento(int) from anon, public;
revoke execute on function public.cancelar_troca_vencimento() from anon, public;
revoke execute on function public.equipe_pedidos_vencimento() from anon, public;
revoke execute on function public.decidir_troca_vencimento(uuid, boolean) from anon, public;
grant execute on function public.minha_mensalidade(), public.configurar_pagamento(int, text), public.pedir_troca_vencimento(int),
  public.cancelar_troca_vencimento(), public.equipe_pedidos_vencimento(), public.decidir_troca_vencimento(uuid, boolean) to authenticated;
grant execute on function public.plano_da_pessoa(public.pessoas) to authenticated;

-- Isentos
update public.pessoas set isento = true, isento_motivo = 'Reposições à vontade' where nome = 'Ana Strapazon';
update public.pessoas set isento = true, isento_motivo = 'Parceria com a produtora' where nome = 'Caroline Lenczynschi';

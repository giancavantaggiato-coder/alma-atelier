-- Alma · Central: etapas de produção do conteúdo e caixa de e-mails
-- 1) Cada publicação passa por texto, revisão do texto, design, revisão do design, agendar e publicar.
--    O prazo de cada etapa é contado para trás a partir do dia da publicação (cont_prazo).
-- 2) E-mails importantes chegam à Central por uma tarefa agendada que lê o Gmail. Para cada um,
--    a direção decide se o Claude responde (com o texto aprovado no app) ou se responde ela mesma.

-- ---------------- etapas ----------------
alter table public.cont_pecas drop constraint if exists cont_pecas_estado_check;
update public.cont_pecas set estado = case estado when 'arte' then 'design' when 'revisao' then 'revisao_design'
  when 'aprovado' then 'agendar' else estado end;
alter table public.cont_pecas add constraint cont_pecas_estado_check
  check (estado in ('ideia','texto','revisao_texto','design','revisao_design','agendar','agendado','publicado'));

-- dias antes da publicação em que cada etapa precisa estar concluída
create or replace function public.cont_prazo(p_formato text, p_estado text, p_dia date) returns date
language sql immutable set search_path = public as $$
  select case when p_dia is null or p_estado in ('ideia','publicado') then null
    else p_dia - case when p_formato = 'blog' then
      case p_estado when 'texto' then 14 when 'revisao_texto' then 10 when 'design' then 6
                    when 'revisao_design' then 3 when 'agendar' then 1 else 0 end
    else
      case p_estado when 'texto' then 7 when 'revisao_texto' then 5 when 'design' then 4
                    when 'revisao_design' then 2 when 'agendar' then 1 else 0 end
    end end
$$;

-- ---------------- e-mails ----------------
create table if not exists public.central_emails (
  id              uuid primary key default gen_random_uuid(),
  gmail_thread_id text not null,
  gmail_msg_id    text not null unique,
  remetente       text,
  remetente_nome  text,
  assunto         text,
  recebido_em     timestamptz,
  resumo          text,
  tipo            text not null default 'outro'
                  check (tipo in ('conta','fornecedor','aluno','interessado','loja','parceria','sistema','outro')),
  prioridade      text not null default 'normal' check (prioridade in ('alta','normal')),
  sugestao        text,                    -- resposta proposta pelo Claude
  resposta        text,                    -- texto aprovado no app para o Claude enviar
  decisao         text not null default 'pendente' check (decisao in ('pendente','claude','eu','arquivado')),
  estado          text not null default 'aberto' check (estado in ('aberto','enviar','enviado','feito','erro')),
  link            text,
  fin_conta_id    uuid references public.fin_contas(id) on delete set null,
  erro            text,
  criado_em       timestamptz not null default now(),
  decidido_em     timestamptz,
  enviado_em      timestamptz
);
create index if not exists central_emails_abertos on public.central_emails (criado_em desc) where estado in ('aberto','enviar');

alter table public.central_emails enable row level security;
drop policy if exists central_emails_direcao on public.central_emails;
create policy central_emails_direcao on public.central_emails for all to authenticated
  using (public.sou_direcao()) with check (public.sou_direcao());
grant select, insert, update, delete on public.central_emails to authenticated;

-- contas encontradas no e-mail entram no financeiro com origem 'email'
alter table public.fin_contas drop constraint if exists fin_contas_origem_check;
alter table public.fin_contas add constraint fin_contas_origem_check
  check (origem in ('manual','email','asaas','shopify','bling','inter','ton'));

-- e-mail novo e importante: aviso no celular da direção
create or replace function public.central_email_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decisao = 'pendente' then
    insert into public.notificacoes (destino, auth_user_id, titulo, corpo, url, chave)
    select 'equipe', e.auth_user_id,
           case when new.prioridade = 'alta' then 'E-mail importante' else 'E-mail na Central' end,
           coalesce(new.remetente_nome, new.remetente, '') || ': ' || coalesce(new.assunto, ''),
           './?ir=central', 'central:email:' || new.id || ':' || e.auth_user_id
      from public.equipe e where e.direcao and e.auth_user_id is not null
    on conflict (chave) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.central_email_aviso() from public, anon, authenticated;
drop trigger if exists central_email_aviso on public.central_emails;
create trigger central_email_aviso after insert on public.central_emails
  for each row execute function public.central_email_aviso();

-- ---------------- avisos da manhã e da tarde, agora com as etapas ----------------
create or replace function public.avisos_central(p_momento text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; d record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_etapas int; v_atrasadas int; v_pagar int; v_atraso int; v_aulas int; v_emails int; v_partes text[]; v_amanha int;
begin
  for d in select auth_user_id from public.equipe where direcao and auth_user_id is not null loop
    if p_momento = 'manha' then
      select count(*) into v_aulas from public.aulas
       where not cancelada and (inicia_em at time zone 'America/Sao_Paulo')::date = v_hoje;
      select count(*) filter (where public.cont_prazo(formato, estado, dia) = v_hoje),
             count(*) filter (where public.cont_prazo(formato, estado, dia) < v_hoje)
        into v_etapas, v_atrasadas from public.cont_pecas;
      select count(*) into v_pagar from public.fin_contas
       where tipo = 'pagar' and pago_em is null and vencimento between v_hoje and v_hoje + 3;
      select count(*) into v_atraso from public.fin_contas where pago_em is null and vencimento < v_hoje;
      select count(*) into v_emails from public.central_emails where decisao = 'pendente';
      v_partes := array_remove(array[
        case when v_aulas > 0 then v_aulas || case when v_aulas = 1 then ' aula' else ' aulas' end || ' no atelier' end,
        case when v_etapas > 0 then v_etapas || case when v_etapas = 1 then ' etapa de conteúdo' else ' etapas de conteúdo' end || ' para hoje' end,
        case when v_atrasadas > 0 then v_atrasadas || case when v_atrasadas = 1 then ' etapa atrasada' else ' etapas atrasadas' end end,
        case when v_pagar > 0 then v_pagar || case when v_pagar = 1 then ' conta' else ' contas' end || ' a pagar até ' || to_char(v_hoje + 3, 'DD/MM') end,
        case when v_atraso > 0 then v_atraso || case when v_atraso = 1 then ' conta em atraso' else ' contas em atraso' end end,
        case when v_emails > 0 then v_emails || case when v_emails = 1 then ' e-mail para decidir' else ' e-mails para decidir' end end
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
       where dia = v_hoje + 1 and estado not in ('agendar','agendado','publicado');
      if v_amanha > 0 then
        insert into public.notificacoes (destino, auth_user_id, titulo, corpo, url, chave)
        values ('equipe', d.auth_user_id, 'Conteúdo de amanhã',
                case when v_amanha = 1 then '1 publicação de amanhã ainda não está pronta.'
                     else v_amanha || ' publicações de amanhã ainda não estão prontas.' end,
                './?ir=central', 'central:tarde:' || d.auth_user_id || ':' || v_hoje)
        on conflict (chave) do nothing;
        if found then n := n + 1; end if;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.avisos_central(text) from public, anon, authenticated;

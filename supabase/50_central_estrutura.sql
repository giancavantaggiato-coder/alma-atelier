-- Alma · Central: estrutura mais firme
-- 1) As etapas do conteúdo passam a morar numa tabela só (cont_etapas): ordem, nome, quem faz e prazo.
--    O app e o banco leem dali; antes os prazos estavam repetidos no JS e no SQL.
-- 2) E-mails: só combinações válidas de decisão e estado.
-- 3) Financeiro: categorias fechadas e contas mensais ligadas por série (não mais pela descrição).

-- ---------------- 1) etapas do conteúdo ----------------
create table if not exists public.cont_etapas (
  estado     text primary key,
  ordem      int  not null unique,
  rotulo     text not null,          -- nome da etapa
  curto      text not null,          -- como aparece no calendário
  tarefa     text,                   -- o que fazer nesta etapa
  quem       text not null check (quem in ('voce','claude','ninguem')),
  dias_post  int,                    -- dias antes da publicação em que a etapa precisa estar feita
  dias_blog  int
);
insert into public.cont_etapas (estado, ordem, rotulo, curto, tarefa, quem, dias_post, dias_blog) values
  ('ideia',          0, 'Ideia',               'ideia',          null,                    'ninguem', null, null),
  ('pauta',          1, 'Pauta para aprovar',  'pauta',          'Aprovar a pauta',       'voce',    8,    15),
  ('texto',          2, 'Texto',               'escrevendo',     'Escrever o texto',      'claude',  7,    14),
  ('revisao_texto',  3, 'Revisão do texto',    'revisar texto',  'Revisar o texto',       'voce',    5,    10),
  ('design',         4, 'Design',              'design',         'Fazer o design',        'claude',  4,    6),
  ('revisao_design', 5, 'Revisão do design',   'revisar design', 'Revisar o design',      'voce',    2,    3),
  ('agendar',        6, 'Pronto para agendar', 'agendar',        'Agendar a publicação',  'voce',    1,    1),
  ('agendado',       7, 'Agendado',            'agendado',       'Conferir se publicou',  'voce',    0,    0),
  ('publicado',      8, 'Publicado',           'publicado',      null,                    'ninguem', null, null)
on conflict (estado) do update set ordem = excluded.ordem, rotulo = excluded.rotulo, curto = excluded.curto,
  tarefa = excluded.tarefa, quem = excluded.quem, dias_post = excluded.dias_post, dias_blog = excluded.dias_blog;

alter table public.cont_etapas enable row level security;
drop policy if exists cont_etapas_ler on public.cont_etapas;
create policy cont_etapas_ler on public.cont_etapas for select to authenticated using (public.sou_direcao());
grant select on public.cont_etapas to authenticated;

-- a etapa de cada publicação precisa existir na tabela (no lugar da lista fixa)
alter table public.cont_pecas drop constraint if exists cont_pecas_estado_check;
alter table public.cont_pecas drop constraint if exists cont_pecas_estado_fk;
alter table public.cont_pecas add constraint cont_pecas_estado_fk
  foreign key (estado) references public.cont_etapas(estado) on update cascade;
create index if not exists cont_pecas_estado on public.cont_pecas (estado);

create or replace function public.cont_prazo(p_formato text, p_estado text, p_dia date) returns date
language sql stable set search_path = public as $$
  select case when p_dia is null then null
    else p_dia - (case when p_formato = 'blog' then e.dias_blog else e.dias_post end) end
    from public.cont_etapas e where e.estado = p_estado
$$;

-- ---------------- 2) e-mails ----------------
-- pendente/aberto: esperando decisão; claude/enviar|enviado|erro: o Claude responde;
-- eu/aberto|feito: Giancarlo responde; arquivado/feito: sem resposta
alter table public.central_emails drop constraint if exists central_emails_combinacao;
alter table public.central_emails add constraint central_emails_combinacao check (
     (decisao = 'pendente'  and estado = 'aberto')
  or (decisao = 'claude'    and estado in ('enviar','enviado','erro'))
  or (decisao = 'eu'        and estado in ('aberto','feito'))
  or (decisao = 'arquivado' and estado = 'feito'));
create index if not exists central_emails_thread on public.central_emails (gmail_thread_id);

-- ---------------- 3) financeiro ----------------
update public.fin_contas set categoria = 'Outros' where categoria is null or lower(categoria) = 'outros';
alter table public.fin_contas alter column categoria set default 'Outros';
alter table public.fin_contas drop constraint if exists fin_contas_categoria_check;
alter table public.fin_contas add constraint fin_contas_categoria_check check (categoria in (
  'Aluguel','Contabilidade','Fornecedores','Sistemas e assinaturas','Produção e fotos','Mídia paga',
  'Impostos e taxas','Manutenção','Materiais do atelier','Mensalidades','Vendas','Outros'));

-- série das contas mensais: cada repetição herda o mesmo serie_id
alter table public.fin_contas add column if not exists serie_id uuid;
update public.fin_contas set serie_id = id where mensal and serie_id is null;
create unique index if not exists fin_contas_serie_venc on public.fin_contas (serie_id, vencimento) where serie_id is not null;

create or replace function public.fin_contas_serie() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.mensal and new.serie_id is null then new.serie_id := new.id; end if;
  return new;
end $$;
drop trigger if exists fin_contas_serie on public.fin_contas;
create trigger fin_contas_serie before insert or update of mensal on public.fin_contas
  for each row execute function public.fin_contas_serie();

create or replace function public.fin_contas_mensal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mensal and new.pago_em is not null and (tg_op = 'INSERT' or old.pago_em is null) then
    insert into public.fin_contas (tipo, descricao, categoria, frente, valor, vencimento, mensal, serie_id, fornecedor_id, notas)
    values (new.tipo, new.descricao, new.categoria, new.frente, new.valor, (new.vencimento + interval '1 month')::date,
            true, new.serie_id, new.fornecedor_id, new.notas)
    on conflict (serie_id, vencimento) where serie_id is not null do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.fin_contas_mensal() from public, anon, authenticated;

-- ---------------- avisos da manhã: só o que depende da direção ----------------
create or replace function public.avisos_central(p_momento text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; d record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_revisar int; v_pautas int; v_atrasadas int; v_claude int; v_pagar int; v_atraso int; v_aulas int; v_emails int;
  v_partes text[]; v_amanha int;
begin
  for d in select auth_user_id from public.equipe where direcao and auth_user_id is not null loop
    if p_momento = 'manha' then
      select count(*) into v_aulas from public.aulas
       where not cancelada and (inicia_em at time zone 'America/Sao_Paulo')::date = v_hoje;
      select count(*) filter (where p.estado in ('revisao_texto','revisao_design')),
             count(*) filter (where p.estado = 'pauta'),
             count(*) filter (where e.quem = 'voce' and p.estado <> 'pauta' and public.cont_prazo(p.formato, p.estado, p.dia) < v_hoje),
             count(*) filter (where e.quem = 'claude' and public.cont_prazo(p.formato, p.estado, p.dia) < v_hoje)
        into v_revisar, v_pautas, v_atrasadas, v_claude
        from public.cont_pecas p join public.cont_etapas e on e.estado = p.estado;
      select count(*) into v_pagar from public.fin_contas
       where tipo = 'pagar' and pago_em is null and vencimento between v_hoje and v_hoje + 3;
      select count(*) into v_atraso from public.fin_contas where tipo = 'pagar' and pago_em is null and vencimento < v_hoje;
      select count(*) into v_emails from public.central_emails where decisao = 'pendente' or (decisao = 'eu' and estado = 'aberto');
      v_partes := array_remove(array[
        case when v_aulas > 0 then v_aulas || case when v_aulas = 1 then ' aula' else ' aulas' end || ' no atelier' end,
        case when v_emails > 0 then v_emails || case when v_emails = 1 then ' e-mail' else ' e-mails' end || ' com você' end,
        case when v_revisar > 0 then v_revisar || case when v_revisar = 1 then ' revisão' else ' revisões' end || ' de conteúdo' end,
        case when v_pautas > 0 then v_pautas || case when v_pautas = 1 then ' pauta para aprovar' else ' pautas para aprovar' end end,
        case when v_atrasadas > 0 then v_atrasadas || case when v_atrasadas = 1 then ' etapa sua atrasada' else ' etapas suas atrasadas' end end,
        case when v_claude > 0 then v_claude || ' com o Claude em atraso' end,
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

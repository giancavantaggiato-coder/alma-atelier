-- =====================================================================
-- Alma — base de pessoas (alunos, ex-alunos, interessados, compradores da loja) + app do atelier · beta
-- Cada pessoa tem UM registro para a vida toda; o "vínculo" com o atelier muda com o tempo.
-- Só quem tem vínculo 'aluno' ou 'pausado' entra no app.
-- Regras de reposição:
--   * desmarcar com 4h ou mais de antecedência gera 1 crédito
--   * crédito vale 1 ano a partir da data da aula perdida
--   * máximo de 8 créditos ativos por aluno
--   * reposição só em aula com vaga
--   * desmarcar uma reposição devolve o crédito usado
--   * aula cancelada pelo atelier: reposição devolve o crédito; aula fixa gera crédito (respeitando o limite de 8)
--   * presença: aula que já terminou conta como presença, a menos que a equipe marque falta
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------- tabelas ----------------

create table public.equipe (
  email         text primary key,
  nome          text not null,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create table public.pessoas (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  nome          text not null,
  email         text unique,
  whatsapp      text,
  -- vínculo com o atelier: aluno (frequentando), pausado (matrícula pausada), ex_aluno, interessado,
  -- ou vazio (sem vínculo, ex.: só compra na loja)
  vinculo       text check (vinculo in ('aluno','pausado','ex_aluno','interessado')),
  aluno_desde   date,
  saida_em      date,
  motivo_saida  text,
  aulas_anteriores int not null default 0 check (aulas_anteriores >= 0),
  -- mensalidade (só para alunos)
  pagamento_status text not null default 'em_dia' check (pagamento_status in ('em_dia','pendente','atrasado')),
  pagamento_ultimo date,
  pagamento_proximo_vencimento date,
  pagamento_metodo text,
  asaas_customer_id text unique,
  -- loja (Alma Materiais Artísticos) — preenchido pela integração no futuro
  comprador_loja   boolean not null default false,
  shopify_customer_id text unique,
  bling_contato_id text unique,
  -- relacionamento
  origem        text,                          -- Instagram, indicação, loja, evento, site...
  interesses    text[] not null default '{}',  -- Desenho, Pintura, Escultura...
  aceita_comunicacao boolean not null default false,   -- consentimento (LGPD) para receber novidades
  aceita_comunicacao_em timestamptz,
  ultimo_contato date,
  avatar_url    text,
  capa_url      text,
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (email is not null or whatsapp is not null)
);

create table public.turmas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  dia_semana  smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo
  inicio      time not null,
  fim         time not null,
  capacidade  smallint not null default 8 check (capacidade > 0),
  ativa       boolean not null default true,
  check (fim > inicio)
);

create table public.matriculas (
  id        uuid primary key default gen_random_uuid(),
  aluno_id  uuid not null references public.pessoas(id) on delete cascade,
  turma_id  uuid not null references public.turmas(id) on delete cascade,
  desde     date not null default current_date,
  ate       date,
  check (ate is null or ate >= desde)
);
create unique index matriculas_ativa_unica on public.matriculas (aluno_id, turma_id) where ate is null;

create table public.aulas (
  id          uuid primary key default gen_random_uuid(),
  turma_id    uuid not null references public.turmas(id) on delete cascade,
  inicia_em   timestamptz not null,
  termina_em  timestamptz not null,
  capacidade  smallint not null,
  cancelada   boolean not null default false,
  motivo_cancelamento text,
  unique (turma_id, inicia_em)
);

create table public.reservas (
  id         uuid primary key default gen_random_uuid(),
  aula_id    uuid not null references public.aulas(id) on delete cascade,
  aluno_id   uuid not null references public.pessoas(id) on delete cascade,
  tipo       text not null check (tipo in ('fixa','reposicao')),
  status     text not null default 'confirmada'
             check (status in ('confirmada','presente','falta','desmarcada','ausencia_tardia','aula_cancelada')),
  atualizado_em timestamptz not null default now(),
  unique (aula_id, aluno_id)
);

create table public.creditos (
  id                  uuid primary key default gen_random_uuid(),
  aluno_id            uuid not null references public.pessoas(id) on delete cascade,
  reserva_origem_id   uuid references public.reservas(id) on delete set null,
  data_falta          date not null,
  expira_em           date not null,
  usado_em_reserva_id uuid references public.reservas(id) on delete set null,
  origem              text not null default 'desmarcou' check (origem in ('desmarcou','aula_cancelada','equipe')),
  criado_em           timestamptz not null default now()
);

create table public.eventos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,                 -- Modelo vivo, História da Arte, Visita, Encontro...
  titulo      text not null,
  descricao   text,
  inicia_em   timestamptz not null,
  termina_em  timestamptz not null,
  local       text,
  vagas       int,
  preco_texto text,
  publicado   boolean not null default true,
  criado_em   timestamptz not null default now(),
  check (termina_em > inicia_em)
);

create table public.inscricoes (
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  pessoa_id  uuid not null references public.pessoas(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (evento_id, pessoa_id)
);

create index on public.pessoas (vinculo);
create index on public.pessoas (lower(nome));

create index on public.reservas (aluno_id);
create index on public.reservas (aula_id);
create index on public.creditos (aluno_id) where usado_em_reserva_id is null;
create index on public.aulas (inicia_em);
create index on public.matriculas (turma_id);
create index on public.eventos (inicia_em);

-- ---------------- ajudantes de identidade ----------------

create or replace function public.meu_aluno_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.pessoas where auth_user_id = auth.uid() and vinculo in ('aluno','pausado')
$$;

create or replace function public.sou_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where auth_user_id = auth.uid())
$$;

-- liga a conta de login ao cadastro pelo e-mail (nos dois sentidos)
create or replace function public.ligar_conta_nova() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.pessoas set auth_user_id = new.id where lower(email) = lower(new.email) and auth_user_id is null;
  update public.equipe set auth_user_id = new.id where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger ao_criar_conta after insert on auth.users
  for each row execute function public.ligar_conta_nova();

create or replace function public.ligar_cadastro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  if new.email is null then new.auth_user_id := null;
  elsif new.auth_user_id is null or tg_op = 'UPDATE' and new.email is distinct from old.email then
    new.auth_user_id := (select id from auth.users where lower(email) = new.email limit 1);
  end if;
  return new;
end $$;
create trigger pessoas_ligar before insert or update of email on public.pessoas
  for each row execute function public.ligar_cadastro();

-- Mudança de vínculo: entrada como aluno marca a data; saída fecha as turmas e libera as vagas futuras
create or replace function public.ao_mudar_vinculo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.vinculo = 'aluno' and new.aluno_desde is null then new.aluno_desde := current_date; end if;
  if new.aceita_comunicacao and (tg_op = 'INSERT' or not old.aceita_comunicacao) then new.aceita_comunicacao_em := now(); end if;
  if not new.aceita_comunicacao then new.aceita_comunicacao_em := null; end if;
  if tg_op = 'UPDATE' and old.vinculo in ('aluno','pausado') and coalesce(new.vinculo,'') not in ('aluno','pausado') then
    new.saida_em := coalesce(new.saida_em, current_date);
    update public.matriculas set ate = current_date where aluno_id = new.id and ate is null;
    delete from public.reservas r using public.aulas a
     where r.aula_id = a.id and r.aluno_id = new.id and r.status = 'confirmada' and a.inicia_em > now();
  end if;
  if tg_op = 'UPDATE' and new.vinculo in ('aluno','pausado') and coalesce(old.vinculo,'') not in ('aluno','pausado') then
    new.saida_em := null; new.motivo_saida := null;
  end if;
  return new;
end $$;
create trigger pessoas_vinculo before insert or update on public.pessoas
  for each row execute function public.ao_mudar_vinculo();
create trigger equipe_ligar before insert or update of email on public.equipe
  for each row execute function public.ligar_cadastro();

-- ---------------- leitura para o aluno ----------------

-- Aulas de um período, com vagas e a situação do aluno em cada uma
create or replace function public.agenda(p_de date, p_ate date)
returns table (aula_id uuid, turma_nome text, inicia_em timestamptz, termina_em timestamptz,
               capacidade int, cancelada boolean, ocupadas int,
               reserva_id uuid, reserva_tipo text, reserva_status text)
language sql stable security definer set search_path = public as $$
  select a.id, t.nome, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada,
         (select count(*) from public.reservas r where r.aula_id = a.id and r.status in ('confirmada','presente'))::int,
         m.id, m.tipo, m.status
  from public.aulas a
  join public.turmas t on t.id = a.turma_id
  left join public.reservas m on m.aula_id = a.id and m.aluno_id = public.meu_aluno_id()
  where auth.uid() is not null
    and a.inicia_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
    and a.inicia_em <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicia_em
$$;

-- Quem está em aula agora (primeiro nome + inicial)
create or replace function public.em_aula_agora()
returns table (nome text, tipo text, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select trim(split_part(al.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(al.nome,' ',2),1),'') || '.', '')),
         r.tipo, al.id = public.meu_aluno_id()
  from public.aulas a
  join public.reservas r on r.aula_id = a.id and r.status in ('confirmada','presente')
  join public.pessoas al on al.id = r.aluno_id
  where auth.uid() is not null and now() >= a.inicia_em and now() < a.termina_em and not a.cancelada
  order by (al.id = public.meu_aluno_id()) desc, al.nome
$$;

-- Números do aluno
create or replace function public.meu_resumo()
returns table (aulas_total int, presenca_90d int, semanas_ritmo int, creditos_ativos int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_aluno uuid := public.meu_aluno_id();
  v_ultima_falta timestamptz; v_inicio timestamptz;
  v_pres int; v_prev int; v_ant int;
begin
  if v_aluno is null then return; end if;
  select aulas_anteriores into v_ant from public.pessoas where id = v_aluno;

  select max(a.inicia_em) into v_ultima_falta
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.aluno_id = v_aluno and r.status in ('falta','ausencia_tardia') and a.inicia_em <= now();

  select min(a.inicia_em) into v_inicio
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.aluno_id = v_aluno and r.status in ('confirmada','presente') and not a.cancelada
    and a.inicia_em <= now() and (v_ultima_falta is null or a.inicia_em > v_ultima_falta);

  select count(*) filter (where r.status in ('confirmada','presente') and a.termina_em <= now() and a.inicia_em > now() - interval '90 days'),
         count(*) filter (where r.tipo = 'fixa' and r.status <> 'aula_cancelada' and a.termina_em <= now() and a.inicia_em > now() - interval '90 days')
    into v_pres, v_prev
  from public.reservas r join public.aulas a on a.id = r.aula_id
  where r.aluno_id = v_aluno and not a.cancelada;

  return query select
    (v_ant + (select count(*) from public.reservas r join public.aulas a on a.id = r.aula_id
              where r.aluno_id = v_aluno and r.status in ('confirmada','presente') and a.termina_em <= now() and not a.cancelada))::int,
    case when v_prev = 0 then null else least(100, round(100.0 * v_pres / v_prev))::int end,
    case when v_inicio is null then 0 else greatest(1, round(extract(epoch from now() - v_inicio) / 604800))::int end,
    (select count(*) from public.creditos c where c.aluno_id = v_aluno and c.usado_em_reserva_id is null and c.expira_em >= current_date)::int;
end $$;

-- Eventos com contagem de inscritos e a inscrição do aluno
create or replace function public.eventos_lista()
returns table (id uuid, tipo text, titulo text, descricao text, inicia_em timestamptz, termina_em timestamptz,
               local text, vagas int, preco_texto text, publicado boolean, inscritos int, inscrito boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.tipo, e.titulo, e.descricao, e.inicia_em, e.termina_em, e.local, e.vagas, e.preco_texto, e.publicado,
         (select count(*) from public.inscricoes i where i.evento_id = e.id)::int,
         exists (select 1 from public.inscricoes i where i.evento_id = e.id and i.pessoa_id = public.meu_aluno_id())
  from public.eventos e
  where auth.uid() is not null and (e.publicado or public.sou_equipe())
    and e.termina_em > now() - interval '1 day'
  order by e.inicia_em
$$;

-- ---------------- ações do aluno ----------------

create or replace function public.desmarcar(p_reserva uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.reservas; a public.aulas; v_aluno uuid := public.meu_aluno_id(); v_ativos int; v_dia date;
begin
  select * into r from public.reservas where id = p_reserva and aluno_id = v_aluno for update;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if r.status <> 'confirmada' then raise exception 'Esta aula não pode mais ser desmarcada'; end if;
  select * into a from public.aulas where id = r.aula_id;
  if a.cancelada then raise exception 'Esta aula foi cancelada pelo atelier'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;

  if a.inicia_em - now() < interval '4 hours' then
    -- aviso com menos de 4h: fica registrado, sem crédito (numa reposição, o crédito usado não volta)
    update public.reservas set status = 'ausencia_tardia', atualizado_em = now() where id = r.id;
    return 'ausencia_sem_credito';
  end if;

  if r.tipo = 'reposicao' then
    update public.creditos set usado_em_reserva_id = null where usado_em_reserva_id = r.id;
    delete from public.reservas where id = r.id;
    return 'credito_devolvido';
  end if;

  update public.reservas set status = 'desmarcada', atualizado_em = now() where id = r.id;
  select count(*) into v_ativos from public.creditos
   where aluno_id = v_aluno and usado_em_reserva_id is null and expira_em >= current_date;
  if v_ativos >= 8 then return 'limite_de_creditos'; end if;

  v_dia := (a.inicia_em at time zone 'America/Sao_Paulo')::date;
  insert into public.creditos (aluno_id, reserva_origem_id, data_falta, expira_em)
  values (v_aluno, r.id, v_dia, (v_dia + interval '1 year')::date);
  return 'credito_gerado';
end $$;

create or replace function public.marcar_reposicao(p_aula uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.aulas; v_aluno uuid := public.meu_aluno_id(); v_ocup int; v_cred uuid; v_res uuid; v_exist public.reservas;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into a from public.aulas where id = p_aula for update;   -- trava a aula: evita duas pessoas na última vaga
  if not found or a.cancelada then raise exception 'Aula indisponível'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;
  if (select vinculo from public.pessoas where id = v_aluno) <> 'aluno' then raise exception 'Sua matrícula está pausada'; end if;

  select * into v_exist from public.reservas where aula_id = p_aula and aluno_id = v_aluno;
  if found and v_exist.status in ('confirmada','presente') then raise exception 'Você já está nesta aula'; end if;

  select count(*) into v_ocup from public.reservas where aula_id = p_aula and status in ('confirmada','presente');
  if v_ocup >= a.capacidade then raise exception 'Turma completa neste dia'; end if;

  select id into v_cred from public.creditos
   where aluno_id = v_aluno and usado_em_reserva_id is null and expira_em >= current_date
   order by data_falta limit 1 for update;
  if v_cred is null then raise exception 'Você não tem reposições disponíveis'; end if;

  if v_exist.id is not null then
    -- era o próprio dia fixo, desmarcado antes: volta a valer como reposição
    update public.reservas set tipo = 'reposicao', status = 'confirmada', atualizado_em = now() where id = v_exist.id returning id into v_res;
  else
    insert into public.reservas (aula_id, aluno_id, tipo) values (p_aula, v_aluno, 'reposicao') returning id into v_res;
  end if;
  update public.creditos set usado_em_reserva_id = v_res where id = v_cred;
  return v_res;
end $$;

create or replace function public.inscrever_evento(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.eventos; v_aluno uuid := public.meu_aluno_id(); n int;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into e from public.eventos where id = p_evento and publicado for update;
  if not found then raise exception 'Evento indisponível'; end if;
  if e.inicia_em <= now() then raise exception 'O evento já começou'; end if;
  select count(*) into n from public.inscricoes where evento_id = p_evento;
  if e.vagas is not null and n >= e.vagas then raise exception 'Não há mais vagas'; end if;
  insert into public.inscricoes (evento_id, pessoa_id) values (p_evento, v_aluno) on conflict do nothing;
end $$;

create or replace function public.cancelar_inscricao(p_evento uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.inscricoes where evento_id = p_evento and pessoa_id = public.meu_aluno_id()
$$;

create or replace function public.atualizar_fotos(p_avatar text, p_capa text)
returns void language sql security definer set search_path = public as $$
  update public.pessoas
     set avatar_url = coalesce(p_avatar, avatar_url), capa_url = coalesce(p_capa, capa_url)
   where id = public.meu_aluno_id()
$$;

-- ---------------- ações da equipe ----------------

create or replace function public.exigir_equipe() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Apenas a equipe pode fazer isso'; end if;
end $$;

-- Cria as aulas das turmas ativas até a data e as reservas fixas dos matriculados
create or replace function public.gerar_aulas(p_ate date)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; t record; d date; v_aula uuid;
begin
  perform public.exigir_equipe();
  for t in select * from public.turmas where ativa loop
    for d in select g::date from generate_series(current_date, p_ate, interval '1 day') g
             where extract(dow from g) = t.dia_semana loop
      insert into public.aulas (turma_id, inicia_em, termina_em, capacidade)
      values (t.id, (d + t.inicio) at time zone 'America/Sao_Paulo', (d + t.fim) at time zone 'America/Sao_Paulo', t.capacidade)
      on conflict (turma_id, inicia_em) do nothing
      returning id into v_aula;
      if v_aula is not null then
        n := n + 1;
        insert into public.reservas (aula_id, aluno_id, tipo)
        select v_aula, m.aluno_id, 'fixa' from public.matriculas m
          join public.pessoas al on al.id = m.aluno_id and al.vinculo = 'aluno'
         where m.turma_id = t.id and m.desde <= d and (m.ate is null or m.ate >= d)
        on conflict do nothing;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- Matricula numa turma e já coloca o aluno nas aulas futuras dela
create or replace function public.matricular(p_aluno uuid, p_turma uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  insert into public.matriculas (aluno_id, turma_id) values (p_aluno, p_turma) on conflict do nothing;
  insert into public.reservas (aula_id, aluno_id, tipo)
  select a.id, p_aluno, 'fixa' from public.aulas a
   where a.turma_id = p_turma and a.inicia_em > now() and not a.cancelada
  on conflict do nothing;
end $$;

-- Tira da turma e libera as vagas futuras
create or replace function public.desmatricular(p_aluno uuid, p_turma uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  update public.matriculas set ate = current_date where aluno_id = p_aluno and turma_id = p_turma and ate is null;
  delete from public.reservas r using public.aulas a
   where r.aula_id = a.id and a.turma_id = p_turma and r.aluno_id = p_aluno
     and r.tipo = 'fixa' and r.status = 'confirmada' and a.inicia_em > now();
end $$;

-- Cancela uma aula: reposições devolvem o crédito; aulas fixas geram crédito (até o limite de 8)
create or replace function public.cancelar_aula(p_aula uuid, p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_dia date; n int := 0;
begin
  perform public.exigir_equipe();
  update public.aulas set cancelada = true, motivo_cancelamento = p_motivo where id = p_aula and not cancelada;
  if not found then raise exception 'Aula não encontrada ou já cancelada'; end if;
  select (inicia_em at time zone 'America/Sao_Paulo')::date into v_dia from public.aulas where id = p_aula;
  for r in select * from public.reservas where aula_id = p_aula and status = 'confirmada' loop
    update public.reservas set status = 'aula_cancelada', atualizado_em = now() where id = r.id;
    if r.tipo = 'reposicao' then
      update public.creditos set usado_em_reserva_id = null where usado_em_reserva_id = r.id;
    elsif (select count(*) from public.creditos where aluno_id = r.aluno_id and usado_em_reserva_id is null and expira_em >= current_date) < 8 then
      insert into public.creditos (aluno_id, reserva_origem_id, data_falta, expira_em, origem)
      values (r.aluno_id, r.id, v_dia, (v_dia + interval '1 year')::date, 'aula_cancelada');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Chamada: marcar falta ou presença
create or replace function public.marcar_chamada(p_reserva uuid, p_falta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  update public.reservas set status = case when p_falta then 'falta' else 'presente' end, atualizado_em = now()
   where id = p_reserva and status in ('confirmada','presente','falta');
end $$;

-- Dar uma reposição manualmente
create or replace function public.dar_credito(p_aluno uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  if (select count(*) from public.creditos where aluno_id = p_aluno and usado_em_reserva_id is null and expira_em >= current_date) >= 8 then
    raise exception 'O aluno já tem 8 reposições';
  end if;
  insert into public.creditos (aluno_id, data_falta, expira_em, origem)
  values (p_aluno, current_date, (current_date + interval '1 year')::date, 'equipe');
end $$;

-- Aulas de um dia com a lista de presença
create or replace function public.equipe_dia(p_dia date)
returns table (aula_id uuid, turma_nome text, inicia_em timestamptz, termina_em timestamptz, capacidade int,
               cancelada boolean, reserva_id uuid, aluno_id uuid, aluno_nome text, tipo text, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query
  select a.id, t.nome, a.inicia_em, a.termina_em, a.capacidade::int, a.cancelada, r.id, al.id, al.nome, r.tipo, r.status
  from public.aulas a join public.turmas t on t.id = a.turma_id
  left join public.reservas r on r.aula_id = a.id
  left join public.pessoas al on al.id = r.aluno_id
  where a.inicia_em >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicia_em <  ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  order by a.inicia_em, al.nome;
end $$;

-- Créditos ativos de todos (para a lista de alunos)
create or replace function public.equipe_creditos()
returns table (aluno_id uuid, ativos int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  return query select c.aluno_id, count(*)::int from public.creditos c
   where c.usado_em_reserva_id is null and c.expira_em >= current_date group by c.aluno_id;
end $$;

-- ---------------- segurança ----------------

alter table public.equipe     enable row level security;
alter table public.pessoas    enable row level security;
alter table public.turmas     enable row level security;
alter table public.matriculas enable row level security;
alter table public.aulas      enable row level security;
alter table public.reservas   enable row level security;
alter table public.creditos   enable row level security;
alter table public.eventos    enable row level security;
alter table public.inscricoes enable row level security;

create policy equipe_le_equipe   on public.equipe     for select to authenticated using (public.sou_equipe() or auth_user_id = auth.uid());
create policy equipe_edita_equipe on public.equipe    for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy pessoa_le_propria   on public.pessoas    for select to authenticated using (auth_user_id = auth.uid() or public.sou_equipe());
create policy equipe_edita_pessoas on public.pessoas  for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_turmas          on public.turmas     for select to authenticated using (true);
create policy equipe_turmas      on public.turmas     for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_matriculas      on public.matriculas for select to authenticated using (aluno_id = public.meu_aluno_id() or public.sou_equipe());
create policy equipe_matriculas  on public.matriculas for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_aulas           on public.aulas      for select to authenticated using (true);
create policy equipe_aulas       on public.aulas      for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_reservas        on public.reservas   for select to authenticated using (aluno_id = public.meu_aluno_id() or public.sou_equipe());
create policy equipe_reservas    on public.reservas   for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_creditos        on public.creditos   for select to authenticated using (aluno_id = public.meu_aluno_id() or public.sou_equipe());
create policy equipe_creditos    on public.creditos   for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_eventos         on public.eventos    for select to authenticated using (publicado or public.sou_equipe());
create policy equipe_eventos     on public.eventos    for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

create policy le_inscricoes      on public.inscricoes for select to authenticated using (pessoa_id = public.meu_aluno_id() or public.sou_equipe());
create policy equipe_inscricoes  on public.inscricoes for all    to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

-- funções: só quem está logado
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('meu_aluno_id','sou_equipe','agenda','em_aula_agora','meu_resumo','eventos_lista','desmarcar','marcar_reposicao',
            'inscrever_evento','cancelar_inscricao','atualizar_fotos','exigir_equipe','gerar_aulas','matricular','desmatricular',
            'cancelar_aula','marcar_chamada','dar_credito','equipe_dia','equipe_creditos') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
  revoke execute on function public.ligar_conta_nova() from public, anon, authenticated;
  revoke execute on function public.ligar_cadastro() from public, anon, authenticated;
  revoke execute on function public.ao_mudar_vinculo() from public, anon, authenticated;
end $$;

-- ---------------- fotos de perfil ----------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfis', 'perfis', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy perfis_le_proprio on storage.objects for select to authenticated
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);
create policy perfis_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);
create policy perfis_atualiza on storage.objects for update to authenticated
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);
create policy perfis_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);

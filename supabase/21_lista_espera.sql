-- Alma · lista de espera e fila de notificações
-- Aluno entra na fila de uma aula lotada. Quando alguém desmarca e abre vaga, quem está na fila
-- recebe um aviso (no app e no celular) e marca normalmente; quem marca primeiro fica com a vaga.

create table if not exists public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  destino     text not null default 'pessoa' check (destino in ('pessoa','equipe')),
  pessoa_id   uuid references public.pessoas(id) on delete cascade,
  titulo      text not null,
  corpo       text,
  url         text,
  chave       text unique,              -- evita mandar o mesmo aviso duas vezes
  criado_em   timestamptz not null default now(),
  enviado_em  timestamptz,
  tentativas  int not null default 0,
  check (destino = 'equipe' or pessoa_id is not null)
);
create index if not exists notificacoes_pendentes on public.notificacoes (criado_em) where enviado_em is null;
alter table public.notificacoes enable row level security;  -- só o servidor lê e escreve

create or replace function public.notificar(p_pessoa uuid, p_titulo text, p_corpo text, p_url text, p_chave text)
returns void language sql security definer set search_path = public as $$
  insert into public.notificacoes (destino, pessoa_id, titulo, corpo, url, chave)
  values (case when p_pessoa is null then 'equipe' else 'pessoa' end, p_pessoa, p_titulo, p_corpo, p_url, p_chave)
  on conflict (chave) do nothing
$$;
revoke execute on function public.notificar(uuid, text, text, text, text) from public, anon, authenticated;

create table if not exists public.lista_espera (
  aula_id    uuid not null references public.aulas(id) on delete cascade,
  aluno_id   uuid not null references public.pessoas(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  avisado_em timestamptz,
  primary key (aula_id, aluno_id)
);
create index if not exists lista_espera_aluno on public.lista_espera (aluno_id);
alter table public.lista_espera enable row level security;
create policy espera_le on public.lista_espera for select to authenticated using (aluno_id = public.meu_aluno_id() or public.sou_equipe());
grant select on public.lista_espera to authenticated;

create or replace function public.entrar_lista_espera(p_aula uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.aulas; v_aluno uuid := public.meu_aluno_id(); p public.pessoas; v_ocup int; n_cred int;
begin
  if v_aluno is null then raise exception 'Cadastro não encontrado'; end if;
  select * into p from public.pessoas where id = v_aluno;
  if p.vinculo <> 'aluno' then raise exception 'Sua matrícula está pausada'; end if;
  select * into a from public.aulas where id = p_aula;
  if not found or a.cancelada then raise exception 'Aula indisponível'; end if;
  if a.inicia_em <= now() then raise exception 'A aula já começou'; end if;
  if exists (select 1 from public.reservas where aula_id = p_aula and aluno_id = v_aluno and status in ('confirmada','presente')) then
    raise exception 'Você já está nesta aula'; end if;
  select count(*) into v_ocup from public.reservas where aula_id = p_aula and status in ('confirmada','presente') and not public.eh_fantasma(aluno_id);
  if v_ocup < a.capacidade then raise exception 'Ainda há vaga nesta aula. Marque direto.'; end if;
  if not (p.plano = 'livre' or p.reposicao_livre) then
    select count(*) into n_cred from public.creditos where aluno_id = v_aluno and usado_em_reserva_id is null and expira_em >= current_date;
    if n_cred = 0 then raise exception 'Você não tem reposições disponíveis'; end if;
  end if;
  insert into public.lista_espera (aula_id, aluno_id) values (p_aula, v_aluno) on conflict do nothing;
end $$;

create or replace function public.sair_lista_espera(p_aula uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.lista_espera where aula_id = p_aula and aluno_id = public.meu_aluno_id()
$$;

-- abriu vaga: avisa quem está na fila
create or replace function public.avisar_vaga_aberta(p_aula uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.aulas; v_ocup int; r record; v_quando text;
begin
  select * into a from public.aulas where id = p_aula;
  if not found or a.cancelada or a.inicia_em <= now() then return; end if;
  select count(*) into v_ocup from public.reservas where aula_id = p_aula and status in ('confirmada','presente') and not public.eh_fantasma(aluno_id);
  if v_ocup >= a.capacidade then return; end if;
  v_quando := (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from a.inicia_em at time zone 'America/Sao_Paulo')::int + 1]
    || ', ' || to_char(a.inicia_em at time zone 'America/Sao_Paulo', 'DD/MM') || ' às '
    || ltrim(to_char(a.inicia_em at time zone 'America/Sao_Paulo', 'HH24'), '0') || 'h'
    || coalesce(nullif(to_char(a.inicia_em at time zone 'America/Sao_Paulo', 'MI'), '00'), '');
  for r in select le.aluno_id from public.lista_espera le
            where le.aula_id = p_aula and (le.avisado_em is null or le.avisado_em < now() - interval '30 minutes') loop
    perform public.notificar(r.aluno_id, 'Abriu uma vaga', 'Abriu vaga na aula de ' || v_quando || '. Quem marcar primeiro fica com ela.',
      './?aula=' || p_aula, 'vaga:' || p_aula || ':' || r.aluno_id || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
    update public.lista_espera set avisado_em = now() where aula_id = p_aula and aluno_id = r.aluno_id;
  end loop;
end $$;
revoke execute on function public.avisar_vaga_aberta(uuid) from public, anon, authenticated;

create or replace function public.reservas_lista_espera() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- quem garantiu a vaga sai da fila
  if tg_op in ('INSERT','UPDATE') and new.status in ('confirmada','presente') then
    delete from public.lista_espera where aula_id = new.aula_id and aluno_id = new.aluno_id;
  end if;
  -- vaga liberada
  if tg_op in ('UPDATE','DELETE') and old.status in ('confirmada','presente')
     and (tg_op = 'DELETE' or new.status not in ('confirmada','presente'))
     and not public.eh_fantasma(old.aluno_id) then
    perform public.avisar_vaga_aberta(old.aula_id);
  end if;
  return null;
end $$;
drop trigger if exists reservas_lista_espera on public.reservas;
create trigger reservas_lista_espera after insert or update of status or delete on public.reservas
  for each row execute function public.reservas_lista_espera();

-- capacidade aumentada também abre vaga
create or replace function public.aulas_lista_espera() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.capacidade > old.capacidade and not new.cancelada then perform public.avisar_vaga_aberta(new.id); end if;
  return null;
end $$;
drop trigger if exists aulas_lista_espera on public.aulas;
create trigger aulas_lista_espera after update of capacidade on public.aulas
  for each row execute function public.aulas_lista_espera();

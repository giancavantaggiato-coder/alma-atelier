-- Alma · lembretes no celular (Web Push)
-- O app guarda a inscrição do aparelho; avisos entram em public.notificacoes e a função
-- enviar-push manda para o celular. As chaves ficam no Vault (vapid_publica, vapid_privada,
-- push_segredo) e só o servidor lê.

create extension if not exists pg_net;

create table if not exists public.push_inscricoes (
  endpoint     text primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  aparelho     text,
  criado_em    timestamptz not null default now(),
  usado_em     timestamptz
);
create index if not exists push_inscricoes_user on public.push_inscricoes (auth_user_id);
alter table public.push_inscricoes enable row level security;
create policy push_le_proprias on public.push_inscricoes for select to authenticated using (auth_user_id = auth.uid());
grant select on public.push_inscricoes to authenticated;

create or replace function public.salvar_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre no app primeiro'; end if;
  insert into public.push_inscricoes (endpoint, auth_user_id, p256dh, auth, aparelho)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_aparelho, 200))
  on conflict (endpoint) do update set auth_user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho;
end $$;

create or replace function public.remover_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_inscricoes where endpoint = p_endpoint and auth_user_id = auth.uid()
$$;

-- configuração lida só pela função de envio (service_role)
create or replace function public.push_config()
returns json language sql stable security definer set search_path = public, vault as $$
  select json_object_agg(name, decrypted_secret) from vault.decrypted_secrets
   where name in ('vapid_publica','vapid_privada','push_segredo')
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- chama a função de envio (assíncrono, não trava quem gerou o aviso)
create or replace function public.disparar_push()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_seg text;
begin
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'push_segredo';
  if v_seg is null then return; end if;
  perform net.http_post(
    url := 'https://iyfrfckynkcqkiorxhny.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object('Content-Type','application/json','x-alma-segredo', v_seg),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
end $$;
revoke execute on function public.disparar_push() from public, anon, authenticated;

create or replace function public.notificacoes_disparar() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.disparar_push(); return null; end $$;
drop trigger if exists notificacoes_disparar on public.notificacoes;
create trigger notificacoes_disparar after insert on public.notificacoes
  for each statement execute function public.notificacoes_disparar();

-- texto curto de dia e hora: "quinta, 23/10 às 14h"
create or replace function public.quando_txt(p timestamptz) returns text
language sql immutable set search_path = public as $$
  select (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from p at time zone 'America/Sao_Paulo')::int + 1]
    || ', ' || to_char(p at time zone 'America/Sao_Paulo', 'DD/MM') || ' às '
    || to_char(p at time zone 'America/Sao_Paulo', 'FMHH24') || 'h'
    || coalesce(nullif(to_char(p at time zone 'America/Sao_Paulo', 'MI'), '00'), '')
$$;
create or replace function public.hora_txt(p timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(p at time zone 'America/Sao_Paulo', 'FMHH24') || 'h'
    || coalesce(nullif(to_char(p at time zone 'America/Sao_Paulo', 'MI'), '00'), '')
$$;

-- lembrete da véspera (roda todo dia às 19h)
create or replace function public.gerar_lembretes()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; v_amanha date := (now() at time zone 'America/Sao_Paulo')::date + 1;
begin
  for r in select rs.id, rs.aluno_id, a.inicia_em, a.termina_em, rs.tipo
             from public.reservas rs join public.aulas a on a.id = rs.aula_id
             join public.pessoas p on p.id = rs.aluno_id and p.vinculo = 'aluno' and p.auth_user_id is not null
            where rs.status = 'confirmada' and not a.cancelada
              and (a.inicia_em at time zone 'America/Sao_Paulo')::date = v_amanha loop
    perform public.notificar(r.aluno_id,
      case when r.tipo = 'reposicao' then 'Amanhã tem reposição' else 'Amanhã tem aula' end,
      'Te esperamos às ' || public.hora_txt(r.inicia_em) || '. Se não puder ir, desmarque pelo app até 4h antes para ganhar a reposição.',
      './', 'lembrete:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.gerar_lembretes() from public, anon, authenticated;

-- aula cancelada pelo atelier: avisa quem estava nela
create or replace function public.reservas_avisos() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.aulas;
begin
  if new.status = 'aula_cancelada' and old.status is distinct from 'aula_cancelada' then
    select * into a from public.aulas where id = new.aula_id;
    if a.inicia_em > now() then
      perform public.notificar(new.aluno_id, 'Aula cancelada',
        'A aula de ' || public.quando_txt(a.inicia_em) || ' foi cancelada pelo atelier. Sua reposição já está disponível no app.',
        './?ir=agenda', 'cancelada:' || new.id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists reservas_avisos on public.reservas;
create trigger reservas_avisos after update of status on public.reservas
  for each row execute function public.reservas_avisos();

-- pedido de mudança: avisa a equipe quando chega e o aluno quando é decidido
create or replace function public.pedidos_avisos() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if tg_op = 'INSERT' and new.status = 'pendente' and not public.eh_fantasma(new.aluno_id) then
    select coalesce(nullif(trim(nome || ' ' || coalesce(sobrenome, '')), ''), email) into v_nome from public.pessoas where id = new.aluno_id;
    perform public.notificar(null, 'Novo pedido de mudança',
      v_nome || ' quer passar para ' || new.frequencia_nova || 'x por semana. Toque para aprovar ou recusar.',
      './?ir=painel', 'pedido:' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('aprovado','recusado') then
    perform public.notificar(new.aluno_id,
      case when new.status = 'aprovado' then 'Mudança aprovada' else 'Pedido de mudança' end,
      case when new.status = 'aprovado' then 'Seus novos dias já estão na sua agenda.'
           else 'Seu pedido não foi aprovado.' || coalesce(' ' || nullif(trim(new.resposta_equipe), ''), '') end,
      './?ir=voce', 'pedido:' || new.id || ':' || new.status);
  end if;
  return null;
end $$;
drop trigger if exists pedidos_avisos on public.pedidos_mudanca;
create trigger pedidos_avisos after insert or update of status on public.pedidos_mudanca
  for each row execute function public.pedidos_avisos();

-- agendamentos: lembretes às 19h de Brasília (22h UTC) e nova tentativa de envio a cada 10 min
select cron.schedule('alma-lembretes-vespera', '0 22 * * *', $$select public.gerar_lembretes()$$);
select cron.schedule('alma-push-reenvio', '*/10 * * * *',
  $$select public.disparar_push() where exists (select 1 from public.notificacoes where enviado_em is null and tentativas < 5)$$);

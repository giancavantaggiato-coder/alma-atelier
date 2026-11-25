-- Alma · Central: pauta para aprovar, legenda separada do texto e pedido de ajuste
-- Fluxo: pauta (proposta, espera aprovação) → texto (o Claude escreve) → revisão do texto (direção lê na tela de leitura)
--        → design → revisão do design → agendar → agendado → publicado.
-- Texto de carrossel: um slide por bloco, separados por uma linha com ---. A legenda fica na coluna legenda.

alter table public.cont_pecas drop constraint if exists cont_pecas_estado_check;
alter table public.cont_pecas add constraint cont_pecas_estado_check
  check (estado in ('ideia','pauta','texto','revisao_texto','design','revisao_design','agendar','agendado','publicado'));
alter table public.cont_pecas add column if not exists pauta     text;         -- o ângulo do post, em uma ou duas frases
alter table public.cont_pecas add column if not exists legenda   text;
alter table public.cont_pecas add column if not exists ajuste    text;         -- pedido de ajuste da direção para o Claude reescrever
alter table public.cont_pecas add column if not exists escrito_em timestamptz;

create or replace function public.cont_prazo(p_formato text, p_estado text, p_dia date) returns date
language sql immutable set search_path = public as $$
  select case when p_dia is null or p_estado in ('ideia','publicado') then null
    else p_dia - case when p_formato = 'blog' then
      case p_estado when 'pauta' then 15 when 'texto' then 14 when 'revisao_texto' then 10 when 'design' then 6
                    when 'revisao_design' then 3 when 'agendar' then 1 else 0 end
    else
      case p_estado when 'pauta' then 8 when 'texto' then 7 when 'revisao_texto' then 5 when 'design' then 4
                    when 'revisao_design' then 2 when 'agendar' then 1 else 0 end
    end end
$$;

-- avisa a direção quando um texto ou um design fica pronto para revisar
create or replace function public.cont_aviso_revisao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('revisao_texto','revisao_design') and new.estado is distinct from old.estado then
    insert into public.notificacoes (destino, auth_user_id, titulo, corpo, url, chave)
    select 'equipe', e.auth_user_id,
           case when new.estado = 'revisao_texto' then 'Texto para revisar' else 'Design para revisar' end,
           new.titulo, './?ir=central', 'central:rev:' || new.id || ':' || new.estado || ':' || extract(epoch from now())::bigint / 3600
      from public.equipe e where e.direcao and e.auth_user_id is not null
    on conflict (chave) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.cont_aviso_revisao() from public, anon, authenticated;
drop trigger if exists cont_aviso_revisao on public.cont_pecas;
create trigger cont_aviso_revisao after update of estado on public.cont_pecas
  for each row execute function public.cont_aviso_revisao();

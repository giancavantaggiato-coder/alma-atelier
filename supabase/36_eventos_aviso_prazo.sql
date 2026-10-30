-- 36: aviso aos alunos quando um evento é publicado; prazo de inscrição (já aplicado em 30/10/2026)
alter table public.eventos add column if not exists inscricoes_ate timestamptz;
-- inscrever_evento: recusa com 'As inscrições para este evento foram encerradas' depois de inscricoes_ate

create or replace function public.evento_publicado_avisa()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record; v_corpo text;
begin
  if not new.publicado or new.inicia_em <= now() then return null; end if;
  if tg_op = 'UPDATE' and old.publicado then return null; end if;
  v_corpo := new.titulo || ', ' || public.quando_txt(new.inicia_em)
    || case when new.inscricoes_ate is not null then '. Inscrições até ' || to_char(new.inscricoes_ate at time zone 'America/Sao_Paulo', 'DD/MM') else '' end
    || '. Veja no app e se inscreva.';
  for p in select id from public.pessoas where vinculo = 'aluno' and acesso_app and not fantasma loop
    perform public.notificar(p.id, 'Novo evento no atelier', v_corpo, './?evento=' || new.id, 'evento:' || new.id || ':' || p.id);
  end loop;
  return null;
end $$;
create trigger evento_publicado_avisa after insert or update of publicado on public.eventos
for each row execute function public.evento_publicado_avisa();

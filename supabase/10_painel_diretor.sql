-- Alma · painel da equipe (diretor): foto, capa e resumo
alter table public.equipe add column if not exists avatar_url text;
alter table public.equipe add column if not exists capa_url text;
alter table public.equipe add column if not exists cargo text;
update public.equipe set nome = coalesce(nome, 'Giancarlo Avantaggiato'), cargo = coalesce(cargo, 'Diretor')
 where email = 'giancarlo@almaestudosvisuais.com.br';

create or replace function public.meu_painel_equipe()
returns json language plpgsql stable security definer set search_path = public as $$
declare e public.equipe;
begin
  perform public.exigir_equipe();
  select * into e from public.equipe where auth_user_id = auth.uid();
  return json_build_object(
    'nome', e.nome, 'email', e.email, 'cargo', e.cargo, 'avatar_url', e.avatar_url, 'capa_url', e.capa_url, 'desde', e.criado_em,
    'alunos', (select count(*) from public.pessoas where vinculo = 'aluno' and not fantasma),
    'pausados', (select count(*) from public.pessoas where vinculo = 'pausado' and not fantasma),
    'usam_app', (select count(*) from public.pessoas where vinculo in ('aluno','pausado') and not fantasma and cadastro_completo_em is not null),
    'pedidos', (select count(*) from public.pedidos_mudanca where status = 'pendente'),
    'aulas_semana', (select count(*) from public.aulas where not cancelada
                       and inicia_em >= date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
                       and inicia_em < (date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '7 days') at time zone 'America/Sao_Paulo'),
    'interessados', (select count(*) from public.pessoas where vinculo = 'interessado')
  );
end $$;

create or replace function public.atualizar_equipe(p_nome text default null, p_cargo text default null, p_avatar text default null, p_capa text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_equipe();
  update public.equipe set
    nome = coalesce(nullif(trim(p_nome), ''), nome),
    cargo = coalesce(nullif(trim(p_cargo), ''), cargo),
    avatar_url = coalesce(p_avatar, avatar_url),
    capa_url = coalesce(p_capa, capa_url)
  where auth_user_id = auth.uid();
end $$;

revoke execute on function public.meu_painel_equipe() from public, anon;
revoke execute on function public.atualizar_equipe(text, text, text, text) from public, anon;
grant execute on function public.meu_painel_equipe() to authenticated;
grant execute on function public.atualizar_equipe(text, text, text, text) to authenticated;

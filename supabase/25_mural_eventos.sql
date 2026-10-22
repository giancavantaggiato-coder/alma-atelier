-- Alma, mural dos eventos
-- Tocar no evento abre a página dele. Embaixo dos detalhes fica um mural: alunos ativos e equipe
-- comentam e reagem ao evento (as reações voltam a ser usadas, pela tabela public.reacoes da 16).
-- Ex-alunos e alunos suspensos leem o mural, mas não escrevem. Quem escreveu pode apagar; a equipe apaga qualquer um.

create table if not exists public.comentarios_evento (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  texto      text not null check (char_length(trim(texto)) between 1 and 500),
  criado_em  timestamptz not null default now()
);
create index if not exists comentarios_evento_ev on public.comentarios_evento (evento_id, criado_em);
alter table public.comentarios_evento enable row level security;   -- acesso só pelas funções abaixo
revoke all on public.comentarios_evento from anon, authenticated;

create or replace function public.mural_evento(p_evento uuid)
returns table (id uuid, nome text, avatar_url text, equipe boolean, sou_eu boolean, texto text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(nullif(trim(e.nome), ''), public.nome_curto(p), 'Aluno'),
         coalesce(e.avatar_url, p.avatar_url),
         e.email is not null, c.user_id = auth.uid(), c.texto, c.criado_em
    from public.comentarios_evento c
    left join public.equipe e on e.auth_user_id = c.user_id
    left join public.pessoas p on p.auth_user_id = c.user_id
   where c.evento_id = p_evento
     and (public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe())
     and exists (select 1 from public.eventos v where v.id = p_evento and (v.publicado or public.sou_equipe()))
     and (c.user_id = auth.uid() or not public.login_fantasma(c.user_id))
   order by c.criado_em
$$;

create or replace function public.comentar_evento(p_evento uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or (public.meu_aluno_id() is null and not public.sou_equipe()) then
    raise exception 'O mural é para alunos e equipe do atelier.';
  end if;
  p_texto := trim(coalesce(p_texto, ''));
  if p_texto = '' then raise exception 'Escreva o comentário'; end if;
  if char_length(p_texto) > 500 then raise exception 'O comentário pode ter até 500 caracteres'; end if;
  if not exists (select 1 from public.eventos where id = p_evento and (publicado or public.sou_equipe())) then
    raise exception 'Evento não encontrado';
  end if;
  insert into public.comentarios_evento (evento_id, user_id, texto) values (p_evento, auth.uid(), p_texto) returning id into v_id;
  return v_id;
end $$;

create or replace function public.apagar_comentario_evento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.comentarios_evento where id = p_id and (user_id = auth.uid() or public.sou_equipe());
  if not found then raise exception 'Comentário não encontrado'; end if;
end $$;

-- quantos comentários cada evento tem (para o cartão da lista)
create or replace function public.mural_contagem()
returns table (evento_id uuid, total int)
language sql stable security definer set search_path = public as $$
  select c.evento_id, count(*)::int
    from public.comentarios_evento c
   where (public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe())
     and (c.user_id = auth.uid() or not public.login_fantasma(c.user_id))
   group by c.evento_id
$$;

comment on table public.reacoes is 'Reações com emoji nos eventos (por login). Voltaram a ser usadas na página do evento em 22/10/2026.';

revoke all on function public.mural_evento(uuid) from public, anon;
revoke all on function public.comentar_evento(uuid, text) from public, anon;
revoke all on function public.apagar_comentario_evento(uuid) from public, anon;
revoke all on function public.mural_contagem() from public, anon;
grant execute on function public.mural_evento(uuid) to authenticated;
grant execute on function public.comentar_evento(uuid, text) to authenticated;
grant execute on function public.apagar_comentario_evento(uuid) to authenticated;
grant execute on function public.mural_contagem() to authenticated;

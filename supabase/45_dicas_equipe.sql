-- 45: Equipe também participa das dicas do presente (20/11/2026)
-- A conta de equipe passa a ter um cadastro de pessoa ligado (equipe.pessoa_id). Assim quem é equipe
-- e está inscrito num evento escreve as próprias dicas pelo app de administração.

alter table public.equipe add column if not exists pessoa_id uuid references public.pessoas(id) on delete set null;
update public.equipe set pessoa_id = '98d93a6a-9eb0-41fa-928c-99b533769be8'
 where email = 'giancarlo@almaestudosvisuais.com.br' and pessoa_id is null;

create or replace function public.meu_participante_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_inscrito_id(), (select pessoa_id from public.equipe where auth_user_id = auth.uid()))
$$;
revoke all on function public.meu_participante_id() from public, anon;
grant execute on function public.meu_participante_id() to authenticated;

create or replace function public.dicas_evento(p_evento uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_eu uuid := public.meu_participante_id(); r json;
begin
  if not (public.meu_inscrito_id() is not null or public.sou_equipe()) then return null; end if;
  if not exists (select 1 from public.eventos where id = p_evento and dicas_presente and (publicado or public.sou_equipe())) then return null; end if;
  select json_build_object(
    'inscrito', exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu),
    'minha', (select texto from public.evento_dicas where evento_id = p_evento and pessoa_id = v_eu),
    'eu', v_eu,
    'total', (select count(*) from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma where i.evento_id = p_evento),
    'itens', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p), 'texto', d.texto, 'sou_eu', p.id = v_eu)
                         order by public.nome_curto(p))
                        from public.evento_dicas d join public.pessoas p on p.id = d.pessoa_id
                       where d.evento_id = p_evento and (not p.fantasma or p.id = v_eu)), '[]'::json),
    'faltam', coalesce((select json_agg(json_build_object('pessoa_id', p.id, 'nome', public.nome_curto(p)) order by public.nome_curto(p))
                         from public.inscricoes i join public.pessoas p on p.id = i.pessoa_id and not p.fantasma
                        where i.evento_id = p_evento and p.id is distinct from v_eu
                          and not exists (select 1 from public.evento_dicas d where d.evento_id = p_evento and d.pessoa_id = p.id)), '[]'::json)
  ) into r;
  return r;
end $$;

create or replace function public.salvar_dicas(p_evento uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_eu uuid := public.meu_participante_id();
begin
  if v_eu is null then raise exception 'Cadastro não encontrado'; end if;
  if not exists (select 1 from public.eventos where id = p_evento and publicado and dicas_presente) then raise exception 'Evento indisponível'; end if;
  if not exists (select 1 from public.inscricoes where evento_id = p_evento and pessoa_id = v_eu) then
    raise exception 'Só quem está participando escreve dicas';
  end if;
  p_texto := trim(coalesce(p_texto, ''));
  if p_texto = '' then
    delete from public.evento_dicas where evento_id = p_evento and pessoa_id = v_eu; return;
  end if;
  if char_length(p_texto) > 500 then raise exception 'Escreva em até 500 caracteres'; end if;
  insert into public.evento_dicas (evento_id, pessoa_id, texto) values (p_evento, v_eu, p_texto)
  on conflict (evento_id, pessoa_id) do update set texto = excluded.texto, atualizado_em = now();
end $$;

create or replace function public.dicas_pendentes()
returns table (evento_id uuid, titulo text, inicia_em timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.inicia_em
    from public.eventos e
    join public.inscricoes i on i.evento_id = e.id and i.pessoa_id = public.meu_participante_id()
   where e.dicas_presente and e.publicado and e.inicia_em > now()
     and not exists (select 1 from public.evento_dicas d where d.evento_id = e.id and d.pessoa_id = i.pessoa_id)
   order by e.inicia_em
$$;

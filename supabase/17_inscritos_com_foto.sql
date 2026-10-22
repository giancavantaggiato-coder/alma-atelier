-- Quem vai em cada evento, com foto (ou iniciais), para mostrar embaixo do card.
create or replace function public.inscritos_eventos()
returns table (evento_id uuid, nome text, avatar_url text, sou_eu boolean)
language sql stable security definer set search_path = public as $$
  select i.evento_id,
         coalesce(nullif(trim(split_part(p.nome,' ',1) || ' ' || coalesce(nullif(left(split_part(p.nome,' ',2),1),'') || '.', '')), ''), 'Aluno'),
         p.avatar_url, p.id = public.meu_aluno_id()
    from public.inscricoes i
    join public.pessoas p on p.id = i.pessoa_id and (not p.fantasma or p.id = public.meu_aluno_id())
   where public.meu_aluno_id() is not null or public.meu_visitante_id() is not null or public.sou_equipe()
   order by i.evento_id, (p.id = public.meu_aluno_id()) desc, i.criado_em
$$;
revoke all on function public.inscritos_eventos() from public, anon;
grant execute on function public.inscritos_eventos() to authenticated;

-- Alma · avisa a equipe no celular quando um aluno marca reposição
-- (não avisa quando a própria equipe marca, nem para o fantasma, nem para aula que já começou)
create or replace function public.reposicao_avisa_equipe() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.aulas; v_nome text;
begin
  if new.tipo <> 'reposicao' or new.status <> 'confirmada' then return null; end if;
  if tg_op = 'UPDATE' and old.status = new.status and old.tipo = new.tipo then return null; end if;
  if public.eh_fantasma(new.aluno_id) or public.sou_equipe() then return null; end if;
  select * into a from public.aulas where id = new.aula_id;
  if a.inicia_em <= now() then return null; end if;
  select coalesce(nullif(trim(coalesce(nome,'') || ' ' || coalesce(sobrenome,'')), ''), email) into v_nome from public.pessoas where id = new.aluno_id;
  perform public.notificar(null, 'Reposição marcada',
    v_nome || ' marcou reposição para ' || public.quando_txt(a.inicia_em) || '.',
    './?ir=eqhoje', 'repo:' || new.id || ':' || extract(epoch from now())::bigint);
  return null;
end $$;
revoke execute on function public.reposicao_avisa_equipe() from public, anon, authenticated;
create trigger reposicao_avisa_equipe after insert or update of status, tipo on public.reservas
  for each row execute function public.reposicao_avisa_equipe();

-- Alma · equipe exclui o cadastro de uma pessoa (e o login dela)
-- Apaga junto: dias fixos, reservas, reposições e inscrições em eventos.
create or replace function public.excluir_pessoa(p_pessoa uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_auth uuid; v_email text;
begin
  perform public.exigir_equipe();
  select auth_user_id, email into v_auth, v_email from public.pessoas where id = p_pessoa;
  if not found then raise exception 'Cadastro não encontrado'; end if;
  if exists (select 1 from public.equipe e where e.auth_user_id = v_auth or lower(e.email) = lower(v_email)) then
    raise exception 'Este e-mail é da equipe e não pode ser excluído por aqui';
  end if;
  delete from public.pessoas where id = p_pessoa;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end $$;
revoke execute on function public.excluir_pessoa(uuid) from public, anon;
grant execute on function public.excluir_pessoa(uuid) to authenticated;
select 'Pronto: exclusão de cadastro ativada' as resultado;

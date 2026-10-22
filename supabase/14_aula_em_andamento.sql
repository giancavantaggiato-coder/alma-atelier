-- Ao entrar num dia fixo (primeiro acesso, matrícula pela equipe ou rotina semanal),
-- a aula que já começou mas ainda não terminou também entra na agenda do aluno.
do $$
declare f record; d text;
begin
  for f in select p.oid from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('completar_cadastro','matricular','manter_aulas')
              and pg_get_functiondef(p.oid) like '%a.inicia_em > now() and not a.cancelada%'
  loop
    d := replace(pg_get_functiondef(f.oid), 'a.inicia_em > now() and not a.cancelada', 'a.termina_em > now() and not a.cancelada');
    execute d;
  end loop;
end $$;

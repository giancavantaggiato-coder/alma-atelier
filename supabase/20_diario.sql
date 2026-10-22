-- Alma · diário de registros do aluno
-- Cada registro tem data, título opcional, anotação e fotos. O aluno vê e edita os seus;
-- a equipe do atelier também vê (é um diário de ateliê, para acompanhar o processo).

create table if not exists public.diario (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.pessoas(id) on delete cascade,
  data          date not null default (now() at time zone 'America/Sao_Paulo')::date,
  titulo        text check (titulo is null or char_length(titulo) <= 140),
  texto         text check (texto is null or char_length(texto) <= 20000),
  fotos         text[] not null default '{}' check (cardinality(fotos) <= 10),
  tipo          text not null default 'anotacao' check (tipo in ('anotacao','obra','aula','referencia')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (coalesce(nullif(trim(titulo),''), nullif(trim(texto),'')) is not null or cardinality(fotos) > 0)
);
alter table public.diario add column if not exists tipo text not null default 'anotacao' check (tipo in ('anotacao','obra','aula','referencia'));
create index if not exists diario_aluno_data on public.diario (aluno_id, data desc, criado_em desc);

alter table public.diario enable row level security;
drop policy if exists diario_le on public.diario;
drop policy if exists diario_cria on public.diario;
drop policy if exists diario_edita on public.diario;
drop policy if exists diario_apaga on public.diario;
create policy diario_le    on public.diario for select to authenticated using (aluno_id = public.meu_aluno_id() or public.sou_equipe());
create policy diario_cria  on public.diario for insert to authenticated with check (aluno_id = public.meu_aluno_id());
create policy diario_edita on public.diario for update to authenticated using (aluno_id = public.meu_aluno_id()) with check (aluno_id = public.meu_aluno_id());
create policy diario_apaga on public.diario for delete to authenticated using (aluno_id = public.meu_aluno_id());
grant select, insert, update, delete on public.diario to authenticated;

create or replace function public.diario_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists diario_atualizado on public.diario;
create trigger diario_atualizado before update on public.diario for each row execute function public.diario_atualizado();

-- fotos do diário: bucket privado, cada login grava na própria pasta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diario', 'diario', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists diario_fotos_le on storage.objects;
drop policy if exists diario_fotos_grava on storage.objects;
drop policy if exists diario_fotos_apaga on storage.objects;
create policy diario_fotos_le on storage.objects for select to authenticated
  using (bucket_id = 'diario' and ((storage.foldername(name))[1] = auth.uid()::text or public.sou_equipe()));
create policy diario_fotos_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'diario' and (storage.foldername(name))[1] = auth.uid()::text);
create policy diario_fotos_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and (storage.foldername(name))[1] = auth.uid()::text);

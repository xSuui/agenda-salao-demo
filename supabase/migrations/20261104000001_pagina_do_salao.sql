-- Página do salão: foto de capa, galeria "Nossos trabalhos" e "Onde estamos".
-- O endereço e o WhatsApp já existiam na tabela saloes; aqui entram as fotos.
-- As fotos ficam no Storage do Supabase (bucket público "fotos"),
-- numa pasta por salão: fotos/<id do salão>/<arquivo>.jpg

-- 1. Foto de capa do salão (caminho dentro do bucket)
alter table public.saloes add column if not exists foto_capa text;

-- 2. Galeria de trabalhos
create table if not exists public.fotos_salao (
  id uuid primary key default gen_random_uuid(),
  salao_id uuid not null references public.saloes (id) on delete cascade,
  caminho text not null,              -- ex.: <id do salão>/<uuid>.jpg
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists fotos_salao_salao_idx on public.fotos_salao (salao_id, ordem);

alter table public.fotos_salao enable row level security;

drop policy if exists "publico ve fotos" on public.fotos_salao;
create policy "publico ve fotos" on public.fotos_salao
  for select to anon, authenticated using (true);

drop policy if exists "dono gerencia fotos" on public.fotos_salao;
create policy "dono gerencia fotos" on public.fotos_salao
  for all to authenticated
  using (public.eh_dono_do_salao(salao_id))
  with check (public.eh_dono_do_salao(salao_id));

-- 3. Bucket público (qualquer um vê; só imagens de até 5 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 4. Só a dona sobe ou apaga arquivos, e só na pasta do próprio salão.
--    (storage.foldername(name))[1] = primeira pasta do caminho = id do salão
drop policy if exists "dono sobe fotos do salao" on storage.objects;
create policy "dono sobe fotos do salao" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.saloes s
      where s.id::text = (storage.foldername(name))[1]
        and s.dono_id = (select auth.uid())
    )
  );

drop policy if exists "dono apaga fotos do salao" on storage.objects;
create policy "dono apaga fotos do salao" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.saloes s
      where s.id::text = (storage.foldername(name))[1]
        and s.dono_id = (select auth.uid())
    )
  );

-- Para apagar pela API, o Storage também exige poder "ver" o arquivo
drop policy if exists "dono ve fotos do salao" on storage.objects;
create policy "dono ve fotos do salao" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.saloes s
      where s.id::text = (storage.foldername(name))[1]
        and s.dono_id = (select auth.uid())
    )
  );

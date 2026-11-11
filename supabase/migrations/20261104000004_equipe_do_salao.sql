-- Equipe do salão: outras pessoas com login no painel do mesmo salão
-- (ex.: uma manicure que atende no salão, ou alguém que ajuda nos testes).
-- Quem é da equipe faz no painel o mesmo que a dona: reservas, atendentes,
-- serviços, expediente, folgas, endereço. Não pode suspender o salão nem
-- trocar a dona (o gatilho protege_campos_do_admin continua valendo).

create table if not exists public.equipe_salao (
  salao_id uuid not null references public.saloes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text,                               -- só para o administrador saber quem é
  criado_em timestamptz not null default now(),
  primary key (salao_id, user_id)
);
alter table public.equipe_salao enable row level security;

-- Cada pessoa vê as próprias ligações; o administrador vê e mexe em todas
drop policy if exists "ve a propria equipe" on public.equipe_salao;
create policy "ve a propria equipe" on public.equipe_salao
  for select to authenticated
  using (user_id = (select auth.uid()) or public.eh_admin());

drop policy if exists "admin gerencia equipe" on public.equipe_salao;
create policy "admin gerencia equipe" on public.equipe_salao
  for all to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

grant select, insert, update, delete on public.equipe_salao to authenticated;

-- "Dono do salão" passa a valer para: administrador, dona e equipe
create or replace function public.eh_dono_do_salao(p_salao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_admin()
    or exists (
      select 1 from public.saloes
      where id = p_salao_id and dono_id = (select auth.uid())
    )
    or exists (
      select 1 from public.equipe_salao
      where salao_id = p_salao_id and user_id = (select auth.uid())
    );
$$;

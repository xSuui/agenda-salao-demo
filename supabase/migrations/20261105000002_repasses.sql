-- Repasses (comissão) por atendente. Ex.: uma atendente fica com 50% de cada
-- serviço que faz; a outra metade fica com o salão.
-- A porcentagem fica numa tabela SEPARADA porque a tabela profissionais é
-- pública (a página das clientes lê os nomes). Só a dona e o administrador
-- veem e mudam: a equipe não (ninguém muda a própria comissão).

-- 1. Dona de verdade ou administrador (sem a equipe)
create or replace function public.eh_dona_ou_admin(p_salao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_admin() or exists (
    select 1 from public.saloes
    where id = p_salao_id and dono_id = (select auth.uid())
  );
$$;
revoke all on function public.eh_dona_ou_admin(uuid) from public;
grant execute on function public.eh_dona_ou_admin(uuid) to authenticated;

-- 2. Garante que a atendente é mesmo do salão informado
alter table public.profissionais
  drop constraint if exists profissionais_id_salao_unico;
alter table public.profissionais
  add constraint profissionais_id_salao_unico unique (id, salao_id);

-- 3. Tabela de repasses
create table if not exists public.repasses_profissionais (
  profissional_id uuid primary key,
  salao_id uuid not null references public.saloes (id) on delete cascade,
  percentual numeric(5,2) not null default 0 check (percentual >= 0 and percentual <= 100),
  atualizado_em timestamptz not null default now(),
  foreign key (profissional_id, salao_id)
    references public.profissionais (id, salao_id) on delete cascade
);

alter table public.repasses_profissionais enable row level security;

drop policy if exists "dona e admin gerenciam repasses" on public.repasses_profissionais;
create policy "dona e admin gerenciam repasses" on public.repasses_profissionais
  for all to authenticated
  using (public.eh_dona_ou_admin(salao_id))
  with check (public.eh_dona_ou_admin(salao_id));

grant select, insert, update, delete on public.repasses_profissionais to authenticated;

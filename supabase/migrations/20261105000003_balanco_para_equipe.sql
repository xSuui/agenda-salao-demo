-- Liberar o Balanço (só leitura) para alguém da equipe, uma pessoa por vez.
-- Ex.: alguém que ajuda nos testes. A pessoa VÊ o Balanço e os repasses,
-- mas não muda porcentagens (gravar continua só com a dona e o administrador).
-- Desligar: update public.equipe_salao set ve_balanco = false where ...

alter table public.equipe_salao
  add column if not exists ve_balanco boolean not null default false;

create or replace function public.ve_balanco_do_salao(p_salao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_dona_ou_admin(p_salao_id) or exists (
    select 1 from public.equipe_salao
    where salao_id = p_salao_id
      and user_id = (select auth.uid())
      and ve_balanco
  );
$$;
revoke all on function public.ve_balanco_do_salao(uuid) from public;
grant execute on function public.ve_balanco_do_salao(uuid) to authenticated;

-- Leitura dos repasses para quem tem o Balanço liberado
drop policy if exists "quem ve o balanco le os repasses" on public.repasses_profissionais;
create policy "quem ve o balanco le os repasses" on public.repasses_profissionais
  for select to authenticated
  using (public.ve_balanco_do_salao(salao_id));

-- Exemplo: liberar para uma conta de testes (troque o e-mail)
update public.equipe_salao
set ve_balanco = true
where user_id = (select id from auth.users where lower(email) = 'teste@exemplo.com');

-- Conferir quem tem ve_balanco = true
select e.nome, e.ve_balanco from public.equipe_salao e order by e.nome;

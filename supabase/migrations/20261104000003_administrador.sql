-- Administrador máximo do sistema (dono do sistema) e chave "salão no ar / suspenso".
-- O administrador vê e mexe em todos os salões, mesmo quando a dona do
-- salão for outra pessoa. A dona continua mexendo só no próprio salão.

-- 1. Lista de administradores (ninguém lê pela API; só as funções abaixo)
create table if not exists public.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.administradores enable row level security;
-- (sem policies e sem grant: a tabela fica fechada para o site)

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.administradores where user_id = (select auth.uid()));
$$;
revoke all on function public.eh_admin() from public;
grant execute on function public.eh_admin() to authenticated;

-- 2. "Dono do salão" passa a valer também para o administrador.
--    Todas as regras que usam esta função (profissionais, serviços,
--    expediente, folgas, clientes, reservas, fotos) já ficam liberadas.
create or replace function public.eh_dono_do_salao(p_salao_id uuid)
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

-- Regras que conferiam o dono direto (sem a função)
drop policy if exists "dono edita o salao" on public.saloes;
create policy "dono edita o salao" on public.saloes
  for update to authenticated
  using (public.eh_dono_do_salao(id))
  with check (public.eh_dono_do_salao(id));

drop policy if exists "dono sobe fotos do salao" on storage.objects;
create policy "dono sobe fotos do salao" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.saloes s
      where s.id::text = (storage.foldername(name))[1] and public.eh_dono_do_salao(s.id)
    )
  );

drop policy if exists "dono apaga fotos do salao" on storage.objects;
create policy "dono apaga fotos do salao" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.saloes s
      where s.id::text = (storage.foldername(name))[1] and public.eh_dono_do_salao(s.id)
    )
  );

drop policy if exists "dono ve fotos do salao" on storage.objects;
create policy "dono ve fotos do salao" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and exists (
      select 1 from public.saloes s
      where s.id::text = (storage.foldername(name))[1] and public.eh_dono_do_salao(s.id)
    )
  );

-- 3. Chave "salão no ar". Desligada, a página mostra "indisponível"
--    e ninguém consegue marcar. Nada é apagado.
alter table public.saloes add column if not exists no_ar boolean not null default true;

-- Só o administrador liga/desliga o salão ou troca a dona
create or replace function public.protege_campos_do_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.no_ar is distinct from old.no_ar or new.dono_id is distinct from old.dono_id)
     and not public.eh_admin()
     and (select auth.uid()) is not null then
    raise exception 'Só o administrador do sistema pode mudar isso.';
  end if;
  return new;
end;
$$;

drop trigger if exists protege_campos_do_admin on public.saloes;
create trigger protege_campos_do_admin
  before update on public.saloes
  for each row execute function public.protege_campos_do_admin();

-- Salão fora do ar não mostra horários livres (e, por isso, marcar_horario
-- também recusa: ele confere a lista de livres antes de reservar).
create or replace function public.horarios_livres(
  p_profissional_id uuid,
  p_servico_id uuid,
  p_data date
)
returns table (horario_inicio timestamptz, horario_fim timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fuso text;
  v_duracao interval;
  v_prazo_sinal interval;
  v_hoje date;
begin
  -- Profissional ativa + serviço ativo, do mesmo salão (no ar), e ela faz esse serviço
  select s.fuso_horario,
         make_interval(mins => sv.duracao_minutos),
         make_interval(mins => s.minutos_para_pagar_sinal)
    into v_fuso, v_duracao, v_prazo_sinal
  from public.profissionais p
  join public.saloes s on s.id = p.salao_id
  join public.servicos sv on sv.id = p_servico_id and sv.salao_id = p.salao_id
  join public.servico_profissional sp on sp.servico_id = sv.id and sp.profissional_id = p.id
  where p.id = p_profissional_id and p.ativo and sv.ativo and s.no_ar;

  if not found then
    return;  -- combinação inválida ou salão fora do ar: nenhum horário
  end if;

  -- Só deixa consultar de hoje até 60 dias para frente
  v_hoje := (now() at time zone v_fuso)::date;
  if p_data < v_hoje or p_data > v_hoje + 60 then
    return;
  end if;

  return query
  select distinct g.ini, g.ini + v_duracao
  from public.horarios_funcionamento h
  cross join lateral generate_series(
    (p_data + h.inicio) at time zone v_fuso,
    ((p_data + h.fim) at time zone v_fuso) - v_duracao,
    interval '30 minutes'
  ) as g(ini)
  where h.profissional_id = p_profissional_id
    and h.dia_semana = extract(dow from p_data)
    and g.ini > now()
    -- não bate com agendamento confirmado ou reserva ainda no prazo do sinal
    and not exists (
      select 1 from public.agendamentos a
      where a.profissional_id = p_profissional_id
        and (a.status = 'confirmado'
             or (a.status = 'aguardando_sinal' and a.criado_em > now() - v_prazo_sinal))
        and tstzrange(a.inicio, a.fim, '[)') && tstzrange(g.ini, g.ini + v_duracao, '[)')
    )
    -- não bate com folga, almoço ou imprevisto
    and not exists (
      select 1 from public.bloqueios b
      where b.profissional_id = p_profissional_id
        and tstzrange(b.inicio, b.fim, '[)') && tstzrange(g.ini, g.ini + v_duracao, '[)')
    )
  order by 1;
end;
$$;

-- 4. Administrador do sistema: troque pelo e-mail da sua conta
insert into public.administradores (user_id)
select id from auth.users where email = 'admin@exemplo.com'
on conflict (user_id) do nothing;

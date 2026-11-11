-- =====================================================================
-- Agenda Salão · Estrutura inicial do banco
-- Pensado para vários salões desde o começo (micro SaaS): toda tabela
-- pertence a um salão, e cada dono só enxerga os dados do próprio salão.
-- Valores em dinheiro ficam em centavos (2000 = R$ 20,00) para evitar
-- erro de arredondamento.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Um salão (cliente do SaaS)
create table public.saloes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,                 -- endereço do salão, ex.: studio-demo
  whatsapp text,
  endereco text,
  dono_id uuid references auth.users (id) on delete set null,
  sinal_valor_centavos integer not null default 2000 check (sinal_valor_centavos >= 0),
  modo_sinal text not null default 'manual' check (modo_sinal in ('manual', 'automatico')),
  antecedencia_remarcar_horas integer not null default 48 check (antecedencia_remarcar_horas >= 0),
  fuso_horario text not null default 'America/Sao_Paulo',
  criado_em timestamptz not null default now()
);

-- Quem atende (Ana, Bia...)
create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  salao_id uuid not null references public.saloes (id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- O que o salão oferece
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  salao_id uuid not null references public.saloes (id) on delete cascade,
  nome text not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  duracao_minutos integer not null check (duracao_minutos > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Quem faz cada serviço
create table public.servico_profissional (
  servico_id uuid not null references public.servicos (id) on delete cascade,
  profissional_id uuid not null references public.profissionais (id) on delete cascade,
  primary key (servico_id, profissional_id)
);

-- Expediente de cada profissional (0 = domingo ... 6 = sábado)
create table public.horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  inicio time not null,
  fim time not null,
  check (fim > inicio)
);

-- Folga, almoço, imprevisto
create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais (id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  check (fim > inicio)
);

-- Clientes finais de cada salão
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  salao_id uuid not null references public.saloes (id) on delete cascade,
  nome text not null,
  telefone text not null,                    -- formato 55 + DDD + número, só dígitos
  criado_em timestamptz not null default now(),
  unique (salao_id, telefone)
);

-- Os horários marcados
create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  salao_id uuid not null references public.saloes (id) on delete cascade,
  profissional_id uuid not null references public.profissionais (id),
  servico_id uuid not null references public.servicos (id),
  cliente_id uuid not null references public.clientes (id),
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'aguardando_sinal' check (status in (
    'aguardando_sinal',   -- reservado, esperando o Pix
    'confirmado',         -- sinal pago
    'cancelado_cliente',
    'cancelado_salao',
    'expirado',           -- não pagou a tempo
    'faltou',
    'concluido'
  )),
  sinal_status text not null default 'pendente' check (sinal_status in (
    'pendente', 'pago', 'devolvido', 'retido'
  )),
  token_cliente uuid not null default gen_random_uuid() unique,  -- link de remarcar/desmarcar da cliente
  lembrete_enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  -- Trava contra horário duplicado: a mesma profissional não pode ter
  -- dois agendamentos ativos que se sobreponham.
  constraint agendamentos_sem_conflito exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim, '[)') with &&
  ) where (status in ('aguardando_sinal', 'confirmado'))
);

create index on public.profissionais (salao_id);
create index on public.servicos (salao_id);
create index on public.horarios_funcionamento (profissional_id);
create index on public.bloqueios (profissional_id, inicio);
create index on public.clientes (salao_id);
create index on public.agendamentos (salao_id, inicio);
create index on public.agendamentos (profissional_id, inicio);

-- ---------------------------------------------------------------------
-- Quem é dono de qual salão
-- ---------------------------------------------------------------------
create or replace function public.eh_dono_do_salao(p_salao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.saloes
    where id = p_salao_id and dono_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- Segurança (RLS): toda tabela trancada; só abre o que for liberado aqui
-- ---------------------------------------------------------------------
alter table public.saloes                 enable row level security;
alter table public.profissionais          enable row level security;
alter table public.servicos               enable row level security;
alter table public.servico_profissional   enable row level security;
alter table public.horarios_funcionamento enable row level security;
alter table public.bloqueios              enable row level security;
alter table public.clientes               enable row level security;
alter table public.agendamentos           enable row level security;

-- Vitrine pública: qualquer visitante pode VER salão, profissionais
-- ativos, serviços ativos, quem faz o quê e o expediente.
create policy "publico ve saloes" on public.saloes
  for select to anon, authenticated using (true);

create policy "publico ve profissionais ativos" on public.profissionais
  for select to anon, authenticated using (ativo);

create policy "publico ve servicos ativos" on public.servicos
  for select to anon, authenticated using (ativo);

create policy "publico ve quem faz o que" on public.servico_profissional
  for select to anon, authenticated using (true);

create policy "publico ve expediente" on public.horarios_funcionamento
  for select to anon, authenticated using (true);

-- Dono do salão: gerencia tudo do próprio salão
create policy "dono edita o salao" on public.saloes
  for update to authenticated
  using (dono_id = (select auth.uid()))
  with check (dono_id = (select auth.uid()));

create policy "dono gerencia profissionais" on public.profissionais
  for all to authenticated
  using (public.eh_dono_do_salao(salao_id))
  with check (public.eh_dono_do_salao(salao_id));

create policy "dono gerencia servicos" on public.servicos
  for all to authenticated
  using (public.eh_dono_do_salao(salao_id))
  with check (public.eh_dono_do_salao(salao_id));

create policy "dono gerencia quem faz o que" on public.servico_profissional
  for all to authenticated
  using (public.eh_dono_do_salao((select s.salao_id from public.servicos s where s.id = servico_id)))
  with check (public.eh_dono_do_salao((select s.salao_id from public.servicos s where s.id = servico_id)));

create policy "dono gerencia expediente" on public.horarios_funcionamento
  for all to authenticated
  using (public.eh_dono_do_salao((select p.salao_id from public.profissionais p where p.id = profissional_id)))
  with check (public.eh_dono_do_salao((select p.salao_id from public.profissionais p where p.id = profissional_id)));

create policy "dono gerencia bloqueios" on public.bloqueios
  for all to authenticated
  using (public.eh_dono_do_salao((select p.salao_id from public.profissionais p where p.id = profissional_id)))
  with check (public.eh_dono_do_salao((select p.salao_id from public.profissionais p where p.id = profissional_id)));

create policy "dono ve e gerencia clientes" on public.clientes
  for all to authenticated
  using (public.eh_dono_do_salao(salao_id))
  with check (public.eh_dono_do_salao(salao_id));

create policy "dono ve e gerencia agendamentos" on public.agendamentos
  for all to authenticated
  using (public.eh_dono_do_salao(salao_id))
  with check (public.eh_dono_do_salao(salao_id));

-- Clientes finais (visitantes) NÃO leem clientes, agendamentos nem
-- bloqueios diretamente. Ver horários livres e marcar horário vai ser
-- feito por funções próprias (próxima etapa), que só devolvem o
-- necessário, sem nome nem telefone de ninguém.

-- ---------------------------------------------------------------------
-- Permissões (as tabelas novas não são expostas automaticamente)
-- ---------------------------------------------------------------------
grant select on public.saloes, public.profissionais, public.servicos,
  public.servico_profissional, public.horarios_funcionamento
  to anon, authenticated;

grant update on public.saloes to authenticated;

grant insert, update, delete on public.profissionais, public.servicos,
  public.servico_profissional, public.horarios_funcionamento
  to authenticated;

grant select, insert, update, delete on public.bloqueios, public.clientes,
  public.agendamentos
  to authenticated;

grant execute on function public.eh_dono_do_salao(uuid) to authenticated;

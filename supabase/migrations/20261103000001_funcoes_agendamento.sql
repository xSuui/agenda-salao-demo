-- =====================================================================
-- Agenda Salão · Funções públicas de agendamento
-- A cliente final (visitante do site) NÃO lê as tabelas de agenda.
-- Ela usa só estas duas funções, que devolvem o mínimo necessário:
--   1. horarios_livres: quais horários estão vagos num dia
--   2. marcar_horario:  reserva um horário (fica aguardando o sinal)
-- =====================================================================

-- Quanto tempo um horário fica segurado esperando o Pix do sinal.
-- Passado esse prazo sem confirmação, o horário volta a ficar livre.
alter table public.saloes
  add column minutos_para_pagar_sinal integer not null default 60
  check (minutos_para_pagar_sinal between 5 and 1440);

-- ---------------------------------------------------------------------
-- 1. Horários livres de uma profissional, para um serviço, num dia
--    Devolve só início e fim de cada horário vago (nada de nomes).
--    Os horários andam de 30 em 30 minutos dentro do expediente.
-- ---------------------------------------------------------------------
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
  -- Profissional ativa + serviço ativo, do mesmo salão, e ela faz esse serviço
  select s.fuso_horario,
         make_interval(mins => sv.duracao_minutos),
         make_interval(mins => s.minutos_para_pagar_sinal)
    into v_fuso, v_duracao, v_prazo_sinal
  from public.profissionais p
  join public.saloes s on s.id = p.salao_id
  join public.servicos sv on sv.id = p_servico_id and sv.salao_id = p.salao_id
  join public.servico_profissional sp on sp.servico_id = sv.id and sp.profissional_id = p.id
  where p.id = p_profissional_id and p.ativo and sv.ativo;

  if not found then
    return;  -- combinação inválida: nenhum horário
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

-- ---------------------------------------------------------------------
-- 2. Marcar horário
--    Cria (ou reaproveita) a cliente pelo telefone e reserva o horário
--    como "aguardando_sinal". Devolve o token do link de remarcar/
--    desmarcar e o valor do sinal a pagar.
-- ---------------------------------------------------------------------
create or replace function public.marcar_horario(
  p_profissional_id uuid,
  p_servico_id uuid,
  p_inicio timestamptz,
  p_nome text,
  p_telefone text
)
returns table (agendamento_id uuid, token uuid, horario_fim timestamptz, sinal_centavos integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_salao_id uuid;
  v_fuso text;
  v_duracao interval;
  v_sinal integer;
  v_prazo_sinal interval;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_cliente_id uuid;
  v_id uuid;
  v_token uuid;
begin
  -- 1. Nome e telefone
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_tel) in (10, 11) then
    v_tel := '55' || v_tel;  -- veio só DDD + número
  end if;
  if length(v_tel) not in (12, 13) or left(v_tel, 2) <> '55' then
    raise exception 'Telefone inválido. Use DDD + número.';
  end if;

  -- 2. Profissional, serviço e salão
  select s.id, s.fuso_horario, make_interval(mins => sv.duracao_minutos),
         s.sinal_valor_centavos, make_interval(mins => s.minutos_para_pagar_sinal)
    into v_salao_id, v_fuso, v_duracao, v_sinal, v_prazo_sinal
  from public.profissionais p
  join public.saloes s on s.id = p.salao_id
  join public.servicos sv on sv.id = p_servico_id and sv.salao_id = p.salao_id
  join public.servico_profissional sp on sp.servico_id = sv.id and sp.profissional_id = p.id
  where p.id = p_profissional_id and p.ativo and sv.ativo;

  if not found then
    raise exception 'Serviço ou profissional indisponível.';
  end if;

  -- 3. Libera reservas dessa profissional que não pagaram o sinal a tempo
  update public.agendamentos a
     set status = 'expirado'
   where a.profissional_id = p_profissional_id
     and a.status = 'aguardando_sinal'
     and a.criado_em <= now() - v_prazo_sinal;

  -- 4. O horário pedido precisa estar na lista de livres
  if not exists (
    select 1
    from public.horarios_livres(p_profissional_id, p_servico_id, (p_inicio at time zone v_fuso)::date) l
    where l.horario_inicio = p_inicio
  ) then
    raise exception 'Esse horário não está mais disponível. Escolha outro.';
  end if;

  -- 5. Cliente: cria ou reaproveita pelo telefone (mantém o nome já salvo)
  insert into public.clientes as c (salao_id, nome, telefone)
  values (v_salao_id, v_nome, v_tel)
  on conflict (salao_id, telefone) do update set telefone = excluded.telefone
  returning c.id into v_cliente_id;

  -- 6. Contra abuso: no máximo 2 reservas esperando sinal por telefone
  if (select count(*) from public.agendamentos a
      where a.cliente_id = v_cliente_id
        and a.status = 'aguardando_sinal'
        and a.criado_em > now() - v_prazo_sinal) >= 2 then
    raise exception 'Você já tem reservas esperando o sinal. Pague ou aguarde antes de marcar outra.';
  end if;

  -- 7. Reserva. Se duas pessoas clicarem no mesmo segundo, a trava do
  --    banco (agendamentos_sem_conflito) recusa a segunda.
  begin
    insert into public.agendamentos as a
      (salao_id, profissional_id, servico_id, cliente_id, inicio, fim)
    values
      (v_salao_id, p_profissional_id, p_servico_id, v_cliente_id, p_inicio, p_inicio + v_duracao)
    returning a.id, a.token_cliente into v_id, v_token;
  exception when exclusion_violation then
    raise exception 'Alguém acabou de pegar esse horário. Escolha outro.';
  end;

  return query select v_id, v_token, p_inicio + v_duracao, v_sinal;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões: visitantes e usuários logados podem chamar as duas
-- ---------------------------------------------------------------------
revoke all on function public.horarios_livres(uuid, uuid, date) from public;
revoke all on function public.marcar_horario(uuid, uuid, timestamptz, text, text) from public;
grant execute on function public.horarios_livres(uuid, uuid, date) to anon, authenticated;
grant execute on function public.marcar_horario(uuid, uuid, timestamptz, text, text) to anon, authenticated;

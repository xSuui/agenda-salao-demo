-- =====================================================================
-- Teste das funções de agendamento (rodar no SQL Editor do Supabase)
-- Cria um salão de teste, testa, e APAGA o salão de teste no final.
-- Não mexe em nenhum dado real. Pode rodar quantas vezes quiser.
-- =====================================================================

create temp table if not exists resultado_teste (passo int, teste text, resultado text);
truncate resultado_teste;

do $$
declare
  v_salao uuid;
  v_prof uuid;
  v_serv uuid;
  v_dia date;
  v_qtd int;
  v_primeiro timestamptz;
  v_r record;
  v_msg text;
begin
  -- Monta um salão de teste: expediente 9h às 18h, serviço de 1h30
  insert into public.saloes (nome, slug) values ('Salão Teste', 'teste-automatico') returning id into v_salao;
  insert into public.profissionais (salao_id, nome) values (v_salao, 'Profissional Teste') returning id into v_prof;
  insert into public.servicos (salao_id, nome, preco_centavos, duracao_minutos)
    values (v_salao, 'Serviço Teste', 5000, 90) returning id into v_serv;
  insert into public.servico_profissional (servico_id, profissional_id) values (v_serv, v_prof);
  v_dia := (now() at time zone 'America/Sao_Paulo')::date + 7;
  insert into public.horarios_funcionamento (profissional_id, dia_semana, inicio, fim)
    values (v_prof, extract(dow from v_dia), '09:00', '18:00');

  -- 1. Horários livres: 9h00 até 16h30, de 30 em 30 min = 16
  select count(*), min(l.horario_inicio) into v_qtd, v_primeiro
  from public.horarios_livres(v_prof, v_serv, v_dia) l;
  insert into resultado_teste values (1, 'Horários livres no dia (esperado: 16)', v_qtd::text);

  -- 2. Marca o primeiro horário (9h00 às 10h30)
  select * into v_r from public.marcar_horario(v_prof, v_serv, v_primeiro, 'Cliente Teste', '(11) 99999-0000');
  insert into resultado_teste values (2, 'Marcar 9h00 (esperado: ok, sinal 2000)', 'ok, sinal ' || v_r.sinal_centavos);

  -- 3. Somem 9h00, 9h30 e 10h00 (todos batem com 9h00 às 10h30) = 13
  select count(*) into v_qtd from public.horarios_livres(v_prof, v_serv, v_dia);
  insert into resultado_teste values (3, 'Livres depois de marcar (esperado: 13)', v_qtd::text);

  -- 4. Outra pessoa tenta o mesmo horário
  begin
    perform public.marcar_horario(v_prof, v_serv, v_primeiro, 'Outra Pessoa', '11988887777');
    insert into resultado_teste values (4, 'Mesmo horário de novo (esperado: recusado)', 'FALHOU: aceitou');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado_teste values (4, 'Mesmo horário de novo (esperado: recusado)', 'recusado: ' || v_msg);
  end;

  -- 5. Telefone inválido
  begin
    perform public.marcar_horario(v_prof, v_serv, v_primeiro + interval '3 hours', 'Fulana', '123');
    insert into resultado_teste values (5, 'Telefone inválido (esperado: recusado)', 'FALHOU: aceitou');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into resultado_teste values (5, 'Telefone inválido (esperado: recusado)', 'recusado: ' || v_msg);
  end;

  -- Limpeza: apaga o salão de teste e tudo que pertence a ele
  delete from public.saloes where id = v_salao;
  insert into resultado_teste values (6, 'Salão de teste apagado', 'ok');
end;
$$;

select * from resultado_teste order by passo;

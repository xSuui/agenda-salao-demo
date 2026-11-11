-- =====================================================================
-- Salão de demonstração (dados fictícios)
-- Rode depois das migrations, no SQL Editor do Supabase.
-- Cria o salão "Studio Demo", duas atendentes, os serviços e o expediente
-- (terça a sábado, 9h às 18h). A página fica em /studio-demo.
-- Se o salão já existir, o script para sem mexer em nada.
-- =====================================================================

do $$
declare
  v_salao uuid;
  v_ana uuid;
  v_bia uuid;
  v_serv uuid;
  r record;
begin
  if exists (select 1 from public.saloes where slug = 'studio-demo') then
    raise exception 'O salão studio-demo já está cadastrado. Nada foi alterado.';
  end if;

  insert into public.saloes (nome, slug, whatsapp, endereco, pix_chave, pix_nome)
  values ('Studio Demo', 'studio-demo', '11900000000',
          'Rua Exemplo, 123, São Paulo, SP', 'demo@exemplo.com', 'STUDIO DEMO')
  returning id into v_salao;

  insert into public.profissionais (salao_id, nome) values (v_salao, 'Ana') returning id into v_ana;
  insert into public.profissionais (salao_id, nome) values (v_salao, 'Bia') returning id into v_bia;

  -- nome, preço (centavos), duração (min), Ana faz?, Bia faz?
  for r in
    select * from (values
      ('Pé e mão tradicional',    8000,  90, false, true),
      ('Mão tradicional',         3500,  60, false, true),
      ('Esmaltação em gel (mão)', 7000,  90, true,  true),
      ('Banho de gel',           10000, 120, true,  false),
      ('Alongamento em gel',     18000, 120, true,  false),
      ('Manutenção em gel',      12000, 120, true,  false)
    ) as t(nome, preco, duracao, ana, bia)
  loop
    insert into public.servicos (salao_id, nome, preco_centavos, duracao_minutos, ativo)
    values (v_salao, r.nome, r.preco, r.duracao, true)
    returning id into v_serv;

    if r.ana then
      insert into public.servico_profissional (servico_id, profissional_id) values (v_serv, v_ana);
    end if;
    if r.bia then
      insert into public.servico_profissional (servico_id, profissional_id) values (v_serv, v_bia);
    end if;
  end loop;

  -- Expediente: terça (2) a sábado (6), 9h às 18h
  insert into public.horarios_funcionamento (profissional_id, dia_semana, inicio, fim)
  select p.id, d.dia, '09:00', '18:00'
  from public.profissionais p
  cross join generate_series(2, 6) as d(dia)
  where p.salao_id = v_salao;
end;
$$;

-- Para entrar no painel como dona do salão: crie um usuário em
-- Authentication > Users e troque o e-mail abaixo.
-- update public.saloes
-- set dono_id = (select id from auth.users where email = 'dona@exemplo.com')
-- where slug = 'studio-demo';

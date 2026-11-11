# Agenda Salão · agendamento online para salões de beleza

Sistema de agendamento feito para um salão de manicure real e hoje **em uso por cliente**. Este repositório é a **versão de demonstração**: o código é o mesmo, com dados fictícios no lugar dos dados da cliente.

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Realtime, Storage, RLS) · Vercel

## O que ele faz

**Para a cliente do salão** (`/<slug-do-salão>`)
- Página do salão com serviços, preços, fotos dos trabalhos e endereço
- Agendamento pelo celular em poucos passos: serviço, profissional, dia e horário
- Faixa de dias com arrastar e calendário para marcar até 90 dias à frente
- Só mostra horários realmente livres (expediente, folgas e reservas existentes)
- Sinal por Pix com QR Code e "copia e cola" gerados na hora; a reserva expira se o sinal não for pago no prazo
- Escolhas guardadas num cookie por alguns minutos, para não perder o que já preencheu

**Para a dona e a equipe** (`/painel`)
- Reservas **ao vivo** (Supabase Realtime): reserva nova chega sem recarregar a página
- Filtros por nome ou WhatsApp, data, intervalo e status; ações com confirmação
- Configurações: atendentes, serviços, expediente, folgas, endereço, chave Pix e fotos
- **Balanço:** ganhos, atendimentos, cancelamentos e faltas por mês, semana ou período, comparação com o período anterior e gráficos
- **Repasses:** porcentagem de cada atendente calculada automaticamente
- Equipe com login próprio e um administrador do sistema que pode suspender um salão

## Destaques técnicos
- **Regras de acesso no banco (RLS):** cada salão só enxerga os próprios dados, inclusive no canal em tempo real.
- **Horários livres calculados em SQL** (`horarios_livres`) e uma regra no banco que recusa dois agendamentos no mesmo horário.
- **Pix sem intermediário:** o payload BR Code é montado no próprio código (`src/lib/pix.ts`), com CRC16.
- **Multi-salão:** cada salão tem seu endereço (`/studio-demo`), pronto para virar SaaS.

## Como rodar
1. Crie um projeto no [Supabase](https://supabase.com) e rode, no SQL Editor, os arquivos de `supabase/migrations/` em ordem e depois `supabase/dados/salao-demo.sql`.
2. Em `supabase/migrations/20261104000003_administrador.sql`, troque `admin@exemplo.com` pelo e-mail da sua conta para ser o administrador.
3. Copie `.env.example` para `.env.local` e preencha com a URL e a chave anon do seu projeto.
4. Instale e rode:
   ```bash
   npm install
   npm run dev
   ```
5. Abra http://localhost:3000 (vai para `/studio-demo`). O painel fica em `/painel`.

## Estrutura
- `src/app/[slug]/`: página pública e agendamento
- `src/app/painel/`: painel da dona (reservas, configurações, balanço, administração)
- `src/lib/`: acesso ao Supabase, datas e fuso, Pix, sessão
- `supabase/migrations/`: estrutura do banco, funções e regras de acesso

---
Feito por [Samuel Rogério](https://srcs-portifolio.vercel.app) · [LinkedIn](https://www.linkedin.com/in/samuel-rogerio/)

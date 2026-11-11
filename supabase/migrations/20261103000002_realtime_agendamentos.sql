-- =====================================================================
-- Painel ao vivo: liga o Realtime do Supabase na tabela de reservas.
-- As regras de segurança (RLS) continuam valendo: cada dona só recebe
-- eventos das reservas do próprio salão; visitantes não recebem nada.
-- =====================================================================

alter publication supabase_realtime add table public.agendamentos;

-- Conferência: esperado 1 linha com "agendamentos"
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agendamentos';

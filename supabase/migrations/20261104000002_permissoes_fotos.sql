-- Permissões da tabela de fotos (faltaram na migração anterior).
-- Neste projeto as tabelas não ganham permissão sozinhas: cada uma precisa
-- do seu "grant". As regras RLS continuam decidindo quem vê e mexe em quê.
grant select on public.fotos_salao to anon, authenticated;
grant insert, update, delete on public.fotos_salao to authenticated;

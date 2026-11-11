-- Pix do sinal (modo manual): a chave Pix do salão aparece para a cliente
-- depois de reservar, com QR Code e "Pix copia e cola" já com o valor.
-- A dona confere no app do banco e aperta "Sinal recebido" no painel.

alter table public.saloes
  add column if not exists pix_chave text,
  add column if not exists pix_nome text,                         -- nome de quem recebe (a cliente confere antes de pagar)
  add column if not exists pix_cidade text not null default 'SAO PAULO';

-- Só a dona ou o administrador mudam a chave Pix (a equipe não: evita
-- alguém trocar a chave pela própria). Também continua valendo: só o
-- administrador liga/desliga o salão e troca a dona.
create or replace function public.protege_campos_do_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;  -- SQL rodado pelo dono do sistema no Supabase
  end if;

  if (new.no_ar is distinct from old.no_ar or new.dono_id is distinct from old.dono_id)
     and not public.eh_admin() then
    raise exception 'Só o administrador do sistema pode mudar isso.';
  end if;

  if (new.pix_chave is distinct from old.pix_chave
      or new.pix_nome is distinct from old.pix_nome
      or new.pix_cidade is distinct from old.pix_cidade)
     and not public.eh_admin()
     and old.dono_id is distinct from (select auth.uid()) then
    raise exception 'Só a dona do salão pode mudar a chave Pix.';
  end if;

  return new;
end;
$$;

import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { consultar } from "@/lib/supabase";
import { usuarioLogado } from "@/lib/sessao";
import { ehAdmin } from "@/lib/admin";
import { COOKIE_SALAO } from "@/lib/painel";
import ListaSaloes, { type SalaoAdmin } from "./lista";

// Administração do sistema: /painel/admin (só o administrador)
// Todos os salões, qual está aberto no painel, e a chave "no ar / suspenso".
export default function Page() {
  return (
    <main className="flex flex-1 justify-center bg-rose-50 px-4 py-8">
      <div className="w-full max-w-2xl">
        <Suspense
          fallback={
            <p className="py-16 text-center text-stone-500">Carregando...</p>
          }
        >
          <Conteudo />
        </Suspense>
      </div>
    </main>
  );
}

async function Conteudo() {
  const u = await usuarioLogado();
  if (u === null) redirect("/painel/entrar");
  if (u === "vencido") redirect("/painel/renovar");
  if (!(await ehAdmin(u.token))) redirect("/painel");

  const saloes = await consultar<SalaoAdmin[]>(
    `saloes?select=id,nome,slug,no_ar,dono_id,criado_em&order=criado_em`,
    { token: u.token },
  );
  const escolhido =
    (await cookies()).get(COOKIE_SALAO)?.value ?? saloes[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">
            Administração
          </h1>
          <p className="text-sm text-stone-500">
            Todos os salões do sistema · {u.email}
          </p>
        </div>
        <Link
          href="/painel"
          className="rounded-xl px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-white"
        >
          Voltar ao painel
        </Link>
      </header>
      <ListaSaloes saloes={saloes} escolhido={escolhido} meuId={u.id} />
    </div>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioLogado } from "@/lib/sessao";
import FormSenha from "./form";

// Minha conta: /painel/conta (trocar a própria senha)
export default function Page() {
  return (
    <main className="flex flex-1 items-center justify-center bg-rose-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-rose-100">
        <Suspense
          fallback={<p className="text-center text-stone-500">Carregando...</p>}
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

  return (
    <>
      <h1 className="text-center text-xl font-semibold text-rose-700">
        Trocar senha
      </h1>
      <p className="mb-5 text-center text-sm text-stone-500">{u.email}</p>
      <FormSenha />
      <p className="mt-5 text-center">
        <Link href="/painel" className="text-sm text-rose-700 underline">
          Voltar ao painel
        </Link>
      </p>
    </>
  );
}

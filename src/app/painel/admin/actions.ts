"use server";

// Ações da tela de Administração (só o administrador do sistema).
// O banco confere de novo: a regra do banco só deixa o administrador
// ligar/desligar um salão.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { consultar } from "@/lib/supabase";
import { usuarioLogado } from "@/lib/sessao";
import { ehAdmin } from "@/lib/admin";
import { COOKIE_SALAO } from "@/lib/painel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  const u = await usuarioLogado();
  if (!u || u === "vencido") return null;
  return (await ehAdmin(u.token)) ? u : null;
}

// Abre o painel (reservas e configurações) de um salão
export async function abrirSalao(id: string) {
  if (typeof id !== "string" || !UUID.test(id)) return;
  const u = await admin();
  if (!u) return;
  (await cookies()).set(COOKIE_SALAO, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/painel");
}

// Liga ou desliga a página do salão (atraso de pagamento, fim de contrato)
export async function mudarNoAr(
  id: string,
  noAr: boolean,
): Promise<{ erro: string | null }> {
  if (typeof id !== "string" || !UUID.test(id) || typeof noAr !== "boolean")
    return { erro: "Ação inválida." };
  const u = await admin();
  if (!u) return { erro: "Só o administrador do sistema pode fazer isso." };
  try {
    const alterados = await consultar<unknown[]>(`saloes?id=eq.${id}`, {
      metodo: "PATCH",
      body: { no_ar: noAr },
      token: u.token,
      headers: { Prefer: "return=representation" },
    });
    if (!alterados?.length) return { erro: "Salão não encontrado." };
  } catch {
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  refresh();
  return { erro: null };
}

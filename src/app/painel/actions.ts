"use server";

// Ações do painel. Todas conferem o login e mandam o token da dona
// para o banco: as regras de segurança (RLS) garantem que ela só
// consegue mexer nas reservas do próprio salão.

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { consultar, ErroSupabase } from "@/lib/supabase";
import {
  apagarSessao,
  entrarComSenha,
  gravarSessao,
  usuarioLogado,
} from "@/lib/sessao";

export async function entrar(
  _estado: { erro: string | null },
  form: FormData,
): Promise<{ erro: string | null }> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!email || !senha) return { erro: "Preencha e-mail e senha." };
  try {
    await gravarSessao(await entrarComSenha(email, senha));
  } catch (e) {
    if (e instanceof ErroSupabase && e.status === 400)
      return { erro: "E-mail ou senha incorretos." };
    return { erro: "Não foi possível entrar agora. Tente de novo." };
  }
  redirect("/painel");
}

export async function sair() {
  await apagarSessao();
  redirect("/painel/entrar");
}

export type Acao = "confirmar" | "cancelar" | "faltou" | "concluir";

type Atual = { status: string; sinal_status: string };

// Para cada ação: de quais situações pode partir e como fica depois
const REGRAS: Record<Acao, { de: string[]; para: (a: Atual) => Atual }> = {
  // Sinal caiu no Pix: confirma (vale também para quem pagou depois do prazo)
  confirmar: {
    de: ["aguardando_sinal", "expirado"],
    para: () => ({ status: "confirmado", sinal_status: "pago" }),
  },
  // Salão cancelou: se já tinha pago, o sinal é devolvido
  cancelar: {
    de: ["aguardando_sinal", "expirado", "confirmado"],
    para: (a) => ({
      status: "cancelado_salao",
      sinal_status: a.sinal_status === "pago" ? "devolvido" : a.sinal_status,
    }),
  },
  // Cliente não apareceu: o salão fica com o sinal
  faltou: {
    de: ["confirmado"],
    para: () => ({ status: "faltou", sinal_status: "retido" }),
  },
  // Atendida: o sinal foi descontado do serviço
  concluir: {
    de: ["confirmado"],
    para: (a) => ({ status: "concluido", sinal_status: a.sinal_status }),
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function alterarReserva(
  id: string,
  acao: Acao,
): Promise<{ erro: string | null }> {
  const regra = REGRAS[acao];
  if (!regra || typeof id !== "string" || !UUID.test(id))
    return { erro: "Ação inválida." };

  const u = await usuarioLogado();
  if (!u || u === "vencido")
    return { erro: "Sua sessão expirou. Recarregue a página." };

  try {
    const [atual] = await consultar<Atual[]>(
      `agendamentos?id=eq.${id}&select=status,sinal_status`,
      { token: u.token },
    );
    if (!atual) return { erro: "Reserva não encontrada." };
    if (!regra.de.includes(atual.status))
      return { erro: "Essa reserva mudou. Recarregue a página." };

    // Só grava se a reserva ainda estiver como estava (evita clique duplo e conflito)
    const alteradas = await consultar<unknown[]>(
      `agendamentos?id=eq.${id}&status=eq.${atual.status}`,
      {
        metodo: "PATCH",
        body: regra.para(atual),
        token: u.token,
        headers: { Prefer: "return=representation" },
      },
    );
    if (!alteradas?.length)
      return { erro: "Essa reserva mudou. Recarregue a página." };
  } catch (e) {
    if (e instanceof ErroSupabase && e.codigo === "23P01") {
      return {
        erro: "Esse horário já foi ocupado por outra reserva. Não dá para confirmar.",
      };
    }
    return { erro: "Não foi possível salvar. Tente de novo." };
  }

  refresh();
  return { erro: null };
}

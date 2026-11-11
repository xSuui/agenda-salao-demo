// Qual salão o painel está mostrando.
// - Dona do salão: sempre o salão dela. Equipe: o salão em que trabalha.
// - Administrador: o salão escolhido na tela de Administração (cookie);
//   sem escolha, o primeiro salão.

import { cookies } from "next/headers";
import { consultar } from "./supabase";
import { ehAdmin } from "./admin";

export const COOKIE_SALAO = "painel_salao";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function salaoDoPainel<T extends { id: string }>(
  u: { id: string; token: string },
  campos: string,
): Promise<{ salao: T | null; admin: boolean }> {
  const admin = await ehAdmin(u.token);
  const select = campos.split(",").includes("id") ? campos : `id,${campos}`;

  if (admin) {
    const escolhido = (await cookies()).get(COOKIE_SALAO)?.value;
    if (escolhido && UUID.test(escolhido)) {
      const [s] = await consultar<T[]>(
        `saloes?id=eq.${escolhido}&select=${select}`,
        { token: u.token },
      );
      if (s) return { salao: s, admin };
    }
    const [primeiro] = await consultar<T[]>(
      `saloes?select=${select}&order=criado_em&limit=1`,
      { token: u.token },
    );
    return { salao: primeiro ?? null, admin };
  }

  const [s] = await consultar<T[]>(
    `saloes?dono_id=eq.${u.id}&select=${select}`,
    { token: u.token },
  );
  if (s) return { salao: s, admin };

  // Não é a dona: pode ser da equipe do salão (ex.: uma manicure contratada)
  const [ligacao] = await consultar<{ saloes: T | null }[]>(
    `equipe_salao?user_id=eq.${u.id}&select=saloes(${select})&limit=1`,
    { token: u.token },
  );
  return { salao: ligacao?.saloes ?? null, admin };
}

// Quem pode ver o Balanço: a dona, o administrador e quem da equipe tiver
// "ve_balanco" ligado (ex.: uma conta de testes). Pergunta ao banco; se
// a função ainda não existir lá, vale a regra antiga (dona ou admin).
export async function podeVerBalanco(
  u: { id: string; token: string },
  salao: { id: string; dono_id: string | null },
  admin: boolean,
): Promise<boolean> {
  if (admin || salao.dono_id === u.id) return true;
  try {
    return await consultar<boolean>("rpc/ve_balanco_do_salao", {
      token: u.token,
      body: { p_salao_id: salao.id },
    });
  } catch {
    return false;
  }
}

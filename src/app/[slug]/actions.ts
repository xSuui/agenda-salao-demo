"use server";

// Funções que o navegador da cliente chama, mas que rodam no servidor.
// Qualquer pessoa pode chamá-las, então tudo é conferido aqui e,
// de novo, dentro do banco (horarios_livres e marcar_horario).

import { consultar, ErroSupabase } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type Horario = { inicio: string; fim: string };

export async function buscarHorarios(
  profissionalId: string,
  servicoId: string,
  data: string,
): Promise<{ horarios: Horario[] } | { erro: string }> {
  if (!UUID.test(profissionalId) || !UUID.test(servicoId) || !DATA.test(data)) {
    return { erro: "Dados inválidos." };
  }
  try {
    const linhas = await consultar<
      { horario_inicio: string; horario_fim: string }[]
    >("rpc/horarios_livres", {
      body: {
        p_profissional_id: profissionalId,
        p_servico_id: servicoId,
        p_data: data,
      },
    });
    return {
      horarios: linhas.map((l) => ({
        inicio: l.horario_inicio,
        fim: l.horario_fim,
      })),
    };
  } catch {
    return { erro: "Não foi possível carregar os horários. Tente de novo." };
  }
}

export async function marcarHorario(pedido: {
  profissionalId: string;
  servicoId: string;
  inicio: string;
  nome: string;
  telefone: string;
}): Promise<
  | {
      ok: true;
      token: string;
      fim: string;
      sinalCentavos: number;
      codigo: string;
    }
  | { erro: string }
> {
  const { profissionalId, servicoId, inicio, nome, telefone } = pedido ?? {};
  if (
    typeof nome !== "string" ||
    typeof telefone !== "string" ||
    typeof inicio !== "string" ||
    !UUID.test(profissionalId) ||
    !UUID.test(servicoId) ||
    Number.isNaN(Date.parse(inicio)) ||
    nome.length > 80 ||
    telefone.length > 30
  ) {
    return { erro: "Dados inválidos." };
  }
  try {
    const [r] = await consultar<
      {
        agendamento_id: string;
        token: string;
        horario_fim: string;
        sinal_centavos: number;
      }[]
    >("rpc/marcar_horario", {
      body: {
        p_profissional_id: profissionalId,
        p_servico_id: servicoId,
        p_inicio: inicio,
        p_nome: nome,
        p_telefone: telefone,
      },
    });
    return {
      ok: true,
      token: r.token,
      fim: r.horario_fim,
      sinalCentavos: r.sinal_centavos,
      // Código curto da reserva: vai no Pix e na mensagem do comprovante
      codigo: r.agendamento_id.replace(/-/g, "").slice(0, 8).toUpperCase(),
    };
  } catch (e) {
    // P0001 = mensagem escrita por nós no banco (ex.: "Telefone inválido...")
    if (e instanceof ErroSupabase && e.codigo === "P0001")
      return { erro: e.message };
    return { erro: "Não foi possível marcar agora. Tente de novo." };
  }
}

"use server";

// Dados do Balanço (modal no painel):
// ganhos, trabalhos realizados, cancelamentos, gráficos e comparação
// de meses e semanas.
//
// Busca as reservas dos últimos ~7 meses do salão de quem está logado.
// O token vai junto, então as regras do banco (RLS) só liberam o salão
// da própria pessoa. A conta é feita na tela (balanco.tsx).
//
// Limitação conhecida: o valor de cada atendimento é o PREÇO ATUAL do
// serviço (a reserva não guarda o valor cobrado). Se a dona mudar um
// preço, os meses antigos passam a usar o preço novo.

import { consultar } from "@/lib/supabase";
import { usuarioLogado } from "@/lib/sessao";
import { podeVerBalanco, salaoDoPainel } from "@/lib/painel";
import { agoraMs } from "@/lib/tempo";
import { inicioDoDiaUTC } from "@/lib/datas";
import { refresh } from "next/cache";

export type ItemBalanco = {
  dia: string; // AAAA-MM-DD no fuso do salão
  profissional: string; // id
  status: string;
  sinal_status: string;
  preco: number; // centavos
};

export type Atendente = {
  id: string;
  nome: string;
  ativo: boolean;
  percentual: number; // repasse (0 a 100)
};

export type DadosBalanco = {
  hoje: string;
  sinal: number; // valor do sinal em centavos
  itens: ItemBalanco[];
  atendentes: Atendente[];
  podeEditarRepasse: boolean; // só a dona e o administrador
};

type Linha = {
  inicio: string;
  profissional_id: string;
  status: string;
  sinal_status: string;
  servicos: { preco_centavos: number } | null;
};

export async function dadosBalanco(): Promise<DadosBalanco | null> {
  const u = await usuarioLogado();
  if (!u || u === "vencido") return null;

  const { salao, admin } = await salaoDoPainel<{
    id: string;
    fuso_horario: string;
    sinal_valor_centavos: number;
    dono_id: string | null;
  }>(u, "id,fuso_horario,sinal_valor_centavos,dono_id");
  if (!salao) return null;
  // Balanço e repasses: dona, administrador e quem tiver o Balanço liberado
  // (a equipe, em geral, não vê o faturamento)
  if (!(await podeVerBalanco(u, salao, admin))) return null;

  const diaNoFuso = new Intl.DateTimeFormat("en-CA", {
    timeZone: salao.fuso_horario,
  });
  const hoje = diaNoFuso.format(new Date(agoraMs()));

  // Primeiro dia do mês, 7 meses atrás (6 meses de comparação + folga para as semanas)
  const [a, m] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(a, m - 1 - 7, 1)).toISOString().slice(0, 10);
  const desde = inicioDoDiaUTC(inicio, salao.fuso_horario);

  const linhas = await consultar<Linha[]>(
    `agendamentos?salao_id=eq.${salao.id}` +
      `&inicio=gte.${encodeURIComponent(desde)}` +
      `&select=inicio,profissional_id,status,sinal_status,servicos(preco_centavos)` +
      `&order=inicio&limit=10000`,
    { token: u.token },
  );

  const [profs, repasses] = await Promise.all([
    consultar<{ id: string; nome: string; ativo: boolean }[]>(
      `profissionais?salao_id=eq.${salao.id}&select=id,nome,ativo&order=criado_em`,
      { token: u.token },
    ),
    consultar<{ profissional_id: string; percentual: number }[]>(
      `repasses_profissionais?salao_id=eq.${salao.id}&select=profissional_id,percentual`,
      { token: u.token },
    ),
  ]);
  const pct = new Map(repasses.map((r) => [r.profissional_id, Number(r.percentual)]));

  return {
    hoje,
    sinal: salao.sinal_valor_centavos,
    podeEditarRepasse: admin || salao.dono_id === u.id,
    atendentes: profs.map((p) => ({ ...p, percentual: pct.get(p.id) ?? 0 })),
    itens: linhas.map((l) => ({
      dia: diaNoFuso.format(new Date(l.inicio)),
      profissional: l.profissional_id,
      status: l.status,
      sinal_status: l.sinal_status,
      preco: l.servicos?.preco_centavos ?? 0,
    })),
  };
}

// Muda a porcentagem de repasse de uma atendente (0 a 100).
// O banco (RLS) só aceita da dona ou do administrador.
export async function salvarRepasse(
  profissionalId: string,
  percentual: number,
): Promise<{ ok: boolean; erro?: string }> {
  const u = await usuarioLogado();
  if (!u || u === "vencido") return { ok: false, erro: "Entre de novo no painel." };
  if (!/^[0-9a-f-]{36}$/i.test(profissionalId)) return { ok: false, erro: "Atendente inválida." };
  const p = Math.round(Number(percentual) * 100) / 100;
  if (!Number.isFinite(p) || p < 0 || p > 100)
    return { ok: false, erro: "A porcentagem precisa ser de 0 a 100." };

  const [prof] = await consultar<{ salao_id: string }[]>(
    `profissionais?id=eq.${profissionalId}&select=salao_id`,
    { token: u.token },
  );
  if (!prof) return { ok: false, erro: "Atendente não encontrada." };
  try {
    await consultar(`repasses_profissionais?on_conflict=profissional_id`, {
      token: u.token,
      metodo: "POST",
      body: {
        profissional_id: profissionalId,
        salao_id: prof.salao_id,
        percentual: p,
        atualizado_em: new Date().toISOString(),
      },
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  } catch {
    return { ok: false, erro: "Não foi possível salvar. Só a dona do salão pode mudar o repasse." };
  }
  refresh();
  return { ok: true };
}

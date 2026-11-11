// "Rascunho" da marcação: o que a cliente já escolheu fica num cookie por
// 10 minutos. Se ela fechar a aba e voltar, a tela reabre preenchida.
// Ao reservar, o cookie é apagado.

import type { DadosSalao } from "./dados";

export type Rascunho = {
  servicoId?: string | null;
  profId?: string | null;
  dia?: string | null;
  horario?: string | null; // início do horário (ISO)
  nome?: string | null;
  telefone?: string | null;
};

export const VALIDADE_RASCUNHO_SEG = 10 * 60;
export const TOTAL_DIAS = 14; // quantos dias a cliente vê na faixa de dias
// Até quantos dias à frente a cliente pode marcar pelo calendário ("Outra data").
// Para clientes que já querem garantir o mês seguinte.
export const DIAS_CALENDARIO = 90;
export const nomeCookieRascunho = (slug: string) => `rascunho_${slug}`;

const texto = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max ? v : null;

// Lê o valor cru do cookie sem confiar nele (pode ter sido editado à mão)
export function lerRascunho(valor: string | undefined): Rascunho {
  if (!valor) return {};
  try {
    const o = JSON.parse(decodeURIComponent(valor));
    if (!o || typeof o !== "object") return {};
    return {
      servicoId: texto(o.servicoId, 36),
      profId: texto(o.profId, 36),
      dia:
        typeof o.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.dia)
          ? o.dia
          : null,
      horario: texto(o.horario, 40),
      nome: texto(o.nome, 80),
      telefone: texto(o.telefone, 30),
    };
  } catch {
    return {};
  }
}

// Descarta o que não faz mais sentido (serviço removido, dia que já passou...)
export function validarRascunho(
  r: Rascunho,
  dados: DadosSalao,
  hoje: string,
  totalDias: number,
): Rascunho {
  const servico = dados.servicos.find((s) => s.id === r.servicoId);
  if (!servico) return { nome: r.nome, telefone: r.telefone };

  const prof = dados.profissionais.find(
    (p) => p.id === r.profId && servico.profissionais.includes(p.id),
  );
  if (!prof)
    return { servicoId: servico.id, nome: r.nome, telefone: r.telefone };

  const [a, m, d] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(a, m - 1, d + totalDias - 1))
    .toISOString()
    .slice(0, 10);
  const diaOk =
    r.dia &&
    r.dia >= hoje &&
    r.dia <= limite &&
    prof.dias.includes(new Date(`${r.dia}T12:00:00Z`).getUTCDay());

  return {
    servicoId: servico.id,
    profId: prof.id,
    dia: diaOk ? r.dia : null,
    horario: diaOk ? r.horario : null,
    nome: r.nome,
    telefone: r.telefone,
  };
}

// --- Navegador ---

export function salvarRascunho(slug: string, r: Rascunho) {
  const seguro = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${nomeCookieRascunho(slug)}=${encodeURIComponent(JSON.stringify(r))}; Max-Age=${VALIDADE_RASCUNHO_SEG}; Path=/; SameSite=Lax${seguro}`;
}

export function apagarRascunho(slug: string) {
  document.cookie = `${nomeCookieRascunho(slug)}=; Max-Age=0; Path=/; SameSite=Lax`;
}

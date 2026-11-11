// Ajudantes de data no formato "AAAA-MM-DD" (dia do calendário, sem hora).

export const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function somarDias(dia: string, n: number) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

// "2026-11-03" -> "03/11/2026"
export function diaBR(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

// Meia-noite do dia no fuso do salão, como instante UTC (ISO).
// Ex.: 2026-11-03 em São Paulo -> 2026-11-03T03:00:00.000Z
export function inicioDoDiaUTC(dia: string, fuso: string) {
  const [a, m, d] = dia.split("-").map(Number);
  const palpite = Date.UTC(a, m - 1, d);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(palpite));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoLocal = Date.UTC(
    v("year"),
    v("month") - 1,
    v("day"),
    v("hour") % 24,
    v("minute"),
  );
  return new Date(palpite - (comoLocal - palpite)).toISOString();
}

// Dia + hora ("2026-11-03", "14:30") no fuso do salão, como instante UTC (ISO).
export function instanteUTC(dia: string, hora: string, fuso: string) {
  const [h, m] = hora.split(":").map(Number);
  return new Date(
    new Date(inicioDoDiaUTC(dia, fuso)).getTime() + (h * 60 + m) * 60_000,
  ).toISOString();
}

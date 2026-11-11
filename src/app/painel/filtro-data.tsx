"use client";

// Filtro de data do painel: atalhos (Hoje, Próximos 7 dias...) + calendário
// de intervalo. O período escolhido vai para o endereço (/painel?de=...&ate=...),
// e o servidor busca as reservas desse período. .

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { diaBR, somarDias } from "@/lib/datas";

const paraDate = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
};
const paraDia = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

// Tela larga mostra 2 meses; celular mostra 1
function useTelaLarga() {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia("(min-width: 640px)");
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => true,
  );
}

type Atalho = { nome: string; de: string; ate: string };

export default function FiltroData({
  de,
  ate,
  hoje,
  irPara,
  onAplicar,
  atalhos: atalhosProprios,
  alinhar = "direita",
  semLimpar,
  rotuloVazio = "De hoje em diante",
}: {
  de: string | null;
  ate: string | null;
  hoje: string;
  irPara?: (url: string) => void; // painel: navega mostrando o carregando na lista
  onAplicar?: (de: string | null, ate: string | null) => void; // Balanço: só avisa
  atalhos?: Atalho[];
  alinhar?: "esquerda" | "direita" | "centro"; // centro: por cima de tudo (dentro de modal)
  semLimpar?: boolean;
  rotuloVazio?: string;
}) {
  const larga = useTelaLarga();
  const [aberto, setAberto] = useState(false);
  const [selecao, setSelecao] = useState<DateRange | undefined>(
    de ? { from: paraDate(de), to: paraDate(ate ?? de) } : undefined,
  );
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", clique);
    window.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clique);
      window.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function aplicar(novoDe: string | null, novoAte: string | null) {
    setAberto(false);
    if (onAplicar) {
      setSelecao(novoDe ? { from: paraDate(novoDe), to: paraDate(novoAte ?? novoDe) } : undefined);
      onAplicar(novoDe, novoDe ? (novoAte ?? novoDe) : null);
      return;
    }
    if (!irPara) return;
    if (!novoDe) {
      setSelecao(undefined);
      irPara("/painel");
      return;
    }
    const fim = novoAte ?? novoDe;
    setSelecao({ from: paraDate(novoDe), to: paraDate(fim) });
    irPara(`/painel?de=${novoDe}&ate=${fim}`);
  }

  const atalhos: Atalho[] = atalhosProprios ?? [
    { nome: "Ontem", de: somarDias(hoje, -1), ate: somarDias(hoje, -1) },
    { nome: "Hoje", de: hoje, ate: hoje },
    { nome: "Amanhã", de: somarDias(hoje, 1), ate: somarDias(hoje, 1) },
    { nome: "Últimos 7 dias", de: somarDias(hoje, -6), ate: hoje },
    { nome: "Próximos 7 dias", de: hoje, ate: somarDias(hoje, 6) },
    { nome: "Últimos 14 dias", de: somarDias(hoje, -13), ate: hoje },
    { nome: "Próximos 14 dias", de: hoje, ate: somarDias(hoje, 13) },
    { nome: "Último mês", de: somarDias(hoje, -29), ate: hoje },
  ];

  const rotulo = !de
    ? rotuloVazio
    : de === ate
      ? diaBR(de)
      : `${diaBR(de)} a ${diaBR(ate ?? de)}`;

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-left text-sm ring-1 transition sm:w-auto ${
          de
            ? "text-rose-700 ring-rose-300"
            : "text-stone-700 ring-rose-100 hover:ring-rose-300"
        }`}
      >
        <span aria-hidden>📅</span>
        {rotulo}
      </button>

      {aberto && (
        <div className={`${
          alinhar === "centro"
            ? "fixed top-1/2 left-1/2 z-[60] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
            : `absolute ${alinhar === "esquerda" ? "left-0" : "right-0"} z-40 mt-2 overflow-hidden`
        } flex w-[min(92vw,640px)] flex-col rounded-2xl bg-white text-stone-800 shadow-xl ring-1 ring-rose-100 sm:flex-row`}>
          <ul className="flex gap-1 overflow-x-auto border-b border-rose-100 p-2 text-sm sm:w-40 sm:flex-col sm:border-r sm:border-b-0">
            {atalhos.map((a) => (
              <li key={a.nome} className="shrink-0">
                <button
                  type="button"
                  onClick={() => aplicar(a.de, a.ate)}
                  className={`w-full rounded-lg px-3 py-2 text-left whitespace-nowrap hover:bg-rose-50 ${
                    de === a.de && ate === a.ate
                      ? "cursor-default bg-rose-100 text-rose-800"
                      : ""
                  }`}
                >
                  {a.nome}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex-1 p-3">
            <DayPicker
              mode="range"
              locale={ptBR}
              numberOfMonths={larga ? 2 : 1}
              selected={selecao}
              onSelect={setSelecao}
              defaultMonth={selecao?.from ?? paraDate(hoje)}
              className="painel-calendario"
            />
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-rose-100 pt-3">
              {semLimpar ? (
                <span />
              ) : (
                <button
                  type="button"
                  onClick={() => aplicar(null, null)}
                  className="rounded-xl px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
                >
                  Limpar data
                </button>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={!selecao?.from}
                  onClick={() =>
                    selecao?.from &&
                    aplicar(
                      paraDia(selecao.from),
                      selecao.to ? paraDia(selecao.to) : null,
                    )
                  }
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

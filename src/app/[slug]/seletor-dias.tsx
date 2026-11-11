"use client";

// Faixa de dias: dá para arrastar com o mouse (ou o dedo) e usar as setas.
// Botão "Outra data" abre um calendário para marcar mais longe (até maxDias).
// Para clientes que já querem garantir o mês seguinte.

import { useCallback, useEffect, useRef, useState } from "react";
import ScrollContainer from "react-indiana-drag-scroll";
import "react-indiana-drag-scroll/dist/style.css";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";

// AAAA-MM-DD <-> Date local (o calendário trabalha com Date)
const paraDate = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
};
const paraDia = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

export type Dia = {
  iso: string;
  diaSemana: number;
  numero: number;
  rotulo: string;
  mes: string;
};

export default function SeletorDias({
  dias,
  hoje,
  maxDias,
  diasQueAtende,
  selecionado,
  onEscolher,
}: {
  dias: Dia[];
  hoje: string;
  maxDias: number;
  diasQueAtende: number[];
  selecionado: string | null;
  onEscolher: (iso: string) => void;
}) {
  const faixa = useRef<HTMLElement>(null);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [podeAvancar, setPodeAvancar] = useState(false);
  const [calendario, setCalendario] = useState(false);

  // Fecha o calendário com Esc
  useEffect(() => {
    if (!calendario) return;
    const tecla = (e: KeyboardEvent) =>
      e.key === "Escape" && setCalendario(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [calendario]);

  const inicio = paraDate(hoje);
  const fim = paraDate(hoje);
  fim.setDate(fim.getDate() + maxDias - 1);

  // Mostra cada seta só quando ainda há dias escondidos daquele lado
  const atualizarSetas = useCallback(() => {
    const el = faixa.current;
    if (!el) return;
    setPodeVoltar(el.scrollLeft > 4);
    setPodeAvancar(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = faixa.current;
    atualizarSetas();
    el?.addEventListener("scroll", atualizarSetas, { passive: true });
    window.addEventListener("resize", atualizarSetas);
    return () => {
      el?.removeEventListener("scroll", atualizarSetas);
      window.removeEventListener("resize", atualizarSetas);
    };
  }, [atualizarSetas]);

  // Dia escolhido sempre vai para o centro da faixa.
  // Assim, ao tocar num dia da ponta, a faixa "puxa" e mostra os vizinhos.
  // Depende de "dias" também: escolhido pelo calendário, a faixa cresce antes.
  useEffect(() => {
    const el = faixa.current;
    if (!el || !selecionado) return;
    const botao = el.querySelector<HTMLElement>(`[data-dia="${selecionado}"]`);
    if (!botao) return;
    const alvo = botao.offsetLeft - el.clientWidth / 2 + botao.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, alvo), behavior: "smooth" });
  }, [selecionado, dias.length]);

  function rolar(direcao: 1 | -1) {
    const el = faixa.current;
    if (el)
      el.scrollBy({ left: direcao * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <Seta lado="esquerda" visivel={podeVoltar} onClick={() => rolar(-1)} />

        <ScrollContainer
          innerRef={faixa}
          hideScrollbars
          className="relative min-w-0 flex-1"
        >
          {/* Folga interna para a borda (ring) dos dias não ser cortada nas pontas */}
          <div className="flex w-max gap-2 p-1.5">
            {/* Só os dias em que a profissional atende */}
            {dias
              .filter((d) => diasQueAtende.includes(d.diaSemana))
              .map((d) => {
                const ativo = d.iso === selecionado;
                return (
                  <button
                    key={d.iso}
                    data-dia={d.iso}
                    onClick={() => onEscolher(d.iso)}
                    className={`flex min-w-16 shrink-0 select-none flex-col items-center rounded-xl px-3 py-2 ring-1 transition ${
                      ativo
                        ? "cursor-default bg-rose-600 text-white ring-rose-600"
                        : "bg-white text-stone-800 ring-rose-100 hover:ring-rose-300"
                    }`}
                  >
                    <span className="text-xs capitalize">{d.rotulo}</span>
                    <span className="text-lg font-semibold">{d.numero}</span>
                    <span className="text-xs">{d.mes}</span>
                  </button>
                );
              })}
          </div>
        </ScrollContainer>

        <Seta lado="direita" visivel={podeAvancar} onClick={() => rolar(1)} />
      </div>

      <button
        type="button"
        onClick={() => setCalendario(true)}
        className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-50"
      >
        <span aria-hidden>📅</span> Ver outras datas no calendário
      </button>

      {calendario && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          onClick={() => setCalendario(false)}
        >
          <div
            role="dialog"
            aria-label="Escolher data no calendário"
            className="max-h-[90vh] w-[min(92vw,360px)] overflow-y-auto rounded-2xl bg-white p-4 text-stone-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-center font-semibold">Escolha o dia</p>
            <div className="flex justify-center">
              <DayPicker
                mode="single"
                locale={ptBR}
                selected={selecionado ? paraDate(selecionado) : undefined}
                defaultMonth={selecionado ? paraDate(selecionado) : inicio}
                startMonth={inicio}
                endMonth={fim}
                // Só dias de hoje até o limite, nos dias da semana em que ela atende
                disabled={[
                  { before: inicio },
                  { after: fim },
                  (d: Date) => !diasQueAtende.includes(d.getDay()),
                ]}
                onSelect={(d) => {
                  if (!d) return;
                  setCalendario(false);
                  onEscolher(paraDia(d));
                }}
                className="painel-calendario"
              />
            </div>
            <button
              type="button"
              onClick={() => setCalendario(false)}
              className="mt-2 w-full rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-50"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seta({
  lado,
  visivel,
  onClick,
}: {
  lado: "esquerda" | "direita";
  visivel: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "esquerda" ? "Dias anteriores" : "Próximos dias"}
      tabIndex={visivel ? 0 : -1}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-rose-700 transition hover:bg-rose-100 ${
        visivel ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {lado === "esquerda" ? "‹" : "›"}
    </button>
  );
}

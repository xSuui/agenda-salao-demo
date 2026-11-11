"use client";

// Balanço do salão: botão no topo do painel que abre um modal com
// ganhos, atendimentos, cancelamentos e faltas do mês ou da semana,
// comparação com o período anterior e dois gráficos de barras.
//
// Regras de conta (em centavos):
// - Ganhos = preço do serviço de cada atendimento concluído
//   + sinal retido (cliente faltou ou avisou em cima da hora).
// - Atendimentos = reservas concluídas.
// - Cancelamentos = canceladas pela cliente ou pelo salão.
// - Faltas = cliente não apareceu.

import { useEffect, useMemo, useState, useTransition } from "react";
import { somarDias } from "@/lib/datas";
import {
  dadosBalanco,
  salvarRepasse,
  type Atendente,
  type DadosBalanco,
  type ItemBalanco,
} from "./balanco-dados";
import { Girando } from "./ui";
import FiltroData from "./filtro-data";

type Modo = "mes" | "semana" | "periodo";
type Faixa = { de: string; ate: string };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const reais = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const reaisCurto = (c: number) =>
  c >= 100_000_00
    ? `R$ ${(c / 100_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : reais(c).replace(",00", "");

// ---------- períodos (dias no formato AAAA-MM-DD) ----------

function diaDaSemana(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7; // 0 = segunda
}
function inicioSemana(dia: string) {
  return somarDias(dia, -diaDaSemana(dia));
}
function inicioMes(dia: string) {
  return dia.slice(0, 8) + "01";
}
function somarMeses(dia: string, n: number) {
  const [a, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}
// Período que começa em `ini`: lista de dias
function diasDoPeriodo(ini: string, modo: Modo) {
  const fim = modo === "mes" ? somarMeses(ini, 1) : somarDias(ini, 7);
  const dias: string[] = [];
  for (let d = ini; d < fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}
// Todos os dias de `de` até `ate` (inclusive), no máximo 1 ano
function intervalo(de: string, ate: string) {
  const dias: string[] = [];
  for (let d = de; d <= ate && dias.length < 366; d = somarDias(d, 1)) dias.push(d);
  return dias;
}
function diaCurto(dia: string) {
  const [, m, d] = dia.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}
function proximo(ini: string, modo: Modo, n: number) {
  return modo === "mes" ? somarMeses(ini, n) : somarDias(ini, 7 * n);
}
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function nomePeriodo(ini: string, modo: Modo) {
  const [a, m, d] = ini.split("-").map(Number);
  if (modo === "mes") return maiuscula(`${MESES_LONGOS[m - 1]} de ${a}`);
  const fim = somarDias(ini, 6);
  const [, m2, d2] = fim.split("-").map(Number);
  return `${d} ${MESES[m - 1]} a ${d2} ${MESES[m2 - 1]}`;
}
function rotuloCurto(ini: string, modo: Modo) {
  const [, m, d] = ini.split("-").map(Number);
  return modo === "mes" ? MESES[m - 1] : `${d}/${String(m).padStart(2, "0")}`;
}

// ---------- contas ----------

type Totais = { ganhos: number; atendimentos: number; cancelamentos: number; faltas: number };

function ganhoDoItem(i: ItemBalanco, sinal: number) {
  if (i.status === "concluido") return i.preco;
  if (i.sinal_status === "retido") return sinal;
  return 0;
}

function totais(itens: ItemBalanco[], sinal: number): Totais {
  const t: Totais = { ganhos: 0, atendimentos: 0, cancelamentos: 0, faltas: 0 };
  for (const i of itens) {
    t.ganhos += ganhoDoItem(i, sinal);
    if (i.status === "concluido") t.atendimentos++;
    if (i.status === "cancelado_cliente" || i.status === "cancelado_salao") t.cancelamentos++;
    if (i.status === "faltou") t.faltas++;
  }
  return t;
}

// ---------- componente principal ----------

export default function Balanco() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
      >
        Balanço
      </button>
      {aberto && <ModalBalanco onFechar={() => setAberto(false)} />}
    </>
  );
}

function ModalBalanco({ onFechar }: { onFechar: () => void }) {
  const [dados, setDados] = useState<DadosBalanco | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, iniciar] = useTransition();
  const [modo, setModo] = useState<Modo>("mes");
  const [ini, setIni] = useState<string | null>(null);
  const [tabela, setTabela] = useState(false);
  const [aba, setAba] = useState<"resumo" | "repasses">("resumo");
  const [faixa, setFaixa] = useState<Faixa | null>(null);

  useEffect(() => {
    iniciar(async () => {
      try {
        const d = await dadosBalanco();
        if (!d) return setErro(true);
        setDados(d);
        setIni(inicioMes(d.hoje));
        setFaixa({ de: somarDias(d.hoje, -6), ate: d.hoje });
      } catch {
        setErro(true);
      }
    });
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  const trocarModo = (m: Modo) => {
    if (!dados) return;
    setModo(m);
    if (m !== "periodo") setIni(m === "mes" ? inicioMes(dados.hoje) : inicioSemana(dados.hoje));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="balanco-titulo"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onFechar}
    >
      <div
        className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="balanco-titulo" className="text-lg font-semibold text-stone-800">
            Balanço
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
            aria-label="Fechar"
          >
            Fechar
          </button>
        </div>

        {erro && (
          <p className="py-10 text-center text-sm text-stone-500">
            Não foi possível carregar o balanço. Recarregue a página e tente de novo.
          </p>
        )}
        {!erro && (carregando || !dados || !ini) && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500">
            <Girando /> Carregando o balanço...
          </p>
        )}
        {!erro && dados && ini && faixa && !carregando && (
          <Conteudo
            dados={dados}
            modo={modo}
            ini={ini}
            faixa={faixa}
            onFaixa={setFaixa}
            tabela={tabela}
            aba={aba}
            onAba={setAba}
            onModo={trocarModo}
            onIni={setIni}
            onTabela={() => setTabela((t) => !t)}
            onPercentual={(id, pct) =>
              setDados((d) =>
                d && {
                  ...d,
                  atendentes: d.atendentes.map((a) => (a.id === id ? { ...a, percentual: pct } : a)),
                },
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function Conteudo({
  dados,
  modo,
  ini,
  faixa,
  onFaixa,
  tabela,
  aba,
  onAba,
  onModo,
  onIni,
  onTabela,
  onPercentual,
}: {
  dados: DadosBalanco;
  modo: Modo;
  ini: string;
  faixa: Faixa;
  onFaixa: (f: Faixa) => void;
  tabela: boolean;
  aba: "resumo" | "repasses";
  onAba: (a: "resumo" | "repasses") => void;
  onModo: (m: Modo) => void;
  onIni: (d: string) => void;
  onTabela: () => void;
  onPercentual: (id: string, pct: number) => void;
}) {
  const { itens, sinal, hoje } = dados;

  // Itens agrupados por dia
  const porDia = useMemo(() => {
    const mapa = new Map<string, ItemBalanco[]>();
    for (const i of itens) {
      const l = mapa.get(i.dia);
      if (l) l.push(i);
      else mapa.set(i.dia, [i]);
    }
    return mapa;
  }, [itens]);

  const doPeriodo = (inicio: string) =>
    diasDoPeriodo(inicio, modo).flatMap((d) => porDia.get(d) ?? []);
  const dosDias = (dias: string[]) => dias.flatMap((d) => porDia.get(d) ?? []);

  // Dias do período escolhido, do período anterior (para comparar) e nomes
  let diasAtual: string[];
  let diasAnterior: string[];
  let nomeAtual: string;
  let nomeAnterior: string;
  if (modo === "periodo") {
    // Datas exatas do calendário: compara com os mesmos tantos dias logo antes
    diasAtual = intervalo(faixa.de, faixa.ate);
    const n = diasAtual.length;
    diasAnterior = intervalo(somarDias(faixa.de, -n), somarDias(faixa.de, -1));
    nomeAtual = faixa.de === faixa.ate ? diaCurto(faixa.de) : `${diaCurto(faixa.de)} a ${diaCurto(faixa.ate)}`;
    nomeAnterior = n === 1 ? "dia anterior" : `${n} dias anteriores`;
  } else {
    // Período em andamento (mês ou semana de hoje): compara só o mesmo trecho
    // do período anterior (ex.: 1 a 5 de nov x 1 a 5 de out), senão um mês
    // pela metade sempre pareceria uma queda.
    const anteriorIni = proximo(ini, modo, -1);
    const emAndamento = hoje >= ini && hoje < proximo(ini, modo, 1);
    const decorridos = emAndamento ? diasDoPeriodo(ini, modo).filter((d) => d <= hoje).length : Infinity;
    diasAtual = diasDoPeriodo(ini, modo);
    diasAnterior = diasDoPeriodo(anteriorIni, modo).slice(0, decorridos);
    nomeAtual = nomePeriodo(ini, modo);
    const base = modo === "mes" ? MESES_LONGOS[Number(anteriorIni.slice(5, 7)) - 1] : "semana anterior";
    nomeAnterior = emAndamento
      ? modo === "mes"
        ? `1 a ${decorridos} de ${base}`
        : `mesmos dias da ${base}`
      : base;
  }
  const itensAtual = dosDias(diasAtual);
  const atual = totais(itensAtual, sinal);
  const anterior = totais(dosDias(diasAnterior), sinal);

  // Gráfico 1: ganhos por dia do período
  const curto = diasAtual.length <= 7;
  const barrasDias = diasAtual.map((d) => {
    const [, m, dd] = d.split("-").map(Number);
    return {
      chave: d,
      rotulo: curto ? DIAS_SEMANA[diaDaSemana(d)] : String(dd),
      detalhe: `${DIAS_SEMANA[diaDaSemana(d)]}, ${dd}/${String(m).padStart(2, "0")}`,
      valor: (porDia.get(d) ?? []).reduce((s, i) => s + ganhoDoItem(i, sinal), 0),
      destaque: true,
    };
  });

  // Gráfico 2: mês/semana = últimos 6 meses ou 8 semanas; período = este x anterior
  let barrasComparacao: Barra[];
  let tituloComparacao: string;
  if (modo === "periodo") {
    tituloComparacao = "Este período x o anterior";
    barrasComparacao = [
      { chave: "anterior", rotulo: "Anterior", detalhe: nomeAnterior, valor: anterior.ganhos, destaque: false },
      { chave: "atual", rotulo: "Este período", detalhe: nomeAtual, valor: atual.ganhos, destaque: true },
    ];
  } else {
    const qtd = modo === "mes" ? 6 : 8;
    tituloComparacao = modo === "mes" ? "Ganhos dos últimos 6 meses" : "Ganhos das últimas 8 semanas";
    barrasComparacao = Array.from({ length: qtd }, (_, k) => {
      const p = proximo(ini, modo, k - (qtd - 1));
      return {
        chave: p,
        rotulo: rotuloCurto(p, modo),
        detalhe: nomePeriodo(p, modo),
        valor: totais(doPeriodo(p), sinal).ganhos,
        destaque: p === ini,
      };
    });
  }

  const atualIni = modo === "mes" ? inicioMes(hoje) : inicioSemana(hoje);
  const limiteAntigo = modo === "periodo" ? ini : proximo(atualIni, modo, modo === "mes" ? -6 : -26);
  // Os dados vêm de ~7 meses para trás: o calendário não deixa ir antes disso
  const primeiroDia = somarMeses(inicioMes(hoje), -6);
  const atalhosBalanco = [
    { nome: "Hoje", de: hoje, ate: hoje },
    { nome: "Ontem", de: somarDias(hoje, -1), ate: somarDias(hoje, -1) },
    { nome: "Últimos 7 dias", de: somarDias(hoje, -6), ate: hoje },
    { nome: "Últimos 15 dias", de: somarDias(hoje, -14), ate: hoje },
    { nome: "Últimos 30 dias", de: somarDias(hoje, -29), ate: hoje },
    { nome: "Mês passado", de: somarMeses(inicioMes(hoje), -1), ate: somarDias(inicioMes(hoje), -1) },
  ];

  return (
    <div className="mt-4 space-y-5">
      <div className="flex gap-4 border-b border-stone-200 text-sm">
        {(["resumo", "repasses"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onAba(a)}
            aria-pressed={aba === a}
            className={`-mb-px border-b-2 pb-2 ${aba === a ? "border-rose-600 font-medium text-rose-700" : "border-transparent text-stone-500 hover:text-stone-700"}`}
          >
            {a === "resumo" ? "Resumo" : "Repasses"}
          </button>
        ))}
      </div>
      {/* Filtros: uma linha acima de tudo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-stone-100 p-1 text-sm">
          {(["mes", "semana", "periodo"] as Modo[]).map((m) => (
            <button
              key={m}
              onClick={() => onModo(m)}
              aria-pressed={modo === m}
              className={`rounded-lg px-3 py-1 ${modo === m ? "bg-white font-medium text-stone-800 shadow-sm" : "text-stone-500"}`}
            >
              {m === "mes" ? "Mês" : m === "semana" ? "Semana" : "Período"}
            </button>
          ))}
        </div>
        {modo === "periodo" ? (
          <FiltroData
            de={faixa.de}
            ate={faixa.ate}
            hoje={hoje}
            atalhos={atalhosBalanco}
            alinhar="centro"
            semLimpar
            onAplicar={(de, ate) => {
              if (!de) return;
              const ini2 = de < primeiroDia ? primeiroDia : de;
              const fim2 = (ate ?? de) > hoje ? hoje : (ate ?? de);
              onFaixa({ de: ini2, ate: fim2 < ini2 ? ini2 : fim2 });
            }}
          />
        ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onIni(proximo(ini, modo, -1))}
            disabled={ini <= limiteAntigo}
            className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-30"
            aria-label="Período anterior"
          >
            ‹
          </button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-stone-800">
            {nomePeriodo(ini, modo)}
          </span>
          <button
            onClick={() => onIni(proximo(ini, modo, 1))}
            disabled={ini >= atualIni}
            className="rounded-lg px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-30"
            aria-label="Próximo período"
          >
            ›
          </button>
        </div>
        )}
      </div>

      {aba === "repasses" ? (
        <Repasses
          itens={itensAtual}
          atendentes={dados.atendentes}
          podeEditar={dados.podeEditarRepasse}
          periodo={nomeAtual}
          onPercentual={onPercentual}
        />
      ) : (
      <>
      {/* Números do período */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Ganhos" valor={reais(atual.ganhos)} atual={atual.ganhos} antes={anterior.ganhos} subirEhBom vs={nomeAnterior} />
        <Numero rotulo="Atendimentos" valor={String(atual.atendimentos)} atual={atual.atendimentos} antes={anterior.atendimentos} subirEhBom vs={nomeAnterior} />
        <Numero rotulo="Cancelamentos" valor={String(atual.cancelamentos)} atual={atual.cancelamentos} antes={anterior.cancelamentos} vs={nomeAnterior} />
        <Numero rotulo="Faltas" valor={String(atual.faltas)} atual={atual.faltas} antes={anterior.faltas} vs={nomeAnterior} />
      </div>

      <Grafico
        titulo={modo === "semana" ? "Ganhos por dia da semana" : "Ganhos por dia"}
        barras={barrasDias}
        tabela={tabela}
      />
      <Grafico
        titulo={tituloComparacao}
        semTotal={modo === "periodo"}
        barras={barrasComparacao}
        tabela={tabela}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
        <p>
          Ganhos = serviços concluídos + sinais retidos (faltas e avisos em cima da hora).
          Valores pelo preço atual de cada serviço.
        </p>
        <button onClick={onTabela} className="text-rose-700 underline">
          {tabela ? "Ver gráficos" : "Ver em tabela"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}

// ---------- repasses por atendente ----------
// Base: preço (atual) de cada serviço CONCLUÍDO pela atendente no período.
// Sinal retido de falta não entra (não houve serviço).

function Repasses({
  itens,
  atendentes,
  podeEditar,
  periodo,
  onPercentual,
}: {
  itens: ItemBalanco[];
  atendentes: Atendente[];
  podeEditar: boolean;
  periodo: string;
  onPercentual: (id: string, pct: number) => void;
}) {
  const linhas = atendentes
    .map((a) => {
      const feitos = itens.filter((i) => i.profissional === a.id && i.status === "concluido");
      const valor = feitos.reduce((s, i) => s + i.preco, 0);
      const pagar = Math.round((valor * a.percentual) / 100);
      return { a, qtd: feitos.length, valor, pagar };
    })
    .filter((l) => l.a.ativo || l.qtd > 0);
  const totalPagar = linhas.reduce((s, l) => s + l.pagar, 0);
  const totalValor = linhas.reduce((s, l) => s + l.valor, 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
              <th className="py-2 font-normal">Atendente</th>
              <th className="py-2 text-right font-normal">Atendimentos</th>
              <th className="py-2 text-right font-normal">Valor dos serviços</th>
              <th className="py-2 text-right font-normal">Repasse</th>
              <th className="py-2 text-right font-normal">A pagar</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.a.id} className="border-b border-stone-100">
                <td className="py-2 text-stone-800">
                  {l.a.nome}
                  {!l.a.ativo && <span className="ml-1 text-xs text-stone-400">(desativada)</span>}
                </td>
                <td className="py-2 text-right text-stone-700">{l.qtd}</td>
                <td className="py-2 text-right text-stone-700">{reais(l.valor)}</td>
                <td className="py-2 text-right">
                  {podeEditar ? (
                    <EditarPercentual atendente={l.a} onSalvo={onPercentual} />
                  ) : (
                    <span className="text-stone-700">{l.a.percentual.toLocaleString("pt-BR")}%</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {l.a.percentual > 0 ? (
                    <span className="font-semibold text-stone-800">{reais(l.pagar)}</span>
                  ) : (
                    <span className="text-xs text-stone-400">sem repasse</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl bg-rose-50 p-3 text-sm ring-1 ring-rose-100">
        <p className="text-stone-700">
          Total a pagar em <strong>{periodo}</strong>:{" "}
          <span className="font-semibold text-stone-900">{reais(totalPagar)}</span>
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Fica com o salão: {reais(totalValor - totalPagar)} (de {reais(totalValor)} em serviços
          concluídos).
        </p>
      </div>
      <p className="text-xs text-stone-400">
        Conta feita sobre os serviços marcados como atendidos no painel, pelo preço atual de cada
        serviço. Sinal retido de falta não entra no repasse.{" "}
        {podeEditar
          ? "Para mudar uma porcentagem, toque nela."
          : "Só a dona do salão muda as porcentagens."}
      </p>
    </div>
  );
}

function EditarPercentual({
  atendente,
  onSalvo,
}: {
  atendente: Atendente;
  onSalvo: (id: string, pct: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(atendente.percentual));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  if (!editando)
    return (
      <button
        onClick={() => {
          setValor(String(atendente.percentual));
          setErro(null);
          setEditando(true);
        }}
        className="text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-rose-700"
        title="Mudar a porcentagem"
      >
        {atendente.percentual.toLocaleString("pt-BR")}%
      </button>
    );

  const salvar = () =>
    iniciar(async () => {
      const n = Number(valor.replace(",", "."));
      const r = await salvarRepasse(atendente.id, n);
      if (!r.ok) {
        setErro(r.erro ?? "Erro ao salvar.");
        return;
      }
      onSalvo(atendente.id, Math.round(n * 100) / 100);
      setEditando(false);
    });

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditando(false);
            }
          }}
          inputMode="decimal"
          autoFocus
          aria-label={`Repasse de ${atendente.nome} (%)`}
          className="w-16 rounded-lg px-2 py-1 text-right text-sm ring-1 ring-stone-300"
        />
        <span className="text-stone-500">%</span>
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {salvando ? <Girando className="h-3 w-3" /> : "Salvar"}
        </button>
      </span>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </span>
  );
}


// ---------- número com comparação ----------

function Numero({
  rotulo,
  valor,
  atual,
  antes,
  subirEhBom,
  vs,
}: {
  rotulo: string;
  valor: string;
  atual: number;
  antes: number;
  subirEhBom?: boolean;
  vs: string;
}) {
  let delta: { texto: string; bom: boolean | null } = { texto: `sem dados em ${vs}`, bom: null };
  if (antes > 0) {
    const pct = Math.round(((atual - antes) / antes) * 100);
    const sobe = pct > 0;
    delta = {
      texto: `${pct === 0 ? "=" : sobe ? "▲" : "▼"} ${Math.abs(pct)}% vs ${vs}`,
      bom: pct === 0 ? null : sobe === !!subirEhBom,
    };
  } else if (atual > 0) {
    delta = { texto: `▲ novo vs ${vs}`, bom: !!subirEhBom };
  }
  return (
    <div className="rounded-xl p-3 ring-1 ring-stone-200">
      <p className="text-xs text-stone-500">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold text-stone-800">{valor}</p>
      <p
        className={`mt-1 text-xs ${
          delta.bom === null ? "text-stone-400" : delta.bom ? "text-emerald-700" : "text-red-700"
        }`}
      >
        {delta.texto}
      </p>
    </div>
  );
}

// ---------- gráfico de barras (uma série) ----------

type Barra = { chave: string; rotulo: string; detalhe: string; valor: number; destaque: boolean };

// Topo do eixo arredondado para um número "redondo"
function topoRedondo(max: number) {
  if (max <= 0) return 10000; // R$ 100
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * passo >= max) return f * passo;
  return 10 * passo;
}

function Grafico({
  titulo,
  barras,
  tabela,
  semTotal,
}: {
  titulo: string;
  barras: Barra[];
  tabela: boolean;
  semTotal?: boolean;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const max = Math.max(...barras.map((b) => b.valor), 0);
  const topo = topoRedondo(max);
  const total = barras.reduce((s, b) => s + b.valor, 0);
  const maior = barras.find((b) => b.valor === max && max > 0);
  const ativa = barras.find((b) => b.chave === foco);
  const muitas = barras.length > 12;

  if (tabela) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">{titulo}</p>
        <table className="w-full text-sm">
          <tbody>
            {barras.map((b) => (
              <tr key={b.chave} className="border-b border-stone-100">
                <td className="py-1 text-stone-600">{maiuscula(b.detalhe)}</td>
                <td className="py-1 text-right font-medium text-stone-800">{reais(b.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-stone-700">{titulo}</p>
        <p className="text-xs text-stone-500">
          {ativa ? (
            <>
              <span className="font-semibold text-stone-800">{reais(ativa.valor)}</span>{" "}
              <span>{ativa.detalhe}</span>
            </>
          ) : maior ? (
            <>
              Maior: <span className="font-semibold text-stone-800">{reais(maior.valor)}</span>{" "}
              <span>({maior.detalhe})</span>
            </>
          ) : (
            "Sem ganhos no período"
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {/* eixo: 3 valores redondos */}
        <div className="flex h-36 flex-col justify-between text-right text-[10px] leading-none text-stone-400">
          <span>{reaisCurto(topo)}</span>
          <span>{reaisCurto(topo / 2)}</span>
          <span>R$ 0</span>
        </div>
        <div className="relative flex-1">
          {/* linhas de grade finas */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36">
            {[0, 50, 100].map((p) => (
              <div key={p} className="absolute inset-x-0 border-t border-stone-100" style={{ top: `${p}%` }} />
            ))}
          </div>
          <div className="relative flex h-36 items-end gap-[2px]" onMouseLeave={() => setFoco(null)}>
            {barras.map((b) => (
              <button
                key={b.chave}
                type="button"
                onMouseEnter={() => setFoco(b.chave)}
                onFocus={() => setFoco(b.chave)}
                onBlur={() => setFoco(null)}
                aria-label={`${b.detalhe}: ${reais(b.valor)}`}
                className="group flex h-full flex-1 cursor-default items-end justify-center focus:outline-none"
              >
                <span
                  className={`block w-full max-w-[24px] rounded-t-[4px] transition-colors ${
                    b.destaque ? "bg-rose-500" : "bg-rose-200"
                  } ${foco === b.chave ? "brightness-110 ring-2 ring-rose-300" : ""} group-focus-visible:ring-2 group-focus-visible:ring-rose-400`}
                  style={{ height: b.valor > 0 ? `max(${(b.valor / topo) * 100}%, 2px)` : 0 }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-stone-400">
            {barras.map((b, k) => (
              <span key={b.chave} className="flex-1 text-center capitalize">
                {/* no mês, mostra só alguns dias para não embolar */}
                {!muitas || k === 0 || (k + 1) % 5 === 0 ? b.rotulo : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      {!semTotal && (
        <p className="mt-1 text-right text-xs text-stone-500">
          Total: <span className="font-semibold text-stone-800">{reais(total)}</span>
        </p>
      )}
    </div>
  );
}


"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alterarReserva, type Acao } from "./actions";
import FiltroData from "./filtro-data";
import { Girando, Modal } from "./ui";

export type Reserva = {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  sinal_status: string;
  criado_em: string;
  clientes: { nome: string; telefone: string } | null;
  servicos: { nome: string; preco_centavos: number } | null;
  profissionais: { nome: string } | null;
};

const reais = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type FiltroStatus =
  "todos" | "sinal" | "confirmadas" | "finalizados" | "cancelados" | "atencao";
const FINALIZADOS = ["concluido", "faltou"];
// expirado = a cliente não pagou o sinal no prazo
const CANCELADOS = ["cancelado_salao", "cancelado_cliente", "expirado"];

// Texto sem acento e minúsculo, para a busca achar "Júlia" digitando "julia"
const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function ListaReservas({
  reservas,
  fuso,
  prazoSinalMin,
  agora,
  hoje,
  de,
  ate,
}: {
  reservas: Reserva[];
  fuso: string;
  prazoSinalMin: number;
  agora: number;
  hoje: string;
  de: string | null;
  ate: string | null;
}) {
  const diaLocal = (iso: string | number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date(iso));
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");

  // Reservas que chegaram ao vivo (websocket) ficam destacadas até recarregar a página
  const [novas, setNovas] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const aoChegar = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setNovas((atual) => new Set(atual).add(id));
    };
    window.addEventListener("reserva-nova", aoChegar);
    return () => window.removeEventListener("reserva-nova", aoChegar);
  }, []);

  // Trocar o período busca dados no servidor: enquanto isso, mostra o carregando
  const router = useRouter();
  const [carregandoPeriodo, iniciarPeriodo] = useTransition();
  const irPara = (url: string) => iniciarPeriodo(() => router.push(url));

  // 1. Busca por nome ou WhatsApp
  const termo = normalizar(busca.trim());
  const digitos = busca.replace(/\D/g, "");
  const encontradas = reservas.filter((r) => {
    if (!termo) return true;
    if (normalizar(r.clientes?.nome ?? "").includes(termo)) return true;
    return (
      digitos.length >= 2 && (r.clientes?.telefone ?? "").includes(digitos)
    );
  });

  // 2. Sem filtro de data: agenda de hoje em diante + "dias anteriores" à parte.
  //    Com filtro de data: tudo do período (o servidor já filtrou).
  const comData = de !== null;
  // "Para marcar se veio": confirmada cujo horário já começou e ainda não foi finalizada
  const atencaoTodas = encontradas.filter(
    (r) => r.status === "confirmado" && Date.parse(r.inicio) <= agora,
  );
  const atencaoAnteriores = comData
    ? []
    : atencaoTodas.filter((r) => diaLocal(r.inicio) < hoje);
  const base = comData
    ? encontradas
    : encontradas.filter((r) => diaLocal(r.inicio) >= hoje);

  const contagem: Record<FiltroStatus, number> = {
    todos: base.length + atencaoAnteriores.length,
    sinal: base.filter((r) => r.status === "aguardando_sinal").length,
    confirmadas: base.filter((r) => r.status === "confirmado").length,
    finalizados: base.filter((r) => FINALIZADOS.includes(r.status)).length,
    cancelados: base.filter((r) => CANCELADOS.includes(r.status)).length,
    atencao: comData ? atencaoTodas.length : atencaoAnteriores.length,
  };

  // 3. Botões de status
  const agenda = (() => {
    if (filtroStatus === "sinal")
      return base.filter((r) => r.status === "aguardando_sinal");
    if (filtroStatus === "confirmadas")
      return base.filter((r) => r.status === "confirmado");
    if (filtroStatus === "finalizados")
      return base.filter((r) => FINALIZADOS.includes(r.status));
    if (filtroStatus === "cancelados")
      return base.filter((r) => CANCELADOS.includes(r.status));
    if (filtroStatus === "atencao") return comData ? atencaoTodas : [];
    return base;
  })();
  const atencao =
    filtroStatus === "todos" || filtroStatus === "atencao"
      ? atencaoAnteriores
      : [];

  const porDia = new Map<string, Reserva[]>();
  for (const r of agenda) {
    const d = diaLocal(r.inicio);
    porDia.set(d, [...(porDia.get(d) ?? []), r]);
  }

  const tituloDia = (iso: string) => {
    if (diaLocal(iso) === hoje) return "Hoje";
    return new Date(iso).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: fuso,
    });
  };

  const chip = (chave: FiltroStatus, texto: string, cores: string) => {
    const ativo = filtroStatus === chave;
    return (
      <button
        type="button"
        onClick={() =>
          setFiltroStatus(ativo && chave !== "todos" ? "todos" : chave)
        }
        aria-pressed={ativo}
        className={`rounded-full px-3 py-1 ring-1 transition ${
          ativo
            ? "bg-rose-600 text-white ring-rose-600"
            : `${cores} hover:ring-rose-300`
        }`}
      >
        {contagem[chave]} {texto}
        {ativo && chave !== "todos" && <span className="ml-1">✕</span>}
      </button>
    );
  };

  const vazio = porDia.size === 0 && atencao.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou WhatsApp"
          className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm text-stone-800 ring-1 ring-rose-100 outline-none placeholder:text-stone-400 focus:ring-rose-400"
        />
        <FiltroData
          key={`${de}-${ate}`}
          de={de}
          ate={ate}
          hoje={hoje}
          irPara={irPara}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {chip("todos", "todos", "bg-white text-stone-600 ring-stone-200")}
        {chip(
          "sinal",
          "esperando sinal",
          "bg-amber-100 text-amber-800 ring-amber-100",
        )}
        {chip(
          "confirmadas",
          "confirmados",
          "bg-emerald-50 text-emerald-800 ring-emerald-100",
        )}
        {chip(
          "finalizados",
          "finalizados",
          "bg-stone-100 text-stone-600 ring-stone-200",
        )}
        {chip(
          "cancelados",
          "cancelados",
          "bg-red-50 text-red-700 ring-red-100",
        )}
        {(contagem.atencao > 0 || filtroStatus === "atencao") &&
          chip(
            "atencao",
            "para marcar se veio",
            "bg-rose-100 text-rose-800 ring-rose-100",
          )}
      </div>

      {carregandoPeriodo && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          <Girando /> Carregando reservas...
        </div>
      )}

      <div
        className={`relative space-y-6 transition-opacity ${carregandoPeriodo ? "pointer-events-none opacity-40" : ""}`}
        aria-busy={carregandoPeriodo}
      >
        {vazio && (
          <p className="rounded-2xl bg-white p-6 text-center text-stone-500 ring-1 ring-rose-100">
            {busca || filtroStatus !== "todos" || comData
              ? "Nenhuma reserva com esses filtros."
              : "Nenhuma reserva de hoje em diante."}
          </p>
        )}

        {atencao.length > 0 && (
          <section>
            <h2 className="mb-2 font-medium text-rose-800">
              Dias anteriores: a cliente veio?
            </h2>
            <div className="space-y-2">
              {atencao.map((r) => (
                <Cartao
                  key={r.id}
                  r={r}
                  fuso={fuso}
                  agora={agora}
                  prazoSinalMin={prazoSinalMin}
                  nova={novas.has(r.id)}
                  mostrarData
                />
              ))}
            </div>
          </section>
        )}

        {[...porDia.entries()].map(([dia, lista]) => (
          <section key={dia}>
            <h2 className="mb-2 font-medium capitalize text-stone-700">
              {tituloDia(lista[0].inicio)}
            </h2>
            <div className="space-y-2">
              {lista.map((r) => (
                <Cartao
                  key={r.id}
                  r={r}
                  fuso={fuso}
                  agora={agora}
                  prazoSinalMin={prazoSinalMin}
                  nova={novas.has(r.id)}
                  mostrarData={comData}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Cartao({
  r,
  fuso,
  agora,
  prazoSinalMin,
  mostrarData,
  nova,
}: {
  r: Reserva;
  fuso: string;
  agora: number;
  prazoSinalMin: number;
  mostrarData?: boolean;
  nova?: boolean;
}) {
  const [salvando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: fuso,
    });
  const data = new Date(r.inicio).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: fuso,
  });

  const prazoVencido = Date.parse(r.criado_em) + prazoSinalMin * 60_000 < agora;
  const comecou = Date.parse(r.inicio) <= agora; // dá para finalizar a partir do início

  const selo = (() => {
    switch (r.status) {
      case "aguardando_sinal":
        return prazoVencido
          ? {
              texto: "Prazo do sinal vencido",
              cor: "bg-stone-100 text-stone-600",
            }
          : { texto: "Esperando sinal", cor: "bg-amber-100 text-amber-800" };
      case "confirmado":
        return {
          texto: "Confirmado · sinal pago",
          cor: "bg-emerald-100 text-emerald-800",
        };
      case "concluido":
        return {
          texto: "Finalizado · atendida",
          cor: "bg-emerald-50 text-emerald-700",
        };
      case "faltou":
        return {
          texto: "Faltou · sinal retido",
          cor: "bg-rose-100 text-rose-800",
        };
      case "cancelado_salao":
        return {
          texto:
            r.sinal_status === "devolvido"
              ? "Cancelada · devolver sinal"
              : "Cancelada pelo salão",
          cor: "bg-stone-100 text-stone-600",
        };
      case "cancelado_cliente":
        return {
          texto: "Cancelada pela cliente",
          cor: "bg-stone-100 text-stone-600",
        };
      case "expirado":
        return {
          texto: "Expirou sem sinal",
          cor: "bg-stone-100 text-stone-500",
        };
      default:
        return { texto: r.status, cor: "bg-stone-100 text-stone-600" };
    }
  })();

  const apagada = ["cancelado_salao", "cancelado_cliente", "expirado"].includes(
    r.status,
  );

  // Toda ação passa por um modal de confirmação (evita clique sem querer)
  const botoes: Botao[] = [];
  if (r.status === "aguardando_sinal" || r.status === "expirado") {
    botoes.push({
      acao: "confirmar",
      texto: "Sinal recebido",
      destaque: true,
      titulo: "Confirmar o sinal?",
      mensagem:
        "Só confirme depois de ver o Pix na sua conta. A reserva passa para Confirmada.",
      botaoOk: "Sim, recebi o sinal",
    });
  }
  if (r.status === "confirmado" && comecou) {
    botoes.push({
      acao: "concluir",
      texto: "Finalizar atendimento",
      destaque: true,
      titulo: "Finalizar o atendimento?",
      mensagem: "O sinal já pago fica descontado do valor do serviço.",
      botaoOk: "Sim, finalizar",
    });
    botoes.push({
      acao: "faltou",
      texto: "Faltou",
      titulo: "A cliente faltou?",
      mensagem: "A reserva fica como Faltou e o sinal fica com o salão.",
      botaoOk: "Sim, ela faltou",
      perigo: true,
    });
  }
  if (
    ["aguardando_sinal", "expirado", "confirmado"].includes(r.status) &&
    !comecou
  ) {
    botoes.push({
      acao: "cancelar",
      texto: "Cancelar",
      titulo: "Cancelar esta reserva?",
      mensagem:
        r.status === "confirmado"
          ? "O horário volta a ficar livre. Como o sinal já foi pago, ele deve ser devolvido à cliente."
          : "O horário volta a ficar livre.",
      botaoOk: "Sim, cancelar",
      perigo: true,
    });
  }

  const [pendente, setPendente] = useState<Botao | null>(null);

  function executar(b: Botao) {
    setPendente(null);
    setErro(null);
    iniciar(async () => {
      const res = await alterarReserva(r.id, b.acao);
      if (res.erro) setErro(res.erro);
    });
  }

  const tel = r.clientes?.telefone ?? "";

  return (
    <div
      className={`rounded-2xl p-4 transition ${nova ? "bg-emerald-50 ring-2 ring-emerald-400" : "bg-white ring-1 ring-rose-100"} ${apagada ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-stone-800">
            {mostrarData && <span className="mr-1 text-stone-500">{data}</span>}
            {hora(r.inicio)} às {hora(r.fim)} · {r.clientes?.nome ?? "Cliente"}
            {nova && (
              <span className="ml-2 rounded-full bg-emerald-500 px-2 py-0.5 align-middle text-xs font-medium text-white">
                Nova
              </span>
            )}
          </p>
          <p className="text-sm text-stone-600">
            {r.servicos?.nome} com {r.profissionais?.nome}
            {r.servicos && (
              <span className="text-stone-400">
                {" "}
                · {reais(r.servicos.preco_centavos)}
              </span>
            )}
          </p>
          {tel && (
            <a
              href={`https://wa.me/${tel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-700 underline-offset-2 hover:underline"
            >
              WhatsApp: +{tel.slice(0, 2)} ({tel.slice(2, 4)}){" "}
              {tel.slice(4, -4)}-{tel.slice(-4)}
            </a>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${selo.cor}`}>
          {selo.texto}
        </span>
      </div>

      {botoes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {botoes.map((b) => (
            <button
              key={b.acao}
              disabled={salvando}
              onClick={() => setPendente(b)}
              className={`rounded-xl px-4 py-2 text-sm transition disabled:opacity-50 ${
                b.destaque
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
              }`}
            >
              {salvando ? (
                <span className="inline-flex items-center gap-1.5">
                  <Girando /> Salvando
                </span>
              ) : (
                b.texto
              )}
            </button>
          ))}
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}

      {pendente && (
        <Modal
          titulo={pendente.titulo}
          resumo={`${r.clientes?.nome ?? "Cliente"} · ${data} às ${hora(r.inicio)} · ${r.servicos?.nome ?? ""}`}
          mensagem={pendente.mensagem}
          botaoOk={pendente.botaoOk}
          perigo={pendente.perigo}
          onConfirmar={() => executar(pendente)}
          onFechar={() => setPendente(null)}
        />
      )}
    </div>
  );
}

type Botao = {
  acao: Acao;
  texto: string;
  destaque?: boolean;
  perigo?: boolean;
  titulo: string;
  mensagem: string;
  botaoOk: string;
};

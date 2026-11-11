"use client";

// Tela de marcação: serviço → profissional → dia → horário → nome e telefone.

import { useRef, useState, useTransition } from "react";
import type { DadosSalao } from "@/lib/dados";
import { buscarHorarios, marcarHorario, type Horario } from "./actions";
import SeletorDias from "./seletor-dias";
import PagamentoPix from "./pagamento-pix";
import {
  DIAS_CALENDARIO,
  TOTAL_DIAS,
  apagarRascunho,
  salvarRascunho,
  type Rascunho,
} from "@/lib/rascunho";

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

// Máscara do WhatsApp: (11) 99999-9999, só números, no máximo DDD + 9 dígitos.
function mascaraTelefone(valor: string) {
  let d = valor.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // colou com +55
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const duracao = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

// Quantos dias separam duas datas AAAA-MM-DD
const diferencaDias = (de: string, ate: string) =>
  Math.round(
    (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000,
  );

// Próximos N dias a partir de "hoje" (AAAA-MM-DD), sem depender do relógio do celular
function proximosDias(hoje: string, n: number) {
  const [a, m, d] = hoje.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(a, m - 1, d + i));
    return {
      iso: dt.toISOString().slice(0, 10),
      diaSemana: dt.getUTCDay(),
      numero: dt.getUTCDate(),
      rotulo:
        i === 0
          ? "hoje"
          : dt
              .toLocaleDateString("pt-BR", {
                weekday: "short",
                timeZone: "UTC",
              })
              .replace(".", ""),
      mes: dt
        .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
        .replace(".", ""),
    };
  });
}

type Resultado = {
  inicio: string;
  fim: string;
  sinalCentavos: number;
  codigo: string;
};

export default function Agendador({
  slug,
  dados,
  hoje,
  rascunho,
  horariosIniciais,
}: {
  slug: string;
  dados: DadosSalao;
  hoje: string;
  rascunho: Rascunho;
  horariosIniciais: Horario[] | null;
}) {
  const { salao, profissionais, servicos } = dados;
  const fuso = salao.fuso_horario;
  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: fuso,
    });
  const dataLonga = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: fuso,
    });

  // Começa do rascunho salvo (se a cliente fechou a aba há menos de 10 min)
  const [servicoId, setServicoId] = useState<string | null>(
    rascunho.servicoId ?? null,
  );
  const [profId, setProfId] = useState<string | null>(rascunho.profId ?? null);
  const [dia, setDia] = useState<string | null>(rascunho.dia ?? null);
  const [horarios, setHorarios] = useState<Horario[] | null>(horariosIniciais);
  const [horario, setHorario] = useState<Horario | null>(
    horariosIniciais?.find((h) => h.inicio === rascunho.horario) ?? null,
  );
  const [nome, setNome] = useState(rascunho.nome ?? "");
  const [telefone, setTelefone] = useState(
    mascaraTelefone(rascunho.telefone ?? ""),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [carregando, iniciar] = useTransition();
  const ultimaBusca = useRef("");

  const servico = servicos.find((s) => s.id === servicoId) ?? null;
  const prof = profissionais.find((p) => p.id === profId) ?? null;
  const profsDoServico = servico
    ? profissionais.filter((p) => servico.profissionais.includes(p.id))
    : [];
  // Faixa com 14 dias; se a cliente escolheu uma data mais longe pelo
  // calendário, a faixa cresce até ela (e mais alguns dias de vizinhos)
  const diasAteEscolhido = dia ? diferencaDias(hoje, dia) + 1 : 0;
  const dias = proximosDias(
    hoje,
    Math.min(DIAS_CALENDARIO, Math.max(TOTAL_DIAS, diasAteEscolhido + 4)),
  );

  // Grava no cookie o estado atual + o que acabou de mudar
  function gravar(mudancas: Rascunho) {
    salvarRascunho(slug, {
      servicoId,
      profId,
      dia,
      horario: horario?.inicio ?? null,
      nome,
      telefone,
      ...mudancas,
    });
  }

  // Trocar de serviço zera "Com quem?": a cliente sempre escolhe a profissional
  // (antes, se só uma fazia o serviço, ela era marcada sozinha e parecia que a
  // seleção "pulava" de uma para outra.)
  function escolherServico(id: string) {
    if (id === servicoId) return;
    gravar({ servicoId: id, profId: null, dia: null, horario: null });
    setServicoId(id);
    setProfId(null);
    setDia(null);
    setHorarios(null);
    setHorario(null);
    setErro(null);
  }

  function escolherProf(id: string) {
    gravar({ profId: id, dia: null, horario: null });
    setProfId(id);
    setDia(null);
    setHorarios(null);
    setHorario(null);
    setErro(null);
  }

  function carregarHorarios(novoDia: string) {
    if (!servicoId || !profId) return;
    const chave = `${profId}|${servicoId}|${novoDia}`;
    ultimaBusca.current = chave;
    gravar({ dia: novoDia, horario: null });
    setDia(novoDia);
    setHorario(null);
    setHorarios(null);
    setErro(null);
    iniciar(async () => {
      const r = await buscarHorarios(profId, servicoId, novoDia);
      if (ultimaBusca.current !== chave) return; // a cliente já trocou de dia
      if ("erro" in r) setErro(r.erro);
      else setHorarios(r.horarios);
    });
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!servicoId || !profId || !horario || !dia) return;
    setErro(null);
    iniciar(async () => {
      const r = await marcarHorario({
        profissionalId: profId,
        servicoId,
        inicio: horario.inicio,
        nome,
        telefone,
      });
      if ("erro" in r) {
        setErro(r.erro);
        if (r.erro.includes("horário")) carregarHorarios(dia); // atualiza a lista se alguém pegou o horário
        return;
      }
      apagarRascunho(slug); // reservou: não precisa mais lembrar
      setResultado({
        inicio: horario.inicio,
        fim: r.fim,
        sinalCentavos: r.sinalCentavos,
        codigo: r.codigo,
      });
    });
  }

  // ---------- Tela de sucesso ----------
  if (resultado && servico && prof) {
    return (
      <div className="space-y-5">
        <Cabecalho nome={salao.nome} />
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-rose-100">
          <p className="text-3xl">🎉</p>
          <h2 className="mt-2 text-xl font-semibold text-stone-800">
            Horário reservado!
          </h2>
          <p className="mt-3 text-stone-600">
            <strong>{servico.nome}</strong> com <strong>{prof.nome}</strong>
            <br />
            {dataLonga(resultado.inicio)}, das {hora(resultado.inicio)} às{" "}
            {hora(resultado.fim)}
          </p>
          <PagamentoPix
            salao={salao}
            sinalCentavos={resultado.sinalCentavos}
            codigo={resultado.codigo}
            nomeCliente={nome}
            resumo={`${servico.nome} com ${prof.nome}, ${dataLonga(resultado.inicio)}, às ${hora(resultado.inicio)}`}
          />
        </div>
        <button
          onClick={() => {
            setResultado(null);
            setServicoId(null);
            setProfId(null);
            setDia(null);
            setHorarios(null);
            setHorario(null);
          }}
          className="w-full rounded-xl py-3 text-rose-700 underline-offset-4 hover:underline"
        >
          Marcar outro horário
        </button>
      </div>
    );
  }

  // ---------- Tela de marcação ----------
  return (
    <div className="space-y-6">
      <Cabecalho nome={salao.nome} />

      <Etapa numero={1} titulo="Escolha o serviço">
        <div className="grid gap-2">
          {servicos.map((s) => (
            <button
              key={s.id}
              onClick={() => escolherServico(s.id)}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-left ring-1 transition ${
                s.id === servicoId
                  ? "cursor-default bg-rose-600 text-white ring-rose-600"
                  : "bg-white text-stone-800 ring-rose-100 hover:ring-rose-300"
              }`}
            >
              <span>
                <span className="block font-medium">{s.nome}</span>
                <span
                  className={`text-sm ${s.id === servicoId ? "text-rose-100" : "text-stone-500"}`}
                >
                  {duracao(s.duracao_minutos)}
                </span>
              </span>
              <span className="font-semibold">{reais(s.preco_centavos)}</span>
            </button>
          ))}
        </div>
      </Etapa>

      {servico && (
        <Etapa numero={2} titulo="Com quem?">
          <div className="flex flex-wrap gap-2">
            {profsDoServico.map((p) => (
              <Pilula
                key={p.id}
                ativo={p.id === profId}
                onClick={() => escolherProf(p.id)}
              >
                {p.nome}
              </Pilula>
            ))}
          </div>
        </Etapa>
      )}

      {servico && prof && (
        <Etapa numero={3} titulo="Qual dia?">
          <SeletorDias
            dias={dias}
            hoje={hoje}
            maxDias={DIAS_CALENDARIO}
            diasQueAtende={prof.dias}
            selecionado={dia}
            onEscolher={carregarHorarios}
          />
        </Etapa>
      )}

      {servico && prof && dia && (
        <Etapa numero={4} titulo="Qual horário?">
          {carregando && !horarios && (
            <p className="text-stone-500">Buscando horários...</p>
          )}
          {horarios && horarios.length === 0 && (
            <p className="text-stone-500">
              Nenhum horário livre nesse dia. Tente outro dia.
            </p>
          )}
          {horarios && horarios.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {horarios.map((h) => (
                <Pilula
                  key={h.inicio}
                  ativo={h.inicio === horario?.inicio}
                  onClick={() => {
                    setHorario(h);
                    gravar({ horario: h.inicio });
                  }}
                >
                  {hora(h.inicio)}
                </Pilula>
              ))}
            </div>
          )}
        </Etapa>
      )}

      {servico && prof && horario && (
        <Etapa numero={5} titulo="Seus dados">
          <form onSubmit={confirmar} className="space-y-3">
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                gravar({ nome: e.target.value });
              }}
              placeholder="Seu nome"
              autoComplete="name"
              maxLength={80}
              required
              className="w-full rounded-xl bg-white px-4 py-3 text-stone-800 ring-1 ring-rose-100 outline-none placeholder:text-stone-400 focus:ring-rose-400"
            />
            <input
              value={telefone}
              onChange={(e) => {
                const comMascara = mascaraTelefone(e.target.value);
                setTelefone(comMascara);
                gravar({ telefone: comMascara });
              }}
              placeholder="WhatsApp com DDD: (11) 99999-9999"
              autoComplete="tel-national"
              inputMode="numeric"
              maxLength={15}
              pattern="\(\d{2}\) \d{4,5}-\d{4}"
              title="Digite o DDD e o número, ex.: (11) 99999-9999"
              required
              className="w-full rounded-xl bg-white px-4 py-3 text-stone-800 ring-1 ring-rose-100 outline-none placeholder:text-stone-400 focus:ring-rose-400"
            />
            <div className="rounded-xl bg-white p-4 text-sm text-stone-600 ring-1 ring-rose-100">
              <strong className="text-stone-800">{servico.nome}</strong> com{" "}
              {prof.nome}
              <br />
              {dataLonga(horario.inicio)}, das {hora(horario.inicio)} às{" "}
              {hora(horario.fim)}
              <br />
              Sinal para reservar:{" "}
              <strong>{reais(salao.sinal_valor_centavos)}</strong> (descontado
              do serviço)
            </div>
            <div className="rounded-xl bg-rose-50 p-4 text-sm text-stone-700 ring-1 ring-rose-100">
              <p className="font-semibold text-stone-800">Regras do sinal</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>O horário só fica confirmado depois do Pix do sinal.</li>
                <li>O sinal é descontado do valor do serviço no dia.</li>
                <li>Se o salão cancelar, o sinal é devolvido.</li>
                <li>Para remarcar, avise com até 2 dias de antecedência.</li>
                <li>
                  Se faltar ou avisar em cima da hora, o sinal não é devolvido.
                </li>
              </ul>
            </div>
            <p className="text-xs text-stone-500">
              Seu nome e WhatsApp são usados só para este agendamento e para o
              salão falar com você sobre ele. Ao reservar, você concorda com as
              regras acima.
            </p>
            <button
              type="submit"
              disabled={carregando}
              className="w-full rounded-xl bg-rose-600 py-3 font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {carregando ? "Reservando..." : "Reservar horário"}
            </button>
          </form>
        </Etapa>
      )}

      {erro && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {erro}
        </p>
      )}
    </div>
  );
}

// O nome do salão já aparece na capa, logo acima
function Cabecalho({ nome }: { nome: string }) {
  return (
    <header className="text-center">
      <h2 className="text-2xl font-semibold text-rose-700">
        Agende seu horário
      </h2>
      <p className="text-stone-500">{nome}</p>
    </header>
  );
}

function Etapa({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-medium text-stone-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-sm text-rose-700">
          {numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Pilula({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 ring-1 transition ${
        ativo
          ? "cursor-default bg-rose-600 text-white ring-rose-600"
          : "bg-white text-stone-800 ring-rose-100 hover:ring-rose-300"
      }`}
    >
      {children}
    </button>
  );
}

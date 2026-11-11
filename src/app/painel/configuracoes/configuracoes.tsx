"use client";

import { useState } from "react";
import { Girando } from "../ui";
import {
  botaoPrincipal,
  botaoSecundario,
  campo,
  Cartao,
  Erro,
  useConfirmar,
} from "./comum";
import Folgas from "./folgas";
import Pagina, { type PaginaConfig } from "./pagina";
import {
  salvarExpediente,
  salvarProfissional,
  salvarServico,
  type Turno,
} from "./actions";

export type ProfConfig = {
  id: string;
  nome: string;
  ativo: boolean;
  horarios_funcionamento: Turno[];
};
export type ServicoConfig = {
  id: string;
  nome: string;
  preco_centavos: number;
  duracao_minutos: number;
  ativo: boolean;
  profissionais: string[];
};
export type FolgaConfig = {
  id: string;
  profissional_id: string;
  inicio: string;
  fim: string;
  motivo: string | null;
};

const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
const reais = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// "45", "45,00", "45.5", "R$ 1.200,00" → centavos (null se inválido)
function lerPreco(texto: string): number | null {
  let t = texto.replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export default function Configuracoes({
  profissionais,
  servicos,
  folgas,
  fuso,
  hoje,
  pagina,
}: {
  profissionais: ProfConfig[];
  servicos: ServicoConfig[];
  folgas: FolgaConfig[];
  fuso: string;
  hoje: string;
  pagina: PaginaConfig;
}) {
  const [aba, setAba] = useState<
    "atendentes" | "servicos" | "expediente" | "folgas" | "pagina"
  >("atendentes");
  const abas = [
    ["atendentes", "Atendentes"],
    ["servicos", "Serviços"],
    ["expediente", "Expediente"],
    ["folgas", "Folgas"],
    ["pagina", "Página"],
  ] as const;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-rose-100"
      >
        {abas.map(([id, texto]) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`flex-1 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-medium ${
              aba === id
                ? "cursor-default bg-rose-600 text-white"
                : "text-stone-600 hover:bg-rose-50"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      {aba === "atendentes" && <Atendentes profissionais={profissionais} />}
      {aba === "servicos" && (
        <Servicos servicos={servicos} profissionais={profissionais} />
      )}
      {aba === "expediente" && <Expediente profissionais={profissionais} />}
      {aba === "pagina" && <Pagina pagina={pagina} />}
      {aba === "folgas" && (
        <Folgas
          folgas={folgas}
          profissionais={profissionais}
          fuso={fuso}
          hoje={hoje}
        />
      )}
    </div>
  );
}

function Selo({ ativo }: { ativo: boolean }) {
  return ativo ? null : (
    <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
      Desativada
    </span>
  );
}

// ---------- Atendentes ----------

function Atendentes({ profissionais }: { profissionais: ProfConfig[] }) {
  const [novo, setNovo] = useState("");
  const c = useConfirmar(() => setNovo(""));

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Quem atende no salão. Desativar tira a pessoa da página das clientes,
        mas mantém as reservas antigas.
      </p>
      {profissionais.map((p) => (
        <LinhaAtendente key={`${p.id}-${p.nome}-${p.ativo}`} p={p} />
      ))}
      <Cartao>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const nome = novo.trim();
            if (nome.length < 2)
              return c.setErro("Escreva o nome da atendente.");
            c.pedir({
              titulo: "Adicionar atendente?",
              mensagem: `${nome} vai aparecer na página das clientes depois que você marcar os serviços e o expediente dela.`,
              botaoOk: "Adicionar",
              executar: () => salvarProfissional({ nome, ativo: true }),
            });
          }}
        >
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            maxLength={60}
            placeholder="Nome da nova atendente"
            className={campo}
          />
          <button className={botaoPrincipal} disabled={c.salvando}>
            {c.salvando && <Girando />} Adicionar
          </button>
        </form>
        <Erro texto={c.erro} />
      </Cartao>
      {c.modal}
    </div>
  );
}

function LinhaAtendente({ p }: { p: ProfConfig }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(p.nome);
  const c = useConfirmar(() => setEditando(false));

  return (
    <Cartao apagado={!p.ativo}>
      {editando ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            c.pedir({
              titulo: "Salvar o nome?",
              mensagem: `"${p.nome}" passa a se chamar "${nome.trim()}" no painel e na página das clientes.`,
              botaoOk: "Salvar",
              executar: () =>
                salvarProfissional({ id: p.id, nome, ativo: p.ativo }),
            });
          }}
        >
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={60}
            className={`${campo} flex-1`}
            autoFocus
          />
          <button className={botaoPrincipal} disabled={c.salvando}>
            {c.salvando && <Girando />} Salvar
          </button>
          <button
            type="button"
            className={botaoSecundario}
            onClick={() => {
              setEditando(false);
              setNome(p.nome);
            }}
          >
            Voltar
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-stone-800">
            {p.nome}
            <Selo ativo={p.ativo} />
          </p>
          <div className="flex gap-2">
            {c.salvando && <Girando className="h-5 w-5 text-rose-600" />}
            <button
              className={botaoSecundario}
              onClick={() => setEditando(true)}
            >
              Editar nome
            </button>
            <button
              className={botaoSecundario}
              onClick={() =>
                c.pedir(
                  p.ativo
                    ? {
                        titulo: `Desativar ${p.nome}?`,
                        mensagem:
                          "Ela some da página das clientes e ninguém consegue marcar com ela. As reservas já feitas continuam no painel.",
                        botaoOk: "Desativar",
                        perigo: true,
                        executar: () =>
                          salvarProfissional({
                            id: p.id,
                            nome: p.nome,
                            ativo: false,
                          }),
                      }
                    : {
                        titulo: `Reativar ${p.nome}?`,
                        mensagem:
                          "Ela volta a aparecer na página das clientes, com os serviços e o expediente que já tinha.",
                        botaoOk: "Reativar",
                        executar: () =>
                          salvarProfissional({
                            id: p.id,
                            nome: p.nome,
                            ativo: true,
                          }),
                      },
                )
              }
            >
              {p.ativo ? "Desativar" : "Reativar"}
            </button>
          </div>
        </div>
      )}
      <Erro texto={c.erro} />
      {c.modal}
    </Cartao>
  );
}

// ---------- Serviços ----------

function Servicos({
  servicos,
  profissionais,
}: {
  servicos: ServicoConfig[];
  profissionais: ProfConfig[];
}) {
  const [criando, setCriando] = useState(false);
  const nomes = new Map(profissionais.map((p) => [p.id, p.nome]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Um serviço só aparece para as clientes se estiver ativo e tiver pelo
        menos uma atendente ativa marcada.
      </p>
      {servicos.map((s) => (
        <LinhaServico
          key={JSON.stringify(s)}
          s={s}
          profissionais={profissionais}
          nomes={nomes}
        />
      ))}
      {criando ? (
        <Cartao>
          <FormServico
            profissionais={profissionais}
            onFechar={() => setCriando(false)}
          />
        </Cartao>
      ) : (
        <button className={botaoPrincipal} onClick={() => setCriando(true)}>
          + Novo serviço
        </button>
      )}
    </div>
  );
}

function LinhaServico({
  s,
  profissionais,
  nomes,
}: {
  s: ServicoConfig;
  profissionais: ProfConfig[];
  nomes: Map<string, string>;
}) {
  const [editando, setEditando] = useState(false);
  const c = useConfirmar();
  const quem = s.profissionais.map((id) => nomes.get(id)).filter(Boolean);

  if (editando) {
    return (
      <Cartao>
        <FormServico
          s={s}
          profissionais={profissionais}
          onFechar={() => setEditando(false)}
        />
      </Cartao>
    );
  }

  return (
    <Cartao apagado={!s.ativo}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-stone-800">
            {s.nome}
            {!s.ativo && (
              <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                Desativado
              </span>
            )}
          </p>
          <p className="text-sm text-stone-600">
            {reais(s.preco_centavos)} · {s.duracao_minutos} min
          </p>
          <p className="text-sm text-stone-500">
            {quem.length
              ? `Com: ${quem.join(", ")}`
              : "Ninguém marcado: não aparece para as clientes"}
          </p>
        </div>
        <div className="flex gap-2">
          {c.salvando && <Girando className="h-5 w-5 text-rose-600" />}
          <button className={botaoSecundario} onClick={() => setEditando(true)}>
            Editar
          </button>
          <button
            className={botaoSecundario}
            onClick={() =>
              c.pedir({
                titulo: `${s.ativo ? "Desativar" : "Reativar"} "${s.nome}"?`,
                mensagem: s.ativo
                  ? "O serviço some da página das clientes. As reservas já feitas continuam no painel."
                  : "O serviço volta a aparecer na página das clientes.",
                botaoOk: s.ativo ? "Desativar" : "Reativar",
                perigo: s.ativo,
                executar: () => salvarServico({ ...s, ativo: !s.ativo }),
              })
            }
          >
            {s.ativo ? "Desativar" : "Reativar"}
          </button>
        </div>
      </div>
      <Erro texto={c.erro} />
      {c.modal}
    </Cartao>
  );
}

function FormServico({
  s,
  profissionais,
  onFechar,
}: {
  s?: ServicoConfig;
  profissionais: ProfConfig[];
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(s?.nome ?? "");
  const [preco, setPreco] = useState(
    s ? (s.preco_centavos / 100).toFixed(2).replace(".", ",") : "",
  );
  const [duracao, setDuracao] = useState(String(s?.duracao_minutos ?? 60));
  const [quem, setQuem] = useState<string[]>(
    s?.profissionais ?? profissionais.filter((p) => p.ativo).map((p) => p.id),
  );
  const c = useConfirmar(onFechar);

  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const centavos = lerPreco(preco);
          const minutos = Number(duracao);
          if (nome.trim().length < 2)
            return c.setErro("Escreva o nome do serviço.");
          if (centavos === null)
            return c.setErro("Preço inválido. Exemplo: 45,00");
          if (
            !Number.isInteger(minutos) ||
            minutos < 5 ||
            minutos > 600 ||
            minutos % 5
          ) {
            return c.setErro(
              "A duração precisa ser de 5 a 600 minutos, de 5 em 5.",
            );
          }
          const nomesQuem = profissionais
            .filter((p) => quem.includes(p.id))
            .map((p) => p.nome);
          c.pedir({
            titulo: s ? "Salvar o serviço?" : "Criar o serviço?",
            mensagem:
              `${nome.trim()} · ${reais(centavos)} · ${minutos} min · ` +
              (nomesQuem.length
                ? `com ${nomesQuem.join(", ")}.`
                : "sem ninguém marcado (não aparece para as clientes).") +
              (s ? " Reservas já feitas não mudam." : ""),
            botaoOk: s ? "Salvar" : "Criar",
            executar: () =>
              salvarServico({
                id: s?.id,
                nome,
                preco_centavos: centavos,
                duracao_minutos: minutos,
                ativo: s?.ativo ?? true,
                profissionais: quem,
              }),
          });
        }}
      >
        <label className="block text-sm text-stone-600">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            className={campo}
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-stone-600">
            Preço (R$)
            <input
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              inputMode="decimal"
              placeholder="45,00"
              className={campo}
            />
          </label>
          <label className="block text-sm text-stone-600">
            Duração (min)
            <input
              type="number"
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              min={5}
              max={600}
              step={5}
              className={campo}
            />
          </label>
        </div>
        <fieldset>
          <legend className="text-sm text-stone-600">Quem faz</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {profissionais.map((p) => {
              const marcado = quem.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ring-1 ${
                    marcado
                      ? "bg-rose-50 text-rose-800 ring-rose-300"
                      : "bg-white text-stone-600 ring-stone-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      setQuem(
                        marcado
                          ? quem.filter((q) => q !== p.id)
                          : [...quem, p.id],
                      )
                    }
                    className="accent-rose-600"
                  />
                  {p.nome}
                  {!p.ativo && " (desativada)"}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button className={botaoPrincipal} disabled={c.salvando}>
            {c.salvando && <Girando />} {s ? "Salvar" : "Criar serviço"}
          </button>
          <button type="button" className={botaoSecundario} onClick={onFechar}>
            Voltar
          </button>
        </div>
        <Erro texto={c.erro} />
      </form>
      {c.modal}
    </>
  );
}

// ---------- Expediente ----------

function Expediente({ profissionais }: { profissionais: ProfConfig[] }) {
  const [escolhida, setEscolhida] = useState(profissionais[0]?.id ?? null);
  const p = profissionais.find((x) => x.id === escolhida);

  if (!profissionais.length) {
    return (
      <p className="text-sm text-stone-500">
        Cadastre uma atendente primeiro, na aba Atendentes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Os dias e horários em que cada atendente recebe clientes.
      </p>
      <div className="flex flex-wrap gap-2">
        {profissionais.map((x) => (
          <button
            key={x.id}
            onClick={() => setEscolhida(x.id)}
            className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
              x.id === escolhida
                ? "cursor-default bg-rose-600 text-white ring-rose-600"
                : "bg-white text-stone-700 ring-stone-200 hover:bg-rose-50"
            }`}
          >
            {x.nome}
            {!x.ativo && " (desativada)"}
          </button>
        ))}
      </div>
      {/* key: recomeça o formulário ao trocar de atendente ou depois de salvar */}
      {p && (
        <FormExpediente
          key={`${p.id}-${JSON.stringify(p.horarios_funcionamento)}`}
          p={p}
          outras={profissionais.filter((x) => x.id !== p.id && x.ativo)}
        />
      )}
    </div>
  );
}

type LinhaDia = { atende: boolean; inicio: string; fim: string };

function FormExpediente({
  p,
  outras,
}: {
  p: ProfConfig;
  outras: ProfConfig[];
}) {
  // Copiar o mesmo expediente para outras atendentes (ex.: o salão todo abre às 10h)
  const [tambem, setTambem] = useState<string[]>([]);
  const [dias, setDias] = useState<LinhaDia[]>(() =>
    DIAS.map((_, d) => {
      // Um horário por dia (o salão não tem almoço fixo). Se houver mais de um, junta do primeiro início ao último fim.
      const doDia = p.horarios_funcionamento.filter((h) => h.dia_semana === d);
      if (!doDia.length)
        return { atende: false, inicio: "09:00", fim: "18:00" };
      return {
        atende: true,
        inicio: doDia.map((h) => h.inicio).sort()[0],
        fim: doDia
          .map((h) => h.fim)
          .sort()
          .at(-1)!,
      };
    }),
  );
  const c = useConfirmar();
  const mudar = (d: number, parte: Partial<LinhaDia>) =>
    setDias(dias.map((l, i) => (i === d ? { ...l, ...parte } : l)));
  const primeiro = dias.findIndex((l) => l.atende);

  return (
    <Cartao apagado={!p.ativo}>
      <h2 className="mb-2 font-medium text-stone-800">
        Expediente de {p.nome}
      </h2>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const turnos = dias.flatMap((l, d) =>
            l.atende ? [{ dia_semana: d, inicio: l.inicio, fim: l.fim }] : [],
          );
          const ruim = turnos.find(
            (t) => !t.inicio || !t.fim || t.fim <= t.inicio,
          );
          if (ruim)
            return c.setErro(
              `${DIAS[ruim.dia_semana]}: o fim precisa ser depois do início.`,
            );
          c.pedir({
            titulo: `Salvar o expediente de ${[p.nome, ...outras.filter((o) => tambem.includes(o.id)).map((o) => o.nome)].join(" e ")}?`,
            mensagem: turnos.length
              ? turnos
                  .map((t) => `${DIAS[t.dia_semana]} ${t.inicio} às ${t.fim}`)
                  .join(" · ") +
                ". Os horários livres da página mudam na hora. Reservas já feitas não mudam."
              : "Nenhum dia marcado: ninguém consegue marcar com ela. Reservas já feitas não mudam.",
            botaoOk: "Salvar",
            perigo: !turnos.length,
            executar: async () => {
              for (const id of [p.id, ...tambem]) {
                const r = await salvarExpediente(id, turnos);
                if (r.erro) return r;
              }
              return { erro: null };
            },
          });
        }}
      >
        {dias.map((l, d) => (
          <div key={d} className="flex flex-wrap items-center gap-3">
            <label className="flex w-28 items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={l.atende}
                onChange={() => mudar(d, { atende: !l.atende })}
                className="accent-rose-600"
              />
              {DIAS[d]}
            </label>
            {l.atende ? (
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="time"
                  value={l.inicio}
                  step={900}
                  onChange={(e) => mudar(d, { inicio: e.target.value })}
                  className={`${campo} w-28`}
                  aria-label={`${DIAS[d]}: início`}
                />
                às
                <input
                  type="time"
                  value={l.fim}
                  step={900}
                  onChange={(e) => mudar(d, { fim: e.target.value })}
                  className={`${campo} w-28`}
                  aria-label={`${DIAS[d]}: fim`}
                />
              </div>
            ) : (
              <span className="text-sm text-stone-400">Não atende</span>
            )}
          </div>
        ))}
        {outras.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 text-sm text-stone-600">
            Salvar igual também para:
            {outras.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-1.5 rounded-xl px-2.5 py-1 ring-1 ring-stone-200"
              >
                <input
                  type="checkbox"
                  checked={tambem.includes(o.id)}
                  onChange={() =>
                    setTambem(
                      tambem.includes(o.id)
                        ? tambem.filter((t) => t !== o.id)
                        : [...tambem, o.id],
                    )
                  }
                  className="accent-rose-600"
                />
                {o.nome}
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <button className={botaoPrincipal} disabled={c.salvando}>
            {c.salvando && <Girando />} Salvar expediente
          </button>
          {primeiro >= 0 && (
            <button
              type="button"
              className={botaoSecundario}
              onClick={() =>
                setDias(
                  dias.map((l) =>
                    l.atende
                      ? {
                          ...l,
                          inicio: dias[primeiro].inicio,
                          fim: dias[primeiro].fim,
                        }
                      : l,
                  ),
                )
              }
            >
              Usar o horário de {DIAS[primeiro].toLowerCase()} em todos os dias
              marcados
            </button>
          )}
        </div>
        <Erro texto={c.erro} />
      </form>
      {c.modal}
    </Cartao>
  );
}

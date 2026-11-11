"use client";

// Aba "Folgas": dias ou horários em que uma atendente não atende.
// O banco já respeita os bloqueios (somem dos horários livres e não dá para marcar neles).

import { useState } from "react";
import { Girando } from "../ui";
import { criarFolga, removerFolga } from "./actions";
import {
  botaoPrincipal,
  botaoSecundario,
  campo,
  Cartao,
  Erro,
  useConfirmar,
} from "./comum";
import type { FolgaConfig, ProfConfig } from "./configuracoes";

const diaCurto = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

export default function Folgas({
  folgas,
  profissionais,
  fuso,
  hoje,
}: {
  folgas: FolgaConfig[];
  profissionais: ProfConfig[];
  fuso: string;
  hoje: string;
}) {
  const ativas = profissionais.filter((p) => p.ativo);
  const nomes = new Map(profissionais.map((p) => [p.id, p.nome]));
  const [quem, setQuem] = useState<string[]>(ativas[0] ? [ativas[0].id] : []);
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [inicio, setInicio] = useState("12:00");
  const [fim, setFim] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const c = useConfirmar(() => setMotivo(""));

  // Como mostrar cada folga: "sáb., 08/11 · dia inteiro", "08/11 a 15/11 · dias inteiros" ou "sáb., 08/11 · 12:00 às 13:00"
  const formatar = (iso: string, opcoes: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: fuso, ...opcoes });
  const dia = (iso: string) =>
    formatar(iso, { weekday: "short", day: "2-digit", month: "2-digit" });
  const hora = (iso: string) =>
    formatar(iso, { hour: "2-digit", minute: "2-digit" });
  const descrever = (f: FolgaConfig) => {
    if (hora(f.inicio) === "00:00" && hora(f.fim) === "00:00") {
      const ultimo = new Date(new Date(f.fim).getTime() - 1).toISOString();
      return dia(f.inicio) === dia(ultimo)
        ? `${dia(f.inicio)} · dia inteiro`
        : `${dia(f.inicio)} a ${dia(ultimo)} · dias inteiros`;
    }
    return `${dia(f.inicio)} · ${hora(f.inicio)} às ${hora(f.fim)}`;
  };

  if (!ativas.length) {
    return (
      <p className="text-sm text-stone-500">
        Cadastre uma atendente primeiro, na aba Atendentes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Dias ou horários em que a atendente não atende (folga, feriado, médico,
        almoço). Esses horários somem da página das clientes.
      </p>

      <Cartao>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setAviso(null);
            const ateFinal = diaInteiro ? ate : de;
            if (!quem.length)
              return c.setErro("Escolha pelo menos uma atendente.");
            if (!de || !ateFinal || ateFinal < de) {
              return c.setErro(
                "A data final precisa ser igual ou depois da inicial.",
              );
            }
            if (de < hoje)
              return c.setErro("Escolha uma data de hoje em diante.");
            if (!diaInteiro && (!inicio || !fim || fim <= inicio)) {
              return c.setErro("O fim precisa ser depois do início.");
            }
            const nomesQuem = ativas
              .filter((p) => quem.includes(p.id))
              .map((p) => p.nome);
            const quando = diaInteiro
              ? de === ateFinal
                ? `no dia ${diaCurto(de)} inteiro`
                : `de ${diaCurto(de)} a ${diaCurto(ateFinal)}, dias inteiros`
              : `no dia ${diaCurto(de)}, das ${inicio} às ${fim}`;
            const porque = motivo.trim() ? ` (${motivo.trim()})` : "";
            c.pedir({
              titulo: "Marcar folga?",
              mensagem: `${nomesQuem.join(" e ")} não ${nomesQuem.length > 1 ? "atendem" : "atende"} ${quando}${porque}. Esses horários somem da página das clientes.`,
              botaoOk: "Marcar folga",
              executar: async () => {
                const r = await criarFolga({
                  profissionais: quem,
                  de,
                  ate: ateFinal,
                  diaInteiro,
                  inicio: diaInteiro ? undefined : inicio,
                  fim: diaInteiro ? undefined : fim,
                  motivo,
                });
                setAviso(r.aviso ?? null);
                return r;
              },
            });
          }}
        >
          <fieldset>
            <legend className="text-sm text-stone-600">Quem</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {ativas.map((p) => {
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
                  </label>
                );
              })}
              {ativas.length > 1 && (
                <button
                  type="button"
                  className={botaoSecundario}
                  onClick={() => setQuem(ativas.map((p) => p.id))}
                >
                  Todas (salão fechado)
                </button>
              )}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={diaInteiro}
              onChange={() => setDiaInteiro(!diaInteiro)}
              className="accent-rose-600"
            />
            Dia inteiro
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-stone-600">
              {diaInteiro ? "De" : "Dia"}
              <input
                type="date"
                value={de}
                min={hoje}
                onChange={(e) => {
                  setDe(e.target.value);
                  if (ate < e.target.value) setAte(e.target.value);
                }}
                className={campo}
              />
            </label>
            {diaInteiro ? (
              <label className="block text-sm text-stone-600">
                Até
                <input
                  type="date"
                  value={ate}
                  min={de}
                  onChange={(e) => setAte(e.target.value)}
                  className={campo}
                />
              </label>
            ) : (
              <div className="flex items-end gap-2 text-sm text-stone-600">
                <label className="block flex-1">
                  Das
                  <input
                    type="time"
                    value={inicio}
                    step={900}
                    onChange={(e) => setInicio(e.target.value)}
                    className={campo}
                  />
                </label>
                <label className="block flex-1">
                  Às
                  <input
                    type="time"
                    value={fim}
                    step={900}
                    onChange={(e) => setFim(e.target.value)}
                    className={campo}
                  />
                </label>
              </div>
            )}
          </div>

          <label className="block text-sm text-stone-600">
            Motivo (opcional, só você vê)
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={80}
              placeholder="Folga, feriado, médico..."
              className={campo}
            />
          </label>

          <button className={botaoPrincipal} disabled={c.salvando}>
            {c.salvando && <Girando />} Marcar folga
          </button>
          <Erro texto={c.erro} />
          {aviso && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
              {aviso}
            </p>
          )}
        </form>
      </Cartao>
      {c.modal}

      <h2 className="pt-2 text-sm font-semibold text-stone-700">
        Próximas folgas
      </h2>
      {folgas.length ? (
        folgas.map((f) => (
          <LinhaFolga
            key={f.id}
            f={f}
            nome={nomes.get(f.profissional_id) ?? "Atendente"}
            descricao={descrever(f)}
          />
        ))
      ) : (
        <p className="text-sm text-stone-500">Nenhuma folga marcada.</p>
      )}
    </div>
  );
}

function LinhaFolga({
  f,
  nome,
  descricao,
}: {
  f: FolgaConfig;
  nome: string;
  descricao: string;
}) {
  const c = useConfirmar();
  return (
    <Cartao>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-stone-800">{nome}</p>
          <p className="text-sm text-stone-600">
            {descricao}
            {f.motivo && ` · ${f.motivo}`}
          </p>
        </div>
        <div className="flex gap-2">
          {c.salvando && <Girando className="h-5 w-5 text-rose-600" />}
          <button
            className={botaoSecundario}
            onClick={() =>
              c.pedir({
                titulo: "Tirar esta folga?",
                mensagem: `${nome} · ${descricao}. Os horários voltam a aparecer livres para as clientes.`,
                botaoOk: "Tirar folga",
                perigo: true,
                executar: () => removerFolga(f.id),
              })
            }
          >
            Tirar folga
          </button>
        </div>
      </div>
      <Erro texto={c.erro} />
      {c.modal}
    </Cartao>
  );
}

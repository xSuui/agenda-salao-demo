"use client";

import { useTransition } from "react";
import { Girando } from "../ui";
import {
  botaoPrincipal,
  botaoSecundario,
  Cartao,
  Erro,
  useConfirmar,
} from "../configuracoes/comum";
import { abrirSalao, mudarNoAr } from "./actions";

export type SalaoAdmin = {
  id: string;
  nome: string;
  slug: string;
  no_ar: boolean;
  dono_id: string | null;
  criado_em: string;
};

export default function ListaSaloes({
  saloes,
  escolhido,
  meuId,
}: {
  saloes: SalaoAdmin[];
  escolhido: string | null;
  meuId: string;
}) {
  if (!saloes.length)
    return <p className="text-sm text-stone-500">Nenhum salão cadastrado.</p>;
  return (
    <div className="space-y-3">
      {saloes.map((s) => (
        <LinhaSalao
          key={`${s.id}-${s.no_ar}`}
          s={s}
          aberto={s.id === escolhido}
          meuId={meuId}
        />
      ))}
    </div>
  );
}

function LinhaSalao({
  s,
  aberto,
  meuId,
}: {
  s: SalaoAdmin;
  aberto: boolean;
  meuId: string;
}) {
  const c = useConfirmar();
  const [abrindo, iniciar] = useTransition();
  const dona = !s.dono_id
    ? "Sem dona ligada"
    : s.dono_id === meuId
      ? "Dona: você (teste)"
      : "Dona ligada";

  return (
    <Cartao apagado={!s.no_ar}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-stone-800">
            {s.nome}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                s.no_ar
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {s.no_ar ? "No ar" : "Suspenso"}
            </span>
            {aberto && (
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                Aberto no painel
              </span>
            )}
          </p>
          <p className="text-sm text-stone-500">
            <a
              href={`/${s.slug}`}
              target="_blank"
              className="text-rose-700 underline"
            >
              /{s.slug}
            </a>{" "}
            · {dona}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(c.salvando || abrindo) && (
            <Girando className="h-5 w-5 text-rose-600" />
          )}
          {!aberto && (
            <button
              className={botaoPrincipal}
              disabled={abrindo}
              onClick={() => iniciar(() => abrirSalao(s.id))}
            >
              Abrir no painel
            </button>
          )}
          <button
            className={botaoSecundario}
            onClick={() =>
              c.pedir(
                s.no_ar
                  ? {
                      titulo: `Suspender ${s.nome}?`,
                      mensagem:
                        'A página das clientes passa a mostrar "indisponível" e ninguém consegue marcar. Nada é apagado: reservas, clientes e configurações continuam guardadas. A dona ainda entra no painel.',
                      botaoOk: "Suspender",
                      perigo: true,
                      executar: () => mudarNoAr(s.id, false),
                    }
                  : {
                      titulo: `Pôr ${s.nome} no ar de novo?`,
                      mensagem:
                        "A página volta a funcionar e as clientes voltam a marcar horário.",
                      botaoOk: "Pôr no ar",
                      executar: () => mudarNoAr(s.id, true),
                    },
              )
            }
          >
            {s.no_ar ? "Suspender" : "Pôr no ar"}
          </button>
        </div>
      </div>
      <Erro texto={c.erro} />
      {c.modal}
    </Cartao>
  );
}

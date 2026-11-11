"use client";

// Peças usadas por todas as abas das configurações.

import { useState, useTransition, type ReactNode } from "react";
import { Modal } from "../ui";

export const campo =
  "w-full rounded-xl bg-white px-3 py-2 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-400";
export const botaoPrincipal =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60";
export const botaoSecundario =
  "rounded-xl px-3 py-1.5 text-sm text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50";

// Toda gravação passa por um modal de confirmação (como nas reservas)
type Pedido = {
  titulo: string;
  mensagem: string;
  botaoOk: string;
  perigo?: boolean;
  executar: () => Promise<{ erro: string | null }>;
};

export function useConfirmar(depois?: () => void) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const modal = pedido && (
    <Modal
      titulo={pedido.titulo}
      mensagem={pedido.mensagem}
      botaoOk={pedido.botaoOk}
      perigo={pedido.perigo}
      onFechar={() => setPedido(null)}
      onConfirmar={() => {
        const p = pedido;
        setPedido(null);
        setErro(null);
        iniciar(async () => {
          const r = await p.executar();
          if (r.erro) setErro(r.erro);
          else depois?.();
        });
      }}
    />
  );
  return { pedir: setPedido, erro, setErro, salvando, modal };
}

export function Cartao({
  children,
  apagado,
}: {
  children: ReactNode;
  apagado?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm ring-1 ring-rose-100 ${apagado ? "bg-stone-50" : "bg-white"}`}
    >
      {children}
    </div>
  );
}

export function Erro({ texto }: { texto: string | null }) {
  return texto ? <p className="mt-2 text-sm text-red-700">{texto}</p> : null;
}

"use client";

// Tela de erro do painel. Antes não existia, e qualquer falha numa
// atualização automática deixava a tela toda branca. Agora mostra um aviso
// e tenta de novo sozinha em 10 segundos (ex.: internet caiu por um momento).

import { useEffect } from "react";

export default function ErroPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    const t = setTimeout(() => window.location.reload(), 10_000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <main className="flex flex-1 justify-center bg-rose-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-rose-100">
        <p className="font-medium text-stone-800">
          O painel perdeu a conexão por um momento.
        </p>
        <p className="mt-2 text-sm text-stone-500">
          Tentando de novo sozinho em alguns segundos...
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white"
          >
            Recarregar agora
          </button>
          <button
            onClick={() => reset()}
            className="rounded-full px-5 py-2 text-sm text-rose-700 underline"
          >
            Tentar sem recarregar
          </button>
        </div>
      </div>
    </main>
  );
}

"use client";

// Peças visuais compartilhadas do painel (reservas e configurações).

import { useEffect } from "react";

export function Modal({
  titulo,
  resumo,
  mensagem,
  botaoOk,
  perigo,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  resumo?: string;
  mensagem: string;
  botaoOk: string;
  perigo?: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  // Esc fecha o modal
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-titulo" className="text-lg font-semibold text-stone-800">
          {titulo}
        </h3>
        {resumo && (
          <p className="mt-1 text-sm font-medium text-stone-700">{resumo}</p>
        )}
        <p className="mt-2 text-sm text-stone-600">{mensagem}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onFechar}
            autoFocus
            className="rounded-xl px-4 py-2 text-sm text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
          >
            Voltar
          </button>
          <button
            onClick={onConfirmar}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
              perigo
                ? "bg-red-600 hover:bg-red-700"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {botaoOk}
          </button>
        </div>
      </div>
    </div>
  );
}

// Ícone de carregando (gira).
export function Girando({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

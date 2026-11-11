"use client";

import { useActionState } from "react";
import { entrar } from "../actions";

export default function FormEntrar() {
  const [estado, acao, enviando] = useActionState(entrar, {
    erro: null as string | null,
  });

  return (
    <form action={acao} className="space-y-3">
      <input
        name="email"
        type="email"
        placeholder="E-mail"
        autoComplete="email"
        required
        className="w-full rounded-xl bg-white px-4 py-3 text-stone-800 ring-1 ring-rose-100 outline-none placeholder:text-stone-400 focus:ring-rose-400"
      />
      <input
        name="senha"
        type="password"
        placeholder="Senha"
        autoComplete="current-password"
        required
        className="w-full rounded-xl bg-white px-4 py-3 text-stone-800 ring-1 ring-rose-100 outline-none placeholder:text-stone-400 focus:ring-rose-400"
      />
      {estado.erro && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {estado.erro}
        </p>
      )}
      <button
        disabled={enviando}
        className="w-full rounded-xl bg-rose-600 py-3 font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

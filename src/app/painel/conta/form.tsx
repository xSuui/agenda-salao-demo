"use client";

import { useActionState } from "react";
import { trocarSenha } from "./actions";

const campo =
  "w-full rounded-xl bg-white px-4 py-3 text-stone-800 ring-1 ring-rose-100 outline-none placeholder:text-stone-400 focus:ring-rose-400";

export default function FormSenha() {
  const [estado, acao, enviando] = useActionState(trocarSenha, {
    erro: null,
    ok: false,
  });

  if (estado.ok) {
    return (
      <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
        Senha trocada! Da próxima vez, entre com a senha nova.
      </p>
    );
  }

  return (
    <form action={acao} className="space-y-3">
      <input
        name="atual"
        type="password"
        placeholder="Senha atual"
        autoComplete="current-password"
        required
        className={campo}
      />
      <input
        name="nova"
        type="password"
        placeholder="Senha nova (mínimo 8 caracteres)"
        autoComplete="new-password"
        minLength={8}
        required
        className={campo}
      />
      <input
        name="repetir"
        type="password"
        placeholder="Repita a senha nova"
        autoComplete="new-password"
        minLength={8}
        required
        className={campo}
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
        {enviando ? "Trocando..." : "Trocar senha"}
      </button>
    </form>
  );
}

// Sessão da dona do salão: os "crachás" do login ficam em cookies
// httpOnly (o JavaScript da página não consegue ler, só o servidor).

import { cookies } from "next/headers";
import { autenticacao, ErroSupabase } from "./supabase";

export const COOKIE_ACESSO = "painel_acesso";
export const COOKIE_RENOVAR = "painel_renovar";

type RespostaToken = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

const opcoesCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// Só pode ser chamada em Server Actions ou Route Handlers (onde dá para gravar cookie)
export async function gravarSessao(t: RespostaToken) {
  const c = await cookies();
  c.set(COOKIE_ACESSO, t.access_token, {
    ...opcoesCookie,
    maxAge: t.expires_in,
  });
  c.set(COOKIE_RENOVAR, t.refresh_token, {
    ...opcoesCookie,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function apagarSessao() {
  const c = await cookies();
  c.delete(COOKIE_ACESSO);
  c.delete(COOKIE_RENOVAR);
}

export function entrarComSenha(email: string, senha: string) {
  return autenticacao<RespostaToken>("token?grant_type=password", {
    body: { email, password: senha },
  });
}

export function renovarSessao(refreshToken: string) {
  return autenticacao<RespostaToken>("token?grant_type=refresh_token", {
    body: { refresh_token: refreshToken },
  });
}

// Quem está logado? null = ninguém (ou crachá vencido)
export async function usuarioLogado(): Promise<
  { id: string; email: string; token: string } | "vencido" | null
> {
  const c = await cookies();
  const token = c.get(COOKIE_ACESSO)?.value;
  if (!token) return c.get(COOKIE_RENOVAR)?.value ? "vencido" : null;
  try {
    const u = await autenticacao<{ id: string; email: string }>("user", {
      token,
    });
    return { id: u.id, email: u.email, token };
  } catch (e) {
    if (e instanceof ErroSupabase && (e.status === 401 || e.status === 403))
      return "vencido";
    throw e;
  }
}

// O crachá de acesso dura 1 hora. Quando vence, o painel manda pra cá:
// trocamos o crachá de renovação por um novo e voltamos pro painel.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_RENOVAR,
  apagarSessao,
  gravarSessao,
  renovarSessao,
} from "@/lib/sessao";

export async function GET(request: NextRequest) {
  const refresh = (await cookies()).get(COOKIE_RENOVAR)?.value;
  if (refresh) {
    try {
      await gravarSessao(await renovarSessao(refresh));
      return NextResponse.redirect(new URL("/painel", request.url));
    } catch {
      // renovação falhou: cai no login
    }
  }
  await apagarSessao();
  return NextResponse.redirect(new URL("/painel/entrar", request.url));
}

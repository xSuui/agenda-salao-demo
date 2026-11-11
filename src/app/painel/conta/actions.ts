"use server";

// Trocar a própria senha (qualquer pessoa logada no painel).

import { autenticacao, ErroSupabase } from "@/lib/supabase";
import { entrarComSenha, gravarSessao, usuarioLogado } from "@/lib/sessao";

type Estado = { erro: string | null; ok: boolean };

export async function trocarSenha(
  _estado: Estado,
  form: FormData,
): Promise<Estado> {
  const atual = String(form.get("atual") ?? "");
  const nova = String(form.get("nova") ?? "");
  const repetir = String(form.get("repetir") ?? "");

  if (nova.length < 8)
    return {
      erro: "A senha nova precisa ter pelo menos 8 caracteres.",
      ok: false,
    };
  if (nova.length > 72)
    return {
      erro: "A senha nova pode ter no máximo 72 caracteres.",
      ok: false,
    };
  if (nova !== repetir)
    return { erro: "As duas senhas novas não são iguais.", ok: false };
  if (nova === atual)
    return { erro: "A senha nova precisa ser diferente da atual.", ok: false };

  const u = await usuarioLogado();
  if (!u || u === "vencido")
    return { erro: "Sua sessão expirou. Entre de novo.", ok: false };

  // Confere a senha atual antes de trocar (se alguém pegar o celular aberto, não troca)
  try {
    await entrarComSenha(u.email, atual);
  } catch {
    return { erro: "A senha atual está errada.", ok: false };
  }

  try {
    await autenticacao("user", {
      metodo: "PUT",
      body: { password: nova },
      token: u.token,
    });
    // Entra de novo com a senha nova para renovar o login neste aparelho
    await gravarSessao(await entrarComSenha(u.email, nova));
  } catch (e) {
    if (
      e instanceof ErroSupabase &&
      /weak|pwned|leaked/i.test(`${e.codigo} ${e.message}`)
    ) {
      return {
        erro: "Essa senha é fraca ou já vazou na internet. Escolha outra.",
        ok: false,
      };
    }
    return {
      erro: "Não foi possível trocar a senha. Tente de novo.",
      ok: false,
    };
  }
  return { erro: null, ok: true };
}

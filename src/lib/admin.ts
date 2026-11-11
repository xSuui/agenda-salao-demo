// Administrador máximo do sistema (dono do sistema). A lista fica no banco
// (tabela administradores); aqui só perguntamos ao banco se quem está
// logado é administrador.

import { consultar } from "./supabase";

export async function ehAdmin(token: string) {
  try {
    return (
      (await consultar<boolean>("rpc/eh_admin", { body: {}, token })) === true
    );
  } catch {
    return false; // na dúvida, não é
  }
}

// Conversa com o Supabase pela API REST, sempre do lado do servidor.
// Usa a chave pública (anon/publishable): as regras de segurança (RLS)
// do banco continuam valendo. NUNCA colocar a chave secreta aqui.
// Quando a dona do salão está logada, o "token" dela vai junto e o banco
// sabe quem é (auth.uid()), liberando só os dados do salão dela.

export class ErroSupabase extends Error {
  constructor(
    message: string,
    public codigo?: string,
    public status?: number,
  ) {
    super(message);
  }
}

function config() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_ANON_KEY;
  if (!url || !chave) {
    throw new Error(
      "Faltam SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env.local",
    );
  }
  return { url, chave };
}

async function chamar<T>(
  endereco: string,
  opcoes: {
    metodo?: string;
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const { chave } = config();
  const headers: Record<string, string> = {
    apikey: chave,
    "Content-Type": "application/json",
    ...opcoes.headers,
  };
  if (opcoes.token) headers.Authorization = `Bearer ${opcoes.token}`;
  // Chave antiga (JWT "eyJ...") também vai no Authorization; a nova (sb_publishable_...) não.
  else if (!chave.startsWith("sb_")) headers.Authorization = `Bearer ${chave}`;

  const resposta = await fetch(endereco, {
    method: opcoes.metodo ?? (opcoes.body !== undefined ? "POST" : "GET"),
    headers,
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    cache: "no-store",
  });

  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => null);
    throw new ErroSupabase(
      erro?.message ??
        erro?.msg ??
        erro?.error_description ??
        `Erro ${resposta.status} no Supabase`,
      erro?.code ?? erro?.error_code,
      resposta.status,
    );
  }
  const texto = await resposta.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

// Banco de dados (tabelas e funções)
export function consultar<T>(
  caminho: string,
  opcoes?: {
    body?: unknown;
    token?: string;
    metodo?: string;
    headers?: Record<string, string>;
  },
): Promise<T> {
  return chamar<T>(`${config().url}/rest/v1/${caminho}`, opcoes);
}

// Login (Supabase Auth)
export function autenticacao<T>(
  caminho: string,
  opcoes?: { body?: unknown; token?: string; metodo?: string },
): Promise<T> {
  return chamar<T>(`${config().url}/auth/v1/${caminho}`, opcoes);
}

// Arquivos (Supabase Storage). As fotos ficam no bucket público "fotos".
export const BUCKET_FOTOS = "fotos";

export function urlPublicaFoto(caminho: string) {
  return `${config().url}/storage/v1/object/public/${BUCKET_FOTOS}/${caminho}`;
}

export async function subirFoto(
  caminho: string,
  bytes: ArrayBuffer,
  tipo: string,
  token: string,
) {
  const { url, chave } = config();
  const resposta = await fetch(
    `${url}/storage/v1/object/${BUCKET_FOTOS}/${caminho}`,
    {
      method: "POST",
      headers: {
        apikey: chave,
        Authorization: `Bearer ${token}`,
        "Content-Type": tipo,
        "x-upsert": "false",
      },
      body: bytes,
      cache: "no-store",
    },
  );
  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => null);
    throw new ErroSupabase(
      erro?.message ?? `Erro ${resposta.status} ao subir a foto`,
      erro?.error,
      resposta.status,
    );
  }
}

export function apagarFotos(caminhos: string[], token: string) {
  return chamar(`${config().url}/storage/v1/object/${BUCKET_FOTOS}`, {
    metodo: "DELETE",
    body: { prefixes: caminhos },
    token,
  });
}

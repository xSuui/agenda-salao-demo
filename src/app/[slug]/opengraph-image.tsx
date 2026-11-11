// Imagem que aparece quando o link do salão é colado no WhatsApp ou no Instagram.
// Com foto de capa: a foto com o nome por cima. Sem foto: fundo rosa com o nome.

import { ImageResponse } from "next/og";
import { consultar, urlPublicaFoto } from "@/lib/supabase";

export const alt = "Agende seu horário online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let nome = "Agende seu horário";
  let capa: string | null = null;
  if (/^[a-z0-9-]{1,60}$/.test(slug)) {
    const [s] = await consultar<{ nome: string; foto_capa: string | null }[]>(
      `saloes?slug=eq.${slug}&select=nome,foto_capa`,
    ).catch(() => []);
    if (s) {
      nome = s.nome;
      // Baixa a foto antes: se falhar, a imagem sai só com o fundo rosa (não quebra)
      if (s.foto_capa) {
        const r = await fetch(urlPublicaFoto(s.foto_capa)).catch(() => null);
        if (r?.ok) {
          const tipo = r.headers.get("content-type") ?? "image/jpeg";
          capa = `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
        }
      }
    }
  }

  // Sem "inset" (o gerador de imagem não entende): posição e tamanho explícitos
  const tela = {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1200,
    height: 630,
  } as const;
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        position: "relative",
        background: "#e11d48",
      }}
    >
      {capa && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={capa}
          alt=""
          width={1200}
          height={630}
          style={{ ...tela, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          ...tela,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "56px 64px",
          ...(capa
            ? {
                backgroundImage:
                  "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
              }
            : {}),
          color: "white",
        }}
      >
        <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.05 }}>
          {nome}
        </div>
        <div style={{ fontSize: 40, marginTop: 16 }}>
          Agende seu horário online · sinal por Pix
        </div>
      </div>
    </div>,
    size,
  );
}

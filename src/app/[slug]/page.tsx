import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { carregarSalao } from "@/lib/dados";
import {
  DIAS_CALENDARIO,
  lerRascunho,
  nomeCookieRascunho,
  validarRascunho,
} from "@/lib/rascunho";
import { buscarHorarios, type Horario } from "./actions";
import Agendador from "./agendador";
import { Capa, OndeEstamos, Trabalhos } from "./vitrine";

import type { Metadata } from "next";
import { consultar } from "@/lib/supabase";

// Título e descrição quando o link é compartilhado (WhatsApp, Instagram, Google)
export async function generateMetadata(
  props: PageProps<"/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return {};
  const [s] = await consultar<{ nome: string }[]>(
    `saloes?slug=eq.${slug}&select=nome`,
  ).catch(() => []);
  if (!s) return {};
  const titulo = `${s.nome} · Agende seu horário`;
  const descricao =
    "Escolha o serviço, a profissional e o horário em menos de 1 minuto. Sinal por Pix.";
  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      type: "website",
      locale: "pt_BR",
    },
  };
}

// Página pública de cada salão: /studio-demo
export default function Page(props: PageProps<"/[slug]">) {
  return (
    <main className="flex flex-1 justify-center bg-rose-50 px-4 py-8">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <p className="py-16 text-center text-stone-500">
              Carregando a agenda...
            </p>
          }
        >
          <Conteudo params={props.params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // sempre dados frescos: a agenda muda o tempo todo
  const { slug } = await params;
  const dados = await carregarSalao(slug);
  if (!dados) notFound();

  // Salão suspenso pelo administrador: não mostra a agenda
  if (!dados.salao.no_ar) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-rose-100">
        <h1 className="text-xl font-semibold text-stone-800">
          {dados.salao.nome}
        </h1>
        <p className="mt-2 text-stone-600">
          A agenda online está indisponível no momento.
        </p>
      </div>
    );
  }

  // "Hoje" no fuso do salão, no formato AAAA-MM-DD
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: dados.salao.fuso_horario,
  }).format(new Date());

  // Se a cliente já tinha começado a marcar (últimos 10 min), reabre do ponto onde parou
  const cru = (await cookies()).get(nomeCookieRascunho(slug))?.value;
  const rascunho = validarRascunho(
    lerRascunho(cru),
    dados,
    hoje,
    DIAS_CALENDARIO,
  );

  let horarios: Horario[] | null = null;
  if (rascunho.servicoId && rascunho.profId && rascunho.dia) {
    const r = await buscarHorarios(
      rascunho.profId,
      rascunho.servicoId,
      rascunho.dia,
    );
    if ("horarios" in r) horarios = r.horarios;
  }

  return (
    <div className="space-y-8">
      <Capa nome={dados.salao.nome} capa={dados.capa} />
      <div id="agendar" className="scroll-mt-4">
        <Agendador
          slug={slug}
          dados={dados}
          hoje={hoje}
          rascunho={rascunho}
          horariosIniciais={horarios}
        />
      </div>
      <Trabalhos fotos={dados.fotos} />
      <OndeEstamos
        endereco={dados.salao.endereco}
        whatsapp={dados.salao.whatsapp}
        expediente={dados.expediente}
      />
    </div>
  );
}

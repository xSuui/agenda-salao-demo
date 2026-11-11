import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { consultar, urlPublicaFoto } from "@/lib/supabase";
import { usuarioLogado } from "@/lib/sessao";
import { salaoDoPainel } from "@/lib/painel";
import { agoraMs } from "@/lib/tempo";
import Configuracoes, {
  type FolgaConfig,
  type ProfConfig,
  type ServicoConfig,
} from "./configuracoes";

// Configurações do salão: /painel/configuracoes
// Atendentes, serviços e expediente, sem precisar mexer no banco.
export default function Page() {
  return (
    <main className="flex flex-1 justify-center bg-rose-50 px-4 py-8">
      <div className="w-full max-w-2xl">
        <Suspense
          fallback={
            <p className="py-16 text-center text-stone-500">
              Carregando as configurações...
            </p>
          }
        >
          <Conteudo />
        </Suspense>
      </div>
    </main>
  );
}

async function Conteudo() {
  const u = await usuarioLogado();
  if (u === null) redirect("/painel/entrar");
  if (u === "vencido") redirect("/painel/renovar");

  const { salao, admin } = await salaoDoPainel<{
    id: string;
    nome: string;
    slug: string;
    fuso_horario: string;
    endereco: string | null;
    whatsapp: string | null;
    foto_capa: string | null;
    dono_id: string | null;
    pix_chave: string | null;
    pix_nome: string | null;
    pix_cidade: string;
  }>(
    u,
    "id,nome,slug,fuso_horario,endereco,whatsapp,foto_capa,dono_id,pix_chave,pix_nome,pix_cidade",
  );
  if (!salao) redirect("/painel");

  // A dona vê também quem e o que está desativado (a vitrine pública, não)
  const agora = new Date(agoraMs()).toISOString();
  const [profs, servicos, folgas, fotos] = await Promise.all([
    consultar<ProfConfig[]>(
      `profissionais?salao_id=eq.${salao.id}&select=id,nome,ativo,horarios_funcionamento(dia_semana,inicio,fim)&order=criado_em`,
      { token: u.token },
    ),
    consultar<
      (Omit<ServicoConfig, "profissionais"> & {
        servico_profissional: { profissional_id: string }[];
      })[]
    >(
      `servicos?salao_id=eq.${salao.id}&select=id,nome,preco_centavos,duracao_minutos,ativo,servico_profissional(profissional_id)&order=preco_centavos`,
      { token: u.token },
    ),
    // Folgas que ainda não terminaram
    consultar<FolgaConfig[]>(
      `bloqueios?select=id,profissional_id,inicio,fim,motivo,profissionais!inner(salao_id)` +
        `&profissionais.salao_id=eq.${salao.id}&fim=gte.${encodeURIComponent(agora)}&order=inicio`,
      { token: u.token },
    ),
    consultar<{ id: string; caminho: string }[]>(
      `fotos_salao?salao_id=eq.${salao.id}&select=id,caminho&order=ordem,criado_em`,
      { token: u.token },
    ),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-rose-700">
            Configurações
          </h1>
          <p className="text-sm text-stone-500">
            {salao.nome} ·{" "}
            <a
              href={`/${salao.slug}`}
              target="_blank"
              className="text-rose-700 underline"
            >
              ver a página das clientes
            </a>
          </p>
        </div>
        <Link
          href="/painel"
          className="rounded-xl px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-white"
        >
          Voltar às reservas
        </Link>
      </header>
      <Configuracoes
        profissionais={profs.map((p) => ({
          ...p,
          horarios_funcionamento: p.horarios_funcionamento.map((h) => ({
            dia_semana: h.dia_semana,
            inicio: h.inicio.slice(0, 5),
            fim: h.fim.slice(0, 5),
          })),
        }))}
        servicos={servicos.map(({ servico_profissional, ...s }) => ({
          ...s,
          profissionais: servico_profissional.map((v) => v.profissional_id),
        }))}
        folgas={folgas.map(({ id, profissional_id, inicio, fim, motivo }) => ({
          id,
          profissional_id,
          inicio,
          fim,
          motivo,
        }))}
        fuso={salao.fuso_horario}
        pagina={{
          slug: salao.slug,
          admin,
          podePix: admin || salao.dono_id === u.id,
          pix: {
            chave: salao.pix_chave,
            nome: salao.pix_nome,
            cidade: salao.pix_cidade,
          },
          endereco: salao.endereco,
          whatsapp: salao.whatsapp,
          capa: salao.foto_capa ? urlPublicaFoto(salao.foto_capa) : null,
          fotos: fotos.map((f) => ({
            id: f.id,
            url: urlPublicaFoto(f.caminho),
          })),
        }}
        hoje={new Intl.DateTimeFormat("en-CA", {
          timeZone: salao.fuso_horario,
        }).format(new Date(agora))}
      />
    </div>
  );
}

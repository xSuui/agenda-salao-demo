import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { consultar } from "@/lib/supabase";
import { usuarioLogado } from "@/lib/sessao";
import { podeVerBalanco, salaoDoPainel } from "@/lib/painel";
import { agoraMs } from "@/lib/tempo";
import { DIA_RE, inicioDoDiaUTC, somarDias } from "@/lib/datas";
import { sair } from "./actions";
import ListaReservas, { type Reserva } from "./lista";
import AoVivo from "./ao-vivo";
import Balanco from "./balanco";

// Painel da dona do salão: /painel  (filtro de data: /painel?de=2026-11-03&ate=2026-11-17)
export default function Page(props: PageProps<"/painel">) {
  return (
    <main className="flex flex-1 justify-center bg-rose-50 px-4 py-8">
      <div className="w-full max-w-2xl">
        <Suspense
          fallback={
            <p className="py-16 text-center text-stone-500">
              Carregando o painel...
            </p>
          }
        >
          <Painel searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

type SalaoPainel = {
  id: string;
  nome: string;
  fuso_horario: string;
  minutos_para_pagar_sinal: number;
  no_ar: boolean;
  dono_id: string | null;
};

// Lê e confere o período do endereço (?de=&ate=). Inválido = sem filtro.
function lerPeriodo(sp: Record<string, string | string[] | undefined>) {
  const um = (v: string | string[] | undefined) =>
    typeof v === "string" && DIA_RE.test(v) ? v : null;
  let de = um(sp.de);
  let ate = um(sp.ate) ?? de;
  if (!de || !ate) return { de: null, ate: null };
  if (de > ate) [de, ate] = [ate, de];
  if (somarDias(de, 366) < ate) ate = somarDias(de, 366); // no máximo 1 ano por vez
  return { de, ate };
}

async function Painel({
  searchParams,
}: {
  searchParams: PageProps<"/painel">["searchParams"];
}) {
  const u = await usuarioLogado();
  if (u === null) redirect("/painel/entrar");
  if (u === "vencido") redirect("/painel/renovar");

  const { salao, admin } = await salaoDoPainel<SalaoPainel>(
    u,
    "id,nome,fuso_horario,minutos_para_pagar_sinal,no_ar,dono_id",
  );

  if (!salao) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-rose-100">
        <p className="text-stone-700">
          A conta <strong>{u.email}</strong> ainda não está ligada a nenhum
          salão.
        </p>
        <form action={sair} className="mt-4">
          <button className="text-rose-700 underline">Sair</button>
        </form>
      </div>
    );
  }

  const verBalanco = await podeVerBalanco(u, salao, admin);
  const agora = agoraMs();
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: salao.fuso_horario,
  }).format(new Date(agora));
  const { de, ate } = lerPeriodo(await searchParams);

  // Sem filtro: últimos 7 dias em diante (para marcar "atendida"/"faltou" depois).
  // Com filtro: só o período escolhido, no fuso do salão.
  const periodo = de
    ? `&inicio=gte.${encodeURIComponent(inicioDoDiaUTC(de, salao.fuso_horario))}` +
      `&inicio=lt.${encodeURIComponent(inicioDoDiaUTC(somarDias(ate!, 1), salao.fuso_horario))}`
    : `&inicio=gte.${encodeURIComponent(new Date(agora - 7 * 24 * 60 * 60 * 1000).toISOString())}`;

  const reservas = await consultar<Reserva[]>(
    `agendamentos?salao_id=eq.${salao.id}${periodo}` +
      `&select=id,inicio,fim,status,sinal_status,criado_em,clientes(nome,telefone),servicos(nome,preco_centavos),profissionais(nome)` +
      `&order=inicio`,
    { token: u.token },
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-rose-700">{salao.nome}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
            Painel de reservas · {u.email} ·{" "}
            <Link href="/painel/conta" className="text-rose-700 underline">
              trocar senha
            </Link>
            <AoVivo
              url={process.env.SUPABASE_URL!}
              chave={process.env.SUPABASE_ANON_KEY!}
              token={u.token}
              salaoId={salao.id}
            />
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {verBalanco && <Balanco />}
          {admin && (
            <Link
              href="/painel/admin"
              className="rounded-xl bg-stone-800 px-3 py-2 text-sm text-white hover:bg-stone-700"
            >
              Administração
            </Link>
          )}
          <Link
            href="/painel/configuracoes"
            className="rounded-xl px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-white"
          >
            Configurações
          </Link>
          <form action={sair}>
            <button className="rounded-xl px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-white">
              Sair
            </button>
          </form>
        </div>
      </header>
      {!salao.no_ar && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          A página deste salão está suspensa: as clientes veem
          &ldquo;indisponível&rdquo; e não conseguem marcar.
        </p>
      )}
      <ListaReservas
        reservas={reservas}
        fuso={salao.fuso_horario}
        prazoSinalMin={salao.minutos_para_pagar_sinal}
        agora={agora}
        hoje={hoje}
        de={de}
        ate={ate}
      />
    </div>
  );
}

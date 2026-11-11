"use client";

// Painel ao vivo: escuta as mudanças na tabela de reservas do salão
// (Supabase Realtime, websocket) e recarrega a lista sozinho, sem F5.
// Socket.IO não serve aqui porque o Vercel
// não mantém um servidor ligado; o Realtime do Supabase faz o mesmo papel.
//
// Segurança: o canal usa o token da própria dona, então as regras do banco
// (RLS) só deixam chegar eventos das reservas do salão dela.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function AoVivo({
  url,
  chave,
  token,
  salaoId,
}: {
  url: string;
  chave: string;
  token: string;
  salaoId: string;
}) {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    supabase.realtime.setAuth(token);

    const canal = supabase
      .channel(`painel-${salaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `salao_id=eq.${salaoId}`,
        },
        (payload) => {
          // Reserva nova chegou pelo websocket: avisa a lista para destacar o cartão
          if (
            payload.eventType === "INSERT" &&
            payload.new &&
            "id" in payload.new
          ) {
            window.dispatchEvent(
              new CustomEvent("reserva-nova", {
                detail: String(payload.new.id),
              }),
            );
          }
          router.refresh();
        },
      )
      .subscribe((status) => setConectado(status === "SUBSCRIBED"));

    // O crachá (token) vence em 1 hora. Renovar dentro de um router.refresh()
    // deixava a tela branca (o redirect para /painel/renovar não funciona numa
    // atualização "por baixo"), e o websocket parava de receber eventos com o
    // token vencido. Então: 2 min antes de vencer, vamos para /painel/renovar
    // com navegação completa, que troca o crachá e volta para o painel.
    const venceEm = expiraEmMs(token);
    const renovar = () => {
      window.location.href = "/painel/renovar";
    };
    const faltam = venceEm ? venceEm - Date.now() - 120_000 : null;
    const timerRenovar =
      faltam !== null ? setTimeout(renovar, Math.max(faltam, 0)) : null;

    // Rede de segurança: recarrega a cada 1 min mesmo se o websocket cair.
    // Se o crachá já venceu (ex.: computador dormiu), renova em vez de atualizar.
    const atualizar = () => {
      if (venceEm && Date.now() > venceEm - 60_000) renovar();
      else router.refresh();
    };
    const reserva = setInterval(atualizar, 60_000);

    // Voltou para a aba depois de um tempo fora: atualiza na hora
    const aoVoltar = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      clearInterval(reserva);
      if (timerRenovar) clearTimeout(timerRenovar);
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(canal);
    };
  }, [url, chave, token, salaoId, router]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${conectado ? "text-emerald-700" : "text-stone-400"}`}
      title={conectado ? "Novas reservas aparecem sozinhas" : "Conectando..."}
    >
      <span
        className={`h-2 w-2 rounded-full ${conectado ? "animate-pulse bg-emerald-500" : "bg-stone-300"}`}
      />
      {conectado ? "Ao vivo" : "Conectando..."}
    </span>
  );
}

// Lê a validade (exp) do crachá JWT, em milissegundos. Só leitura: quem
// confere a assinatura é o Supabase. Formato estranho = null (sem timer).
function expiraEmMs(token: string): number | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(base64));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

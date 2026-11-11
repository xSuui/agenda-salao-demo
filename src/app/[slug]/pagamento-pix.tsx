"use client";

// Depois de reservar: como pagar o sinal por Pix (modo manual).
// QR Code e "Pix copia e cola" já com o valor; a dona confere no banco
// e aperta "Sinal recebido" no painel. Se o salão ainda não cadastrou a
// chave, a cliente combina pelo WhatsApp.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { pixCopiaECola } from "@/lib/pix";

const reais = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
        } catch {
          // navegador antigo ou de dentro de app: seleciona para copiar à mão
          window.prompt("Copie o código:", texto);
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }}
      className="w-full rounded-xl bg-rose-600 py-3 font-semibold text-white hover:bg-rose-700"
    >
      {copiado ? "Copiado! Agora cole no app do banco" : rotulo}
    </button>
  );
}

export default function PagamentoPix({
  salao,
  sinalCentavos,
  codigo,
  resumo,
  nomeCliente,
}: {
  salao: {
    nome: string;
    whatsapp: string | null;
    pix_chave: string | null;
    pix_nome: string | null;
    pix_cidade: string;
    minutos_para_pagar_sinal: number;
  };
  sinalCentavos: number;
  codigo: string;
  resumo: string; // "Pé e mão com Ana, terça, 10 de novembro, às 10:00"
  nomeCliente: string;
}) {
  const copiaECola = salao.pix_chave
    ? pixCopiaECola({
        chave: salao.pix_chave,
        nome: salao.pix_nome || salao.nome,
        cidade: salao.pix_cidade,
        valorCentavos: sinalCentavos,
        referencia: codigo,
      })
    : null;
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!copiaECola) return;
    QRCode.toDataURL(copiaECola, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [copiaECola]);

  const prazo =
    salao.minutos_para_pagar_sinal >= 60 &&
    salao.minutos_para_pagar_sinal % 60 === 0
      ? `${salao.minutos_para_pagar_sinal / 60} hora${salao.minutos_para_pagar_sinal === 60 ? "" : "s"}`
      : `${salao.minutos_para_pagar_sinal} minutos`;

  const mensagem = encodeURIComponent(
    `Olá! Sou ${nomeCliente.trim()} e acabei de reservar: ${resumo} (reserva ${codigo}). ` +
      (copiaECola
        ? "Segue o comprovante do Pix do sinal."
        : "Como faço o Pix do sinal?"),
  );
  const linkWhats = salao.whatsapp
    ? `https://wa.me/55${salao.whatsapp}?text=${mensagem}`
    : null;

  return (
    <div className="mt-5 space-y-4 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
      <div>
        <p className="font-semibold">
          Falta só o sinal de {reais(sinalCentavos)}
        </p>
        <p className="mt-1 text-sm">
          Pague em até <strong>{prazo}</strong>. Depois desse prazo, o horário
          volta a ficar livre. O valor é descontado do serviço no dia.
        </p>
        <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-sm font-medium">
          <li>
            {copiaECola
              ? "Pague o Pix pelo QR Code ou copia e cola"
              : "Chame o salão no WhatsApp para pegar o Pix"}
          </li>
          <li>Envie o comprovante no WhatsApp do salão (botão verde abaixo)</li>
          <li>O salão confirma o seu horário</li>
        </ol>
      </div>

      {copiaECola ? (
        <>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR Code do Pix"
              className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
            />
          )}
          <BotaoCopiar texto={copiaECola} rotulo="Copiar Pix copia e cola" />
          <p className="text-center text-xs text-amber-800">
            No app do banco: Pix → Pix copia e cola. O valor já vem preenchido.
            <br />
            Confira se quem recebe é{" "}
            <strong>{salao.pix_nome || salao.nome}</strong>.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-amber-800 underline">
              Prefiro pagar pela chave
            </summary>
            <p className="mt-2 break-all">
              Chave Pix: <strong>{salao.pix_chave}</strong>
              <br />
              Valor: <strong>{reais(sinalCentavos)}</strong>
            </p>
          </details>
        </>
      ) : (
        <p className="text-sm">O salão vai te passar o Pix pelo WhatsApp.</p>
      )}

      {linkWhats && (
        <a
          href={linkWhats}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white hover:bg-emerald-700"
        >
          {copiaECola
            ? "Já paguei: mandar comprovante"
            : "Chamar o salão no WhatsApp"}
        </a>
      )}
      <p className="text-xs text-amber-800">
        Seu horário fica confirmado quando o salão receber o sinal. Precisa
        remarcar? Fale com o salão no WhatsApp com até 2 dias de antecedência.
      </p>
    </div>
  );
}

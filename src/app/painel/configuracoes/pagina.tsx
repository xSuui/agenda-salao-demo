"use client";

// Aba "Página": o que aparece para as clientes além da agenda
// (foto de capa, "Nossos trabalhos" e "Onde estamos").

import { useRef, useState, useTransition } from "react";
import { Girando } from "../ui";
import {
  enviarFoto,
  moverFoto,
  removerFoto,
  salvarInfoSalao,
  salvarPix,
} from "./actions";
import type { TipoChave } from "@/lib/pix";
import {
  botaoPrincipal,
  botaoSecundario,
  campo,
  Cartao,
  Erro,
  useConfirmar,
} from "./comum";

export type PaginaConfig = {
  slug: string;
  endereco: string | null;
  whatsapp: string | null;
  capa: string | null; // URL pública
  admin: boolean; // só o administrador  vê e mexe nas fotos
  podePix: boolean; // dona ou administrador (a equipe não mexe na chave Pix)
  pix: { chave: string | null; nome: string | null; cidade: string };
  fotos: { id: string; url: string }[];
};

// (11) 91234-5678
function mascaraWhats(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Reduz a foto no próprio celular antes de mandar (fica leve e rápida de abrir)
async function reduzirFoto(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const lado = 1600;
  const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext("2d")!.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close();
  for (const qualidade of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, "image/jpeg", qualidade),
    );
    if (blob && blob.size <= 880 * 1024) return blob;
  }
  throw new Error("grande demais");
}

export default function Pagina({ pagina }: { pagina: PaginaConfig }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        O que as clientes veem na página do salão além da agenda.{" "}
        <a
          href={`/${pagina.slug}`}
          target="_blank"
          className="text-rose-700 underline"
        >
          Ver como está ficando
        </a>
      </p>
      <Info key={`${pagina.endereco}-${pagina.whatsapp}`} pagina={pagina} />
      {pagina.podePix && (
        <Pix key={JSON.stringify(pagina.pix)} pix={pagina.pix} />
      )}
      {pagina.admin && (
        <>
          <Capa capa={pagina.capa} />
          <Galeria fotos={pagina.fotos} />
        </>
      )}
    </div>
  );
}

function Info({ pagina }: { pagina: PaginaConfig }) {
  const [endereco, setEndereco] = useState(pagina.endereco ?? "");
  const [whatsapp, setWhatsapp] = useState(mascaraWhats(pagina.whatsapp ?? ""));
  const c = useConfirmar();
  const mudou =
    endereco !== (pagina.endereco ?? "") ||
    whatsapp !== mascaraWhats(pagina.whatsapp ?? "");

  return (
    <Cartao>
      <h2 className="font-medium text-stone-800">Onde estamos</h2>
      <form
        className="mt-2 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          c.pedir({
            titulo: "Salvar endereço e WhatsApp?",
            mensagem: `${endereco.trim() || "(sem endereço)"} · ${whatsapp || "(sem WhatsApp)"}. Aparece na página das clientes.`,
            botaoOk: "Salvar",
            executar: () => salvarInfoSalao({ endereco, whatsapp }),
          });
        }}
      >
        <label className="block text-sm text-stone-600">
          Endereço
          <input
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            maxLength={200}
            placeholder="Rua, número, bairro"
            className={campo}
          />
        </label>
        <label className="block text-sm text-stone-600">
          WhatsApp do salão
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascaraWhats(e.target.value))}
            inputMode="tel"
            placeholder="(11) 91234-5678"
            className={campo}
          />
        </label>
        <p className="text-xs text-stone-500">
          Os dias e horários vêm sozinhos do expediente das atendentes.
        </p>
        <button className={botaoPrincipal} disabled={c.salvando || !mudou}>
          {c.salvando && <Girando />} Salvar
        </button>
        <Erro texto={c.erro} />
      </form>
      {c.modal}
    </Cartao>
  );
}

// Botão que abre a galeria/câmera do celular e sobe as fotos escolhidas
function BotaoFoto({
  destino,
  texto,
  multiplas,
  onErro,
}: {
  destino: "capa" | "galeria";
  texto: string;
  multiplas?: boolean;
  onErro: (e: string | null) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subindo, iniciar] = useTransition();
  const [progresso, setProgresso] = useState("");

  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiplas}
        className="hidden"
        onChange={(e) => {
          const arquivos = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!arquivos.length) return;
          onErro(null);
          iniciar(async () => {
            for (const [i, arquivo] of arquivos.entries()) {
              if (arquivos.length > 1)
                setProgresso(` ${i + 1} de ${arquivos.length}`);
              let blob: Blob;
              try {
                blob = await reduzirFoto(arquivo);
              } catch {
                onErro(
                  `Não consegui abrir "${arquivo.name}". Tente uma foto JPG ou PNG.`,
                );
                continue;
              }
              const form = new FormData();
              form.set(
                "arquivo",
                new File([blob], "foto.jpg", { type: "image/jpeg" }),
              );
              form.set("destino", destino);
              const r = await enviarFoto(form);
              if (r.erro) {
                onErro(r.erro);
                break;
              }
            }
            setProgresso("");
          });
        }}
      />
      <button
        type="button"
        className={botaoPrincipal}
        disabled={subindo}
        onClick={() => entrada.current?.click()}
      >
        {subindo ? (
          <>
            <Girando /> Subindo{progresso}...
          </>
        ) : (
          texto
        )}
      </button>
    </>
  );
}

function Capa({ capa }: { capa: string | null }) {
  const [erro, setErro] = useState<string | null>(null);
  const c = useConfirmar();
  return (
    <Cartao>
      <h2 className="font-medium text-stone-800">Foto de capa</h2>
      <p className="text-sm text-stone-500">
        A primeira coisa que a cliente vê. Uma foto do salão ou de um trabalho
        bonito.
      </p>
      {capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={capa}
          alt="Foto de capa"
          className="mt-3 aspect-[16/10] w-full rounded-xl object-cover"
        />
      ) : (
        <div className="mt-3 flex aspect-[16/10] w-full items-center justify-center rounded-xl bg-rose-50 text-sm text-stone-400">
          Sem foto de capa
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <BotaoFoto
          destino="capa"
          texto={capa ? "Trocar foto" : "Escolher foto"}
          onErro={setErro}
        />
        {capa && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={c.salvando}
            onClick={() =>
              c.pedir({
                titulo: "Tirar a foto de capa?",
                mensagem:
                  "A página volta a mostrar só o nome do salão no topo.",
                botaoOk: "Tirar foto",
                perigo: true,
                executar: () => removerFoto("capa"),
              })
            }
          >
            Tirar foto
          </button>
        )}
      </div>
      <Erro texto={erro ?? c.erro} />
      {c.modal}
    </Cartao>
  );
}

function Galeria({ fotos }: { fotos: { id: string; url: string }[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const c = useConfirmar();
  const [movendo, iniciar] = useTransition();

  const mover = (id: string, direcao: -1 | 1) =>
    iniciar(async () => {
      const r = await moverFoto(id, direcao);
      setErro(r.erro);
    });

  return (
    <Cartao>
      <h2 className="font-medium text-stone-800">Nossos trabalhos</h2>
      <p className="text-sm text-stone-500">
        Até 12 fotos. Sem nenhuma foto, essa parte não aparece na página. Use as
        setas para mudar a ordem.
      </p>
      {fotos.length > 0 && (
        <div
          className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 ${movendo ? "opacity-60" : ""}`}
        >
          {fotos.map((f, i) => (
            <div
              key={f.id}
              className="overflow-hidden rounded-xl ring-1 ring-rose-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={`Trabalho ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-1 bg-white p-1.5">
                <button
                  type="button"
                  aria-label="Mover para a esquerda"
                  disabled={i === 0 || movendo}
                  onClick={() => mover(f.id, -1)}
                  className="rounded-lg px-2 py-1 text-stone-600 hover:bg-rose-50 disabled:cursor-default disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() =>
                    c.pedir({
                      titulo: "Tirar esta foto?",
                      mensagem: `A foto ${i + 1} sai da página das clientes.`,
                      botaoOk: "Tirar foto",
                      perigo: true,
                      executar: () => removerFoto(f.id),
                    })
                  }
                  className="rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Tirar
                </button>
                <button
                  type="button"
                  aria-label="Mover para a direita"
                  disabled={i === fotos.length - 1 || movendo}
                  onClick={() => mover(f.id, 1)}
                  className="rounded-lg px-2 py-1 text-stone-600 hover:bg-rose-50 disabled:cursor-default disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        {fotos.length < 12 ? (
          <BotaoFoto
            destino="galeria"
            texto="+ Adicionar fotos"
            multiplas
            onErro={setErro}
          />
        ) : (
          <p className="text-sm text-stone-500">
            Limite de 12 fotos. Tire uma para pôr outra.
          </p>
        )}
      </div>
      <Erro texto={erro ?? c.erro} />
      {c.modal}
    </Cartao>
  );
}

// Tipo da chave guardada (para abrir o formulário certo)
function tipoDaChave(chave: string | null): TipoChave {
  if (!chave) return "celular";
  if (chave.startsWith("+")) return "celular";
  if (chave.includes("@")) return "email";
  if (chave.includes("-")) return "aleatoria";
  return chave.length === 14 ? "cnpj" : "cpf";
}

const TIPOS: [TipoChave, string, string][] = [
  ["celular", "Celular", "(11) 91234-5678"],
  ["cpf", "CPF", "123.456.789-00"],
  ["cnpj", "CNPJ", "12.345.678/0001-00"],
  ["email", "E-mail", "voce@email.com"],
  ["aleatoria", "Aleatória", "a1b2c3d4-..."],
];

function Pix({ pix }: { pix: PaginaConfig["pix"] }) {
  const [tipo, setTipo] = useState<TipoChave>(tipoDaChave(pix.chave));
  const [chave, setChave] = useState(pix.chave ?? "");
  const [nome, setNome] = useState(pix.nome ?? "");
  const [cidade, setCidade] = useState(pix.cidade);
  const c = useConfirmar();

  return (
    <Cartao>
      <h2 className="font-medium text-stone-800">Pix do sinal</h2>
      <p className="text-sm text-stone-500">
        Depois de reservar, a cliente vê o QR Code e o Pix copia e cola já com o
        valor do sinal. O dinheiro cai direto nesta chave. Você confere no banco
        e aperta &ldquo;Sinal recebido&rdquo; no painel.
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          c.pedir({
            titulo: "Salvar a chave Pix?",
            mensagem: chave.trim()
              ? `Chave ${TIPOS.find((t) => t[0] === tipo)?.[1]}: ${chave.trim()} · recebe: ${nome.trim()}. Confira com atenção: é para esta chave que as clientes vão mandar o sinal.`
              : "Sem chave, a cliente é orientada a chamar o salão no WhatsApp para pagar.",
            botaoOk: "Salvar",
            executar: () => salvarPix({ tipo, chave, nome, cidade }),
          });
        }}
      >
        <div className="flex flex-wrap gap-2">
          {TIPOS.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTipo(id)}
              className={`rounded-xl px-3 py-1.5 text-sm ring-1 ${
                tipo === id
                  ? "cursor-default bg-rose-600 text-white ring-rose-600"
                  : "bg-white text-stone-700 ring-stone-200 hover:bg-rose-50"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <label className="block text-sm text-stone-600">
          Chave Pix
          <input
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={TIPOS.find((t) => t[0] === tipo)?.[2]}
            maxLength={80}
            className={campo}
          />
        </label>
        <label className="block text-sm text-stone-600">
          Nome de quem recebe (como aparece no Pix)
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={60}
            className={campo}
          />
        </label>
        <label className="block text-sm text-stone-600">
          Cidade
          <input
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            maxLength={40}
            className={campo}
          />
        </label>
        <button className={botaoPrincipal} disabled={c.salvando}>
          {c.salvando && <Girando />} Salvar
        </button>
        <Erro texto={c.erro} />
      </form>
      {c.modal}
    </Cartao>
  );
}

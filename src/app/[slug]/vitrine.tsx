// Partes da página do salão em volta da agenda: capa, "Nossos trabalhos"
// e "Onde estamos". Tudo vem do painel (aba Configurações → Página);
// o que não estiver preenchido simplesmente não aparece.

/* eslint-disable @next/next/no-img-element */

const DIAS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

// "09:00" -> "9h", "18:30" -> "18h30"
function horaCurta(h: string) {
  const [hh, mm] = h.split(":");
  return `${Number(hh)}h${mm === "00" ? "" : mm}`;
}

// Junta dias seguidos com o mesmo horário: "Terça a sábado · 9h às 18h"
export function resumirExpediente(
  expediente: { dia: number; inicio: string; fim: string }[],
) {
  const grupos: { de: number; ate: number; inicio: string; fim: string }[] = [];
  for (const e of expediente) {
    const ultimo = grupos.at(-1);
    if (
      ultimo &&
      ultimo.ate === e.dia - 1 &&
      ultimo.inicio === e.inicio &&
      ultimo.fim === e.fim
    )
      ultimo.ate = e.dia;
    else grupos.push({ de: e.dia, ate: e.dia, inicio: e.inicio, fim: e.fim });
  }
  return grupos.map((g) => {
    const dias =
      g.de === g.ate
        ? DIAS[g.de]
        : g.ate === g.de + 1
          ? `${DIAS[g.de]} e ${DIAS[g.ate]}`
          : `${DIAS[g.de]} a ${DIAS[g.ate]}`;
    return `${dias.charAt(0).toUpperCase()}${dias.slice(1)} · ${horaCurta(g.inicio)} às ${horaCurta(g.fim)}`;
  });
}

export function Capa({ nome, capa }: { nome: string; capa: string | null }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-rose-600 text-white shadow-sm">
      {capa && (
        <img
          src={capa}
          alt={`Foto do ${nome}`}
          className="aspect-[16/10] w-full object-cover"
        />
      )}
      <div className="space-y-3 p-6">
        <p className="text-sm font-medium tracking-wide text-rose-100 uppercase">
          {nome}
        </p>
        <h1 className="text-3xl leading-tight font-bold">
          Unhas bem feitas, horário garantido.
        </h1>
        <p className="text-rose-50">
          Escolha o serviço, a profissional e o horário em menos de 1 minuto.
        </p>
        <a
          href="#agendar"
          className="block rounded-2xl bg-white px-4 py-3 text-center font-semibold text-rose-700 hover:bg-rose-50"
        >
          Agendar horário
        </a>
      </div>
    </section>
  );
}

export function Trabalhos({ fotos }: { fotos: string[] }) {
  if (!fotos.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-stone-800">
        Nossos trabalhos
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {fotos.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`Trabalho ${i + 1}`}
            loading="lazy"
            className="aspect-square w-full rounded-2xl object-cover ring-1 ring-rose-100"
          />
        ))}
      </div>
    </section>
  );
}

export function OndeEstamos({
  endereco,
  whatsapp,
  expediente,
}: {
  endereco: string | null;
  whatsapp: string | null;
  expediente: { dia: number; inicio: string; fim: string }[];
}) {
  const horarios = resumirExpediente(expediente);
  if (!endereco && !whatsapp && !horarios.length) return null;
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-rose-100">
      <h2 className="text-xl font-semibold text-stone-800">Onde estamos</h2>
      {endereco && (
        <p className="mt-2 text-stone-700">
          {endereco}
          <br />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-rose-700 underline"
          >
            Abrir no mapa
          </a>
        </p>
      )}
      {horarios.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-stone-600">
          {horarios.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {whatsapp && (
        <a
          href={`https://wa.me/55${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-2xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white hover:bg-emerald-700"
        >
          Falar no WhatsApp
        </a>
      )}
    </section>
  );
}

"use server";

// Ações da tela de configurações: atendentes, serviços, expediente e folgas.
// Todas conferem o login e mandam o token da dona para o banco: as regras
// de segurança (RLS) garantem que ela só mexe no próprio salão.
// Nada é apagado de verdade: atendente e serviço são desativados,
// porque as reservas antigas apontam para eles.

import { refresh } from "next/cache";
import {
  apagarFotos,
  consultar,
  ErroSupabase,
  subirFoto,
} from "@/lib/supabase";
import { usuarioLogado } from "@/lib/sessao";
import { salaoDoPainel } from "@/lib/painel";
import { normalizarChave, type TipoChave } from "@/lib/pix";
import { DIA_RE, inicioDoDiaUTC, instanteUTC, somarDias } from "@/lib/datas";

type Resultado = { erro: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Confere o login e descobre o salão do painel (da dona, ou o escolhido pelo administrador)
async function contexto() {
  const u = await usuarioLogado();
  if (!u || u === "vencido") return null;
  const { salao, admin } = await salaoDoPainel<{
    id: string;
    fuso_horario: string;
  }>(u, "id,fuso_horario");
  return salao
    ? { token: u.token, salaoId: salao.id, fuso: salao.fuso_horario, admin }
    : null;
}

const SESSAO = "Sua sessão expirou. Recarregue a página.";
const FALHOU = "Não foi possível salvar. Tente de novo.";

function nomeValido(v: unknown, max = 60): string | null {
  if (typeof v !== "string") return null;
  const nome = v.trim().replace(/\s+/g, " ");
  return nome.length >= 2 && nome.length <= max ? nome : null;
}

// ---------- Atendentes ----------

export async function salvarProfissional(dados: {
  id?: string;
  nome: string;
  ativo: boolean;
}): Promise<Resultado> {
  const nome = nomeValido(dados?.nome);
  if (!nome) return { erro: "O nome precisa ter de 2 a 60 letras." };
  if (dados.id !== undefined && !UUID.test(dados.id))
    return { erro: "Atendente inválida." };

  const c = await contexto();
  if (!c) return { erro: SESSAO };

  try {
    if (dados.id) {
      const alteradas = await consultar<unknown[]>(
        `profissionais?id=eq.${dados.id}&salao_id=eq.${c.salaoId}`,
        {
          metodo: "PATCH",
          body: { nome, ativo: Boolean(dados.ativo) },
          token: c.token,
          headers: { Prefer: "return=representation" },
        },
      );
      if (!alteradas?.length)
        return { erro: "Atendente não encontrada. Recarregue a página." };
    } else {
      await consultar(`profissionais`, {
        body: { salao_id: c.salaoId, nome, ativo: true },
        token: c.token,
      });
    }
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

// ---------- Serviços ----------

export async function salvarServico(dados: {
  id?: string;
  nome: string;
  preco_centavos: number;
  duracao_minutos: number;
  ativo: boolean;
  profissionais: string[];
}): Promise<Resultado> {
  const nome = nomeValido(dados?.nome, 80);
  if (!nome) return { erro: "O nome precisa ter de 2 a 80 letras." };
  const preco = dados.preco_centavos;
  if (!Number.isInteger(preco) || preco < 0 || preco > 10_000_00)
    return { erro: "Preço inválido." };
  const duracao = dados.duracao_minutos;
  if (
    !Number.isInteger(duracao) ||
    duracao < 5 ||
    duracao > 600 ||
    duracao % 5 !== 0
  ) {
    return { erro: "A duração precisa ser de 5 a 600 minutos, de 5 em 5." };
  }
  if (dados.id !== undefined && !UUID.test(dados.id))
    return { erro: "Serviço inválido." };
  if (
    !Array.isArray(dados.profissionais) ||
    !dados.profissionais.every((p) => typeof p === "string" && UUID.test(p))
  ) {
    return { erro: "Atendentes inválidas." };
  }
  const quem = [...new Set(dados.profissionais)];

  const c = await contexto();
  if (!c) return { erro: SESSAO };

  try {
    // Só aceita atendentes do próprio salão
    if (quem.length) {
      const doSalao = await consultar<{ id: string }[]>(
        `profissionais?salao_id=eq.${c.salaoId}&id=in.(${quem.join(",")})&select=id`,
        { token: c.token },
      );
      if (doSalao.length !== quem.length)
        return { erro: "Atendente não encontrada. Recarregue a página." };
    }

    const campos = {
      nome,
      preco_centavos: preco,
      duracao_minutos: duracao,
      ativo: Boolean(dados.ativo),
    };
    let servicoId = dados.id;
    if (servicoId) {
      const alterados = await consultar<unknown[]>(
        `servicos?id=eq.${servicoId}&salao_id=eq.${c.salaoId}`,
        {
          metodo: "PATCH",
          body: campos,
          token: c.token,
          headers: { Prefer: "return=representation" },
        },
      );
      if (!alterados?.length)
        return { erro: "Serviço não encontrado. Recarregue a página." };
    } else {
      const [novo] = await consultar<{ id: string }[]>(`servicos?select=id`, {
        body: { ...campos, salao_id: c.salaoId, ativo: true },
        token: c.token,
        headers: { Prefer: "return=representation" },
      });
      servicoId = novo.id;
    }

    // Quem faz: acrescenta as novas e tira as desmarcadas (sem apagar tudo antes)
    const atuais = await consultar<{ profissional_id: string }[]>(
      `servico_profissional?servico_id=eq.${servicoId}&select=profissional_id`,
      { token: c.token },
    );
    const tinha = new Set(atuais.map((a) => a.profissional_id));
    const entrar = quem.filter((p) => !tinha.has(p));
    const sair = [...tinha].filter((p) => !quem.includes(p));
    if (entrar.length) {
      await consultar(`servico_profissional`, {
        body: entrar.map((p) => ({
          servico_id: servicoId,
          profissional_id: p,
        })),
        token: c.token,
        headers: { Prefer: "resolution=ignore-duplicates" },
      });
    }
    if (sair.length) {
      await consultar(
        `servico_profissional?servico_id=eq.${servicoId}&profissional_id=in.(${sair.join(",")})`,
        {
          metodo: "DELETE",
          token: c.token,
        },
      );
    }
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

// ---------- Expediente ----------

export type Turno = { dia_semana: number; inicio: string; fim: string };

export async function salvarExpediente(
  profissionalId: string,
  turnos: Turno[],
): Promise<Resultado> {
  if (typeof profissionalId !== "string" || !UUID.test(profissionalId))
    return { erro: "Atendente inválida." };
  if (!Array.isArray(turnos) || turnos.length > 7)
    return { erro: "Expediente inválido." };
  const dias = new Set<number>();
  for (const t of turnos) {
    if (
      !Number.isInteger(t?.dia_semana) ||
      t.dia_semana < 0 ||
      t.dia_semana > 6 ||
      dias.has(t.dia_semana)
    ) {
      return { erro: "Expediente inválido." };
    }
    if (!HORA.test(t.inicio) || !HORA.test(t.fim))
      return { erro: "Horário inválido." };
    if (t.fim <= t.inicio)
      return { erro: "Em cada dia, o fim precisa ser depois do início." };
    dias.add(t.dia_semana);
  }

  const c = await contexto();
  if (!c) return { erro: SESSAO };

  try {
    const [prof] = await consultar<{ id: string }[]>(
      `profissionais?id=eq.${profissionalId}&salao_id=eq.${c.salaoId}&select=id`,
      { token: c.token },
    );
    if (!prof)
      return { erro: "Atendente não encontrada. Recarregue a página." };

    // Grava o novo antes de tirar o antigo: se algo falhar no meio,
    // o expediente antigo continua valendo (nunca fica sem nenhum).
    const antigos = await consultar<{ id: string }[]>(
      `horarios_funcionamento?profissional_id=eq.${profissionalId}&select=id`,
      { token: c.token },
    );
    if (turnos.length) {
      await consultar(`horarios_funcionamento`, {
        body: turnos.map((t) => ({
          profissional_id: profissionalId,
          dia_semana: t.dia_semana,
          inicio: t.inicio,
          fim: t.fim,
        })),
        token: c.token,
      });
    }
    if (antigos.length) {
      await consultar(
        `horarios_funcionamento?id=in.(${antigos.map((a) => a.id).join(",")})`,
        {
          metodo: "DELETE",
          token: c.token,
        },
      );
    }
  } catch (e) {
    if (e instanceof ErroSupabase && e.codigo === "23514")
      return { erro: "Horário inválido." };
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

// ---------- Folgas e bloqueios ----------
// O banco já respeita os bloqueios: horarios_livres não mostra e
// marcar_horario não aceita horário que bata com um deles.

export type NovaFolga = {
  profissionais: string[]; // uma ou mais atendentes (feriado = todas)
  de: string; // "AAAA-MM-DD"
  ate: string; // "AAAA-MM-DD" (igual a "de" quando é um dia só)
  diaInteiro: boolean;
  inicio?: string; // "HH:MM", só quando não é o dia inteiro
  fim?: string;
  motivo?: string;
};

export async function criarFolga(
  f: NovaFolga,
): Promise<Resultado & { aviso?: string }> {
  if (
    !Array.isArray(f?.profissionais) ||
    !f.profissionais.length ||
    !f.profissionais.every((p) => UUID.test(p))
  ) {
    return { erro: "Escolha pelo menos uma atendente." };
  }
  const quem = [...new Set(f.profissionais)];
  if (!DIA_RE.test(f.de) || !DIA_RE.test(f.ate) || f.ate < f.de)
    return { erro: "Datas inválidas." };
  if (somarDias(f.de, 366) < f.ate) return { erro: "No máximo 1 ano por vez." };
  if (!f.diaInteiro) {
    if (f.ate !== f.de)
      return { erro: "Folga de algumas horas vale para um dia só." };
    if (!f.inicio || !f.fim || !HORA.test(f.inicio) || !HORA.test(f.fim))
      return { erro: "Horário inválido." };
    if (f.fim <= f.inicio)
      return { erro: "O fim precisa ser depois do início." };
  }
  const motivo =
    typeof f.motivo === "string" ? f.motivo.trim().slice(0, 80) || null : null;

  const c = await contexto();
  if (!c) return { erro: SESSAO };

  const inicio = f.diaInteiro
    ? inicioDoDiaUTC(f.de, c.fuso)
    : instanteUTC(f.de, f.inicio!, c.fuso);
  const fim = f.diaInteiro
    ? inicioDoDiaUTC(somarDias(f.ate, 1), c.fuso)
    : instanteUTC(f.de, f.fim!, c.fuso);
  if (new Date(fim).getTime() <= Date.now())
    return { erro: "Esse período já passou." };

  try {
    const doSalao = await consultar<{ id: string }[]>(
      `profissionais?salao_id=eq.${c.salaoId}&id=in.(${quem.join(",")})&select=id`,
      { token: c.token },
    );
    if (doSalao.length !== quem.length)
      return { erro: "Atendente não encontrada. Recarregue a página." };

    await consultar(`bloqueios`, {
      body: quem.map((p) => ({ profissional_id: p, inicio, fim, motivo })),
      token: c.token,
    });

    // Reservas que já existiam nesse período continuam marcadas: só avisa
    const batem = await consultar<{ id: string }[]>(
      `agendamentos?profissional_id=in.(${quem.join(",")})&status=in.(aguardando_sinal,confirmado)` +
        `&inicio=lt.${encodeURIComponent(fim)}&fim=gt.${encodeURIComponent(inicio)}&select=id`,
      { token: c.token },
    );
    refresh();
    if (batem.length) {
      return {
        erro: null,
        aviso:
          batem.length === 1
            ? "Atenção: já existe 1 reserva nesse período. Ela continua marcada: avise a cliente ou cancele no painel."
            : `Atenção: já existem ${batem.length} reservas nesse período. Elas continuam marcadas: avise as clientes ou cancele no painel.`,
      };
    }
  } catch {
    return { erro: FALHOU };
  }
  return { erro: null };
}

export async function removerFolga(id: string): Promise<Resultado> {
  if (typeof id !== "string" || !UUID.test(id))
    return { erro: "Folga inválida." };
  const c = await contexto();
  if (!c) return { erro: SESSAO };
  try {
    // O RLS só deixa apagar bloqueio de atendente do próprio salão
    const apagados = await consultar<unknown[]>(`bloqueios?id=eq.${id}`, {
      metodo: "DELETE",
      token: c.token,
      headers: { Prefer: "return=representation" },
    });
    if (!apagados?.length)
      return { erro: "Folga não encontrada. Recarregue a página." };
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

// ---------- Página do salão (endereço, WhatsApp e fotos) ----------

export async function salvarInfoSalao(dados: {
  endereco: string;
  whatsapp: string;
}): Promise<Resultado> {
  const endereco =
    typeof dados?.endereco === "string"
      ? dados.endereco.trim().replace(/\s+/g, " ")
      : "";
  if (endereco.length > 200)
    return { erro: "Endereço muito longo (até 200 letras)." };
  const whatsapp =
    typeof dados?.whatsapp === "string"
      ? dados.whatsapp.replace(/\D/g, "")
      : "";
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 11)) {
    return {
      erro: "WhatsApp inválido. Use DDD + número, ex.: (11) 91234-5678.",
    };
  }

  const c = await contexto();
  if (!c) return { erro: SESSAO };
  try {
    await consultar(`saloes?id=eq.${c.salaoId}`, {
      metodo: "PATCH",
      body: { endereco: endereco || null, whatsapp: whatsapp || null },
      token: c.token,
    });
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

const MAX_FOTOS = 12;
const MAX_BYTES = 900 * 1024; // a tela já reduz a foto antes de mandar

// Confere pelo conteúdo (não só pelo nome) que é JPEG, PNG ou WebP
function tipoDaImagem(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45
  ) {
    return "image/webp";
  }
  return null;
}

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function enviarFoto(form: FormData): Promise<Resultado> {
  const arquivo = form.get("arquivo");
  const destino = form.get("destino");
  if (
    !(arquivo instanceof File) ||
    (destino !== "capa" && destino !== "galeria")
  )
    return { erro: "Foto inválida." };
  if (arquivo.size === 0 || arquivo.size > MAX_BYTES)
    return { erro: "A foto está grande demais. Tente outra." };
  const bytes = await arquivo.arrayBuffer();
  const tipo = tipoDaImagem(new Uint8Array(bytes.slice(0, 12)));
  if (!tipo)
    return { erro: "Formato não aceito. Use uma foto JPG, PNG ou WebP." };

  const c = await contexto();
  if (!c) return { erro: SESSAO };
  if (!c.admin)
    return { erro: "Só o administrador do sistema mexe nas fotos." };

  try {
    let ordem = 0;
    if (destino === "galeria") {
      const fotos = await consultar<{ ordem: number }[]>(
        `fotos_salao?salao_id=eq.${c.salaoId}&select=ordem&order=ordem.desc`,
        { token: c.token },
      );
      if (fotos.length >= MAX_FOTOS)
        return {
          erro: `No máximo ${MAX_FOTOS} fotos. Tire uma antes de pôr outra.`,
        };
      ordem = (fotos[0]?.ordem ?? -1) + 1;
    }

    const caminho = `${c.salaoId}/${crypto.randomUUID()}.${EXTENSAO[tipo]}`;
    await subirFoto(caminho, bytes, tipo, c.token);

    if (destino === "capa") {
      const [antes] = await consultar<{ foto_capa: string | null }[]>(
        `saloes?id=eq.${c.salaoId}&select=foto_capa`,
        {
          token: c.token,
        },
      );
      await consultar(`saloes?id=eq.${c.salaoId}`, {
        metodo: "PATCH",
        body: { foto_capa: caminho },
        token: c.token,
      });
      if (antes?.foto_capa)
        await apagarFotos([antes.foto_capa], c.token).catch(() => null);
    } else {
      await consultar(`fotos_salao`, {
        body: { salao_id: c.salaoId, caminho, ordem },
        token: c.token,
      });
    }
  } catch {
    return { erro: "Não foi possível subir a foto. Tente de novo." };
  }
  refresh();
  return { erro: null };
}

export async function removerFoto(id: string | "capa"): Promise<Resultado> {
  if (id !== "capa" && (typeof id !== "string" || !UUID.test(id)))
    return { erro: "Foto inválida." };
  const c = await contexto();
  if (!c) return { erro: SESSAO };
  if (!c.admin)
    return { erro: "Só o administrador do sistema mexe nas fotos." };
  try {
    if (id === "capa") {
      const [s] = await consultar<{ foto_capa: string | null }[]>(
        `saloes?id=eq.${c.salaoId}&select=foto_capa`,
        {
          token: c.token,
        },
      );
      await consultar(`saloes?id=eq.${c.salaoId}`, {
        metodo: "PATCH",
        body: { foto_capa: null },
        token: c.token,
      });
      if (s?.foto_capa)
        await apagarFotos([s.foto_capa], c.token).catch(() => null);
    } else {
      const apagadas = await consultar<{ caminho: string }[]>(
        `fotos_salao?id=eq.${id}&salao_id=eq.${c.salaoId}`,
        {
          metodo: "DELETE",
          token: c.token,
          headers: { Prefer: "return=representation" },
        },
      );
      if (!apagadas?.length)
        return { erro: "Foto não encontrada. Recarregue a página." };
      await apagarFotos([apagadas[0].caminho], c.token).catch(() => null);
    }
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

// Troca a foto de lugar com a vizinha (para a esquerda ou para a direita)
export async function moverFoto(
  id: string,
  direcao: -1 | 1,
): Promise<Resultado> {
  if (
    typeof id !== "string" ||
    !UUID.test(id) ||
    (direcao !== -1 && direcao !== 1)
  )
    return { erro: "Foto inválida." };
  const c = await contexto();
  if (!c) return { erro: SESSAO };
  if (!c.admin)
    return { erro: "Só o administrador do sistema mexe nas fotos." };
  try {
    const fotos = await consultar<{ id: string; ordem: number }[]>(
      `fotos_salao?salao_id=eq.${c.salaoId}&select=id,ordem&order=ordem,criado_em`,
      { token: c.token },
    );
    const i = fotos.findIndex((f) => f.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= fotos.length) return { erro: null };
    // Renumera 0, 1, 2... já com as duas trocadas
    const nova = [...fotos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    await Promise.all(
      nova.map((f, k) =>
        f.ordem === k
          ? null
          : consultar(`fotos_salao?id=eq.${f.id}`, {
              metodo: "PATCH",
              body: { ordem: k },
              token: c.token,
            }),
      ),
    );
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

// ---------- Pix do sinal (só a dona ou o administrador) ----------

export async function salvarPix(dados: {
  tipo: TipoChave;
  chave: string;
  nome: string;
  cidade: string;
}): Promise<Resultado> {
  const tipos: TipoChave[] = ["cpf", "cnpj", "celular", "email", "aleatoria"];
  if (!tipos.includes(dados?.tipo)) return { erro: "Escolha o tipo da chave." };
  const vazia = typeof dados.chave !== "string" || !dados.chave.trim();
  const chave = vazia ? null : normalizarChave(dados.tipo, dados.chave);
  if (!vazia && !chave)
    return { erro: "Chave Pix inválida para o tipo escolhido." };
  const nome =
    typeof dados.nome === "string" ? dados.nome.trim().slice(0, 60) : "";
  const cidade =
    typeof dados.cidade === "string" ? dados.cidade.trim().slice(0, 40) : "";
  if (chave && nome.length < 2)
    return { erro: "Escreva o nome que aparece no Pix (de quem recebe)." };

  const c = await contexto();
  if (!c) return { erro: SESSAO };
  if (!c.admin) {
    const u = await usuarioLogado();
    const [s] = await consultar<{ dono_id: string | null }[]>(
      `saloes?id=eq.${c.salaoId}&select=dono_id`,
      {
        token: c.token,
      },
    );
    if (!u || u === "vencido" || s?.dono_id !== u.id)
      return { erro: "Só a dona do salão pode mudar a chave Pix." };
  }
  try {
    await consultar(`saloes?id=eq.${c.salaoId}`, {
      metodo: "PATCH",
      body: {
        pix_chave: chave,
        pix_nome: nome || null,
        pix_cidade: cidade || "SAO PAULO",
      },
      token: c.token,
    });
  } catch {
    return { erro: FALHOU };
  }
  refresh();
  return { erro: null };
}

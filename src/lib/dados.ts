import { consultar, urlPublicaFoto } from "./supabase";

export type Salao = {
  id: string;
  nome: string;
  fuso_horario: string;
  sinal_valor_centavos: number;
  minutos_para_pagar_sinal: number;
  endereco: string | null;
  whatsapp: string | null;
  foto_capa: string | null;
  no_ar: boolean; // false = suspenso pelo administrador
  pix_chave: string | null;
  pix_nome: string | null;
  pix_cidade: string;
};

export type Profissional = {
  id: string;
  nome: string;
  dias: number[]; // dias da semana em que atende (0 = domingo ... 6 = sábado)
};

export type Servico = {
  id: string;
  nome: string;
  preco_centavos: number;
  duracao_minutos: number;
  profissionais: string[]; // ids de quem faz
};

export type DadosSalao = {
  salao: Salao;
  profissionais: Profissional[];
  servicos: Servico[];
  capa: string | null; // URL pública da foto de capa
  fotos: string[]; // URLs públicas da galeria "Nossos trabalhos"
  expediente: { dia: number; inicio: string; fim: string }[]; // horário do salão por dia da semana
};

// Tudo que a vitrine pública do salão precisa, numa leitura só.
export async function carregarSalao(slug: string): Promise<DadosSalao | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;

  const saloes = await consultar<Salao[]>(
    `saloes?slug=eq.${slug}&select=id,nome,fuso_horario,sinal_valor_centavos,minutos_para_pagar_sinal,endereco,whatsapp,foto_capa,no_ar,pix_chave,pix_nome,pix_cidade`,
  );
  const salao = saloes[0];
  if (!salao) return null;

  const [profs, servs, fotos] = await Promise.all([
    consultar<
      {
        id: string;
        nome: string;
        horarios_funcionamento: {
          dia_semana: number;
          inicio: string;
          fim: string;
        }[];
      }[]
    >(
      `profissionais?salao_id=eq.${salao.id}&ativo=eq.true&select=id,nome,horarios_funcionamento(dia_semana,inicio,fim)&order=nome`,
    ),
    consultar<
      {
        id: string;
        nome: string;
        preco_centavos: number;
        duracao_minutos: number;
        servico_profissional: { profissional_id: string }[];
      }[]
    >(
      `servicos?salao_id=eq.${salao.id}&ativo=eq.true&select=id,nome,preco_centavos,duracao_minutos,servico_profissional(profissional_id)&order=preco_centavos`,
    ),
    consultar<{ caminho: string }[]>(
      `fotos_salao?salao_id=eq.${salao.id}&select=caminho&order=ordem,criado_em`,
    ),
  ]);

  // Horário do salão em cada dia: do primeiro início ao último fim entre as atendentes ativas
  const porDia = new Map<number, { inicio: string; fim: string }>();
  for (const h of profs.flatMap((p) => p.horarios_funcionamento)) {
    const atual = porDia.get(h.dia_semana);
    const inicio = h.inicio.slice(0, 5);
    const fim = h.fim.slice(0, 5);
    porDia.set(h.dia_semana, {
      inicio: atual && atual.inicio < inicio ? atual.inicio : inicio,
      fim: atual && atual.fim > fim ? atual.fim : fim,
    });
  }

  const idsAtivos = new Set(profs.map((p) => p.id));

  return {
    salao,
    profissionais: profs.map((p) => ({
      id: p.id,
      nome: p.nome,
      dias: [...new Set(p.horarios_funcionamento.map((h) => h.dia_semana))],
    })),
    servicos: servs
      .map((s) => ({
        id: s.id,
        nome: s.nome,
        preco_centavos: s.preco_centavos,
        duracao_minutos: s.duracao_minutos,
        profissionais: s.servico_profissional
          .map((v) => v.profissional_id)
          .filter((id) => idsAtivos.has(id)),
      }))
      .filter((s) => s.profissionais.length > 0),
    capa: salao.foto_capa ? urlPublicaFoto(salao.foto_capa) : null,
    fotos: fotos.map((f) => urlPublicaFoto(f.caminho)),
    expediente: [...porDia]
      .map(([dia, h]) => ({ dia, ...h }))
      .sort((a, b) => a.dia - b.dia),
  };
}

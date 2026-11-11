// "Pix copia e cola" (BR Code estático do Banco Central) com valor já preenchido.
// A cliente cola no app do banco (ou lê o QR Code) e o Pix já vem com a chave,
// o nome de quem recebe e o valor do sinal. O dinheiro cai direto na conta do salão.
// Formato: campos ID + tamanho (2 dígitos) + valor, e no fim um CRC16.

function campo(id: string, valor: string) {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

// Banco Central só aceita letras sem acento, números e alguns sinais
function limpar(texto: string, max: number) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

// CRC16-CCITT (polinômio 0x1021, começa em 0xFFFF), exigido pelo padrão
export function crc16(texto: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type TipoChave = "cpf" | "cnpj" | "celular" | "email" | "aleatoria";

// Confere e arruma a chave conforme o tipo (null = inválida).
// Celular vai como +55DDDNÚMERO; CPF/CNPJ só com números.
export function normalizarChave(tipo: TipoChave, valor: string): string | null {
  const v = valor.trim();
  const numeros = v.replace(/\D/g, "");
  switch (tipo) {
    case "cpf":
      return numeros.length === 11 ? numeros : null;
    case "cnpj":
      return numeros.length === 14 ? numeros : null;
    case "celular": {
      const n =
        numeros.length === 13 && numeros.startsWith("55")
          ? numeros.slice(2)
          : numeros;
      return n.length === 11 ? `+55${n}` : null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 77
        ? v.toLowerCase()
        : null;
    case "aleatoria":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        v,
      )
        ? v.toLowerCase()
        : null;
  }
}

export function pixCopiaECola(opcoes: {
  chave: string;
  nome: string;
  cidade: string;
  valorCentavos: number;
  referencia: string; // aparece no extrato de alguns bancos (até 25 letras/números)
}) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", opcoes.chave);
  const referencia =
    opcoes.referencia.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (opcoes.valorCentavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(opcoes.nome, 25) || "SALAO") +
    campo("60", limpar(opcoes.cidade, 15) || "SAO PAULO") +
    campo("62", campo("05", referencia)) +
    "6304";
  return semCrc + crc16(semCrc);
}

// Hora atual do servidor, lida uma vez por requisição (fora do componente,
// para não quebrar a regra de "componente puro" do React).
export function agoraMs() {
  return Date.now();
}

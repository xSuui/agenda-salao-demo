import { redirect } from "next/navigation";

// Por enquanto a página inicial leva direto para a agenda do primeiro salão.
// Quando houver mais salões, aqui vira a página de apresentação do produto.
export default function Home() {
  redirect("/studio-demo");
}

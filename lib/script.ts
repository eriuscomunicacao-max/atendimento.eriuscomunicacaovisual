import { CONFIG } from "./config";

// Cada fala tem "audio". Vazio = só texto. Na fase 2: audio: "/audio/intro-1.mp3"
export type Line = { text: string; audio?: string };

export const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

const A = CONFIG.assistantName;

export const S = {
  intro: (g: string): Line[] => [
    { text: `${g}! Aqui é a ${A}, da ${CONFIG.brand}. Vou iniciar o seu atendimento.`, audio: "" },
    { text: "Como posso te chamar?", audio: "" },
  ],
  askPhone: (n: string): Line[] => [
    { text: `Prazer, ${n}!`, audio: "" },
    { text: "Me passa seu WhatsApp? Se a conexão cair, eu consigo te chamar pra continuar de onde parou.", audio: "" },
  ],
  askSize: (n: string): Line[] => [
    { text: `Perfeito, ${n}. Sobre as etiquetas, qual tamanho você precisa hoje?`, audio: "" },
  ],
  askQty: (): Line[] => [{ text: "Boa escolha. E qual a quantidade que você precisa?", audio: "" }],
  minQty: (n: number): Line[] => [
    {
      text: `O pedido mínimo é de ${CONFIG.minQty} unidades, e a diferença de valor de ${n} pra ${CONFIG.minQty} é bem pequena. Qual quantidade você prefere?`,
      audio: "",
    },
  ],
  round: (from: number, to: number): Line[] => [
    { text: `Trabalhamos em múltiplos de ${CONFIG.qtyStep}, então ajustei de ${from} para ${to} unidades.`, audio: "" },
  ],
  askCep: (): Line[] => [{ text: "Me passe seu CEP para ver se está dentro do raio de frete grátis, por favor.", audio: "" }],
  calc: (): Line[] => [{ text: "Só um minutinho que eu vou calcular...", audio: "" }],
  bfOffer: (n: string, day: number | null): Line[] => [
    { text: `Antes de fechar, ${n}: a gente está com a promoção de Black Friday${day ? `, válida até dia ${day} de novembro` : ""}.`, audio: "" },
    {
      text: `Você leva ${CONFIG.bf.billedQty} unidades + ${CONFIG.bf.bonusQty} de brinde, com frete grátis, e paga só o valor das ${CONFIG.bf.billedQty}.`,
      audio: "",
    },
  ],
  recalc: (): Line[] => [{ text: "Só um instante, vou recalcular...", audio: "" }],
  finish: (n: string): Line[] => [
    { text: `Fechado, ${n}! Seu orçamento está pronto. Toque no botão abaixo para confirmar e enviar a arte no WhatsApp.`, audio: "" },
  ],
  custom: (): Line[] => [
    { text: "Esse caso pede um orçamento personalizado. Toque no botão abaixo para continuar no WhatsApp com o que você já informou.", audio: "" },
  ],
};

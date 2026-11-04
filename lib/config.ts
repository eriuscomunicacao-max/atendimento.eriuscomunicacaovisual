export const CONFIG = {
  brand: "Érius",
  assistantName: "Ana",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP || "5519900000000",

  // Precisa bater com as chaves de lib/prices.ts
  sizes: ["2x2", "3x3", "4x4", "5x5", "6x6", "8x8", "10x10"],

  shipping: 30,
  // Cidades dentro do raio de frete grátis (escreva o nome da cidade, ex.: "Casa Branca").
  // Vazio = ninguém tem frete grátis (exceto na oferta Black Friday).
  freeShippingCities: [] as string[],
  fullPriceExtra: 20, // valor cheio = tabela + frete + este extra
  roundStep: 0, // 0 = centavos; 5 = arredonda de 5 em 5 reais

  minQty: 150,
  qtyStep: 50,
  maxQty: 1000,

  // Black Friday: pedido de min a max recebe billedQty + bonusQty, frete grátis
  bf: { min: 150, max: 299, billedQty: 300, bonusQty: 100 },
  promo: { month: 11, deadlines: [8, 15, 22, 29, 30] },

  timezone: "America/Sao_Paulo",
};

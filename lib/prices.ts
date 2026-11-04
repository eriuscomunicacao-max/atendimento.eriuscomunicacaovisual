// Tabela base (R$) por tamanho. Quantidades: 150, 200, ... 1000 (18 valores por linha).
// 2x2 e 3x3 NÃO usam esta tabela: têm regra própria em SPECIAL.
export const QTYS = Array.from({ length: 18 }, (_, i) => 150 + i * 50);

function row(values: number[]): Record<number, number> {
  if (values.length !== QTYS.length) throw new Error("Linha de preços com tamanho errado");
  return Object.fromEntries(QTYS.map((q, i) => [q, values[i]]));
}

export const PRICES: Record<string, Record<number, number>> = {
  "4x4": row([26.18, 34.65, 43.12, 51.59, 60.06, 68.53, 77.00, 85.47, 93.94, 102.41, 110.88, 119.35, 127.82, 136.29, 144.76, 153.23, 161.70, 170.17]),
  "5x5": row([37.13, 49.24, 61.36, 73.48, 85.60, 97.71, 109.83, 121.95, 134.07, 146.18, 158.30, 170.42, 182.53, 194.65, 206.77, 218.89, 231.00, 243.12]),
  "6x6": row([48.26, 64.09, 79.92, 95.74, 111.57, 127.40, 143.23, 159.06, 174.89, 190.71, 206.54, 222.37, 238.20, 254.03, 269.86, 285.68, 301.51, 317.34]),
  "8x8": row([91.22, 121.37, 151.52, 181.67, 211.82, 241.97, 272.12, 302.27, 332.41, 362.56, 392.71, 422.86, 453.01, 483.16, 513.31, 543.46, 573.61, 603.76]),
  "10x10": row([127.40, 169.61, 211.82, 254.03, 296.24, 338.44, 380.65, 422.86, 465.07, 507.28, 549.49, 591.70, 633.91, 676.11, 718.32, 760.53, 802.74, 844.95]),
};

// Regras próprias (valor base, antes do frete e do extra)
const SPECIAL: Record<string, (qty: number) => number> = {
  "2x2": () => 50,
  "3x3": (qty) => (qty <= 500 ? 55 : 91), // 150 a 500 = 55 | 550 a 1000 = 91
};

// Piso: se o valor base de qualquer pedido der menos que isso, vira isso.
export const MIN_BASE = 50;

export function tableValue(size: string, qty: number): number | null {
  if (!QTYS.includes(qty)) return null;
  const special = SPECIAL[size];
  const v = special ? special(qty) : PRICES[size]?.[qty];
  if (typeof v !== "number") return null;
  return Math.max(v, MIN_BASE);
}

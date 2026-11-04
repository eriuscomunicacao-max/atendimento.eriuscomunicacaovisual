import { CONFIG } from "./config";
import { tableValue } from "./prices";

const pad = (n: number) => String(n).padStart(2, "0");

export function brDate(now = new Date()) {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function endOfDayBR(y: number, m: number, d: number) {
  return new Date(`${y}-${pad(m)}-${pad(d)}T23:59:59-03:00`);
}

export type Promo = { active: boolean; deadline: number | null; year: number };

export function getPromo(now = new Date()): Promo {
  const { y, m, d } = brDate(now);
  if (m !== CONFIG.promo.month) return { active: false, deadline: null, year: y };
  const deadline = CONFIG.promo.deadlines.find((x) => x >= d) ?? null;
  return { active: deadline !== null, deadline, year: y };
}

const normText = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function isFreeShipping(city?: string | null) {
  if (!city) return false;
  return CONFIG.freeShippingCities.map(normText).includes(normText(city));
}

const money = (n: number) => {
  const r = CONFIG.roundStep;
  const v = r > 0 ? Math.round(n / r) * r : n;
  return Math.round(v * 100) / 100;
};

export type QuoteOk = {
  ok: true;
  size: string;
  qty: number;
  billedQty: number;
  deliveredQty: number;
  table: number;
  shipping: number;
  fullPrice: number;
  todayPrice: number;
  bf: boolean;
  bfEligible: boolean;
  promoDay: number | null;
};
export type QuoteErr = { ok: false; reason: "min" | "custom" };
export type QuoteResult = QuoteOk | QuoteErr;

// ÚNICA função de cálculo do sistema (roda só no servidor).
export function buildQuote(a: { size: string; qty: number; bf: boolean; promo: Promo; freeShipping?: boolean }): QuoteResult {
  let qty = Number(a.qty);
  if (!Number.isFinite(qty) || qty < CONFIG.minQty) return { ok: false, reason: "min" };
  qty = Math.ceil(qty / CONFIG.qtyStep) * CONFIG.qtyStep;
  if (qty > CONFIG.maxQty) return { ok: false, reason: "custom" };

  const bfEligible = a.promo.active && qty >= CONFIG.bf.min && qty <= CONFIG.bf.max;
  const useBf = a.bf && bfEligible;

  const billedQty = useBf ? CONFIG.bf.billedQty : qty;
  const table = tableValue(a.size, billedQty);
  if (table === null) return { ok: false, reason: "custom" };

  const shipping = useBf || a.freeShipping ? 0 : CONFIG.shipping;
  const todayPrice = money(table + shipping);
  const fullPrice = useBf ? todayPrice : money(table + shipping + CONFIG.fullPriceExtra);

  return {
    ok: true,
    size: a.size,
    qty,
    billedQty,
    deliveredQty: useBf ? CONFIG.bf.billedQty + CONFIG.bf.bonusQty : qty,
    table,
    shipping,
    fullPrice,
    todayPrice,
    bf: useBf,
    bfEligible,
    promoDay: a.promo.deadline,
  };
}

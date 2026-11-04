import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildQuote, brDate, endOfDayBR, getPromo, isFreeShipping } from "@/lib/pricing";
import { normalizePhone } from "@/lib/whatsapp";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { id, patch = {}, wantQuote = false, bf = false } = body;
  const now = new Date();
  const promo = getPromo(now);

  const row: Record<string, unknown> = { updated_at: now.toISOString() };

  if (typeof patch.name === "string") row.name = patch.name.trim().slice(0, 60);
  if (typeof patch.phone === "string") row.phone = normalizePhone(patch.phone).slice(0, 13);
  if (typeof patch.consent === "boolean") row.consent = patch.consent;
  if (typeof patch.size === "string" && CONFIG.sizes.includes(patch.size)) row.size = patch.size;
  if (patch.qty !== undefined) row.qty = Math.max(0, Math.min(100000, Number(patch.qty) || 0));
  if (typeof patch.cep === "string") row.cep = patch.cep.replace(/\D/g, "").slice(0, 8);
  if (typeof patch.city === "string") row.city = patch.city.slice(0, 80);
  if (typeof patch.uf === "string") row.uf = patch.uf.slice(0, 2);
  if (["started", "phone", "quoted", "whatsapp"].includes(patch.status)) row.status = patch.status;

  // 1) Lê o lead existente (se o banco falhar, segue sem ele)
  let current: Record<string, any> | null = null;
  if (id) {
    try {
      const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      current = data;
    } catch (e) {
      console.error("lead read error", e);
    }
  }

  // 2) Calcula o orçamento. NÃO depende do banco: usa o que veio na requisição.
  let quote: Record<string, unknown> | null = null;
  const size = (row.size ?? current?.size) as string | undefined;
  const qty = (row.qty ?? current?.qty) as number | undefined;

  if (wantQuote && size && qty) {
    const city = (row.city ?? current?.city) as string | undefined;
    const q = buildQuote({ size, qty, bf: !!bf, promo, freeShipping: isFreeShipping(city) });
    if (q.ok) {
      row.table_value = q.table;
      row.full_price = q.fullPrice;
      row.today_price = q.todayPrice;
      row.bf_offer = q.bf;
      if (q.bf && promo.deadline) {
        const { y, m } = brDate(now);
        row.offer_expires_at = endOfDayBR(y, m, promo.deadline).toISOString();
      } else if (!current?.offer_expires_at) {
        const { y, m, d } = brDate(now);
        row.offer_expires_at = endOfDayBR(y, m, d).toISOString();
      }
      const expires = (row.offer_expires_at ?? current?.offer_expires_at) as string | undefined;
      quote = { ...q, todayActive: !!expires && new Date(expires) > now };
    } else {
      quote = q;
    }
  }

  // 3) Salva o lead (se falhar, o orçamento ainda é devolvido)
  let leadId: string | undefined = current?.id;
  try {
    if (current) {
      await supabase.from("leads").update(row).eq("id", current.id);
    } else {
      if (patch.source && typeof patch.source === "object") row.source = patch.source;
      const { data, error } = await supabase.from("leads").insert(row).select("id").single();
      if (error) throw error;
      leadId = data.id;
    }
  } catch (e) {
    console.error("lead save error", e);
  }

  return NextResponse.json({ id: leadId, quote });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ found: false });

  try {
    const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
    if (!data || !data.size || !data.qty) return NextResponse.json({ found: false });

    const now = new Date();
    const q = buildQuote({
      size: data.size,
      qty: data.qty,
      bf: !!data.bf_offer,
      promo: getPromo(now),
      freeShipping: isFreeShipping(data.city),
    });
    const todayActive = !!data.offer_expires_at && new Date(data.offer_expires_at) > now;

    return NextResponse.json({
      found: true,
      name: data.name,
      quote: q.ok ? { ...q, todayActive } : q,
    });
  } catch {
    return NextResponse.json({ found: false });
  }
}

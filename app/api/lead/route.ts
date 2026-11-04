import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildQuote, brDate, endOfDayBR, getPromo } from "@/lib/pricing";
import { normalizePhone } from "@/lib/whatsapp";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { id, patch = {}, wantQuote = false, bf = false } = await req.json();
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

    let current: Record<string, any> | null = null;
    if (id) {
      const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
      current = data;
    }

    let quote: Record<string, unknown> | null = null;
    const size = (row.size ?? current?.size) as string | undefined;
    const qty = (row.qty ?? current?.qty) as number | undefined;

    if (wantQuote && size && qty) {
      const q = buildQuote({ size, qty, bf: !!bf, promo });
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

    let leadId: string | undefined = current?.id;
    if (current) {
      await supabase.from("leads").update(row).eq("id", current.id);
    } else {
      if (patch.source && typeof patch.source === "object") row.source = patch.source;
      const { data, error } = await supabase.from("leads").insert(row).select("id").single();
      if (error) throw error;
      leadId = data.id;
    }

    return NextResponse.json({ id: leadId, quote });
  } catch (e) {
    return NextResponse.json({ error: "lead_error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ found: false });

  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!data || !data.size || !data.qty) return NextResponse.json({ found: false });

  const now = new Date();
  const q = buildQuote({ size: data.size, qty: data.qty, bf: !!data.bf_offer, promo: getPromo(now) });
  const todayActive = !!data.offer_expires_at && new Date(data.offer_expires_at) > now;

  return NextResponse.json({
    found: true,
    name: data.name,
    quote: q.ok ? { ...q, todayActive } : q,
  });
}

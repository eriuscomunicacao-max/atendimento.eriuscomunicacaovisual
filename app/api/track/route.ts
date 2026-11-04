import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { normalizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export async function POST(req: Request) {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) return NextResponse.json({ ok: false });

  try {
    const b = await req.json();
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

    const user_data: Record<string, unknown> = {
      client_user_agent: req.headers.get("user-agent") || undefined,
      client_ip_address: ip || undefined,
      fbp: b.fbp || undefined,
      fbc: b.fbc || undefined,
    };
    if (b.phone) user_data.ph = [sha(normalizePhone(String(b.phone)))];
    if (b.name) user_data.fn = [sha(String(b.name).split(" ")[0])];

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: b.event,
          event_time: Math.floor(Date.now() / 1000),
          event_id: b.eventId,
          event_source_url: b.url,
          action_source: "website",
          user_data,
          custom_data: b.custom || {},
        },
      ],
    };
    if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

    await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

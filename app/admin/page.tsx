import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { CONFIG } from "@/lib/config";
import { normalizePhone, waLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

async function markSent(fd: FormData) {
  "use server";
  const key = String(fd.get("key"));
  const id = String(fd.get("id"));
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return;
  await supabase.from("leads").update({ recovery_sent: true }).eq("id", id);
  revalidatePath("/admin");
}

export default async function Admin({ searchParams }: { searchParams: { key?: string } }) {
  const key = searchParams.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return <main style={{ padding: 24 }}>Acesso negado.</main>;
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .in("status", ["started", "phone", "quoted"])
    .not("phone", "is", null)
    .eq("recovery_sent", false)
    .lt("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(100);

  const site = process.env.NEXT_PUBLIC_SITE_URL || "";

  return (
    <main style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 6 }}>Leads para recuperar</h1>
      <p style={{ color: "#a9b7d6", marginBottom: 18 }}>
        Começaram o orçamento há mais de 1 hora e não clicaram no WhatsApp.
      </p>

      {(data || []).length === 0 && <p>Nenhum lead pendente.</p>}

      {(data || []).map((l) => {
        const nome = (l.name || "").split(" ")[0] || "tudo bem";
        const msg = `Oi, ${nome}! Aqui é a ${CONFIG.assistantName}, da ${CONFIG.brand}. Vi que você começou um orçamento de etiquetas e não terminou. Quer continuar? ${site}/?l=${l.id}`;
        return (
          <div key={l.id} style={{ background: "#16213a", borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <b>{l.name || "Sem nome"}</b> · {l.phone}
            <div style={{ color: "#a9b7d6", fontSize: 14, margin: "4px 0 10px" }}>
              {l.size ? `${l.size} cm` : "sem tamanho"} · {l.qty ? `${l.qty} un` : "sem quantidade"} ·{" "}
              {l.today_price ? `R$ ${l.today_price}` : "sem valor"} · {l.status}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={waLink(normalizePhone(l.phone), msg)}
                target="_blank"
                rel="noreferrer"
                style={{ background: "#16a34a", color: "#fff", padding: "10px 14px", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}
              >
                Chamar no WhatsApp
              </a>
              <form action={markSent}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="key" value={key} />
                <button type="submit" style={{ background: "#243455", color: "#fff", padding: "10px 14px", borderRadius: 10 }}>
                  Marcar enviado
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </main>
  );
}

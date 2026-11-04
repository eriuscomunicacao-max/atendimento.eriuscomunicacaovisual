"use client";

import { useEffect, useRef, useState } from "react";
import { CONFIG } from "@/lib/config";
import { getSource, track } from "@/lib/meta";
import { waLink } from "@/lib/whatsapp";
import { greeting, S } from "@/lib/script";
import type { Line } from "@/lib/script";

type Step = "idle" | "name" | "phone" | "size" | "qty" | "cep" | "accept" | "bf" | "confirm";
type Msg = { id: number; from: "bot" | "user"; text: string };
type Quote = {
  ok: true;
  size: string;
  qty: number;
  billedQty: number;
  deliveredQty: number;
  table: number;
  shipping: number;
  fullPrice: number;
  todayPrice: number;
  todayActive: boolean;
  bf: boolean;
  bfEligible: boolean;
  promoDay: number | null;
};
type QuoteResp = Quote | { ok: false; reason: "min" | "custom" };
type Data = { name?: string; phone?: string; size?: string; qty?: number; cep?: string; city?: string; uf?: string };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SILENT =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

export default function Chat() {
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [muted, setMuted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);

  const data = useRef<Data>({});
  const leadId = useRef<string | null>(null);
  const quoteRef = useRef<Quote | null>(null);
  const offered = useRef(false);
  const pendingWa = useRef<{ url: string; custom: boolean } | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const idc = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, typing, step]);

  const push = (from: "bot" | "user", text: string) =>
    setMsgs((m) => [...m, { id: ++idc.current, from, text }]);

  const first = () => (data.current.name || "").split(" ")[0];

  async function say(lines: Line[]) {
    for (const l of lines) {
      setTyping(true);
      await wait(Math.min(1600 + l.text.length * 45, 4500));
      setTyping(false);
      push("bot", l.text);
      if (l.audio && !mutedRef.current && audio.current) {
        audio.current.src = l.audio;
        audio.current.play().catch(() => {});
      }
      await wait(800);
    }
  }

  type SaveResp = { id?: string; quote?: QuoteResp };

  // Uma chamada por vez, na ordem, para o id do lead existir antes da próxima.
  function saveLead(
    patch: Record<string, unknown>,
    opts: { wantQuote?: boolean; bf?: boolean } = {}
  ): Promise<SaveResp> {
    const run = saveQueue.current.then(() => doSaveLead(patch, opts));
    saveQueue.current = run.catch(() => {});
    return run;
  }

  async function doSaveLead(
    patch: Record<string, unknown>,
    opts: { wantQuote?: boolean; bf?: boolean } = {}
  ): Promise<SaveResp> {
    try {
      const r = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId.current, patch: { ...patch, source: getSource() }, ...opts }),
      });
      const j = await r.json();
      if (j.id) leadId.current = j.id;
      return j;
    } catch {
      return {};
    }
  }

  function unlockAudio() {
    const a = new Audio(SILENT);
    audio.current = a;
    a.play().catch(() => {});
  }

  function toggleMute() {
    const v = !muted;
    setMuted(v);
    mutedRef.current = v;
    if (v) audio.current?.pause();
  }

  async function start() {
    unlockAudio();
    track("ViewContent");
    setLoading(true);
    await wait(2600);
    setStarted(true);

    const l = new URLSearchParams(location.search).get("l");
    if (l) {
      try {
        const r = await fetch(`/api/lead?id=${encodeURIComponent(l)}`);
        const j = await r.json();
        if (j.found && j.quote?.ok) {
          leadId.current = l;
          data.current = { name: j.name, size: j.quote.size, qty: j.quote.qty };
          await say([{ text: `Oi, ${first()}! Que bom que você voltou.` }]);
          await showQuote(j.quote);
          return;
        }
      } catch {}
    }

    await say(S.intro(greeting()));
    setStep("name");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (step === "name") {
      const name = input.trim().replace(/\s+/g, " ").slice(0, 40);
      if (name.length < 2) return;
      setInput("");
      setStep("idle");
      push("user", name);
      data.current.name = name;
      saveLead({ name, status: "started" });
      await say(S.askPhone(first()));
      setStep("phone");
      return;
    }

    if (step === "phone") {
      const d = input.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
      if (d.length < 10 || d.length > 11) return setErr("Confere o número com DDD, por favor.");
      setInput("");
      setStep("idle");
      push("user", d);
      data.current.phone = d;
      saveLead({ phone: d, consent: true, status: "phone" });
      track("LeadCapturado", { phone: d, name: data.current.name });
      await say(S.askSize(first()));
      setStep("size");
      return;
    }

    if (step === "qty") {
      const n = parseInt(input.replace(/\D/g, ""), 10);
      if (!n) return;
      setInput("");
      await handleQty(n);
      return;
    }

    if (step === "cep") {
      const cep = input.replace(/\D/g, "");
      if (cep.length !== 8) return setErr("O CEP tem 8 números.");
      setInput("");
      setStep("idle");
      push("user", `${cep.slice(0, 5)}-${cep.slice(5)}`);
      await handleCep(cep);
    }
  }

  async function skipPhone() {
    setErr("");
    setStep("idle");
    push("user", "Prefiro não informar agora");
    await say(S.askSize(first()));
    setStep("size");
  }

  async function pickSize(s: string) {
    setStep("idle");
    push("user", `${s} cm`);
    data.current.size = s;
    saveLead({ size: s });
    await say(S.askQty());
    setStep("qty");
  }

  async function handleQty(n: number) {
    setErr("");
    setStep("idle");
    push("user", `${n} unidades`);

    if (n < CONFIG.minQty) {
      await say(S.minQty(n));
      setStep("qty");
      return;
    }
    if (n > CONFIG.maxQty) return customWhatsApp();

    const norm = Math.ceil(n / CONFIG.qtyStep) * CONFIG.qtyStep;
    if (norm !== n) await say(S.round(n, norm));
    data.current.qty = norm;
    saveLead({ qty: norm });
    track("CustomizeProduct", { custom: { content_name: `${data.current.size}cm`, num_items: norm } });
    await say(S.askCep());
    setStep("cep");
  }

  async function handleCep(cep: string) {
    let city: string | undefined;
    let uf: string | undefined;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (!j.erro) {
        city = j.localidade;
        uf = j.uf;
      }
    } catch {}
    data.current.cep = cep;
    data.current.city = city;
    data.current.uf = uf;

    if (city) await say([{ text: `Vi que você é de ${city}. Boa!` }]);

    const [resp] = await Promise.all([
      saveLead(
        { cep, city, uf, size: data.current.size, qty: data.current.qty, status: "quoted" },
        { wantQuote: true }
      ),
      say(S.calc()),
      wait(4500),
    ]);

    const q = resp.quote;
    if (!q || !q.ok) return customWhatsApp();
    await showQuote(q);
  }

  async function showQuote(q: Quote) {
    setQuote(q);
    quoteRef.current = q;
    const price = q.todayActive ? q.todayPrice : q.fullPrice;
    track("InitiateCheckout", { value: price, custom: { content_name: `${q.size}cm`, num_items: q.deliveredQty } });

    const where = data.current.city ? ` para ${data.current.city}` : "";
    const free = q.shipping === 0;
    const freteTxt = free ? "com frete grátis" : "com frete incluso";
    const freeNote: Line[] =
      free && !q.bf ? [{ text: "Boa notícia: seu CEP está dentro do raio de frete grátis!" }] : [];
    let lines: Line[];
    if (q.bf) {
      lines = [
        {
          text: `Ficou ${brl(q.todayPrice)} pelas ${q.deliveredQty} unidades (${q.billedQty} + ${q.deliveredQty - q.billedQty} de brinde), com frete grátis${where}.`,
        },
        { text: `Promoção de Black Friday válida até dia ${q.promoDay} de novembro. Valor estimado, pode ajustar se a arte ou o acabamento fugirem do padrão.` },
      ];
    } else if (q.todayActive) {
      lines = [
        ...freeNote,
        { text: `${first()}, seu orçamento ficaria ${brl(q.fullPrice)}, mas se a gente fechar hoje eu consigo por ${brl(q.todayPrice)}.` },
        { text: `São ${q.qty} etiquetas ${q.size} cm, ${freteTxt}${where}. Valor estimado, pode ajustar se a arte ou o acabamento fugirem do padrão.` },
      ];
    } else {
      lines = [
        ...freeNote,
        { text: `Seu orçamento fica ${brl(q.fullPrice)}, ${freteTxt}${where}. O valor especial vale só no dia do orçamento e já encerrou.` },
      ];
    }
    await say(lines);
    setStep("accept");
  }

  async function accept() {
    setStep("idle");
    push("user", "Aceito");
    const q = quoteRef.current!;
    if (q.bfEligible && !q.bf && !offered.current) {
      offered.current = true;
      await say(S.bfOffer(first(), q.promoDay));
      setStep("bf");
      return;
    }
    await finish(q);
  }

  async function recalc() {
    setStep("idle");
    push("user", "Recalcular valor");
    const [resp] = await Promise.all([saveLead({ size: data.current.size, qty: data.current.qty }, { wantQuote: true, bf: true }), say(S.recalc()), wait(3500)]);
    const q = resp.quote;
    if (!q || !q.ok) return customWhatsApp();
    await showQuote(q);
  }

  async function keepOriginal() {
    setStep("idle");
    push("user", "Seguir com meu pedido original");
    await finish(quoteRef.current!);
  }

  function buildMessage(q: Quote) {
    const price = q.todayActive ? q.todayPrice : q.fullPrice;
    const s = getSource();
    const lines = [
      `Olá! Sou ${data.current.name} e fiz um orçamento pelo atendimento online.`,
      ``,
      `Etiqueta: ${q.size} cm`,
      `Quantidade: ${q.deliveredQty} un${q.bf ? ` (${q.billedQty} + ${q.deliveredQty - q.billedQty} de brinde, Black Friday)` : ""}`,
      data.current.city ? `Cidade: ${data.current.city}${data.current.uf ? "/" + data.current.uf : ""} (CEP ${data.current.cep})` : `CEP: ${data.current.cep}`,
      `Valor estimado: ${brl(price)} (${q.shipping === 0 ? "frete grátis" : "frete incluso"})`,
      s.utm_campaign ? `Origem: ${s.utm_campaign}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function finish(q: Quote) {
    pendingWa.current = { url: waLink(CONFIG.whatsapp, buildMessage(q)), custom: false };
    await say(S.finish(first()));
    setStep("confirm");
  }

  async function customWhatsApp() {
    setStep("idle");
    await say(S.custom());
    const d = data.current;
    const text = [
      `Olá! Sou ${d.name || "cliente"} e preciso de um orçamento personalizado de etiquetas.`,
      d.size ? `Tamanho: ${d.size} cm` : "Tamanho: outro / ainda não sei",
      d.qty ? `Quantidade: ${d.qty} un` : "",
      d.cep ? `CEP: ${d.cep}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    pendingWa.current = { url: waLink(CONFIG.whatsapp, text), custom: true };
    setStep("confirm");
  }

  // Só abre o WhatsApp quando a pessoa toca no botão verde.
  function confirmWhatsApp() {
    const p = pendingWa.current;
    if (!p) return;
    const q = quoteRef.current;
    if (p.custom || !q) {
      track("Contact");
    } else {
      const price = q.todayActive ? q.todayPrice : q.fullPrice;
      track("Lead", {
        value: price,
        phone: data.current.phone,
        name: data.current.name,
        custom: { content_name: `${q.size}cm`, num_items: q.deliveredQty },
      });
    }
    saveLead({ status: "whatsapp" });
    window.location.href = p.url;
  }

  function directWhatsApp() {
    track("Contact");
    const n = data.current.name;
    window.location.href = waLink(
      CONFIG.whatsapp,
      `Olá! ${n ? `Sou ${n}. ` : ""}Quero um orçamento de etiquetas.`
    );
  }

  // ---------- Tela 1: gancho ----------
  if (!started) {
    return (
      <main className="gate">
        <div className="avatar-slot">
          <div className="avatar big pulse">{CONFIG.assistantName[0]}</div>
        </div>
        <h1>Seu orçamento de etiquetas em 1 minuto</h1>
        <p>Sem esperar resposta. A {CONFIG.assistantName} te atende agora.</p>
        {!loading ? (
          <button className="cta" onClick={start}>
            Toque aqui para ser atendido
          </button>
        ) : (
          <div className="loadwrap">
            <div className="bar" />
            <small>Conectando você com a {CONFIG.assistantName}...</small>
          </div>
        )}
      </main>
    );
  }

  // ---------- Chat ----------
  const price = quote ? (quote.todayActive ? quote.todayPrice : quote.fullPrice) : 0;

  return (
    <main className="chat">
      <header className="head">
        <div className="avatar-slot">
          <div className="avatar">{CONFIG.assistantName[0]}</div>
        </div>
        <div className="who">
          <b>{CONFIG.assistantName} · {CONFIG.brand}</b>
          <small>online agora</small>
        </div>
        <button className="mute" onClick={toggleMute}>{muted ? "Som off" : "Som on"}</button>
      </header>

      <section className="msgs">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.from}`}>{m.text}</div>
        ))}
        {typing && (
          <div className="bubble bot typing"><span /><span /><span /></div>
        )}
        <div ref={endRef} />
      </section>

      <footer className="foot">
        {err && <div className="err">{err}</div>}

        {step === "name" && (
          <form onSubmit={submit}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Seu nome" autoComplete="given-name" autoFocus />
            <button type="submit">Enviar</button>
          </form>
        )}

        {step === "phone" && (
          <>
            <form onSubmit={submit}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="(DDD) 9 0000-0000" inputMode="tel" autoComplete="tel" autoFocus />
              <button type="submit">Enviar</button>
            </form>
            <small className="consent">Ao informar seu número, você aceita receber mensagens sobre este orçamento.</small>
            <button className="link" onClick={skipPhone}>Prefiro não informar agora</button>
          </>
        )}

        {step === "size" && (
          <div className="grid">
            {CONFIG.sizes.map((s) => (
              <button key={s} className="chip" onClick={() => pickSize(s)}>{s}</button>
            ))}
            <button className="chip wide" onClick={() => { push("user", "Outro tamanho / não sei"); customWhatsApp(); }}>
              Outro tamanho / não sei
            </button>
          </div>
        )}

        {step === "qty" && (
          <>
            <div className="chips">
              {[150, 200, 300, 500].map((n) => (
                <button key={n} className="chip" onClick={() => handleQty(n)}>{n} un</button>
              ))}
            </div>
            <form onSubmit={submit}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Outra quantidade" inputMode="numeric" />
              <button type="submit">Enviar</button>
            </form>
          </>
        )}

        {step === "cep" && (
          <form onSubmit={submit}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Seu CEP" inputMode="numeric" autoComplete="postal-code" autoFocus />
            <button type="submit">Enviar</button>
          </form>
        )}

        {step === "accept" && quote && (
          <button className="cta" onClick={accept}>Aceito por {brl(price)}</button>
        )}

        {step === "bf" && (
          <>
            <button className="cta" onClick={recalc}>Recalcular valor</button>
            <button className="link" onClick={keepOriginal}>Seguir com meu pedido original</button>
          </>
        )}

        {step === "confirm" && (
          <button className="cta green" onClick={confirmWhatsApp}>
            Confirmar e enviar a arte no WhatsApp
          </button>
        )}

        <button className="link" onClick={directWhatsApp}>Prefiro falar direto no WhatsApp</button>
      </footer>
    </main>
  );
}

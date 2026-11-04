declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: any;
  }
}

const STANDARD = ["PageView", "ViewContent", "CustomizeProduct", "InitiateCheckout", "Lead", "Contact"];

function cookie(name: string) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

export function getSource() {
  const p = new URLSearchParams(location.search);
  const fbclid = p.get("fbclid");
  return {
    utm_source: p.get("utm_source"),
    utm_medium: p.get("utm_medium"),
    utm_campaign: p.get("utm_campaign"),
    utm_content: p.get("utm_content"),
    utm_term: p.get("utm_term"),
    fbclid,
    fbp: cookie("_fbp"),
    fbc: cookie("_fbc") || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null),
    ref: document.referrer || null,
  };
}

export function track(
  event: string,
  opts: { value?: number; phone?: string; name?: string; custom?: Record<string, unknown> } = {}
) {
  const eventId = crypto.randomUUID();
  const custom: Record<string, unknown> = { ...(opts.custom || {}) };
  if (opts.value !== undefined) {
    custom.value = opts.value;
    custom.currency = "BRL";
  }

  try {
    window.fbq?.(STANDARD.includes(event) ? "track" : "trackCustom", event, custom, { eventID: eventId });
  } catch {}

  const s = getSource();
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event,
      eventId,
      url: location.href,
      fbp: s.fbp,
      fbc: s.fbc,
      custom,
      phone: opts.phone,
      name: opts.name,
    }),
  }).catch(() => {});
}

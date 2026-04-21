import { USER_AGENT, DEFAULT_TIMEOUT_MS } from "./constants.mjs";

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts] — pass tiered timeouts from caller (probe / homepage / careers).
 * @returns {Promise<{ ok: boolean, status: number, finalUrl: string, contentType: string, html: string, error?: string }>}
 */
export async function fetchHtml(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(t);
    const finalUrl = res.url;
    const contentType = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      contentType,
      html: text.slice(0, 2_000_000),
    };
  } catch (e) {
    clearTimeout(t);
    const msg = e?.name === "AbortError" ? "timeout" : String(e?.message || e);
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      html: "",
      error: msg,
    };
  }
}

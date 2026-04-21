/**
 * SerpAPI Google search — isolated from domain-discovery cache.
 */
const SERP_URL = "https://serpapi.com/search.json";

const DEFAULT_TIMEOUT_MS = Number(process.env.SERPAPI_REQUEST_TIMEOUT_MS) || 12000;

/**
 * @param {string} query
 * @param {string} apiKey
 * @param {{ engine?: string, num?: number, timeoutMs?: number }} [opts]
 */
export async function serpGoogleSearch(query, apiKey, opts = {}) {
  const engine = opts.engine || "google";
  const num = opts.num ?? 10;
  const timeoutMs =
    opts.timeoutMs != null
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const url = new URL(SERP_URL);
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(num));

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = new Error(`serpapi_invalid_json: ${text.slice(0, 200)}`);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (data.error) {
        lastErr = new Error(String(data.error));
        break;
      }
      return { ok: true, payload: data };
    } catch (e) {
      const name = e && /** @type {any} */ (e).name;
      if (name === "AbortError" || (e && String(e).includes("abort"))) {
        return {
          ok: false,
          error: "serp_timeout",
          timedOut: true,
        };
      }
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    } finally {
      clearTimeout(tid);
    }
  }
  return {
    ok: false,
    error: lastErr ? String(lastErr.message || lastErr) : "serpapi_unknown_error",
  };
}

/**
 * @param {any} payload
 */
export function organicResults(payload) {
  const o = payload?.organic_results;
  return Array.isArray(o) ? o : [];
}

/**
 * HTTP helpers aligned with scripts/daily-sync.js (timeouts, 429 backoff, HTML detection).
 */
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1000;
const MAX_ATTEMPTS = 6;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(res) {
  const ra = res.headers.get("retry-after");
  if (!ra) return null;
  const sec = parseInt(ra, 10);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.min(sec * 1000, 180_000);
}

/**
 * @param {string} url
 * @param {{
 *   label: string,
 *   parse?: 'json'|'text',
 *   timeoutMs?: number,
 *   maxAttempts?: number,
 *   retryDelayMs?: number,
 * }} opts
 */
export async function fetchWithRetry(url, opts) {
  const label = opts.label || url;
  const parse = opts.parse || "json";
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const retryDelayMs = opts.retryDelayMs ?? RETRY_DELAY_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept:
            parse === "json"
              ? "application/json, text/plain, */*"
              : "text/html,application/xhtml+xml,*/*;q=0.8",
          "User-Agent": USER_AGENT,
        },
      });
      clearTimeout(t);

      if (!res.ok) {
        const status = res.status;
        if (status === 404) {
          throw new Error(`${label}: HTTP ${res.status}`);
        }
        const retryable =
          status === 429 ||
          status === 503 ||
          status === 502 ||
          status === 403 ||
          status === 408;
        if (retryable && attempt < maxAttempts - 1) {
          let waitMs;
          if (status === 429 || status === 503) {
            waitMs = parseRetryAfterMs(res) ?? Math.min(90_000, 10_000 * 2 ** attempt);
          } else {
            waitMs = 5_000 * (attempt + 1);
          }
          console.log(`[fetch] ${label} HTTP ${status}, backing off ${waitMs}ms (${attempt + 1}/${maxAttempts})`);
          await sleep(waitMs);
          continue;
        }
        throw new Error(`${label}: HTTP ${res.status}`);
      }

      if (parse === "text") {
        return await res.text();
      }

      const text = await res.text();
      const trimmed = text.trimStart();
      const ct = res.headers.get("content-type") || "";
      const looksHtml =
        /text\/html/i.test(ct) ||
        trimmed.startsWith("<!") ||
        trimmed.toLowerCase().startsWith("<html");
      if (looksHtml) {
        if (attempt < maxAttempts - 1) {
          const waitMs = 5_000 * (attempt + 1);
          console.log(`[fetch] ${label} returned HTML instead of JSON, retry in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        throw new Error(`${label}: response was HTML, not JSON`);
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        if (attempt < maxAttempts - 1) {
          await sleep(2_000 * (attempt + 1));
          continue;
        }
        throw new Error(`${label}: invalid JSON (${e.message})`);
      }
    } catch (e) {
      clearTimeout(t);
      const msg = String(e.message || e);
      if (/HTTP 404/.test(msg)) throw e;

      const isAbort = e.name === "AbortError" || /aborted/i.test(msg);
      if (attempt < maxAttempts - 1 && (isAbort || /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|fetch failed/i.test(msg))) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      if (attempt >= maxAttempts - 1) throw e;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw new Error(`${label}: fetch failed after ${maxAttempts} attempts`);
}

export async function fetchJson(url, label, extra = {}) {
  return fetchWithRetry(url, { label, parse: "json", ...extra });
}

/**
 * @param {string} url
 * @param {string} label
 * @param {{ timeoutMs?: number, maxAttempts?: number, retryDelayMs?: number }} [extra]
 */
export async function fetchText(url, label, extra = {}) {
  return fetchWithRetry(url, { label, parse: "text", ...extra });
}

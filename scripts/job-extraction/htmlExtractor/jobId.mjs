import crypto from "crypto";

/**
 * @param {string} s
 */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic id for custom_html jobs.
 * @param {{ apply_url?: string, company_key?: string, title?: string, location?: string }} fields
 */
export function makeSourceJobId(fields) {
  const apply = (fields.apply_url || "").trim();
  if (apply) {
    return crypto
      .createHash("sha256")
      .update(apply.toLowerCase())
      .digest("hex")
      .slice(0, 32);
  }
  const payload = [
    fields.company_key || "",
    norm(fields.title || ""),
    norm(fields.location || ""),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

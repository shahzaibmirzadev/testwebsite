/**
 * @param {Record<string, string>} row — routing table row
 */
export function pickCareersUrl(row) {
  const a = (row.careers_url_final || "").trim();
  const b = (row.careers_url_candidate || "").trim();
  const c = (row.homepage_url || "").trim();
  return a || b || c || "";
}

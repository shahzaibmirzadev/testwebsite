/**
 * URL-safe slug from text (kebab-case).
 */
export function slugify(text) {
  if (!text) return "job";
  const s = String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return s || "job";
}

/**
 * Stable public slug: use DB `slug` when set, else title + short id suffix for uniqueness.
 */
export function jobSlug(job) {
  if (job?.slug != null && String(job.slug).trim() !== "") {
    return String(job.slug).trim();
  }
  const base = slugify(job?.title);
  const idPart =
    job?.id != null
      ? String(job.id).replace(/-/g, "").slice(0, 8)
      : "";
  return idPart ? `${base}-${idPart}` : base;
}

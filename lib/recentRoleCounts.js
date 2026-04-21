export const RECENT_ROLE_WINDOW_DAYS = 3;

export function countRecentlyPostedRoles(jobs, days = RECENT_ROLE_WINDOW_DAYS) {
  const list = Array.isArray(jobs) ? jobs : [];
  const windowMs = Math.max(1, Number(days || RECENT_ROLE_WINDOW_DAYS)) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return list.reduce((count, job) => {
    const postedAt = Date.parse(String(job?.posted_at || "").trim());
    if (!Number.isFinite(postedAt)) return count;
    if (postedAt > now) return count;
    return now - postedAt <= windowMs ? count + 1 : count;
  }, 0);
}

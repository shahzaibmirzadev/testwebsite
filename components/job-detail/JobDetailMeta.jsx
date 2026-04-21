import {
  getEmploymentType,
  getJobFamily,
  getJobTags,
  getRemoteStatus,
  getSeniority,
} from "@/lib/jobFieldHelpers";

const MAX_TAGS = 12;

/**
 * Shared meta row: family, seniority, employment, remote, tags.
 * @param {{ job: Record<string, unknown> }} props
 */
export default function JobDetailMeta({ job }) {
  const family = getJobFamily(job);
  const seniority = getSeniority(job);
  const employment = getEmploymentType(job);
  const remote = getRemoteStatus(job);
  const tags = getJobTags(job);

  const badges = [family, seniority, employment, remote].filter(Boolean);
  const hasTags = tags.length > 0;

  if (badges.length === 0 && !hasTags) return null;

  const pillClass =
    "inline-flex min-h-7 items-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F8FAFC] px-3 py-1 text-xs font-bold text-[#475569]";

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {badges.map((t) => (
        <span key={t} className={`${pillClass} uppercase tracking-[0.04em]`}>
          {t}
        </span>
      ))}
      {tags.slice(0, MAX_TAGS).map((t) => (
        <span key={t} className={pillClass}>
          {t}
        </span>
      ))}
      {tags.length > MAX_TAGS ? (
        <span className={pillClass}>+{tags.length - MAX_TAGS}</span>
      ) : null}
    </div>
  );
}

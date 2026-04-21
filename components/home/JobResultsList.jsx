"use client";

import { jobSlug } from "@/lib/slug";
import JobCard from "./JobCard";


/**
 * @param {{
 *   jobs: Record<string, unknown>[],
 *   onOpenPreview?: (job: Record<string, unknown>) => void,
 *   previewSlug?: string|null,
 * }} props
 */
export default function JobResultsList({
  jobs,
  onOpenPreview,
  previewSlug,
}) {
  if (jobs.length === 0) {
    return (
      <div className={"text-center [padding:48px_20px] [color:var(--muted)] [background:var(--surface)] [border:1px_dashed_var(--border)] [border-radius:var(--radius)]"}>
        <p>No jobs match your filters.</p>
        <p className={"[margin-top:8px] [font-size:0.9rem]"}>
          Try clearing filters or broadening keyword / location.
        </p>
      </div>
    );
  }

  return (
    <div className={"flex [flex-direction:column] [gap:8px]"}>
      {jobs.map((job, index) => {
        const id = job.id != null ? String(job.id) : `job-${index}`;
        const slug = jobSlug(job);
        const open =
          previewSlug != null && slug === previewSlug;
        return (
          <JobCard
            key={id}
            job={job}
            onOpenPreview={onOpenPreview}
            previewOpen={open}
          />
        );
      })}
    </div>
  );
}

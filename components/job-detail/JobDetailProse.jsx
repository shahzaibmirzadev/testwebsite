import JobBody from "@/components/JobBody";

/**
 * Shared long-form description (same pipeline as full job page).
 * @param {{
 *   job: Record<string, unknown>,
 *   proseClassName?: string,
 * }} props
 */
export default function JobDetailProse({ job, proseClassName }) {
  return <JobBody job={job} rootClassName={proseClassName} />;
}

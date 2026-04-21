import Link from "next/link";
import { companyPagePath } from "@/lib/companyPages";

/**
 * @param {{ title?: string, items: { name: string, slug: string, roleCount: number }[], className?: string }} props
 */
export default function RelatedCompanies({ title = "Related companies", items, className }) {
  if (!items?.length) return null;
  return (
    <section className={className} aria-label={title}>
      {title ? <h2 style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{title}</h2> : null}
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
        {items.map((c) => (
          <li key={c.slug}>
            <Link href={companyPagePath(c.name) || `/company/${c.slug}`} style={{ color: "#2563eb" }}>
              {c.name}
            </Link>
            <span style={{ color: "#64748b" }}> · {c.roleCount} roles</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

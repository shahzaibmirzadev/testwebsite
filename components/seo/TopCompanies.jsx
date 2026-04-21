import Link from "next/link";
import { companyPagePath } from "@/lib/companyPages";

/**
 * @param {{ title?: string, items: { name: string, slug: string, roleCount: number }[], className?: string, variant?: "list"|"tiles" }} props
 */
export default function TopCompanies({ title = "Top companies hiring", items, className, variant = "list" }) {
  if (!items?.length) return null;
  if (variant === "tiles") {
    return (
      <section className={className} aria-label={title}>
        {title ? <h2 style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{title}</h2> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {items.map((c) => (
            <Link
              key={c.slug}
              href={companyPagePath(c.name) || `/company/${c.slug}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                textDecoration: "none",
                color: "#1e293b",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              {c.name}
              <span style={{ color: "#64748b", fontWeight: 500, fontSize: "0.82rem" }}>{c.roleCount}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className={className} aria-label={title}>
      {title ? <h2 style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{title}</h2> : null}
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
        {items.map((c) => (
          <li key={c.slug}>
            <Link href={companyPagePath(c.name) || `/company/${c.slug}`} style={{ color: "#2563eb" }}>
              {c.name}
            </Link>
            <span style={{ color: "#64748b" }}> · {c.roleCount} roles in this hub</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

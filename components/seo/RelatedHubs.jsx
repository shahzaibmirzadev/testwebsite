import Link from "next/link";

/**
 * @param {{ title?: string, items: { key: string, path: string, label: string }[], className?: string, listClassName?: string }} props
 */
export default function RelatedHubs({ title = "Related hubs", items, className, listClassName }) {
  if (!items?.length) return null;
  return (
    <section className={className} aria-label={title}>
      {title ? <h2 style={{ fontSize: "1.1rem", margin: "0 0 10px" }}>{title}</h2> : null}
      <ul
        className={listClassName}
        style={listClassName ? undefined : { margin: 0, paddingLeft: 20, lineHeight: 1.6 }}
      >
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.path} style={{ color: "#2563eb" }}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";

/**
 * @param {{
 *   label: string,
 *   title: string,
 *   shortDescription: string,
 *   finalNote: string,
 * }} props
 */
export default function ComingSoonPage({ label, title, shortDescription, finalNote }) {
  return (
    <main
      style={{
        minHeight: "calc(100vh - 80px)",
        maxWidth: 1120,
        margin: "0 auto",
        padding: "56px 20px 72px",
      }}
    >
      <section
        style={{
          border: "1px solid #d9e4f3",
          borderRadius: 20,
          background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 75%)",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.08)",
          padding: "34px 28px",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontSize: "0.8rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#64748b",
          }}
        >
          {label}
        </p>
        <h1 style={{ margin: "0 0 10px", color: "#0f172a", fontSize: "clamp(1.8rem, 3.8vw, 2.8rem)" }}>
          Whoops, we&apos;re not ready for you yet!
        </h1>
        <p style={{ margin: "0 0 16px", color: "#334155", lineHeight: 1.65, maxWidth: 900 }}>
          {shortDescription}
        </p>

        <p style={{ margin: "0 0 8px", color: "#334155", lineHeight: 1.65 }}>
          We have just launched in April and are still building out core features. Our end goal is to create the
          ultimate hub for drone-related jobs around the world, so you can expect to see:
        </p>
        <ul style={{ margin: "0 0 16px", color: "#334155", lineHeight: 1.65, paddingLeft: 20 }}>
          <li>Increased numbers of approved companies and jobs</li>
          <li>User portals to track, save, and reach out directly to companies and teams</li>
          <li>
            Candidate profiles sent directly to recruiters so they can come to you, because why should you have to do
            all the hard work?
          </li>
          <li>Email updates and alerts</li>
        </ul>

        <p style={{ margin: "0 0 16px", color: "#334155", lineHeight: 1.65 }}>
          We would absolutely love recommendations and encourage you to submit ideas, findings, or dislikes through
          our <Link href="/contact">contact form</Link>.
        </p>

        <p style={{ margin: "0 0 22px", color: "#0f172a", lineHeight: 1.65 }}>
          <strong>{title}:</strong> {finalNote}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              textDecoration: "none",
              borderRadius: 10,
              background: "#0058ba",
              color: "#ffffff",
              padding: "10px 14px",
              fontWeight: 700,
            }}
          >
            Back to jobs
          </Link>
          <Link
            href="/contact"
            style={{
              display: "inline-block",
              textDecoration: "none",
              borderRadius: 10,
              border: "1px solid #c8d5ea",
              color: "#1e3a8a",
              background: "#ffffff",
              padding: "10px 14px",
              fontWeight: 700,
            }}
          >
            Send feedback
          </Link>
        </div>
      </section>
    </main>
  );
}


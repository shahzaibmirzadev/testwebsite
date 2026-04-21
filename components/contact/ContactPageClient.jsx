"use client";

import Link from "next/link";
import { useState } from "react";

export default function ContactPageClient() {
  const [form, setForm] = useState({ name: "", email: "", message: "", company: "" });
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: "idle", message: "" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unable to send message.");
      }
      setForm({ name: "", email: "", message: "", company: "" });
      setStatus({ type: "ok", message: "Message sent. I will get back to you soon." });
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Could not send your message." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={"[min-height:100vh] [background:#FFFCF7] [padding:26px_14px_72px]"}>
      <div className={"[max-width:720px] [margin:0_auto] [padding:32px_16px_64px] [background:#fff] [min-height:100vh] [max-width:920px] [padding:30px_34px_40px] [border:1px_solid_#e7ebf3] [border-radius:14px] [box-shadow:0_20px_40px_rgba(15,_23,_42,_0.04)] [min-height:auto] max-[900px]:[padding:22px_16px_28px]"} style={{ maxWidth: 760 }}>
        <Link href="/" className={"inline-block [margin-bottom:12px] [font-size:0.9rem] no-underline hover:underline [color:#5B4FE8] [opacity:0.92] [margin-bottom:10px] [font-size:0.8rem]"}>
          ← Back to jobs
        </Link>
        <h1 className={"[margin:0_0_8px] [font-size:1.75rem] [line-height:1.25] font-bold [color:#1C1C1A] [font-size:clamp(2rem,_3.2vw,_2.65rem)] [line-height:1.14] [letter-spacing:-0.03em]"} style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}>
          Contact Us
        </h1>
        <p className={"[margin:0_0_12px] [font-size:0.875rem] [color:#665A50] [opacity:0.9]"}>Send a quick message and we will reply by email.</p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input
            type="text"
            value={form.company}
            onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))}
            tabIndex={-1}
            autoComplete="off"
            style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            required
            className={"w-full [border:1px_solid_#d8e2f0] [border-radius:10px] [padding:10px_12px] [font:inherit] [background:#fff] [color:#1C1C1A] placeholder:[color:#8A8A86]"}
          />
          <input
            type="email"
            placeholder="Your email"
            value={form.email}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            required
            className={"w-full [border:1px_solid_#d8e2f0] [border-radius:10px] [padding:10px_12px] [font:inherit] [background:#fff] [color:#1C1C1A] placeholder:[color:#8A8A86]"}
          />
          <textarea
            placeholder="How can we help?"
            value={form.message}
            onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
            required
            rows={6}
            className={"w-full [border:1px_solid_#d8e2f0] [border-radius:10px] [padding:10px_12px] [font:inherit] [background:#fff] [resize:vertical] [color:#1C1C1A] placeholder:[color:#8A8A86]"}
          />
          <button
            type="submit"
            className={"inline-block [padding:12px_24px] [background:#111827] [color:#fff] no-underline [border-radius:8px] font-semibold hover:[background:#374151] inline-flex [align-items:center] [justify-content:center] [min-width:150px] [padding:11px_18px] [border-radius:10px] font-semibold no-underline [border:1px_solid_rgba(91,_79,_232,_0.16)] [background:#5B4FE8] [color:#FFFFFF] hover:[background:#1A1160]"}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Send message"}
          </button>
        </form>

        {status.type !== "idle" ? (
          <p style={{ marginTop: 12, color: status.type === "ok" ? "#166534" : "#b91c1c" }}>
            {status.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}

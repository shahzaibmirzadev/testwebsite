import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RESEND_TIMEOUT_MS = Number(process.env.CONTACT_EMAIL_TIMEOUT_MS || 8000);
const CONTACT_TABLE = process.env.CONTACT_TABLE || "support_messages";

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getContactStorageClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function saveContactMessage({ name, email, message }) {
  const client = getContactStorageClient();
  if (!client) {
    return { ok: false, reason: "missing_supabase_credentials" };
  }

  const payload = {
    name,
    email,
    message,
    source: "contact_page",
    status: "new",
    created_at: new Date().toISOString(),
  };

  const { error } = await client.from(CONTACT_TABLE).insert(payload);
  if (error) {
    console.error("contact_storage_failed", error.message);
    return { ok: false, reason: error.message };
  }

  console.log("contact_new_message", {
    table: CONTACT_TABLE,
    name,
    email,
    preview: message.slice(0, 140),
  });
  return { ok: true };
}

async function sendContactEmail({ name, email, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail =
    process.env.CONTACT_FROM_EMAIL || "Drone Roles <onboarding@resend.dev>";

  if (!apiKey || !toEmail) {
    return { ok: false, reason: "email_not_configured" };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `Drone Roles contact: ${name}`,
      reply_to: email,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutHandle));

  if (!resp.ok) {
    const detail = await resp.text();
    console.error("contact_email_failed", detail);
    return { ok: false, reason: detail || `status_${resp.status}` };
  }
  return { ok: true };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const message = String(body?.message || "").trim();
    const company = String(body?.company || "").trim();

    if (company) {
      return NextResponse.json({ ok: true });
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 }
      );
    }
    if (!isEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Invalid email address." },
        { status: 400 }
      );
    }

    const [storageResult, emailResult] = await Promise.all([
      saveContactMessage({ name, email, message }),
      sendContactEmail({ name, email, message }),
    ]);

    if (storageResult.ok || emailResult.ok) {
      return NextResponse.json({
        ok: true,
        stored: storageResult.ok,
        emailed: emailResult.ok,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Contact storage and email delivery are not configured.",
      },
      { status: 503 }
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      return NextResponse.json(
        { ok: false, error: "Email request timed out. Please try again." },
        { status: 504 }
      );
    }
    console.error("contact_submit_error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected error." },
      { status: 500 }
    );
  }
}

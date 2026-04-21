const BLOCKED_TAGS_RE = /<(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\/\1>/gi;
const BLOCKED_SELF_CLOSING_RE = /<(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi;
const EVENT_HANDLER_ATTR_RE = /\son[a-z]+\s*=\s*(['"]).*?\1/gi;
const JS_URL_ATTR_RE = /\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi;
const DOC_ATTR_RE = /\s(srcdoc|srcset)\s*=\s*(['"]).*?\2/gi;

/**
 * @param {unknown} dirty
 * @returns {string} safe HTML string (may be empty)
 */
export function sanitizeJobHtml(dirty) {
  if (dirty == null) return "";
  if (typeof dirty !== "string") return "";
  const trimmed = dirty.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(BLOCKED_TAGS_RE, "")
    .replace(BLOCKED_SELF_CLOSING_RE, "")
    .replace(EVENT_HANDLER_ATTR_RE, "")
    .replace(JS_URL_ATTR_RE, "")
    .replace(DOC_ATTR_RE, "");
}

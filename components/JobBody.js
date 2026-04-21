import { sanitizeJobHtml } from "@/lib/sanitizeJobHtml";

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function decodeCommonEntities(text) {
  return text
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function decodeNumericEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, num) => {
      const cp = Number(num);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    });
}

function normalizePlainJobText(raw) {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  return decodeNumericEntities(decodeCommonEntities(text))
    .replace(/Ã¢â‚¬Â¢|â€¢/g, "•")
    .trim();
}

function looksLikeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(String(text || ""));
}

const PROSE_CLASSES = {
  "job-prose": "job-source-prose [line-height:1.65] [font-size:1rem] [color:#374151] [&h1]:[margin:1.25em_0_0.5em] [&h1]:[line-height:1.3] [&h1]:[color:#111827] [&h1]:font-bold [&h2]:[margin:1.25em_0_0.5em] [&h2]:[line-height:1.3] [&h2]:[color:#111827] [&h2]:font-bold [&h3]:[margin:1.25em_0_0.5em] [&h3]:[line-height:1.3] [&h3]:[color:#111827] [&h3]:font-bold [&h4]:[margin:1.25em_0_0.5em] [&h4]:[line-height:1.3] [&h4]:[color:#111827] [&h4]:font-bold [&h5]:[margin:1.25em_0_0.5em] [&h5]:[line-height:1.3] [&h5]:[color:#111827] [&h5]:font-bold [&h6]:[margin:1.25em_0_0.5em] [&h6]:[line-height:1.3] [&h6]:[color:#111827] [&h6]:font-bold [&h1]:[font-size:1.5rem] [&h1:first-child]:[margin-top:0] [&h2:first-child]:[margin-top:0] [&h3:first-child]:[margin-top:0] [&h2]:[font-size:1.25rem] [&h3]:[font-size:1.1rem] [&h4]:[font-size:1.05rem] [&h5]:[font-size:1rem] [&h6]:[font-size:1rem] [&p]:[margin:0_0_1em] [&p:last-child]:[margin-bottom:0] [&strong]:font-bold [&strong]:text-[#1C1C1A] [&b]:font-bold [&b]:text-[#1C1C1A] [&br]:[line-height:inherit] [&ul]:[margin:0_0_1em] [&ul]:[padding-left:1.5em] [&ol]:[margin:0_0_1em] [&ol]:[padding-left:1.5em] [&ul]:[list-style-type:disc] [&ol]:[list-style-type:decimal] [&li]:[margin-bottom:0.35em] [&li_>_ul]:[margin-top:0.35em] [&li_>_ul]:[margin-bottom:0.35em] [&li_>_ol]:[margin-top:0.35em] [&li_>_ol]:[margin-bottom:0.35em] [&blockquote]:[margin:0_0_1em] [&blockquote]:[padding-left:1em] [&blockquote]:[border-left:3px_solid_#e5e7eb] [&blockquote]:[color:#4b5563] [&hr]:border-0 [&hr]:[border-top:1px_solid_#e5e7eb] [&hr]:[margin:1.5em_0] [&pre]:[margin:0_0_1em] [&pre]:[padding:12px] [&pre]:overflow-x-auto [&pre]:[background:#f3f4f6] [&pre]:[border-radius:6px] [&pre]:[font-size:0.9em] [&code]:[font-size:0.9em] [&table]:w-full [&table]:[border-collapse:collapse] [&table]:[margin:0_0_1em] [&table]:[font-size:0.95em] [&th]:[border:1px_solid_#e5e7eb] [&th]:[padding:8px_10px] [&th]:[vertical-align:top] [&td]:[border:1px_solid_#e5e7eb] [&td]:[padding:8px_10px] [&td]:[vertical-align:top] [&th]:[background:#f9fafb] [&th]:font-semibold [&th]:text-left [&a]:[word-break:break-word] [color:#334155] [&h2]:[font-size:1.32rem] [&h2]:[margin-top:1.4em] [&h3]:[font-size:1.16rem]",
  "job-prose--html": "[overflow-wrap:break-word]",
  "job-prose--plain": "[white-space:normal]",
  "job-empty": "[color:#6b7280] [margin:0_0_24px]",
};

function proseClass(base, rootClassName) {
  return String(rootClassName ? `${base} ${rootClassName}`.trim() : base)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => PROSE_CLASSES[token] || token)
    .join(" ");
}

function isLikelyBulletLine(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  if (/^[-*•]\s+/.test(t)) return true;
  if (/^\d+[.)]\s+/.test(t)) return true;
  return /^(must|should|ability to|able to|required to)\b/i.test(t);
}

function isLikelyHeadingLine(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  if (t.length > 80) return false;
  if (isLikelyBulletLine(t)) return false;
  if (/[:;,.!?]$/.test(t)) return false;
  if (/^(https?:\/\/|www\.)/i.test(t)) return false;

  const lettersOnly = t.replace(/[^A-Za-z]/g, "");
  if (lettersOnly.length < 4) return false;

  const uppercaseOnly = t.replace(/[^A-Z]/g, "").length;
  const uppercaseRatio = uppercaseOnly / Math.max(1, lettersOnly.length);
  if (uppercaseRatio > 0.72) return true;

  if (/^(about|overview|responsibilities|requirements|qualifications|preferred|nice to have|benefits|what you'll do|what you will do|what we're looking for|what we are looking for|you should have|salary|compensation|us salary range|why join|about the role|about the job)\b/i.test(t)) {
    return true;
  }

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 8) {
    const titleCaseWords = words.filter((word) => /^[A-Z][a-z0-9'/-]*$/.test(word)).length;
    if (titleCaseWords >= Math.max(2, words.length - 1)) return true;
  }

  return false;
}

function splitLongParagraph(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return [];
  if (normalized.length < 280) return [normalized];
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 4) return [normalized];
  const out = [];
  let chunk = "";
  for (const sentence of sentences) {
    const next = chunk ? `${chunk} ${sentence}` : sentence;
    if (next.length > 240 && chunk) {
      out.push(chunk.trim());
      chunk = sentence;
    } else {
      chunk = next;
    }
  }
  if (chunk.trim()) out.push(chunk.trim());
  return out;
}

function renderPlainBlocks(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim());
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i]) {
      i += 1;
      continue;
    }

    if (isLikelyHeadingLine(lines[i])) {
      blocks.push(<h3 key={`h-${blocks.length}`}>{lines[i]}</h3>);
      i += 1;
      continue;
    }

    if (isLikelyBulletLine(lines[i])) {
      const items = [];
      while (i < lines.length && lines[i] && isLikelyBulletLine(lines[i])) {
        items.push(lines[i].replace(/^([-*•]|\d+[.)])\s+/, "").trim());
        i += 1;
      }
      if (items.length > 0) {
        blocks.push(
          <ul key={`ul-${blocks.length}`}>
            {items.map((item, idx) => (
              <li key={`li-${blocks.length}-${idx}`}>{item}</li>
            ))}
          </ul>
        );
        continue;
      }
    }

    const paragraphLines = [];
    while (
      i < lines.length &&
      lines[i] &&
      !isLikelyBulletLine(lines[i]) &&
      !isLikelyHeadingLine(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    const paragraph = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    splitLongParagraph(paragraph).forEach((chunk) => {
      blocks.push(<p key={`p-${blocks.length}`}>{chunk}</p>);
    });
  }

  return blocks;
}

/**
 * Long-form job content: prefer sanitized HTML fields first, then plain-text fallbacks.
 * @param {{ job: Record<string, unknown>, rootClassName?: string }} props
 */
export default function JobBody({ job, rootClassName }) {
  const htmlFields = [
    job.description_html,
    job.body_html,
    job.content_html,
    job.html_description,
    job.details_html,
    looksLikeHtml(job.description) ? job.description : "",
    looksLikeHtml(job.body) ? job.body : "",
    looksLikeHtml(job.content) ? job.content : "",
    looksLikeHtml(job.details) ? job.details : "",
  ];

  for (const candidate of htmlFields) {
    if (!isNonEmptyString(candidate)) continue;
    const clean = sanitizeJobHtml(candidate);
    if (!clean) continue;
    return (
      <div
        className={proseClass("job-prose job-prose--html", rootClassName)}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  const plainFields = [job.description, job.body, job.content, job.details];

  for (const candidate of plainFields) {
    if (!isNonEmptyString(candidate)) continue;
    const plainText = normalizePlainJobText(candidate);
    if (!plainText) continue;
    return (
      <div className={proseClass("job-prose job-prose--plain", rootClassName)}>
        {renderPlainBlocks(plainText)}
      </div>
    );
  }

  return (
    <p className={proseClass("job-empty", rootClassName)}>
      No full description on file yet. Use Apply for full details on the employer site.
    </p>
  );
}

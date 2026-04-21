import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fembcwzqqalvrdcmsydi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function assertServiceRoleKeyOrExit() {
  if (!SUPABASE_KEY) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. This script performs writes and will not run with anon/publishable keys.'
    );
  }
  const payload = decodeJwtPayload(SUPABASE_KEY);
  const role = String(payload?.role || '').toLowerCase();
  if (role && role !== 'service_role') {
    throw new Error(
      `Invalid Supabase key role "${role}". Use SUPABASE_SERVICE_ROLE_KEY (role: service_role).`
    );
  }
}

assertServiceRoleKeyOrExit();

const ROOT_DIR = process.cwd();
const SOURCES_CSV_PATH = path.join(ROOT_DIR, 'sources.csv');
const SOURCE_PERFORMANCE_CSV_PATH = path.join(ROOT_DIR, 'source_performance.csv');

function assertRequiredFilesOrExit() {
  if (!fs.existsSync(SOURCES_CSV_PATH)) {
    throw new Error(
      `Missing sources.csv at ${SOURCES_CSV_PATH}. Run this script from the repository root.`
    );
  }
}

assertRequiredFilesOrExit();

const CONFIG = {
  MAX_JOB_AGE_DAYS: 90,
  FILTER_DEBUG: true,

  // Relevance behavior
  STRICT_TITLE_ONLY: true,
  SKIP_PARTIALS: false,
  STORE_RAW_JSON: true,

  // Source handling
  MARK_UNSEEN_INACTIVE: true,
  SKIP_LOW_VALUE_SOURCES: false,
  EMPTY_STREAK_SKIP_THRESHOLD: 3,
  FAIL_STREAK_SKIP_THRESHOLD: 3,
  SAVE_SOURCES_CHECKPOINT_EVERY: 25,

  // Network (Workable rate-limits shared CI IPs aggressively — pace + backoff)
  REQUEST_TIMEOUT_MS: Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '20000', 10) || 20000,
  RETRY_COUNT: Number.parseInt(process.env.RETRY_COUNT || '2', 10) || 2,
  RETRY_DELAY_MS: Number.parseInt(process.env.RETRY_DELAY_MS || '1000', 10) || 1000,
  FETCH_MAX_ATTEMPTS: Number.parseInt(process.env.FETCH_MAX_ATTEMPTS || '6', 10) || 6,
  FETCH_USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  WORKABLE_INTER_SOURCE_DELAY_MS: Number.parseInt(process.env.WORKABLE_INTER_SOURCE_DELAY_MS || '800', 10) || 800,
  /** Min ms between apply.workable.com calls (default 4s; conservative vs ~10/10s). Set 0 to disable. */
  WORKABLE_MIN_REQUEST_INTERVAL_MS: Number.parseInt(
    process.env.WORKABLE_MIN_REQUEST_INTERVAL_MS || '4000',
    10
  ) || 0,
  /** Workable-only run: wait before any HTTP (lets a hot / penalized IP cool down). Set 0 to disable. */
  WORKABLE_COLD_START_DELAY_MS: Number.parseInt(process.env.WORKABLE_COLD_START_DELAY_MS || '60000', 10) || 0,
  /** Cap Retry-After / backoff for apply.workable.com (server often sends 180s). */
  WORKABLE_MAX_RETRY_AFTER_MS: Number.parseInt(process.env.WORKABLE_MAX_RETRY_AFTER_MS || '120000', 10) || 120_000,
  FETCH_MAX_RETRY_AFTER_MS: Number.parseInt(process.env.FETCH_MAX_RETRY_AFTER_MS || '180000', 10) || 180_000
};

function parseProviderSet(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const set = new Set(
    v
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.size ? set : null;
}

const ONLY_PROVIDERS = parseProviderSet(process.env.DAILY_SYNC_ONLY_PROVIDERS);

/**
 * Full daily sync excludes Workable by default (use `npm run sync:workable` for that ATS).
 * Override: DAILY_SYNC_INCLUDE_WORKABLE=1, or DAILY_SYNC_ONLY_PROVIDERS=workable (Workable-only run).
 */
function buildExcludeProviders() {
  const explicit = parseProviderSet(process.env.DAILY_SYNC_EXCLUDE_PROVIDERS);
  const includeWorkableInDaily =
    process.env.DAILY_SYNC_INCLUDE_WORKABLE === '1' ||
    process.env.DAILY_SYNC_INCLUDE_WORKABLE === 'true';
  const workableOnlyRun = ONLY_PROVIDERS && ONLY_PROVIDERS.has('workable');
  const set = new Set(explicit ? [...explicit] : []);
  if (includeWorkableInDaily || workableOnlyRun) {
    set.delete('workable');
  } else {
    set.add('workable');
  }
  return set.size ? set : null;
}

const EXCLUDE_PROVIDERS = buildExcludeProviders();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const MAX_JOB_AGE_MS = CONFIG.MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000;

const runStats = {
  sourcesLoaded: 0,
  sourcesEligible: 0,
  sourcesProcessed: 0,
  sourcesSkippedByTiering: 0,
  sourcesFailed: 0,
  sourcesEmpty: 0,

  jobsListed: 0,
  jobsRelevant: 0,
  jobsDetailFetched: 0,
  jobsDetailFailed: 0,
  jobsSkippedOld: 0,
  jobsSkippedIrrelevant: 0,
  jobsFlaggedPartial: 0,
  jobsInserted: 0,
  jobsUpdated: 0,
  jobsMarkedInactive: 0,
  jobsUpsertErrors: 0,
  jobsRlsErrors: 0
};

const sourceStats = {};
const atsStats = {};
const FOCUS_FILTER_VISIBILITY_KEYS = new Set([
  'greenhouse__andurilindustries',
  'greenhouse__flyzipline'
]);
const focusFilterVisibility = new Map();

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map(v => v.trim());
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return null;
}

function safeJson(value) {
  try {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value) {
  if (!value) return '';

  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, '/')
    .replace(/&#x2F;/gi, '/');
}

function stripTags(value) {
  if (!value) return '';
  return String(value).replace(/<[^>]*>/g, ' ');
}

function cleanText(value) {
  if (!value) return '';

  const decoded = decodeHtmlEntities(value);
  const stripped = stripTags(decoded);

  return stripped
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function joinText(parts) {
  return (parts || []).map(cleanText).filter(Boolean).join(' ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dedupeArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function looksLikeHtml(value) {
  if (!value) return false;
  const decoded = decodeHtmlEntities(value);
  return /<\/?[a-z][\s\S]*>/i.test(decoded);
}

function sanitizeHtml(value) {
  if (!value) return '';

  const decoded = decodeHtmlEntities(value);

  return String(decoded)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function splitIntoBlocks(text) {
  if (!text) return [];
  return String(text)
    .replace(/\r/g, '\n')
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);
}

function isBulletLine(line) {
  return /^(\-|\*|•|·)\s+/.test(line) || /^\d+[\.\)]\s+/.test(line);
}

function normalizeBulletLine(line) {
  return line
    .replace(/^(\-|\*|•|·)\s+/, '')
    .replace(/^\d+[\.\)]\s+/, '')
    .trim();
}

function textBlockToHtml(block) {
  const lines = block
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  const allBullets = lines.every(isBulletLine);
  if (allBullets) {
    const items = lines
      .map(line => `<li>${escapeHtml(normalizeBulletLine(line))}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (lines.length === 1) {
    const single = lines[0];

    if (single.length <= 80 && /:$/.test(single)) {
      return `<h3>${escapeHtml(single.replace(/:$/, ''))}</h3>`;
    }

    return `<p>${escapeHtml(single)}</p>`;
  }

  const bulletLines = lines.filter(isBulletLine);
  if (bulletLines.length >= 2 && bulletLines.length >= Math.ceil(lines.length * 0.6)) {
    const items = lines
      .map(line => {
        if (isBulletLine(line)) {
          return `<li>${escapeHtml(normalizeBulletLine(line))}</li>`;
        }
        return `<li>${escapeHtml(line)}</li>`;
      })
      .join('');
    return `<ul>${items}</ul>`;
  }

  return `<p>${escapeHtml(lines.join(' '))}</p>`;
}

function textToStructuredHtml(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return '';

  const blocks = splitIntoBlocks(
    decodeHtmlEntities(String(value))
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .trim()
  );

  if (!blocks.length) {
    return `<p>${escapeHtml(cleaned)}</p>`;
  }

  return blocks.map(textBlockToHtml).filter(Boolean).join('\n');
}

function parseDateCandidate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function extractDate(...candidates) {
  for (const candidate of candidates) {
    const parsed = parseDateCandidate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function dateOlderThanMaxAge(isoDate) {
  if (!isoDate) return true;
  return new Date(isoDate).getTime() < Date.now() - MAX_JOB_AGE_MS;
}

function computeExpiresAt(postedAt, existingExpiresAt) {
  if (postedAt) {
    return new Date(new Date(postedAt).getTime() + MAX_JOB_AGE_MS).toISOString();
  }
  if (existingExpiresAt) return existingExpiresAt;
  return new Date(Date.now() + MAX_JOB_AGE_MS).toISOString();
}

function computePostedRelativeDays(postedAt) {
  if (!postedAt) return null;
  const postedMs = new Date(postedAt).getTime();
  if (Number.isNaN(postedMs)) return null;

  const diff = Date.now() - postedMs;
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function detectSeniority(title) {
  const t = cleanText(title).toLowerCase();

  if (/\bprincipal\b/.test(t)) return 'principal';
  if (/\bstaff\b/.test(t)) return 'staff';
  if (/\bsenior\b/.test(t) || /\bsr\b/.test(t)) return 'senior';
  if (/\blead\b/.test(t)) return 'lead';
  if (/\bjunior\b/.test(t) || /\bjr\b/.test(t)) return 'junior';
  if (/\bintern\b/.test(t) || /\binternship\b/.test(t)) return 'intern';

  return null;
}

function detectEmploymentTypeFromText(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return null;

  if (/\bfull[\s-]?time\b/.test(text)) return 'full-time';
  if (/\bpart[\s-]?time\b/.test(text)) return 'part-time';
  if (/\bcontract\b/.test(text)) return 'contract';
  if (/\btemporary\b/.test(text) || /\btemp\b/.test(text)) return 'temporary';
  if (/\bintern\b/.test(text)) return 'internship';

  return null;
}

function detectEmploymentTypeFromLever(job) {
  const parts = [
    job?.categories?.commitment,
    job?.categories?.team,
    job?.categories?.department
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' ');

  if (!parts) return null;
  return detectEmploymentTypeFromText(parts);
}

function detectRemoteStatus(job) {
  const text = joinText([
    job.location,
    job.raw_location,
    job.description,
    job.description_raw,
    job.workplaceType,
    job.remote_status_hint
  ]).toLowerCase();

  if (!text) return 'on-site';
  if (/\bhybrid\b/.test(text)) return 'hybrid';
  if (/\bremote\b/.test(text)) return 'remote';
  if (/\bon[\s-]?site\b/.test(text) || /\bonsite\b/.test(text)) return 'on-site';

  return 'on-site';
}

function classifyJob(job) {
  const title = cleanText(job.title).toLowerCase();
  const text = `${title} ${cleanText(job.description).toLowerCase()} ${cleanText(job.description_raw).toLowerCase()}`;

  let jobFamily = 'other';

  const pilotTitleExcluded =
    /\b(program|project|product)\s+manager\b/.test(title) ||
    /\bstandards?\b/.test(title) ||
    /\bsafety\b/.test(title) ||
    /\bcompliance\b/.test(title);

  if ((/\bpilot\b/.test(title) || /\bremote pilot\b/.test(title)) && !pilotTitleExcluded) {
    jobFamily = 'pilot';
  } else if (/\boperator\b/.test(title)) {
    jobFamily = 'operator';
  } else if (/\btechnician\b/.test(title) || /\bmechanic\b/.test(title)) {
    jobFamily = 'technician';
  } else if (/\bflight test\b/.test(title) || /\btest engineer\b/.test(title)) {
    jobFamily = 'testing';
  } else if (/\bfield engineer\b/.test(title)) {
    jobFamily = 'field_engineering';
  } else if (/\b(business development|biz dev|partnerships?|alliances?)\b/.test(title)) {
    jobFamily = 'business_development';
  } else if (/\b(administrative|administrator|admin assistant|administrative assistant|executive assistant|office administrator|operations coordinator|program coordinator|project coordinator)\b/.test(title)) {
    jobFamily = 'administrative';
  } else if (/\bengineer\b/.test(title)) {
    jobFamily = 'engineering';
  }

  const tags = [];
  const tagRules = [
    { tag: 'drone', patterns: [/\bdrone\b/, /\bdrones\b/] },
    { tag: 'uav', patterns: [/\buav\b/] },
    { tag: 'uas', patterns: [/\buas\b/] },
    { tag: 'unmanned', patterns: [/\bunmanned\b/, /\buncrewed\b/] },
    { tag: 'counter-uas', patterns: [/\bcounter[\s-]?uas\b/, /\bcounter[\s-]?drone\b/] },
    { tag: 'flight-test', patterns: [/\bflight test\b/, /\btest engineer\b/] },
    { tag: 'embedded', patterns: [/\bembedded\b/] },
    { tag: 'firmware', patterns: [/\bfirmware\b/] },
    { tag: 'controls', patterns: [/\bcontrols\b/, /\bflight controls\b/] },
    { tag: 'gnc', patterns: [/\bgnc\b/, /\bguidance\b/, /\bnavigation\b/] },
    { tag: 'avionics', patterns: [/\bavionics\b/] },
    { tag: 'payload', patterns: [/\bpayload\b/] },
    { tag: 'integration', patterns: [/\bintegration\b/] },
    { tag: 'field', patterns: [/\bfield\b/] },
    { tag: 'maintenance', patterns: [/\bmaintenance\b/] },
    { tag: 'inspection', patterns: [/\binspection\b/] },
    { tag: 'mapping', patterns: [/\bmapping\b/, /\bphotogrammetry\b/, /\bsurvey(?:ing)?\b/] },
    { tag: 'defense', patterns: [/\bdefen[cs]e\b/, /\bmilitary\b/, /\bdod\b/, /\bwarfighter\b/] },
    { tag: 'autonomy', patterns: [/\bautonomy\b/] },
    { tag: 'computer-vision', patterns: [/\bcomputer vision\b/, /\bperception\b/] },
    { tag: 'fixed-wing', patterns: [/\bfixed wing\b/] },
    { tag: 'multirotor', patterns: [/\bmultirotor\b/, /\bquadcopter\b/] },
    { tag: 'vtol', patterns: [/\bvtol\b/] },
    { tag: 'bvlos', patterns: [/\bbvlos\b/] },
    { tag: 'remote-pilot', patterns: [/\bremote pilot\b/] }
  ];

  for (const rule of tagRules) {
    if (rule.patterns.some(pattern => pattern.test(text))) {
      tags.push(rule.tag);
    }
  }

  return {
    job_family: jobFamily,
    tags: dedupeArray(tags)
  };
}

function matchesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

function countDistinctPatternHits(text, patterns) {
  if (!text) return 0;
  let hits = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) hits += 1;
  }
  return hits;
}

function isRelevantJob(job, source) {
  const title = cleanText(job.title).toLowerCase();
  const body = joinText([job.description, job.description_raw]).toLowerCase();
  const sourceText = joinText([source?.company, source?.company_name, source?.slug]).toLowerCase();
  const reasons = [];

  const hardDronePatterns = [
    /\bdrone\b/,
    /\bdrones\b/,
    /\buav\b/,
    /\buas\b/,
    /\bsuas\b/,
    /\brpas\b/,
    /\bcounter[\s-]?uas\b/,
    /\bcounter[\s-]?drone\b/,
    /\bunmanned\b/,
    /\buncrewed\b/,
    /\bunmanned aerial\b/,
    /\bunmanned aircraft\b/,
    /\bunmanned systems\b/,
    /\bunmanned aircraft systems\b/,
    /\bunmanned aerial systems\b/,
    /\baerial robotics?\b/,
    /\bquadcopter\b/,
    /\bmultirotor\b/,
    /\bvtol\b/,
    /\bbvlos\b/
  ];

  const hardRejectTitlePatterns = [
    /\brecruiter\b/,
    /\bhuman resources\b/,
    /\bhr\b/,
    /\bpeople operations\b/,
    /\bfinance\b/,
    /\baccounting\b/,
    /\blegal\b/,
    /\bparalegal\b/,
    /\bexecutive assistant\b/,
    /\boffice manager\b/,
    /\bit support\b/,
    /\bprocurement\b/,
    /\bsupply chain\b/,
    /\bmarketing\b/,
    /\bcontent writer\b/,
    /\bcopywriter\b/,
    /\btruck[\s-]?driver\b/,
    /\btrucker\b/,
    /\bcdl\b/,
    /\bdelivery driver\b/
  ];

  const businessDevelopmentPatterns = [
    /\bbusiness development\b/,
    /\bbiz dev\b/,
    /\bbd manager\b/,
    /\bbusiness development representative\b/,
    /\bbdr\b/
  ];

  const titleDroneMatch = matchesAny(title, hardDronePatterns);
  const bodyDroneMatch = matchesAny(body, hardDronePatterns);
  const bodyDroneHitCount = countDistinctPatternHits(body, hardDronePatterns);
  const isBusinessDevelopmentRole =
    matchesAny(title, businessDevelopmentPatterns) ||
    matchesAny(body, businessDevelopmentPatterns);

  if (matchesAny(title, hardRejectTitlePatterns)) {
    reasons.push('hard-reject-title');
    return CONFIG.FILTER_DEBUG
      ? { relevant: false, reason: reasons.join('|') }
      : { relevant: false };
  }

  if (isBusinessDevelopmentRole) {
    // Business development roles need stronger drone/UAS signal.
    if (titleDroneMatch || bodyDroneHitCount >= 2) {
      reasons.push(titleDroneMatch ? 'bizdev-title-drone-keyword-match' : 'bizdev-strong-body-drone-match');
      return CONFIG.FILTER_DEBUG
        ? { relevant: true, reason: reasons.join('|') }
        : { relevant: true };
    }
    reasons.push('bizdev-no-strong-drone-signal');
    return CONFIG.FILTER_DEBUG
      ? { relevant: false, reason: reasons.join('|') }
      : { relevant: false };
  }

  if (titleDroneMatch) {
    reasons.push('title-drone-keyword-match');
    return CONFIG.FILTER_DEBUG
      ? { relevant: true, reason: reasons.join('|') }
      : { relevant: true };
  }

  if (bodyDroneMatch) {
    reasons.push('body-drone-keyword-match');
    return CONFIG.FILTER_DEBUG
      ? { relevant: true, reason: reasons.join('|') }
      : { relevant: true };
  }

  if (matchesAny(sourceText, hardDronePatterns) && matchesAny(body, hardDronePatterns)) {
    reasons.push('source-and-body-drone-match');
    return CONFIG.FILTER_DEBUG
      ? { relevant: true, reason: reasons.join('|') }
      : { relevant: true };
  }

  reasons.push('no-drone-signal');
  return CONFIG.FILTER_DEBUG
    ? { relevant: false, reason: reasons.join('|') }
    : { relevant: false };
}


function buildBestDescriptionHtml({ htmlCandidate, rawTextCandidate, plainTextCandidate }) {
  const decodedHtmlCandidate = decodeHtmlEntities(htmlCandidate || '');

  if (decodedHtmlCandidate && looksLikeHtml(decodedHtmlCandidate)) {
    return sanitizeHtml(decodedHtmlCandidate);
  }

  if (rawTextCandidate) return textToStructuredHtml(rawTextCandidate);
  if (plainTextCandidate) return textToStructuredHtml(plainTextCandidate);

  return '';
}

function extractLeverListsPlain(lists) {
  if (!Array.isArray(lists)) return '';

  const sections = [];

  for (const list of lists) {
    const heading = cleanText(list?.text || '');
    const content = list?.content || '';

    const lines = cleanText(content)
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);

    const blockParts = [];
    if (heading) blockParts.push(heading);
    if (lines.length) blockParts.push(lines.join('\n'));
    if (blockParts.length) sections.push(blockParts.join('\n'));
  }

  return sections.join('\n\n');
}

function renderLeverListContentHtml(content) {
  if (!content) return '';

  const decoded = decodeHtmlEntities(content);

  if (/<li[\s>]/i.test(decoded)) {
    const sanitized = sanitizeHtml(decoded);
    return `<ul>${sanitized}</ul>`;
  }

  if (looksLikeHtml(decoded)) return sanitizeHtml(decoded);

  return textToStructuredHtml(decoded);
}

function buildLeverDescriptionHtml(job) {
  const htmlParts = [];

  const openingHtml = sanitizeHtml(job.opening || '');
  const descriptionBodyHtml = sanitizeHtml(job.descriptionBody || '');
  const descriptionHtml = sanitizeHtml(job.description || '');
  const additionalHtml = sanitizeHtml(job.additional || '');

  if (openingHtml) htmlParts.push(openingHtml);
  if (descriptionBodyHtml) htmlParts.push(descriptionBodyHtml);
  else if (descriptionHtml) htmlParts.push(descriptionHtml);

  if (Array.isArray(job.lists)) {
    for (const list of job.lists) {
      const heading = cleanText(list?.text || '');
      const contentHtml = renderLeverListContentHtml(list?.content || '');
      if (!heading && !contentHtml) continue;

      const sectionParts = [];
      if (heading) sectionParts.push(`<h3>${escapeHtml(heading.replace(/:$/, ''))}</h3>`);
      if (contentHtml) sectionParts.push(contentHtml);
      htmlParts.push(sectionParts.join('\n'));
    }
  }

  if (additionalHtml) htmlParts.push(additionalHtml);

  const combined = htmlParts.filter(Boolean).join('\n\n').trim();
  if (combined) return combined;

  const fallbackText = [
    job.openingPlain || '',
    job.descriptionBodyPlain || '',
    job.descriptionPlain || '',
    extractLeverListsPlain(job.lists),
    job.additionalPlain || ''
  ]
    .filter(Boolean)
    .join('\n\n');

  return textToStructuredHtml(fallbackText);
}

function parseJsonFromHtml(html) {
  if (!html) return null;

  const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch?.[1]) {
    try {
      return JSON.parse(nextMatch[1]);
    } catch {}
  }

  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of ldMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed) return parsed;
    } catch {}
  }

  const appStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i);
  if (appStateMatch?.[1]) {
    try {
      return JSON.parse(appStateMatch[1]);
    } catch {}
  }

  return null;
}

function extractHtmlMainContent(html) {
  if (!html) return '';

  const match =
    html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i) ||
    html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i) ||
    html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);

  return sanitizeHtml(match?.[1] || html);
}

function deriveWorkableShortcode(job) {
  const raw = firstNonEmpty(job?.shortcode, job?.short_code, job?.code);
  if (raw) return cleanText(raw);

  const url = firstNonEmpty(job?.url, job?.apply_url, job?.application_url);
  if (!url) return null;

  const match = String(url).match(/\/j\/([^/?#]+)/i);
  return match?.[1] || null;
}

function workableHasGoodDescription(job) {
  const html = cleanText(
    firstNonEmpty(
      job?.description_html,
      job?.full_description,
      job?.descriptionHtml,
      job?.fullDescription
    ) || ''
  );

  const text = cleanText(
    joinText([
      job?.description,
      job?.short_description,
      job?.requirements,
      job?.benefits,
      job?.content
    ])
  );

  return html.length > 120 || text.length > 200;
}

function extractWorkableHtmlFieldsFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return {};

  const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [];
  const jobPosting =
    parsed['@type'] === 'JobPosting'
      ? parsed
      : graph.find(item => item && item['@type'] === 'JobPosting');

  return {
    descriptionHtml: jobPosting?.description ? sanitizeHtml(jobPosting.description) : '',
    descriptionText: cleanText(JSON.stringify(parsed))
  };
}

function getSmartRecruitersPublicUrl(slug, id, job) {
  return (
    job?.referralUrl ||
    job?.applyUrl ||
    job?.url ||
    (id ? `https://careers.smartrecruiters.com/${slug}/${id}` : null)
  );
}

function hasUsableDescription(normalizedJob) {
  if (!normalizedJob) return false;
  if (!normalizedJob.posted_at) return false;
  if (!normalizedJob.apply_url) return false;
  if (!cleanText(normalizedJob.title)) return false;
  if (!cleanText(normalizedJob.company)) return false;

  const rawLen = cleanText(normalizedJob.description_raw).length;
  const htmlLen = cleanText(normalizedJob.description_html).length;

  return rawLen >= 120 && htmlLen >= 120;
}

function sourceKey(source) {
  return `${source.provider}__${source.slug}`;
}

function isFocusFilterVisibilitySource(source) {
  return FOCUS_FILTER_VISIBILITY_KEYS.has(sourceKey(source));
}

function getFocusFilterVisibilityEntry(source) {
  const key = sourceKey(source);
  if (!focusFilterVisibility.has(key)) {
    focusFilterVisibility.set(key, {
      company: source.company,
      rejected_titles_sample: [],
      rejection_reason_counts: {},
      printed: false
    });
  }
  return focusFilterVisibility.get(key);
}

function recordFocusRejectedTitle(source, title, reason) {
  if (!isFocusFilterVisibilitySource(source)) return;
  const entry = getFocusFilterVisibilityEntry(source);
  const normalizedTitle = cleanText(title).toLowerCase();
  if (entry.rejected_titles_sample.length < 20) {
    entry.rejected_titles_sample.push({
      raw_title: title || '',
      normalized_title: normalizedTitle,
      rejection_reason: reason || 'no-reason'
    });
  }
  const bucket = reason || 'no-reason';
  entry.rejection_reason_counts[bucket] = (entry.rejection_reason_counts[bucket] || 0) + 1;
}

function printFocusFilterVisibilityIfReady(source) {
  if (!isFocusFilterVisibilitySource(source)) return;
  const entry = getFocusFilterVisibilityEntry(source);
  if (entry.printed) return;
  entry.printed = true;
  console.log(
    JSON.stringify({
      company: entry.company,
      rejected_titles_sample: entry.rejected_titles_sample,
      rejection_reason_counts: entry.rejection_reason_counts
    })
  );
}

function jobKey(job) {
  return `${job.source}__${job.source_job_id}`;
}

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function initializeSourceStat(source) {
  const key = sourceKey(source);

  if (!sourceStats[key]) {
    sourceStats[key] = {
      key,
      provider: source.provider,
      slug: source.slug,
      company: source.company,
      status: source.status || 'auto',

      jobs_listed: 0,
      jobs_relevant: 0,
      jobs_inserted: 0,
      jobs_updated: 0,
      jobs_skipped_old: 0,
      jobs_skipped_irrelevant: 0,
      jobs_flagged_partial: 0,
      jobs_marked_inactive: 0,

      detail_fetch_success: 0,
      detail_fetch_failed: 0,

      fetch_failed: false,
      is_empty: false,
      bucket_last_run: '',

      last_error: '',
      last_checked_at: '',
      last_successful_fetch_at: '',
      yield_last_run: 0,

      scrape_tier: source.scrape_tier || '',
      scrape_every_runs: source.scrape_every_runs || '',

      jobs_last_run: 0,
      jobs_relevant_last_run: 0,
      jobs_inserted_last_run: 0,
      jobs_updated_last_run: 0,
      jobs_irrelevant_last_run: 0,
      jobs_partial_last_run: 0,
      jobs_old_last_run: 0,
      fetch_failed_last_run: false,

      times_seen_empty: parseNumber(source.times_seen_empty, 0),
      times_failed: parseNumber(source.times_failed, 0),
      last_relevant_at: String(source.last_relevant_at || '').trim(),
      runs_since_last_relevant: parseNumber(source.runs_since_last_relevant, 0),
      consecutive_fetch_failures: parseNumber(source.consecutive_fetch_failures, 0),
      manually_disabled: String(source.manually_disabled || '').trim().toLowerCase() === 'true'
    };
  }

  return sourceStats[key];
}

function ensureAtsStat(provider) {
  if (!atsStats[provider]) {
    atsStats[provider] = {
      provider,
      sources: 0,
      jobs_listed: 0,
      jobs_relevant: 0,
      jobs_inserted: 0,
      jobs_updated: 0,
      jobs_skipped_irrelevant: 0,
      jobs_flagged_partial: 0,
      jobs_skipped_old: 0,
      detail_fetch_success: 0,
      detail_fetch_failed: 0,
      fetch_failed: 0
    };
  }

  return atsStats[provider];
}

function computeSourceScore(stats) {
  return (
    (stats.jobs_inserted + stats.jobs_updated) -
    (stats.jobs_skipped_irrelevant * 0.5) -
    (stats.jobs_flagged_partial * 0.25) -
    (stats.jobs_skipped_old * 0.25)
  );
}

function classifySourceTier(stats) {
  if (stats.fetch_failed || stats.times_failed >= 3) return 'low';
  if (stats.jobs_listed === 0 && stats.times_seen_empty >= 2) return 'dead';

  const score = computeSourceScore(stats);
  const yieldRate = stats.jobs_listed ? (stats.jobs_inserted + stats.jobs_updated) / stats.jobs_listed : 0;

  if (score >= 5 || yieldRate >= 0.5) return 'high';
  if (score >= 1 || yieldRate >= 0.1) return 'medium';
  return 'low';
}

function classifySourceBucket(stats) {
  if (stats.fetch_failed) return 'fetch_failed';
  if (stats.jobs_listed === 0) return 'empty';
  if (stats.jobs_relevant === 0 && stats.jobs_skipped_old > 0 && stats.jobs_skipped_irrelevant === 0) return 'old_only';
  if (stats.jobs_relevant === 0 && stats.jobs_skipped_irrelevant > 0) return 'irrelevant_only';
  if (stats.jobs_relevant > 0 && (stats.jobs_inserted + stats.jobs_updated) === 0 && stats.jobs_flagged_partial > 0) return 'partial_only';
  if ((stats.jobs_inserted + stats.jobs_updated) > 0) return 'productive';
  return 'mixed';
}

function shouldProcessSource(source) {
  return String(source.manually_disabled || '').toLowerCase() !== 'true';
}

/** Prefer `provider` column, then `ats` (sources.csv lists Workable in a block after ~400 other ATS rows; both should match). */
function canonicalProviderFromCsvRow(row) {
  const p = (row.provider || '').trim();
  const a = (row.ats || '').trim();
  return (p || a).toLowerCase();
}

/**
 * Same row shape as loadSources pre-filter, counting workable rows only — for diagnostics when sync:workable loads 0 sources.
 */
function countEligibleWorkableRowsOnDisk() {
  if (!fs.existsSync(SOURCES_CSV_PATH)) return { path: SOURCES_CSV_PATH, count: 0 };

  const raw = fs.readFileSync(SOURCES_CSV_PATH, 'utf-8')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!raw) return { path: SOURCES_CSV_PATH, count: 0 };

  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return { path: SOURCES_CSV_PATH, count: 0 };

  const header = parseCsvLine(lines[0]).map(v => v.toLowerCase());
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = cols[j] ?? '';
    }
    const provider = canonicalProviderFromCsvRow(row);
    const slug = (row.slug || '').trim();
    const company = (row.company_name || row.company || '').trim();
    const status = (row.status || '').trim().toLowerCase();
    if (!provider || !slug || !company) continue;
    if (status !== 'approved' && status !== 'auto') continue;
    if (provider === 'workable') count += 1;
  }

  return { path: SOURCES_CSV_PATH, count };
}

function loadSources() {
  if (!fs.existsSync(SOURCES_CSV_PATH)) return [];

  const raw = fs.readFileSync(SOURCES_CSV_PATH, 'utf-8')
    .replace(/^\uFEFF/, '')
    .trim();

  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map(v => v.toLowerCase());

  return lines
    .slice(1)
    .filter(Boolean)
    .map(parseCsvLine)
    .map(cols => {
      const row = {};
      for (let i = 0; i < header.length; i++) {
        row[header[i]] = cols[i] ?? '';
      }

      const provider = canonicalProviderFromCsvRow(row);
      return {
        ...row,
        provider,
        ats: provider,
        slug: (row.slug || '').trim(),
        company: (row.company_name || row.company || '').trim(),
        company_name: (row.company_name || row.company || '').trim(),
        status: (row.status || '').trim().toLowerCase(),
        manually_disabled: String(row.manually_disabled || '').trim().toLowerCase()
      };
    });
}

function isSourceEligibleForRun(source) {
  if (!source.provider || !source.slug || !source.company) return false;
  if (source.status !== 'approved' && source.status !== 'auto') return false;
  if (String(source.manually_disabled || '').toLowerCase() === 'true') return false;
  if (ONLY_PROVIDERS && !ONLY_PROVIDERS.has(source.provider)) return false;
  // Inclusion wins: DAILY_SYNC_ONLY_PROVIDERS=workable must not combine with exclude-workable → 0 rows.
  if (
    EXCLUDE_PROVIDERS &&
    EXCLUDE_PROVIDERS.has(source.provider) &&
    !ONLY_PROVIDERS?.has(source.provider)
  ) {
    return false;
  }
  return true;
}

function saveSources(rows) {
  const requiredHeaders = [
    'ats',
    'slug',
    'company_name',
    'status',
    'last_checked_at',
    'last_successful_fetch_at',
    'jobs_last_run',
    'jobs_relevant_last_run',
    'jobs_inserted_last_run',
    'jobs_updated_last_run',
    'jobs_irrelevant_last_run',
    'jobs_partial_last_run',
    'jobs_old_last_run',
    'fetch_failed_last_run',
    'yield_last_run',
    'times_seen_empty',
    'times_failed',
    'last_relevant_at',
    'runs_since_last_relevant',
    'consecutive_fetch_failures',
    'manually_disabled',
    'scrape_tier',
    'scrape_every_runs',
    'bucket_last_run',
    'last_error'
  ];

  const extraHeaders = new Set(requiredHeaders);
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      extraHeaders.add(key);
    }
  }

  const orderedHeaders = [
    ...requiredHeaders,
    ...Array.from(extraHeaders).filter(h => !requiredHeaders.includes(h))
  ];

  const body = rows.map(row =>
    orderedHeaders.map(h => csvEscape(row[h] ?? '')).join(',')
  );

  fs.writeFileSync(SOURCES_CSV_PATH, [orderedHeaders.join(','), ...body].join('\n'), 'utf-8');
}

function writeSourcePerformanceCsv() {
  const headers = [
    'provider',
    'slug',
    'company',
    'jobs_listed',
    'jobs_relevant',
    'jobs_inserted',
    'jobs_updated',
    'jobs_skipped_old',
    'jobs_skipped_irrelevant',
    'jobs_flagged_partial',
    'jobs_marked_inactive',
    'detail_fetch_success',
    'detail_fetch_failed',
    'fetch_failed',
    'is_empty',
    'bucket_last_run',
    'yield_last_run',
    'scrape_tier',
    'times_seen_empty',
    'times_failed',
    'last_checked_at',
    'last_successful_fetch_at',
    'last_error'
  ];

  const rows = Object.values(sourceStats)
    .sort((a, b) => {
      const y = Number(b.yield_last_run || 0) - Number(a.yield_last_run || 0);
      if (y !== 0) return y;
      return String(a.company).localeCompare(String(b.company));
    })
    .map(stat => headers.map(h => csvEscape(stat[h] ?? '')).join(','));

  fs.writeFileSync(SOURCE_PERFORMANCE_CSV_PATH, [headers.join(','), ...rows].join('\n'), 'utf-8');
}

function loadPreviousSourcePerformance() {
  if (!fs.existsSync(SOURCE_PERFORMANCE_CSV_PATH)) {
    return { totals: null, bySource: new Map() };
  }

  const raw = fs.readFileSync(SOURCE_PERFORMANCE_CSV_PATH, 'utf-8')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!raw) return { totals: null, bySource: new Map() };

  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { totals: null, bySource: new Map() };

  const header = parseCsvLine(lines[0]).map(v => String(v || '').trim().toLowerCase());
  const idx = key => header.indexOf(key);
  const bySource = new Map();
  const totals = {
    jobs_listed: 0,
    jobs_relevant: 0,
    jobs_inserted: 0,
    jobs_updated: 0
  };

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const provider = String(cols[idx('provider')] || '').trim().toLowerCase();
    const slug = String(cols[idx('slug')] || '').trim().toLowerCase();
    const company = String(cols[idx('company')] || '').trim();
    if (!provider || !slug) continue;
    const key = `${provider}__${slug}`;
    const listed = parseNumber(cols[idx('jobs_listed')], 0);
    const relevant = parseNumber(cols[idx('jobs_relevant')], 0);
    const inserted = parseNumber(cols[idx('jobs_inserted')], 0);
    const updated = parseNumber(cols[idx('jobs_updated')], 0);
    bySource.set(key, { provider, slug, company, listed, relevant, inserted, updated });

    totals.jobs_listed += listed;
    totals.jobs_relevant += relevant;
    totals.jobs_inserted += inserted;
    totals.jobs_updated += updated;
  }

  return { totals, bySource };
}

function formatDelta(current, previous) {
  const delta = Number(current) - Number(previous);
  const sign = delta > 0 ? '+' : '';
  return `${current} (${sign}${delta} vs prev ${previous})`;
}

function printDeltaVsPreviousRun(previousPerf) {
  if (!previousPerf?.totals) {
    console.log('\n==============================');
    console.log('DELTA VS PREVIOUS RUN');
    console.log('==============================');
    console.log('No previous source_performance.csv baseline found. Delta output starts next run.');
    return;
  }

  const previous = previousPerf.totals;
  const currentAccepted = runStats.jobsInserted + runStats.jobsUpdated;
  const previousAccepted = previous.jobs_inserted + previous.jobs_updated;

  console.log('\n==============================');
  console.log('DELTA VS PREVIOUS RUN');
  console.log('==============================');
  console.log(`Jobs listed:   ${formatDelta(runStats.jobsListed, previous.jobs_listed)}`);
  console.log(`Jobs relevant: ${formatDelta(runStats.jobsRelevant, previous.jobs_relevant)}`);
  console.log(`Jobs inserted: ${formatDelta(runStats.jobsInserted, previous.jobs_inserted)}`);
  console.log(`Jobs updated:  ${formatDelta(runStats.jobsUpdated, previous.jobs_updated)}`);
  console.log(`Accepted jobs (inserted+updated): ${formatDelta(currentAccepted, previousAccepted)}`);

  const currentBySource = new Map();
  for (const s of Object.values(sourceStats)) {
    const key = `${String(s.provider || '').trim().toLowerCase()}__${String(s.slug || '').trim().toLowerCase()}`;
    currentBySource.set(key, {
      provider: s.provider,
      slug: s.slug,
      company: s.company,
      accepted: Number(s.jobs_inserted || 0) + Number(s.jobs_updated || 0),
      listed: Number(s.jobs_listed || 0),
      relevant: Number(s.jobs_relevant || 0)
    });
  }

  const deltas = [];
  const keys = new Set([...currentBySource.keys(), ...previousPerf.bySource.keys()]);
  for (const key of keys) {
    const cur = currentBySource.get(key);
    const prev = previousPerf.bySource.get(key);
    const curAccepted = cur ? cur.accepted : 0;
    const prevAccepted = prev ? (prev.inserted + prev.updated) : 0;
    const deltaAccepted = curAccepted - prevAccepted;
    if (deltaAccepted === 0) continue;
    deltas.push({
      key,
      company: cur?.company || prev?.company || key,
      accepted: curAccepted,
      prevAccepted,
      deltaAccepted
    });
  }

  if (!deltas.length) {
    console.log('Per-company accepted deltas: no changes vs previous run.');
    return;
  }

  deltas.sort((a, b) => Math.abs(b.deltaAccepted) - Math.abs(a.deltaAccepted));
  console.log('Per-company accepted deltas (top 20 by absolute change):');
  for (const row of deltas.slice(0, 20)) {
    const sign = row.deltaAccepted > 0 ? '+' : '';
    console.log(`- ${row.company}: ${row.accepted} (${sign}${row.deltaAccepted} vs prev ${row.prevAccepted})`);
  }
}

function applySourceMetricsToRows(sourceRows) {
  return sourceRows.map(source => {
    const stats = sourceStats[sourceKey(source)];
    if (!stats) return source;

    const scrapeTier = classifySourceTier(stats);
    const scrapeEveryRuns =
      scrapeTier === 'high' ? 1 :
      scrapeTier === 'medium' ? 1 :
      scrapeTier === 'low' ? 2 : 999;

    return {
      ...source,
      ats: source.provider,
      company_name: source.company,
      last_checked_at: stats.last_checked_at || source.last_checked_at || '',
      last_successful_fetch_at: stats.last_successful_fetch_at || source.last_successful_fetch_at || '',
      jobs_last_run: String(stats.jobs_listed),
      jobs_relevant_last_run: String(stats.jobs_relevant),
      jobs_inserted_last_run: String(stats.jobs_inserted),
      jobs_updated_last_run: String(stats.jobs_updated),
      jobs_irrelevant_last_run: String(stats.jobs_skipped_irrelevant),
      jobs_partial_last_run: String(stats.jobs_flagged_partial),
      jobs_old_last_run: String(stats.jobs_skipped_old),
      fetch_failed_last_run: String(!!stats.fetch_failed),
      yield_last_run: stats.yield_last_run.toFixed(3),
      times_seen_empty: String(stats.times_seen_empty),
      times_failed: String(stats.times_failed),
      last_relevant_at: stats.last_relevant_at || '',
      runs_since_last_relevant: String(stats.runs_since_last_relevant),
      consecutive_fetch_failures: String(stats.consecutive_fetch_failures),
      manually_disabled: String(!!stats.manually_disabled),
      scrape_tier: scrapeTier,
      scrape_every_runs: String(scrapeEveryRuns),
      bucket_last_run: stats.bucket_last_run || '',
      last_error: stats.last_error || ''
    };
  });
}

function recordDetailFetchSuccess(source) {
  runStats.jobsDetailFetched += 1;
  initializeSourceStat(source).detail_fetch_success += 1;
  ensureAtsStat(source.provider).detail_fetch_success += 1;
}

function recordDetailFetchFailure(source) {
  runStats.jobsDetailFailed += 1;
  initializeSourceStat(source).detail_fetch_failed += 1;
  ensureAtsStat(source.provider).detail_fetch_failed += 1;
}

function parseRetryAfterMs(res) {
  const ra = res.headers.get('retry-after');
  if (!ra) return null;
  const sec = parseInt(ra, 10);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return sec * 1000;
}

function capBackoffMs(url, tag, waitMs) {
  const isWorkable = /apply\.workable\.com/i.test(url);
  const cap = isWorkable ? CONFIG.WORKABLE_MAX_RETRY_AFTER_MS : CONFIG.FETCH_MAX_RETRY_AFTER_MS;
  if (waitMs > cap) {
    console.log(
      `[fetch] ${tag} capping backoff ${waitMs}ms -> ${cap}ms (${isWorkable ? 'WORKABLE_MAX_RETRY_AFTER_MS' : 'FETCH_MAX_RETRY_AFTER_MS'})`
    );
    return cap;
  }
  return waitMs;
}

async function fetchWithRetry(
  url,
  { label, parse = 'json', headers = {}, maxAttempts = CONFIG.FETCH_MAX_ATTEMPTS, retry403 = true } = {}
) {
  const tag = label || url;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: {
          accept: parse === 'json' ? 'application/json, text/plain, */*' : '*/*',
          'user-agent': CONFIG.FETCH_USER_AGENT,
          ...headers
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const status = res.status;
        if (status === 404) {
          throw new Error(`${tag} failed: 404`);
        }
        const retryable =
          status === 429 ||
          status === 503 ||
          status === 502 ||
          (status === 403 && retry403) ||
          status === 408;
        if (retryable && attempt < maxAttempts - 1) {
          let waitMs;
          if (status === 429 || status === 503) {
            waitMs = parseRetryAfterMs(res) ?? Math.min(90_000, 10_000 * 2 ** attempt);
            waitMs = capBackoffMs(url, tag, waitMs);
          } else {
            waitMs = 5_000 * (attempt + 1);
          }
          console.log(`[fetch] ${tag} HTTP ${status}, backing off ${waitMs}ms (${attempt + 1}/${maxAttempts})`);
          await sleep(waitMs);
          continue;
        }
        throw new Error(`${tag} failed: ${status}`);
      }

      if (parse === 'text') {
        return await res.text();
      }

      const text = await res.text();
      const trimmed = text.trimStart();
      const ct = res.headers.get('content-type') || '';
      const looksHtml =
        /text\/html/i.test(ct) ||
        trimmed.startsWith('<!') ||
        trimmed.toLowerCase().startsWith('<html');
      if (looksHtml) {
        if (attempt < maxAttempts - 1) {
          const waitMs = 5_000 * (attempt + 1);
          console.log(`[fetch] ${tag} returned HTML instead of JSON, retry in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        throw new Error(`${tag} returned HTML instead of JSON`);
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        if (attempt < maxAttempts - 1) {
          await sleep(2_000 * (attempt + 1));
          continue;
        }
        throw new Error(`${tag} invalid JSON: ${e.message}`);
      }
    } catch (err) {
      clearTimeout(timeout);
      const msg = String(err.message || err);
      if (/failed: 404/.test(msg)) throw err;

      const isAbort = err.name === 'AbortError' || /aborted/i.test(msg);
      if (attempt < maxAttempts - 1 && (isAbort || /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|fetch failed/i.test(msg))) {
        console.log(`[fetch] ${tag} transient error, retry: ${msg.slice(0, 120)}`);
        await sleep(CONFIG.RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      if (attempt >= maxAttempts - 1) throw err;
      await sleep(CONFIG.RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error(`${tag} failed after ${maxAttempts} attempts`);
}

async function fetchJson(url, label) {
  return fetchWithRetry(url, { label, parse: 'json' });
}

async function fetchText(url, label) {
  return fetchWithRetry(url, {
    label,
    parse: 'text',
    headers: { 'user-agent': 'Mozilla/5.0' }
  });
}

function normalizeGreenhouseJob(job, company, rawDetail = null) {
  const sourceJob = rawDetail || job;

  const postedAt = extractDate(
    sourceJob.posted_at,
    sourceJob.published_at,
    sourceJob.created_at,
    sourceJob.updated_at
  );

  const rawHtml = decodeHtmlEntities(sourceJob.content || '');
  const plainText = joinText([sourceJob.title, sourceJob.content, sourceJob.location?.name]);
  const descriptionRaw = cleanText(sourceJob.content || '');

  return {
    source: 'greenhouse',
    source_job_id: String(sourceJob.id),
    title: cleanText(sourceJob.title),
    company,
    location: cleanText(sourceJob.location?.name),
    raw_location: cleanText(sourceJob.location?.name),
    description: plainText,
    description_raw: descriptionRaw,
    description_html: buildBestDescriptionHtml({
      htmlCandidate: rawHtml,
      rawTextCandidate: descriptionRaw,
      plainTextCandidate: plainText
    }),
    apply_url: sourceJob.absolute_url || null,
    posted_at: postedAt,
    employment_type: null,
    remote_status: null
  };
}

function normalizeLeverJob(job, company, rawDetail = null) {
  const sourceJob = rawDetail || job;

  const postedAt = extractDate(
    sourceJob.createdAt,
    sourceJob.publishedAt,
    sourceJob.updatedAt,
    sourceJob.openedAt
  );

  const location = cleanText(sourceJob.categories?.location || sourceJob.categories?.allLocations);
  const listsPlain = extractLeverListsPlain(sourceJob.lists);

  const rawText = [
    sourceJob.openingPlain || '',
    sourceJob.descriptionBodyPlain || '',
    sourceJob.descriptionPlain || '',
    listsPlain,
    sourceJob.additionalPlain || ''
  ]
    .filter(Boolean)
    .join('\n\n');

  const plainText = joinText([
    sourceJob.text,
    sourceJob.openingPlain,
    sourceJob.descriptionBodyPlain,
    sourceJob.descriptionPlain,
    sourceJob.additionalPlain,
    sourceJob.categories?.team,
    sourceJob.categories?.commitment,
    sourceJob.categories?.department,
    sourceJob.categories?.allLocations,
    sourceJob.categories?.location,
    sourceJob.workplaceType,
    listsPlain
  ]);

  const descriptionRaw = cleanText(rawText || plainText);

  return {
    source: 'lever',
    source_job_id: String(sourceJob.id),
    title: cleanText(sourceJob.text),
    company,
    location,
    raw_location: location,
    description: plainText,
    description_raw: descriptionRaw,
    description_html: buildLeverDescriptionHtml(sourceJob),
    apply_url: sourceJob.hostedUrl || null,
    posted_at: postedAt,
    employment_type: detectEmploymentTypeFromLever(sourceJob),
    remote_status: detectRemoteStatus({
      location,
      raw_location: location,
      description: plainText,
      description_raw: descriptionRaw,
      workplaceType: sourceJob.workplaceType
    })
  };
}

function normalizeWorkableJob(job, company, slug, rawDetail = null) {
  const sourceJob = rawDetail || job;

  const postedAt = extractDate(
    sourceJob.published,
    sourceJob.created_at,
    sourceJob.updated_at,
    sourceJob.createdAt,
    sourceJob.updatedAt,
    sourceJob.published_at
  );

  const title = cleanText(sourceJob.title || sourceJob.name);
  const location = cleanText(
    joinText([
      sourceJob.location?.city,
      sourceJob.location?.region,
      sourceJob.location?.country,
      sourceJob.location?.location_str,
      sourceJob.location?.name,
      sourceJob.location
    ])
  );

  const htmlCandidate =
    sourceJob.description_html ||
    sourceJob.full_description ||
    sourceJob.descriptionHtml ||
    sourceJob.fullDescription ||
    sourceJob.description;

  const rawTextCandidate = cleanText(
    [
      joinText([
        sourceJob.description,
        sourceJob.short_description,
        sourceJob.requirements,
        sourceJob.benefits,
        sourceJob.location?.location_str
      ]),
      cleanText(sourceJob.requirements_text || ''),
      cleanText(sourceJob.benefits_text || ''),
      cleanText(sourceJob.additional_information || '')
    ]
      .filter(Boolean)
      .join('\n\n')
  );

  const shortcode = deriveWorkableShortcode(sourceJob) || deriveWorkableShortcode(job);

  const applyUrl =
    sourceJob.url ||
    sourceJob.apply_url ||
    sourceJob.application_url ||
    (shortcode ? `https://apply.workable.com/${slug}/j/${shortcode}/` : `https://apply.workable.com/${slug}/`);

  return {
    source: 'workable',
    source_job_id: String(sourceJob.id || shortcode || title),
    title,
    company,
    location,
    raw_location: location,
    description: rawTextCandidate,
    description_raw: rawTextCandidate,
    description_html: buildBestDescriptionHtml({
      htmlCandidate,
      rawTextCandidate,
      plainTextCandidate: rawTextCandidate
    }),
    apply_url: applyUrl,
    posted_at: postedAt,
    employment_type: detectEmploymentTypeFromText(joinText([sourceJob.employment_type, sourceJob.type])),
    remote_status: detectRemoteStatus({
      location,
      raw_location: location,
      description: rawTextCandidate,
      description_raw: rawTextCandidate,
      remote_status_hint: joinText([sourceJob.remote, sourceJob.workplace_type, sourceJob.locationType])
    })
  };
}

function normalizeAshbyJob(job, company, rawDetail = null) {
  const sourceJob = rawDetail || job;

  const postedAt = extractDate(
    sourceJob.publishedAt,
    sourceJob.createdAt,
    sourceJob.updatedAt,
    sourceJob.postedAt
  );

  const location = cleanText(
    joinText([
      sourceJob.location?.name,
      sourceJob.location?.locationName,
      sourceJob.locationName,
      sourceJob.location
    ])
  );

  const htmlCandidate =
    sourceJob.descriptionHtml ||
    sourceJob.descriptionHTML ||
    sourceJob.htmlDescription ||
    sourceJob.content;

  const rawTextCandidate = cleanText(
    joinText([
      sourceJob.descriptionPlain,
      sourceJob.descriptionText,
      sourceJob.description,
      sourceJob.team?.name,
      sourceJob.department?.name
    ])
  );

  return {
    source: 'ashby',
    source_job_id: String(sourceJob.id || sourceJob.jobPostingId || sourceJob.requisitionId || sourceJob.title),
    title: cleanText(sourceJob.title),
    company,
    location,
    raw_location: location,
    description: rawTextCandidate,
    description_raw: rawTextCandidate,
    description_html: buildBestDescriptionHtml({
      htmlCandidate,
      rawTextCandidate,
      plainTextCandidate: rawTextCandidate
    }),
    apply_url: sourceJob.jobUrl || sourceJob.absoluteUrl || sourceJob.applyUrl || null,
    posted_at: postedAt,
    employment_type: detectEmploymentTypeFromText(joinText([sourceJob.employmentType, sourceJob.timeCommitment])),
    remote_status: detectRemoteStatus({
      location,
      raw_location: location,
      description: rawTextCandidate,
      description_raw: rawTextCandidate,
      remote_status_hint: joinText([sourceJob.workplaceType, sourceJob.remote])
    })
  };
}

function normalizeSmartRecruitersJob(job, company, slug, rawDetail = null) {
  const sourceJob = rawDetail || job;

  const postedAt = extractDate(
    sourceJob.releasedDate,
    sourceJob.postedDate,
    sourceJob.createdOn,
    sourceJob.updatedOn
  );

  const location = cleanText(
    joinText([
      sourceJob.location?.city,
      sourceJob.location?.region,
      sourceJob.location?.country,
      sourceJob.location?.fullLocation,
      sourceJob.location?.location
    ])
  );

  const htmlParts = [
    sourceJob.jobAd?.sections?.jobDescription?.text,
    sourceJob.jobAd?.sections?.qualifications?.text,
    sourceJob.jobAd?.sections?.additionalInformation?.text,
    sourceJob.html,
    sourceJob.description
  ].filter(Boolean);

  const htmlCandidate = htmlParts.join('\n\n');

  const rawTextCandidate = cleanText(
    [
      sourceJob.name,
      sourceJob.jobAd?.sections?.jobDescription?.text,
      sourceJob.jobAd?.sections?.qualifications?.text,
      sourceJob.jobAd?.sections?.additionalInformation?.text,
      location
    ]
      .filter(Boolean)
      .join('\n\n')
  );

  const sourceId = sourceJob.id || sourceJob.uuid || sourceJob.refNumber || sourceJob.name;

  return {
    source: 'smartrecruiters',
    source_job_id: String(sourceId),
    title: cleanText(sourceJob.name || sourceJob.title),
    company,
    location,
    raw_location: location,
    description: rawTextCandidate,
    description_raw: rawTextCandidate,
    description_html: buildBestDescriptionHtml({
      htmlCandidate,
      rawTextCandidate,
      plainTextCandidate: rawTextCandidate
    }),
    apply_url: getSmartRecruitersPublicUrl(slug, sourceId, sourceJob),
    posted_at: postedAt,
    employment_type: detectEmploymentTypeFromText(
      joinText([sourceJob.typeOfEmployment?.label, sourceJob.typeOfEmployment?.id])
    ),
    remote_status: detectRemoteStatus({
      location,
      raw_location: location,
      description: rawTextCandidate,
      description_raw: rawTextCandidate,
      remote_status_hint: joinText([sourceJob.location?.remote, sourceJob.remote, sourceJob.locationType])
    })
  };
}

function extractTeamtailorLocationNamesFromItemHtml(itemHtml) {
  if (!itemHtml) return '';
  const names = [...String(itemHtml).matchAll(/<tt:name>([^<]*)<\/tt:name>/g)]
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean);
  return names.join(', ');
}

function normalizeTeamtailorItem(item, company) {
  const descriptionRaw = cleanText(item.descriptionHtml || '');
  const plainText = descriptionRaw;
  const postedAt = extractDate(item.pubDate);
  const loc = cleanText(item.loc || '');
  return {
    source: 'teamtailor',
    source_job_id: String(item.guid || item.link || item.title || 'unknown'),
    title: cleanText(item.title) || '(no title)',
    company,
    location: loc,
    raw_location: loc,
    description: plainText,
    description_raw: descriptionRaw,
    description_html: buildBestDescriptionHtml({
      htmlCandidate: item.descriptionHtml,
      rawTextCandidate: descriptionRaw,
      plainTextCandidate: plainText
    }),
    apply_url: item.link || null,
    posted_at: postedAt,
    employment_type: null,
    remote_status: detectRemoteStatus({
      location: loc,
      raw_location: loc,
      description: plainText,
      description_raw: descriptionRaw,
      remote_status_hint: item.remoteStatus
    })
  };
}

function ripplingEncodeBoardPath(slug) {
  return String(slug || '')
    .trim()
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function formatRipplingLocations(locs) {
  if (!Array.isArray(locs) || locs.length === 0) return '';
  return cleanText(locs.map((l) => (l && typeof l === 'object' ? l.name : '')).filter(Boolean).join(', '));
}

function ripplingDescriptionFromDetail(d) {
  if (d == null) return { html: '', raw: '' };
  if (typeof d === 'string') {
    const html = d;
    return { html, raw: cleanText(html) };
  }
  if (typeof d === 'object') {
    const companyTxt = typeof d.company === 'string' ? d.company : '';
    const role = typeof d.role === 'string' ? d.role : '';
    const html = [companyTxt, role].filter(Boolean).join('\n');
    return { html, raw: cleanText(html) };
  }
  return { html: '', raw: '' };
}

function parseRipplingMaxDetailFetches() {
  const raw = String(process.env.ATS_RIPPLING_MAX_DETAIL_FETCHES ?? '').trim();
  if (!raw) return Infinity;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function ripplingPageFingerprint(items) {
  if (!Array.isArray(items) || items.length === 0) return 'empty';
  return items
    .map((j) => (j && typeof j === 'object' ? String(j.id ?? '') : ''))
    .sort()
    .join('|');
}

function normalizeRipplingListItem(listJob, company, merged) {
  const sourceJob = merged || listJob;
  const id = listJob?.id != null ? String(listJob.id) : '';
  const title = cleanText(sourceJob.name || listJob?.name || '');
  const location = formatRipplingLocations(sourceJob.locations || listJob?.locations);
  const { html: htmlCandidate, raw: rawTextCandidate } = ripplingDescriptionFromDetail(
    sourceJob.description
  );
  const postedAt = extractDate(
    sourceJob.createdOn,
    sourceJob.updatedOn,
    listJob?.createdOn,
    listJob?.updatedOn
  );
  let employmentType = null;
  if (sourceJob?.employmentType && typeof sourceJob.employmentType === 'object') {
    employmentType = cleanText(sourceJob.employmentType.label) || null;
  }
  const applyUrl = cleanText(sourceJob.url || listJob?.url || '');
  const remoteHint =
    sourceJob?.locations?.[0]?.workplaceType || listJob?.locations?.[0]?.workplaceType;

  return {
    source: 'rippling',
    source_job_id: id || title || 'unknown',
    title: title || '(no title)',
    company,
    location,
    raw_location: location,
    description: rawTextCandidate,
    description_raw: rawTextCandidate,
    description_html: buildBestDescriptionHtml({
      htmlCandidate,
      rawTextCandidate,
      plainTextCandidate: rawTextCandidate
    }),
    apply_url: applyUrl || null,
    posted_at: postedAt,
    employment_type: employmentType,
    remote_status: detectRemoteStatus({
      location,
      raw_location: location,
      description: rawTextCandidate,
      description_raw: rawTextCandidate,
      remote_status_hint: remoteHint
    })
  };
}

function parseBamboohrMaxDetailFetches() {
  const raw = String(process.env.ATS_BAMBOOHR_MAX_DETAIL_FETCHES ?? '').trim();
  if (!raw) return Infinity;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function parseWorkableMaxDetailFetches() {
  const raw = String(process.env.ATS_WORKABLE_MAX_DETAIL_FETCHES ?? '').trim();
  if (!raw) return Infinity;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function bambooLocationFromListJob(job) {
  const ats = job?.atsLocation;
  if (ats && typeof ats === 'object') {
    const parts = [ats.city, ats.state, ats.country].filter(Boolean);
    return cleanText(parts.join(', '));
  }
  const loc = job?.location;
  if (loc && typeof loc === 'object') {
    const parts = [loc.city, loc.state, loc.addressCountry].filter(Boolean);
    return cleanText(parts.join(', '));
  }
  return '';
}

function bambooListJobHasUsableDescription(job) {
  const d = job?.description ?? job?.jobOpeningDescription;
  return Boolean(d && String(d).trim());
}

function normalizeBamboohrJob(listJob, company, baseUrl, mergedOpening) {
  const opening = mergedOpening || listJob;
  const id = opening?.id != null ? String(opening.id) : String(listJob?.id ?? '');
  const title = cleanText(opening?.jobOpeningName || opening?.title || listJob?.jobOpeningName || '');
  let applyUrl = '';
  if (opening?.jobOpeningShareUrl) {
    applyUrl = String(opening.jobOpeningShareUrl).trim();
  } else if (id) {
    applyUrl = `${baseUrl}/careers/${encodeURIComponent(id)}`;
  }

  let descriptionHtml = '';
  let rawTextCandidate = '';
  const descSrc = opening?.description ?? listJob?.description ?? listJob?.jobOpeningDescription;
  if (descSrc) {
    descriptionHtml = String(descSrc);
    rawTextCandidate = cleanText(descSrc);
  }

  const postedAt = extractDate(
    opening?.datePosted,
    opening?.postedDate,
    opening?.createdDate,
    listJob?.datePosted
  );
  const location = bambooLocationFromListJob(listJob);

  return {
    source: 'bamboohr',
    source_job_id: id || title || 'unknown',
    title: title || '(no title)',
    company,
    location,
    raw_location: location,
    description: rawTextCandidate,
    description_raw: rawTextCandidate,
    description_html: buildBestDescriptionHtml({
      htmlCandidate: descriptionHtml,
      rawTextCandidate,
      plainTextCandidate: rawTextCandidate
    }),
    apply_url: applyUrl || null,
    posted_at: postedAt,
    employment_type: cleanText(opening?.employmentStatusLabel || listJob?.employmentStatusLabel) || null,
    remote_status: detectRemoteStatus({
      location,
      raw_location: location,
      description: rawTextCandidate,
      description_raw: rawTextCandidate
    })
  };
}

async function fetchTeamtailor(source) {
  const sub = String(source.slug || '').trim();
  if (!sub) throw new Error('Teamtailor: missing slug (careers subdomain)');

  const rssUrl = `https://${encodeURIComponent(sub)}.teamtailor.com/jobs.rss`;
  console.log(`Fetching Teamtailor: ${source.company} -> ${rssUrl}`);
  const xml = await fetchText(rssUrl, `Teamtailor RSS ${source.company}`);
  const $ = load(xml, { xml: { xmlMode: true } });
  const out = [];

  $('item').each((_, el) => {
    try {
      const it = $(el);
      const title = cleanText(it.find('title').first().text());
      const link = cleanText(it.find('link').first().text());
      const guid = cleanText(it.find('guid').first().text());
      const pubDate = cleanText(it.find('pubDate').first().text());
      const remoteStatus = cleanText(it.find('remoteStatus').first().text()) || null;
      const descEl = it.find('description').first();
      const descriptionHtml = String(descEl.html() ?? descEl.text() ?? '');
      const loc = extractTeamtailorLocationNamesFromItemHtml(it.html() || '');

      if (!title && !link) return;

      const normalized = normalizeTeamtailorItem(
        { title, link, guid, pubDate, remoteStatus, descriptionHtml, loc },
        source.company
      );

      out.push({
        raw_list: { title, link, guid, pubDate },
        raw_detail: null,
        detail_fetched: false,
        detail_fetch_failed: false,
        fetch_status: 'listed',
        last_error: null,
        normalized
      });
    } catch (err) {
      console.log(`Teamtailor ${source.company}: item skipped: ${String(err?.message || err)}`);
    }
  });

  return out;
}

async function fetchRippling(source) {
  const boardPath = ripplingEncodeBoardPath(source.slug);
  if (!boardPath) throw new Error('Rippling: missing slug (board path after ats.rippling.com/)');

  const baseApi = `https://ats.rippling.com/api/v2/board/${boardPath}/jobs`;
  const maxDetailFetches = parseRipplingMaxDetailFetches();
  let detailFetchesUsed = 0;

  /** @type {Record<string, unknown>[]} */
  const allItems = [];
  let page = 0;
  let totalPages = Infinity;
  let lastFp = null;

  while (page < totalPages && page < 500) {
    let data;
    try {
      console.log(`Fetching Rippling list: ${source.company} page=${page}`);
      data = await fetchJson(`${baseApi}?page=${page}&pageSize=50`, `Rippling ${source.company} page=${page}`);
    } catch (e) {
      throw new Error(`Rippling list page ${page} failed: ${e?.message || e}`);
    }

    if (typeof data?.totalPages === 'number' && Number.isFinite(data.totalPages)) {
      totalPages = data.totalPages;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) break;

    const fp = ripplingPageFingerprint(items);
    if (fp === lastFp) {
      console.log(`Rippling ${source.company}: pagination stopped (repeated page)`);
      break;
    }
    lastFp = fp;

    allItems.push(...items);
    page += 1;
    if (page >= totalPages) break;
  }

  const out = [];

  for (let i = 0; i < allItems.length; i++) {
    const listJob = allItems[i];
    if (!listJob || typeof listJob !== 'object') continue;

    const id = listJob.id != null ? String(listJob.id) : '';
    const title = cleanText(listJob.name || `Job ${i + 1}`);
    console.log(`Rippling ${source.company}: processing ${i + 1}/${allItems.length} -> ${title}`);

    let merged = { ...listJob };
    let detailFetchFailed = false;
    let lastError = null;
    let fetchStatus = 'listed';

    if (id && detailFetchesUsed < maxDetailFetches) {
      detailFetchesUsed += 1;
      try {
        const detail = await fetchJson(
          `https://ats.rippling.com/api/v2/board/${boardPath}/jobs/${encodeURIComponent(id)}`,
          `Rippling detail ${source.company} job=${id}`
        );
        merged = { ...listJob, ...detail };
        recordDetailFetchSuccess(source);
        fetchStatus = 'detail-fetched';
      } catch (err) {
        detailFetchFailed = true;
        lastError = String(err?.message || err);
        recordDetailFetchFailure(source);
        fetchStatus = 'detail-failed';
      }
    } else if (id && detailFetchesUsed >= maxDetailFetches) {
      fetchStatus = 'listed';
    }

    const normalized = normalizeRipplingListItem(listJob, source.company, merged);

    out.push({
      raw_list: listJob,
      raw_detail: merged,
      detail_fetched: fetchStatus === 'detail-fetched',
      detail_fetch_failed: detailFetchFailed,
      fetch_status: fetchStatus,
      last_error: lastError,
      normalized
    });
  }

  return out;
}

async function fetchBamboohr(source) {
  const sub = String(source.slug || '').trim();
  if (!sub) throw new Error('BambooHR: missing slug (subdomain before .bamboohr.com)');

  const base = `https://${encodeURIComponent(sub)}.bamboohr.com`;
  console.log(`Fetching BambooHR: ${source.company} -> ${base}/careers/list`);

  const listData = await fetchJson(`${base}/careers/list`, `BambooHR list ${source.company}`);
  const list = Array.isArray(listData?.result) ? listData.result : [];
  const maxDetailFetches = parseBamboohrMaxDetailFetches();
  let detailFetchesUsed = 0;

  const out = [];

  for (let i = 0; i < list.length; i++) {
    const job = list[i];
    const id = job?.id != null ? String(job.id) : '';
    const title = cleanText(job?.jobOpeningName || job?.title || `Job ${i + 1}`);
    console.log(`BambooHR ${source.company}: processing ${i + 1}/${list.length} -> ${title}`);

    let mergedOpening = job;
    let detailFetchFailed = false;
    let lastError = null;
    let fetchStatus = 'listed';

    const needDetail = !bambooListJobHasUsableDescription(job);

    if (needDetail && id) {
      if (detailFetchesUsed >= maxDetailFetches) {
        fetchStatus = 'detail-failed';
        detailFetchFailed = true;
        lastError = 'BambooHR detail fetch cap reached';
        recordDetailFetchFailure(source);
      } else {
        detailFetchesUsed += 1;
        try {
          const detail = await fetchJson(
            `${base}/careers/${encodeURIComponent(id)}/detail`,
            `BambooHR detail ${source.company} job=${id}`
          );
          const opening = detail?.result?.jobOpening ?? detail?.result;
          if (opening && typeof opening === 'object') {
            mergedOpening = { ...job, ...opening };
          }
          recordDetailFetchSuccess(source);
          fetchStatus = 'detail-fetched';
        } catch (err) {
          detailFetchFailed = true;
          lastError = String(err?.message || err);
          recordDetailFetchFailure(source);
          fetchStatus = 'detail-failed';
        }
      }
    }

    const normalized = normalizeBamboohrJob(job, source.company, base, mergedOpening);

    out.push({
      raw_list: job,
      raw_detail: mergedOpening,
      detail_fetched: fetchStatus === 'detail-fetched',
      detail_fetch_failed: detailFetchFailed,
      fetch_status: fetchStatus,
      last_error: lastError,
      normalized
    });
  }

  return out;
}

async function fetchGreenhouse(source) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${source.slug}/jobs?content=true`;
  console.log(`Fetching Greenhouse: ${source.company} -> ${url}`);
  const data = await fetchJson(url, `Greenhouse ${source.company}`);
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];

  return jobs.map(job => ({
    raw_list: job,
    raw_detail: null,
    detail_fetched: false,
    detail_fetch_failed: false,
    fetch_status: 'listed',
    last_error: null,
    normalized: normalizeGreenhouseJob(job, source.company, null)
  }));
}

async function fetchLever(source) {
  const url = `https://api.lever.co/v0/postings/${source.slug}?mode=json`;
  console.log(`Fetching Lever: ${source.company} -> ${url}`);
  const data = await fetchJson(url, `Lever ${source.company}`);
  const jobs = Array.isArray(data) ? data : [];

  return jobs.map(job => ({
    raw_list: job,
    raw_detail: null,
    detail_fetched: false,
    detail_fetch_failed: false,
    fetch_status: 'listed',
    last_error: null,
    normalized: normalizeLeverJob(job, source.company, null)
  }));
}

async function paceWorkableRequest() {
  const ms = CONFIG.WORKABLE_MIN_REQUEST_INTERVAL_MS;
  if (ms > 0) await sleep(ms);
}

async function fetchWorkableDetailFromApi(source, listJob) {
  const shortcode = deriveWorkableShortcode(listJob);
  if (!shortcode) return null;

  const detailUrls = [
    `https://apply.workable.com/api/v1/widget/accounts/${source.slug}/jobs/${shortcode}`,
    `https://apply.workable.com/api/v1/widget/accounts/${source.slug}/jobs/${shortcode}?details=true`
  ];

  for (let u = 0; u < detailUrls.length; u++) {
    const url = detailUrls[u];
    if (u > 0) await paceWorkableRequest();
    try {
      const detail = await fetchWithRetry(url, {
        label: `Workable detail ${source.company}`,
        parse: 'json',
        maxAttempts: 2,
        retry403: false
      });
      if (detail && typeof detail === 'object') return detail;
    } catch {}
  }

  return null;
}

async function fetchWorkableDetailFromHtml(source, listJob) {
  const shortcode = deriveWorkableShortcode(listJob);
  const url =
    firstNonEmpty(listJob.url, listJob.apply_url, listJob.application_url) ||
    (shortcode ? `https://apply.workable.com/${source.slug}/j/${shortcode}/` : null);

  if (!url) return null;
  if (!/apply\.workable\.com/i.test(url)) return null;

  try {
    const html = await fetchWithRetry(url, {
      label: `Workable HTML ${source.company}`,
      parse: 'text',
      headers: { 'user-agent': 'Mozilla/5.0' },
      maxAttempts: 2,
      retry403: false
    });
    const parsed = parseJsonFromHtml(html);
    const extracted = extractWorkableHtmlFieldsFromParsed(parsed);
    const mainHtml = extractHtmlMainContent(html);

    return {
      _html_url: url,
      _html_extracted: {
        ...extracted,
        mainHtml
      }
    };
  } catch {
    return null;
  }
}

function mergeWorkableJob(listJob, detailJob, htmlFallback) {
  const merged = {
    ...(listJob || {}),
    ...(detailJob || {})
  };

  if (htmlFallback?._html_extracted?.descriptionHtml && !merged.description_html) {
    merged.description_html = htmlFallback._html_extracted.descriptionHtml;
  }

  if (htmlFallback?._html_extracted?.descriptionText && !merged.description) {
    merged.description = htmlFallback._html_extracted.descriptionText;
  }

  if (htmlFallback?._html_extracted?.mainHtml && !merged.full_description) {
    merged.full_description = htmlFallback._html_extracted.mainHtml;
  }

  if (htmlFallback?._html_url && !merged.url && !merged.apply_url) {
    merged.url = htmlFallback._html_url;
  }

  return merged;
}

async function fetchWorkable(source) {
  await sleep(CONFIG.WORKABLE_INTER_SOURCE_DELAY_MS);
  const maxDetailFetches = parseWorkableMaxDetailFetches();
  let detailFetchesUsed = 0;

  const urls = [
    `https://apply.workable.com/api/v1/widget/accounts/${source.slug}`,
    `https://apply.workable.com/${source.slug}/jobs.json`
  ];

  let data = null;
  let lastErr = null;

  for (let u = 0; u < urls.length; u++) {
    const url = urls[u];
    if (u > 0) await paceWorkableRequest();
    try {
      console.log(`Fetching Workable list: ${source.company} -> ${url}`);
      data = await fetchJson(url, `Workable ${source.company}`);
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data) throw lastErr || new Error(`Workable failed for ${source.company}`);

  const jobs = Array.isArray(data.jobs)
    ? data.jobs
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

  const out = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const title = cleanText(job.title || job.name || `Job ${i + 1}`);

    console.log(`Workable ${source.company}: processing ${i + 1}/${jobs.length} -> ${title}`);

    let rawDetail = null;
    let detailFetchFailed = false;
    let lastError = null;
    let fetchStatus = 'listed';
    let htmlFallback = null;

    if (!workableHasGoodDescription(job)) {
      if (detailFetchesUsed >= maxDetailFetches) {
        detailFetchFailed = true;
        lastError = 'Workable detail fetch cap reached';
        fetchStatus = 'detail-skipped-cap';
        recordDetailFetchFailure(source);
      } else {
        detailFetchesUsed += 1;
      }
    }

    if (!workableHasGoodDescription(job) && fetchStatus !== 'detail-skipped-cap') {
      let skipHtmlFallback = false;
      try {
        await paceWorkableRequest();
        console.log(`Workable ${source.company}: API detail -> ${title}`);
        rawDetail = await fetchWorkableDetailFromApi(source, job);
        if (rawDetail) {
          recordDetailFetchSuccess(source);
          fetchStatus = 'detail-fetched';
        }
      } catch (err) {
        detailFetchFailed = true;
        lastError = err.message;
        skipHtmlFallback = /\b(403|429)\b/.test(String(lastError || ''));
      }

      if (!rawDetail && !skipHtmlFallback) {
        try {
          await paceWorkableRequest();
          console.log(`Workable ${source.company}: HTML fallback -> ${title}`);
          htmlFallback = await fetchWorkableDetailFromHtml(source, job);
          if (htmlFallback) {
            recordDetailFetchSuccess(source);
            fetchStatus = 'detail-fetched-html';
            detailFetchFailed = false;
            lastError = null;
          }
        } catch (err) {
          detailFetchFailed = true;
          lastError = err.message;
        }
      }
    }

    if (!rawDetail && !htmlFallback && !workableHasGoodDescription(job)) {
      detailFetchFailed = true;
      if (!lastError) lastError = 'Workable detail fetch failed';
      fetchStatus = 'detail-failed';
      recordDetailFetchFailure(source);
    }

    const merged = mergeWorkableJob(job, rawDetail, htmlFallback);
    const normalized = normalizeWorkableJob(job, source.company, source.slug, merged);

    out.push({
      raw_list: job,
      raw_detail: rawDetail || htmlFallback || null,
      detail_fetched: !!(rawDetail || htmlFallback),
      detail_fetch_failed: detailFetchFailed,
      fetch_status: fetchStatus,
      last_error: lastError,
      normalized
    });
  }

  return out;
}

async function fetchAshby(source) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${source.slug}`;
  console.log(`Fetching Ashby: ${source.company} -> ${url}`);
  const data = await fetchJson(url, `Ashby ${source.company}`);

  const jobs = Array.isArray(data.jobs)
    ? data.jobs
    : Array.isArray(data.jobPostings)
      ? data.jobPostings
      : Array.isArray(data.postings)
        ? data.postings
        : [];

  return jobs.map(job => ({
    raw_list: job,
    raw_detail: null,
    detail_fetched: false,
    detail_fetch_failed: false,
    fetch_status: 'listed',
    last_error: null,
    normalized: normalizeAshbyJob(job, source.company, null)
  }));
}

async function fetchSmartRecruitersDetailFromApi(source, listJob) {
  const id = listJob.id || listJob.uuid || listJob.refNumber;
  if (!id) return null;

  const urls = [
    `https://api.smartrecruiters.com/v1/companies/${source.slug}/postings/${id}`,
    `https://api.smartrecruiters.com/v1/companies/${source.slug}/postings/${id}?format=json`
  ];

  for (const url of urls) {
    try {
      const detail = await fetchJson(url, `SmartRecruiters detail ${source.company}`);
      if (detail && typeof detail === 'object') return detail;
    } catch {}
  }

  return null;
}

async function fetchSmartRecruitersDetailFromHtml(source, listJob) {
  const id = listJob.id || listJob.uuid || listJob.refNumber;
  const url = getSmartRecruitersPublicUrl(source.slug, id, listJob);
  if (!url) return null;

  try {
    const html = await fetchText(url, `SmartRecruiters HTML ${source.company}`);
    return {
      html: extractHtmlMainContent(html),
      html_url: url
    };
  } catch {
    return null;
  }
}

function mergeSmartRecruitersJob(listJob, detailJob, htmlFallback) {
  const merged = {
    ...(listJob || {}),
    ...(detailJob || {})
  };

  if (htmlFallback?.html && !merged.html) {
    merged.html = htmlFallback.html;
  }

  if (htmlFallback?.html_url && !merged.referralUrl && !merged.applyUrl) {
    merged.referralUrl = htmlFallback.html_url;
  }

  return merged;
}

async function fetchSmartRecruiters(source) {
  const url = `https://api.smartrecruiters.com/v1/companies/${source.slug}/postings?limit=100`;
  console.log(`Fetching SmartRecruiters: ${source.company} -> ${url}`);
  const data = await fetchJson(url, `SmartRecruiters ${source.company}`);

  const jobs = Array.isArray(data.content)
    ? data.content
    : Array.isArray(data.postings)
      ? data.postings
      : Array.isArray(data.data)
        ? data.data
        : [];

  const out = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const title = cleanText(job.name || job.title || `Job ${i + 1}`);
    console.log(`SmartRecruiters ${source.company}: processing ${i + 1}/${jobs.length} -> ${title}`);

    let rawDetail = null;
    let htmlFallback = null;
    let detailFetchFailed = false;
    let lastError = null;
    let fetchStatus = 'listed';

    try {
      rawDetail = await fetchSmartRecruitersDetailFromApi(source, job);
    } catch (err) {
      lastError = err.message;
    }

    if (rawDetail) {
      recordDetailFetchSuccess(source);
      fetchStatus = 'detail-fetched';
    } else {
      try {
        htmlFallback = await fetchSmartRecruitersDetailFromHtml(source, job);
      } catch (err) {
        lastError = err.message;
      }

      if (htmlFallback) {
        recordDetailFetchSuccess(source);
        fetchStatus = 'detail-fetched-html';
        lastError = null;
      } else {
        detailFetchFailed = true;
        if (!lastError) lastError = 'SmartRecruiters detail fetch failed';
        fetchStatus = 'detail-failed';
        recordDetailFetchFailure(source);
      }
    }

    const merged = mergeSmartRecruitersJob(job, rawDetail, htmlFallback);
    const normalized = normalizeSmartRecruitersJob(job, source.company, source.slug, merged);

    out.push({
      raw_list: job,
      raw_detail: rawDetail || htmlFallback || null,
      detail_fetched: !!(rawDetail || htmlFallback),
      detail_fetch_failed: detailFetchFailed,
      fetch_status: fetchStatus,
      last_error: lastError,
      normalized
    });
  }

  return out;
}

async function fetchJobs(source) {
  if (source.provider === 'greenhouse') return fetchGreenhouse(source);
  if (source.provider === 'lever') return fetchLever(source);
  if (source.provider === 'workable') return fetchWorkable(source);
  if (source.provider === 'ashby') return fetchAshby(source);
  if (source.provider === 'smartrecruiters') return fetchSmartRecruiters(source);
  if (source.provider === 'teamtailor') return fetchTeamtailor(source);
  if (source.provider === 'rippling') return fetchRippling(source);
  if (source.provider === 'bamboohr') return fetchBamboohr(source);

  throw new Error(`Unknown provider: ${source.provider}`);
}

/**
 * Bump site_metrics.lifetime_roles via RPC (single source of truth; insert trigger is dropped — see migration).
 * @param {number} delta
 */
async function incrementLifetimeRolesRpc(delta) {
  const inc = Math.max(0, Math.trunc(Number(delta || 0)));
  if (inc <= 0) return;
  const ATTEMPTS = 3;
  let lastErr = null;
  for (let a = 0; a < ATTEMPTS; a += 1) {
    const { error } = await supabase.rpc('increment_lifetime_roles_by', { delta: inc });
    if (!error) return;
    lastErr = error;
    if (a < ATTEMPTS - 1) {
      await sleep(350 * (a + 1) * (a + 1));
    }
  }
  throw new Error(`lifetime_roles_increment_failed: ${String(lastErr?.message || lastErr)}`);
}

async function saveJob(jobRecord, source) {
  const job = jobRecord.normalized;
  const stats = initializeSourceStat(source);
  const atsStat = ensureAtsStat(source.provider);

  const relevance = isRelevantJob(job, source);
  const classification = classifyJob(job);
  const postedRelativeDays = computePostedRelativeDays(job.posted_at);
  const partialFlag = !hasUsableDescription(job);

  job.remote_status = job.remote_status || detectRemoteStatus(job);
  const seniority = detectSeniority(job.title);

  const existing = source._existingJobsBySourceId?.get(String(job.source_job_id)) || null;

  if (dateOlderThanMaxAge(job.posted_at)) {
    runStats.jobsSkippedOld += 1;
    stats.jobs_skipped_old += 1;
    atsStat.jobs_skipped_old += 1;

    if (existing) {
      const { error } = await supabase
        .from('jobs')
        .update({
          is_active: false,
          last_error: 'Skipped: older than 90 days',
          fetch_status: 'old'
        })
        .eq('source', job.source)
        .eq('source_job_id', job.source_job_id);

      if (!error) {
        runStats.jobsMarkedInactive += 1;
        stats.jobs_marked_inactive += 1;
      }
    }

    console.log(`[SKIP OLD] ${job.company} | ${job.title}`);
    return { outcome: 'old' };
  }

  if (!relevance.relevant) {
    runStats.jobsSkippedIrrelevant += 1;
    stats.jobs_skipped_irrelevant += 1;
    atsStat.jobs_skipped_irrelevant += 1;
    recordFocusRejectedTitle(source, job.title, relevance.reason);

    if (existing) {
      const { error } = await supabase
        .from('jobs')
        .update({
          is_active: false,
          is_relevant: false,
          last_error: relevance.reason || 'irrelevant',
          fetch_status: 'irrelevant'
        })
        .eq('source', job.source)
        .eq('source_job_id', job.source_job_id);

      if (!error) {
        runStats.jobsMarkedInactive += 1;
        stats.jobs_marked_inactive += 1;
      }
    }

    console.log(`[SKIP IRRELEVANT] ${job.company} | ${job.title} | ${relevance.reason || 'no-reason'}`);
    return { outcome: 'irrelevant' };
  }

  runStats.jobsRelevant += 1;
  stats.jobs_relevant += 1;
  atsStat.jobs_relevant += 1;

  if (partialFlag) {
    runStats.jobsFlaggedPartial += 1;
    stats.jobs_flagged_partial += 1;
    atsStat.jobs_flagged_partial += 1;
    console.log(`[FLAG PARTIAL] ${job.company} | ${job.title}`);
  }

  const payload = {
    source: job.source,
    source_job_id: job.source_job_id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    description_raw: job.description_raw,
    description_html: job.description_html,
    apply_url: job.apply_url,
    is_active: true,
    is_relevant: true,
    last_seen_at: nowIso(),
    posted_at: job.posted_at,
    posted_relative_days: postedRelativeDays,
    expires_at: computeExpiresAt(job.posted_at, existing?.expires_at || null),
    job_family: classification.job_family,
    tags: classification.tags,
    seniority,
    employment_type: job.employment_type || null,
    remote_status: job.remote_status || null,
    fetch_status: partialFlag ? `${jobRecord.fetch_status || 'listed'}|partial` : (jobRecord.fetch_status || 'listed'),
    detail_fetched: !!jobRecord.detail_fetched,
    detail_fetch_failed: !!jobRecord.detail_fetch_failed,
    last_error: partialFlag ? (jobRecord.last_error || 'Partial or thin description') : (jobRecord.last_error || null),
    source_raw_list_json: CONFIG.STORE_RAW_JSON ? safeJson(jobRecord.raw_list) : null,
    source_raw_detail_json: CONFIG.STORE_RAW_JSON ? safeJson(jobRecord.raw_detail) : null
  };

  if (!existing) {
    payload.first_seen_at = nowIso();
  }

  const UPSERT_ATTEMPTS = 5;
  let upsertError = null;
  for (let u = 0; u < UPSERT_ATTEMPTS; u++) {
    const { error } = await supabase
      .from('jobs')
      .upsert(payload, { onConflict: 'source,source_job_id' });
    if (!error) {
      upsertError = null;
      break;
    }
    upsertError = error;
    const message = String(error.message || 'unknown');
    if (/row-level security policy/i.test(message)) {
      break;
    }
    if (u < UPSERT_ATTEMPTS - 1) {
      const waitMs = 350 * (u + 1) * (u + 1);
      console.log(`UPSERT retry ${u + 1}/${UPSERT_ATTEMPTS} in ${waitMs}ms: ${message.slice(0, 200)}`);
      await sleep(waitMs);
    }
  }

  if (upsertError) {
    console.log('UPSERT ERROR:', upsertError);
    const message = String(upsertError.message || 'unknown');
    runStats.jobsUpsertErrors += 1;
    if (/row-level security policy/i.test(message)) {
      runStats.jobsRlsErrors += 1;
      stats.last_error = `upsert_error: ${message}`;
      return {
        outcome: 'fatal_rls',
        error: `SUPABASE_RLS_WRITE_DENIED: jobs upsert blocked by RLS for ${job.company} | ${job.title}`,
      };
    }
    stats.last_error = `upsert_error: ${message}`;
    return { outcome: 'error' };
  }

  if (existing) {
    runStats.jobsUpdated += 1;
    stats.jobs_updated += 1;
    atsStat.jobs_updated += 1;
    console.log(
      `[SAVE] UPDATED | ${job.company} | ${job.title} | ${relevance.reason || 'passed'} | family:${classification.job_family} | tags:${classification.tags.join(',')}`
    );
    return { outcome: 'updated' };
  }

  try {
    await incrementLifetimeRolesRpc(1);
  } catch (rpcErr) {
    console.warn(
      `[warning] lifetime_roles_increment_failed_non_fatal | ${job.company} | ${job.title} | ${String(rpcErr?.message || rpcErr)}`
    );
  }

  runStats.jobsInserted += 1;
  stats.jobs_inserted += 1;
  atsStat.jobs_inserted += 1;
  console.log(
    `[SAVE] INSERTED | ${job.company} | ${job.title} | ${relevance.reason || 'passed'} | family:${classification.job_family} | tags:${classification.tags.join(',')}`
  );
  return { outcome: 'inserted' };
}

async function markUnseenJobsInactive(seenKeys, providerRunStatus) {
  if (!CONFIG.MARK_UNSEEN_INACTIVE) return;
  const safeProviders = Array.from(providerRunStatus.entries())
    .filter(([, status]) => status.success > 0 && status.failed === 0)
    .map(([provider]) => provider);
  if (!safeProviders.length) return;
  console.log(`[INACTIVE SCOPE] Safe providers for unseen-deactivation: ${safeProviders.join(', ')}`);

  const { data: rows, error } = await supabase
    .from('jobs')
    .select('source, source_job_id, is_active')
    .in('source', safeProviders)
    .eq('is_active', true);

  if (error) {
    console.log('MARK UNSEEN SELECT ERROR:', error);
    return;
  }

  const unseenBySource = new Map();
  for (const row of rows || []) {
    const key = `${row.source}__${row.source_job_id}`;
    if (seenKeys.has(key)) continue;
    if (!unseenBySource.has(row.source)) unseenBySource.set(row.source, []);
    unseenBySource.get(row.source).push(String(row.source_job_id));
  }

  for (const [source, sourceJobIds] of unseenBySource.entries()) {
    for (const idsChunk of chunkArray(sourceJobIds, 250)) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          is_active: false,
          fetch_status: 'not-seen-in-run',
          last_error: 'Marked inactive: not seen in latest successful source fetch'
        })
        .eq('source', source)
        .in('source_job_id', idsChunk);

      if (updateError) {
        console.log(`MARK UNSEEN UPDATE ERROR: ${source} | ${idsChunk.length} ids`, updateError);
        continue;
      }

      runStats.jobsMarkedInactive += idsChunk.length;
      console.log(`[INACTIVE] ${source} | ${idsChunk.length} jobs`);
    }
  }
}

function finalizeSourceMetrics(source, hadSuccess) {
  const stats = initializeSourceStat(source);

  stats.last_checked_at = nowIso();

  if (hadSuccess) {
    stats.last_successful_fetch_at = stats.last_checked_at;
    stats.fetch_failed = false;
    stats.times_failed = 0;
    stats.consecutive_fetch_failures = 0;
  } else {
    stats.fetch_failed = true;
    stats.times_failed += 1;
    stats.consecutive_fetch_failures += 1;
  }

  if (stats.jobs_relevant > 0) {
    stats.last_relevant_at = stats.last_checked_at;
    stats.runs_since_last_relevant = 0;
  } else {
    stats.runs_since_last_relevant += 1;
  }

  stats.is_empty = stats.jobs_listed === 0;

  if (stats.is_empty && hadSuccess) {
    stats.times_seen_empty += 1;
  } else if (!stats.is_empty) {
    stats.times_seen_empty = 0;
  }

  stats.jobs_last_run = stats.jobs_listed;
  stats.jobs_relevant_last_run = stats.jobs_relevant;
  stats.jobs_inserted_last_run = stats.jobs_inserted;
  stats.jobs_updated_last_run = stats.jobs_updated;
  stats.jobs_irrelevant_last_run = stats.jobs_skipped_irrelevant;
  stats.jobs_partial_last_run = stats.jobs_flagged_partial;
  stats.jobs_old_last_run = stats.jobs_skipped_old;
  stats.fetch_failed_last_run = stats.fetch_failed;
  stats.yield_last_run = stats.jobs_listed
    ? (stats.jobs_inserted + stats.jobs_updated) / stats.jobs_listed
    : 0;

  stats.scrape_tier = classifySourceTier(stats);
  stats.bucket_last_run = classifySourceBucket(stats);
}

function printSourcePerformance() {
  console.log('\n==============================');
  console.log('SOURCE PERFORMANCE');
  console.log('==============================');

  const rows = Object.values(sourceStats).sort((a, b) => {
    const y = Number(b.yield_last_run || 0) - Number(a.yield_last_run || 0);
    if (y !== 0) return y;
    return String(a.company).localeCompare(String(b.company));
  });

  for (const s of rows) {
    console.log(
      `${s.company} (${s.provider}) | listed:${s.jobs_listed} | relevant:${s.jobs_relevant} | inserted:${s.jobs_inserted} | updated:${s.jobs_updated} | yield:${s.yield_last_run.toFixed(3)} | irrelevant:${s.jobs_skipped_irrelevant} | partial:${s.jobs_flagged_partial} | old:${s.jobs_skipped_old} | detail_ok:${s.detail_fetch_success} | detail_fail:${s.detail_fetch_failed} | bucket:${s.bucket_last_run} | tier:${s.scrape_tier} | failed:${s.fetch_failed}`
    );
  }
}

function printAtsPerformance() {
  console.log('\n==============================');
  console.log('ATS PERFORMANCE');
  console.log('==============================');

  const rows = Object.values(atsStats).sort((a, b) => {
    const ay = a.jobs_listed ? (a.jobs_inserted + a.jobs_updated) / a.jobs_listed : 0;
    const by = b.jobs_listed ? (b.jobs_inserted + b.jobs_updated) / b.jobs_listed : 0;
    return by - ay;
  });

  for (const s of rows) {
    const yieldRate = s.jobs_listed ? (s.jobs_inserted + s.jobs_updated) / s.jobs_listed : 0;
    console.log(
      `${s.provider} | sources:${s.sources} | listed:${s.jobs_listed} | relevant:${s.jobs_relevant} | inserted:${s.jobs_inserted} | updated:${s.jobs_updated} | irrelevant:${s.jobs_skipped_irrelevant} | partial:${s.jobs_flagged_partial} | old:${s.jobs_skipped_old} | detail_ok:${s.detail_fetch_success} | detail_fail:${s.detail_fetch_failed} | fetch_failed:${s.fetch_failed} | yield:${yieldRate.toFixed(3)}`
    );
  }
}

const SOURCES = loadSources();
const ELIGIBLE_SOURCES = SOURCES.filter(isSourceEligibleForRun);

async function run() {
  const previousPerformance = loadPreviousSourcePerformance();
  const seenKeys = new Set();
  const providerRunStatus = new Map();

  runStats.sourcesLoaded = SOURCES.length;
  runStats.sourcesEligible = ELIGIBLE_SOURCES.length;
  console.log(`Loaded ${SOURCES.length} sources from CSV`);
  console.log(`Eligible for this run: ${ELIGIBLE_SOURCES.length}`);
  const workableOnlyRun = ONLY_PROVIDERS?.size === 1 && ONLY_PROVIDERS.has('workable');

  if (ONLY_PROVIDERS?.size) {
    console.log(`[filter] DAILY_SYNC_ONLY_PROVIDERS=${[...ONLY_PROVIDERS].join(',')}`);
    if (workableOnlyRun) {
      console.log(
        '[filter] Workable-only run (npm run sync:workable). npm run sync:daily skips Workable unless DAILY_SYNC_INCLUDE_WORKABLE=1.'
      );
    }
  }

  if (workableOnlyRun && ELIGIBLE_SOURCES.length === 0) {
    const diag = countEligibleWorkableRowsOnDisk();
    console.error(`[workable] 0 sources after filters. File: ${diag.path}`);
    console.error(
      `[workable] Eligible Workable rows on disk (ats=workable, status approved|auto, slug+company set): ${diag.count}`
    );
    if (diag.count > 0) {
      console.error(
        '[workable] Bug: rows exist in CSV but filters removed them — check DAILY_SYNC_ONLY_PROVIDERS / DAILY_SYNC_EXCLUDE_PROVIDERS.'
      );
    } else {
      console.error(
        '[workable] No eligible Workable rows on disk. In sources.csv, Workable usually starts ~row 418 (after other ATS); a truncated/saved-top-only file drops that whole block.'
      );
      console.error('[workable] Compare: git diff sources.csv — restore: git restore sources.csv');
    }
    process.exitCode = 1;
    return;
  }

  if (workableOnlyRun && CONFIG.WORKABLE_COLD_START_DELAY_MS > 0) {
    console.log(
      `[workable] cold start ${CONFIG.WORKABLE_COLD_START_DELAY_MS}ms before first request (WORKABLE_COLD_START_DELAY_MS)`
    );
    await sleep(CONFIG.WORKABLE_COLD_START_DELAY_MS);
  }
  if (EXCLUDE_PROVIDERS?.size) {
    console.log(`[filter] excluding providers: ${[...EXCLUDE_PROVIDERS].sort().join(',')}`);
  }

  for (let idx = 0; idx < ELIGIBLE_SOURCES.length; idx++) {
    const source = ELIGIBLE_SOURCES[idx];
    const stats = initializeSourceStat(source);
    const atsStat = ensureAtsStat(source.provider);
    atsStat.sources += 1;
    if (!providerRunStatus.has(source.provider)) {
      providerRunStatus.set(source.provider, { success: 0, failed: 0 });
    }

    if (!shouldProcessSource(source)) {
      runStats.sourcesSkippedByTiering += 1;
      console.log(`\n[SKIP SOURCE] ${source.company} (${source.provider}) manually disabled`);
      continue;
    }

    console.log('\n==============================');
    console.log(`START ${source.company} (${source.provider})`);
    console.log('==============================');

    try {
      runStats.sourcesProcessed += 1;

      const jobRecords = await fetchJobs(source);
      const listedCount = jobRecords.length;

      const sourceJobIds = jobRecords
        .map(r => String(r?.normalized?.source_job_id || '').trim())
        .filter(Boolean);
      source._existingJobsBySourceId = new Map();
      for (const idsChunk of chunkArray(dedupeArray(sourceJobIds), 250)) {
        const { data: existingRows, error: selectError } = await supabase
          .from('jobs')
          .select('id, source_job_id, expires_at, is_active')
          .eq('source', source.provider)
          .in('source_job_id', idsChunk);

        if (selectError) {
          console.log('BULK EXISTING SELECT ERROR:', selectError);
          stats.last_error = `bulk_select_error: ${selectError.message || 'unknown'}`;
          continue;
        }

        for (const row of existingRows || []) {
          source._existingJobsBySourceId.set(String(row.source_job_id), row);
        }
      }

      stats.jobs_listed += listedCount;
      atsStat.jobs_listed += listedCount;
      runStats.jobsListed += listedCount;
      providerRunStatus.get(source.provider).success += 1;

      if (listedCount === 0) {
        runStats.sourcesEmpty += 1;
        stats.is_empty = true;
        console.log(`[EMPTY] ${source.company}`);
      }

      console.log(`${source.company}: fetched ${listedCount} jobs`);

      for (const jobRecord of jobRecords) {
        const job = jobRecord.normalized;
        if (job?.source && job?.source_job_id) {
          seenKeys.add(jobKey(job));
        }
        const saveResult = await saveJob(jobRecord, source);
        if (saveResult?.outcome === 'fatal_rls') {
          throw new Error(saveResult.error || 'SUPABASE_RLS_WRITE_DENIED');
        }
      }
      delete source._existingJobsBySourceId;

      finalizeSourceMetrics(source, true);
      console.log(`DONE ${source.company}`);
    } catch (err) {
      runStats.sourcesFailed += 1;
      stats.fetch_failed = true;
      stats.last_error = err.message;
      atsStat.fetch_failed += 1;
      providerRunStatus.get(source.provider).failed += 1;
      finalizeSourceMetrics(source, false);
      console.log(`FAILED ${source.company}: ${err.message}`);
    }

    printFocusFilterVisibilityIfReady(source);

    if ((idx + 1) % CONFIG.SAVE_SOURCES_CHECKPOINT_EVERY === 0) {
      const updatedRows = applySourceMetricsToRows(SOURCES);
      saveSources(updatedRows);
      writeSourcePerformanceCsv();
      console.log(`Checkpoint saved after ${idx + 1} sources`);
    }
  }

  await markUnseenJobsInactive(seenKeys, providerRunStatus);
  console.log('\nProvider run status (for unseen-deactivation safety):');
  for (const [provider, status] of providerRunStatus.entries()) {
    console.log(`- ${provider}: success=${status.success} failed=${status.failed}`);
  }

  const updatedSourceRows = applySourceMetricsToRows(SOURCES);
  saveSources(updatedSourceRows);
  writeSourcePerformanceCsv();

  console.log('\n==============================');
  console.log('RUN SUMMARY');
  console.log('==============================');
  console.log(`Sources loaded: ${runStats.sourcesLoaded}`);
  console.log(`Sources eligible: ${runStats.sourcesEligible}`);
  console.log(`Sources processed: ${runStats.sourcesProcessed}`);
  console.log(`Sources skipped by tiering: ${runStats.sourcesSkippedByTiering}`);
  console.log(`Sources failed: ${runStats.sourcesFailed}`);
  console.log(`Sources empty: ${runStats.sourcesEmpty}`);
  console.log(`Jobs listed: ${runStats.jobsListed}`);
  console.log(`Jobs relevant: ${runStats.jobsRelevant}`);
  console.log(`Jobs detail fetched: ${runStats.jobsDetailFetched}`);
  console.log(`Jobs detail failed: ${runStats.jobsDetailFailed}`);
  console.log(`Jobs skipped old: ${runStats.jobsSkippedOld}`);
  console.log(`Jobs skipped irrelevant: ${runStats.jobsSkippedIrrelevant}`);
  console.log(`Jobs flagged partial: ${runStats.jobsFlaggedPartial}`);
  console.log(`Jobs inserted: ${runStats.jobsInserted}`);
  console.log(`Jobs updated: ${runStats.jobsUpdated}`);
  console.log(`Jobs marked inactive: ${runStats.jobsMarkedInactive}`);
  console.log(`Jobs upsert errors: ${runStats.jobsUpsertErrors}`);
  console.log(`Jobs RLS errors: ${runStats.jobsRlsErrors}`);

  if (runStats.jobsSkippedIrrelevant > runStats.jobsInserted * 3 && runStats.jobsSkippedIrrelevant > 20) {
    console.log('[WARNING] Relevance filter may still be too strict for current source mix.');
  }

  printSourcePerformance();
  printAtsPerformance();
  printDeltaVsPreviousRun(previousPerformance);

  if (runStats.jobsInserted > 0) {
    console.log(
      `[LIFETIME ROLES] ${runStats.jobsInserted} new row(s); counter updated per insert via increment_lifetime_roles_by`
    );
  }

  if (runStats.jobsRlsErrors > 0) {
    throw new Error(
      `SUPABASE_RLS_WRITE_DENIED: detected ${runStats.jobsRlsErrors} RLS-blocked upsert(s). Check SUPABASE_SERVICE_ROLE_KEY secret in GitHub Actions.`
    );
  }
  const allowUpsertFailures =
    process.env.DAILY_SYNC_ALLOW_UPSERT_ERRORS === '1' ||
    process.env.DAILY_SYNC_ALLOW_UPSERT_ERRORS === 'true';
  if (runStats.jobsUpsertErrors > 0) {
    const msg = `JOBS_UPSERT_ERRORS: detected ${runStats.jobsUpsertErrors} failed upsert(s). Inspect source_performance.csv last_error and workflow logs.`;
    if (allowUpsertFailures) {
      console.warn(`[WARNING] ${msg} (continuing because DAILY_SYNC_ALLOW_UPSERT_ERRORS is set)`);
    } else {
      throw new Error(msg);
    }
  }

  console.log(`\nUpdated sources file: ${SOURCES_CSV_PATH}`);
  console.log(`Wrote source performance file: ${SOURCE_PERFORMANCE_CSV_PATH}`);
  console.log('\nALL DONE');
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
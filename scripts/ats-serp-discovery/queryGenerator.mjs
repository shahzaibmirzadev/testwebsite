/**
 * Config-driven diversified query lists (buckets A–D). Deterministic with randomSeed.
 * Uniqueness comes from template × keyword × title × geo × provider content only — no numeric tails.
 */

/**
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 */
export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {Record<string, number>} weights
 * @returns {string[]}
 */
function providersOrderedByWeight(weights) {
  return Object.entries(weights || {})
    .filter(([, w]) => Number(w) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([p]) => p);
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 */
function applyTemplate(template, vars) {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(v);
  }
  return s;
}

/**
 * @param {string[]} parts
 * @returns {string[]}
 */
function dedupeCaseInsensitive(parts) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const p of parts) {
    const t = String(p || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Google: multi-word concepts should be quoted; single tokens (UAV, GNC, drone) stay bare.
 * Do not wrap in parentheses alone — that does not group phrases.
 * @param {string} term
 */
export function phraseForQuery(term) {
  const t = String(term ?? "").trim();
  if (!t) return "";
  const safe = t.replace(/"/g, "");
  if (/\s/.test(safe)) return `"${safe}"`;
  return safe;
}

/**
 * Build (a OR b OR "c d" …) with at most `max` distinct terms, each atom phrase-safe.
 * @param {string[]} terms
 * @param {number} [max]
 */
export function buildOrGroup(terms, max = 5) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const atoms = [];
  for (const t of terms) {
    const p = phraseForQuery(t);
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    atoms.push(p);
    if (atoms.length >= max) break;
  }
  if (!atoms.length) return "";
  return `(${atoms.join(" OR ")})`;
}

/**
 * Remove duplicate OR atoms inside flat (a OR b OR c) groups (case-insensitive).
 * Skips groups with nested parentheses. Fixes e.g. (drone OR drone OR UAV) when kw
 * duplicates a literal in the template.
 * @param {string} q
 */
function dedupeFlatOrGroupsInQuery(q) {
  return q.replace(/\(([^()]*)\)/g, (full, inner) => {
    if (!/\sOR\s/i.test(inner)) return full;
    const atoms = inner
      .split(/\s+OR\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {string[]} */
    const out = [];
    for (const a of atoms) {
      const k = a.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a);
    }
    if (out.length === atoms.length) return full;
    return `(${out.join(" OR ")})`;
  });
}

/**
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @returns {string[]}
 */
function mergeKeywordList(config) {
  const banks = config.keywordBanks || {};
  const cross = config.keywordCrossovers || [];
  const merged = [
    ...(banks.core || []),
    ...(banks.technical || []),
    ...(banks.operations || []),
    ...(banks.use_cases || []),
    ...cross,
  ];
  return dedupeCaseInsensitive(merged);
}

/**
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @param {() => number} rng
 * @returns {{ query: string, providerTarget: string, bucket: string }[]}
 */
function buildDirectCandidates(config, rng) {
  const sites = config.providerSearchSites || {};
  const weights = config.providerWeights || {};
  const providers = providersOrderedByWeight(weights);
  const keywords = mergeKeywordList(config);
  const banks = config.keywordBanks || {};
  /** High-signal role / ops anchors for OR clusters (quoted in templates). */
  const roleAnchors = dedupeCaseInsensitive([
    ...(banks.operations || []),
    "remote pilot",
    "UAV operator",
    "flight test",
    "BVLOS",
    ...(banks.titles || []).slice(0, 8),
  ]);
  const directTemplates =
    Array.isArray(config.directAtsTemplates) &&
    config.directAtsTemplates.length > 0
      ? config.directAtsTemplates
      : [config.directAtsTemplate || "{site} {kw_phrase}"];

  const regionHints =
    Array.isArray(config.directRegionHints) &&
    config.directRegionHints.length > 0
      ? config.directRegionHints
      : ["", "Germany", "Netherlands", "France", "UK", "Spain", "Europe"];

  /** @type {{ query: string, providerTarget: string, bucket: string }[]} */
  const raw = [];
  for (const prov of providers) {
    const site = sites[prov] || `site:${prov}`;
    for (const tmpl of directTemplates) {
      const needsGeo = tmpl.includes("{geo}");
      const geoList = needsGeo ? regionHints : [""];
      const raN = Math.max(1, roleAnchors.length);
      for (let ki = 0; ki < keywords.length; ki++) {
        const kw = keywords[ki];
        const kw_phrase = phraseForQuery(kw);
        const role_cluster = buildOrGroup(
          [
            kw,
            roleAnchors[ki % raN],
            roleAnchors[(ki + 2) % raN],
            roleAnchors[(ki + 4) % raN],
          ],
          4
        );
        const tech_cluster = buildOrGroup(
          [kw, "autonomy", "perception", "computer vision", "GNC", "SLAM"],
          5
        );
        const use_cluster = buildOrGroup(
          [kw, "inspection", "mapping", "survey", "photogrammetry"],
          5
        );
        for (const geo of geoList) {
          const q = applyTemplate(tmpl, {
            site,
            keyword: kw,
            kw_phrase,
            geo: String(geo || "").trim(),
            role_cluster,
            tech_cluster,
            use_cluster,
          })
            .replace(/\s+/g, " ")
            .trim();
          if (q.length < 12) continue;
          raw.push({ query: q, providerTarget: prov, bucket: "direct_ats" });
        }
      }
    }
  }

  /** @type {Map<string, { query: string, providerTarget: string, bucket: string }>} */
  const byKey = new Map();
  for (const row of raw) {
    const k = row.query.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, row);
  }
  const unique = Array.from(byKey.values());
  shuffleInPlace(unique, rng);
  return unique;
}

/**
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @param {() => number} rng
 */
function buildTitleCandidates(config, rng) {
  const banks = config.keywordBanks || {};
  const titles = banks.titles || [];
  const titleTemplates = config.titleLedTemplates || ['"{title}"'];
  const suffixes =
    Array.isArray(config.titleLedContextSuffixes) &&
    config.titleLedContextSuffixes.length > 0
      ? config.titleLedContextSuffixes
      : ["", " UAV", " robotics", " drone", " mapping", " autonomy"];

  /** @type {{ query: string, bucket: string }[]} */
  const raw = [];
  for (const title of titles) {
    for (const tmpl of titleTemplates) {
      for (const suf of suffixes) {
        const base = applyTemplate(tmpl, { title }).trim();
        const q = (base + (suf ? ` ${suf.trim()}` : "")).trim();
        if (q.length < 4) continue;
        raw.push({ query: q, bucket: "title_led" });
      }
    }
  }

  /** @type {Map<string, { query: string, bucket: string }>} */
  const byKey = new Map();
  for (const row of raw) {
    const k = row.query.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, row);
  }
  const unique = Array.from(byKey.values());
  shuffleInPlace(unique, rng);
  return unique;
}

/**
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @param {() => number} rng
 */
function buildBridgeCandidates(config, rng) {
  const defaults = [
    '("drone" OR "robotics" OR "UAV") "careers" "greenhouse"',
    '("drone" OR "UAV") "careers" ("lever" OR "teamtailor")',
  ];
  const bridges = dedupeCaseInsensitive([
    ...(config.companyBridgeTemplates || []),
    ...defaults,
  ]);
  const qualifiers =
    Array.isArray(config.bridgeRegionQualifiers) &&
    config.bridgeRegionQualifiers.length > 0
      ? config.bridgeRegionQualifiers
      : ["", " EU", " Germany", " Netherlands", " France", " UK"];

  /** @type {{ query: string, bucket: string }[]} */
  const raw = [];
  for (const tmpl of bridges) {
    for (const qf of qualifiers) {
      const q = (tmpl + (qf ? ` ${qf.trim()}` : "")).trim();
      if (q.length < 10) continue;
      raw.push({ query: q, bucket: "company_bridge" });
    }
  }

  /** @type {Map<string, { query: string, bucket: string }>} */
  const byKey = new Map();
  for (const row of raw) {
    const k = row.query.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, row);
  }
  const unique = Array.from(byKey.values());
  shuffleInPlace(unique, rng);
  return unique;
}

/**
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @param {() => number} rng
 */
function buildGeoCandidates(config, rng) {
  const banks = config.keywordBanks || {};
  const geoList = banks.geography || [];
  const titles = banks.titles || [];
  const keywords = mergeKeywordList(config);
  const sites = config.providerSearchSites || {};
  const weights = config.providerWeights || {};
  const providers = providersOrderedByWeight(weights);
  const geoTemplates =
    config.geoTemplates && config.geoTemplates.length > 0
      ? config.geoTemplates
      : [
          '"{title}" (drone OR UAV OR robotics OR autonomy) {geo}',
          '"{title}" (UAV OR drone OR inspection) {geo}',
        ];

  let siteIdx = 0;
  const nextSite = () => {
    const p = providers[siteIdx % Math.max(1, providers.length)] || "greenhouse";
    siteIdx += 1;
    return sites[p] || `site:${p}`;
  };

  /** @type {{ query: string, bucket: string }[]} */
  const raw = [];
  for (const g of geoList) {
    let ki = 0;
    for (const tmpl of geoTemplates) {
      for (const title of titles) {
        const kw = keywords[ki % Math.max(1, keywords.length)] || "drone";
        ki += 1;
        const site = nextSite();
        const kw_phrase = phraseForQuery(kw);
        const title_phrase = phraseForQuery(title);
        const q = applyTemplate(tmpl, {
          geo: g,
          title,
          title_phrase,
          keyword: kw,
          kw_phrase,
          site,
        })
          .replace(/\s+/g, " ")
          .trim();
        if (q.length < 8) continue;
        raw.push({ query: q, bucket: "geo" });
      }
    }
  }

  /** @type {Map<string, { query: string, bucket: string }>} */
  const byKey = new Map();
  for (const row of raw) {
    const k = row.query.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, row);
  }
  const unique = Array.from(byKey.values());
  shuffleInPlace(unique, rng);
  return unique;
}

/**
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @returns {{
 *   plan: { bucket: string, query: string, providerTarget?: string }[],
 *   stats: Record<string, unknown>,
 * }}
 */
export function generateQueryPlanWithMeta(config) {
  const rng = mulberry32(Number(config.randomSeed) || 1);
  const budget = config.bucketBudgets || {};
  const totalBudget = Number(config.totalQueryBudget) || 0;

  const directBudget = Number(budget.direct_ats) || 0;
  const titleBudget = Number(budget.title_led) || 0;
  const bridgeBudget = Number(budget.company_bridge) || 0;
  const geoBudget = Number(budget.geo) || 0;

  const directAll = buildDirectCandidates(config, rng);
  const titleAll = buildTitleCandidates(config, rng);
  const bridgeAll = buildBridgeCandidates(config, rng);
  const geoAll = buildGeoCandidates(config, rng);

  const uniqueDirect = directAll.length;
  const uniqueTitle = titleAll.length;
  const uniqueBridge = bridgeAll.length;
  const uniqueGeo = geoAll.length;

  const directTaken = directAll.slice(0, Math.min(directBudget, directAll.length));
  const titleTaken = titleAll.slice(0, Math.min(titleBudget, titleAll.length));
  const bridgeTaken = bridgeAll.slice(0, Math.min(bridgeBudget, bridgeAll.length));
  const geoTaken = geoAll.slice(0, Math.min(geoBudget, geoAll.length));

  /** @type {Set<string>} */
  const seenGlobal = new Set();
  let crossBucketDedupes = 0;

  /**
   * @param {{ query: string, bucket: string, providerTarget?: string }[]} rows
   */
  const mergeUnique = (rows) => {
    /** @type {typeof rows} */
    const out = [];
    for (const row of rows) {
      const query = dedupeFlatOrGroupsInQuery(row.query);
      const k = query.toLowerCase();
      if (seenGlobal.has(k)) {
        crossBucketDedupes += 1;
        continue;
      }
      seenGlobal.add(k);
      out.push({ ...row, query });
    }
    return out;
  };

  const merged = [
    ...mergeUnique(directTaken),
    ...mergeUnique(titleTaken),
    ...mergeUnique(bridgeTaken),
    ...mergeUnique(geoTaken),
  ];

  const naturalUniquePoolSize = merged.length;
  const planned = merged.slice(0, Math.max(0, totalBudget));
  const plannedCount = planned.length;
  const shortfall = Math.max(0, totalBudget - plannedCount);

  /** @type {Record<string, number>} */
  const countsByBucket = {
    direct_ats: 0,
    title_led: 0,
    company_bridge: 0,
    geo: 0,
  };
  /** @type {Record<string, number>} */
  const directByProvider = {};
  for (const row of planned) {
    countsByBucket[row.bucket] = (countsByBucket[row.bucket] || 0) + 1;
    if (row.bucket === "direct_ats" && row.providerTarget) {
      const p = row.providerTarget;
      directByProvider[p] = (directByProvider[p] || 0) + 1;
    }
  }

  const plan = planned.map(({ bucket, query, providerTarget }) => {
    const o = { bucket, query };
    if (providerTarget) o.providerTarget = providerTarget;
    return o;
  });

  const stats = {
    configured_total_query_budget: totalBudget,
    bucket_budget_targets: {
      direct_ats: directBudget,
      title_led: titleBudget,
      company_bridge: bridgeBudget,
      geo: geoBudget,
    },
    natural_unique_candidates_by_bucket: {
      direct_ats: uniqueDirect,
      title_led: uniqueTitle,
      company_bridge: uniqueBridge,
      geo: uniqueGeo,
    },
    taken_after_bucket_cap_before_global_merge: {
      direct_ats: directTaken.length,
      title_led: titleTaken.length,
      company_bridge: bridgeTaken.length,
      geo: geoTaken.length,
    },
    natural_unique_pool_size_after_cross_bucket_dedupe: naturalUniquePoolSize,
    cross_bucket_duplicate_drops: crossBucketDedupes,
    final_planned_query_count: plannedCount,
    budget_shortfall_vs_configured: shortfall,
    budget_fully_reached_naturally: shortfall === 0,
    counts_by_bucket_in_final_plan: countsByBucket,
    direct_ats_queries_by_provider_target: directByProvider,
  };

  return { plan, stats };
}

/**
 * Backward-compatible: plan items only.
 * @param {import("./loadConfig.mjs").AtsSerpDiscoveryConfig} config
 * @returns {{ bucket: string, query: string, providerTarget?: string }[]}
 */
export function generateQueryPlan(config) {
  return generateQueryPlanWithMeta(config).plan;
}

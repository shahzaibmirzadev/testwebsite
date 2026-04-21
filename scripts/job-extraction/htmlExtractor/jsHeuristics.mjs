/**
 * Heuristic: SPA / JS-rendered shell or useless listing page.
 * Tuned so SSR/Next.js sites with real careers content are not discarded
 * solely because __NEXT_DATA__ or #__next exists.
 * @param {string} html
 * @param {import("cheerio").CheerioAPI} $
 */
export function analyzePageSignals(html, $) {
  const textLen = $.root().text().replace(/\s+/g, " ").trim().length;
  const scripts = $("script").length;
  const links = $("a[href]").length;

  const hasNextData = /\b__NEXT_DATA__\b/.test(html);
  const hasReactRoot =
    /\breact-root\b|id=["']app["']|id=["']root["']|id=["']__next["']/i.test(html);

  // Strong JS shell: almost no text and almost no links
  const thinShell =
    textLen < 180 && links < 6 && scripts > 18;

  // Classic SPA suspicion without SSR content
  const suspectedJsLegacy =
    (textLen < 350 && scripts > 15 && links < 8) ||
    (textLen < 200 && links < 4 && scripts > 8);

  // __NEXT_DATA__ alone is NOT a skip if the page already has substantial text + links (SSR/hydration)
  const nextWithoutContent = hasNextData && textLen < 450 && links < 10;

  const suspectedJsHeavy =
    thinShell ||
    (!nextWithoutContent && suspectedJsLegacy) ||
    (hasReactRoot && textLen < 300 && links < 6) ||
    nextWithoutContent;

  const emptyOrThin = textLen < 90 || (links === 0 && textLen < 220);

  return {
    textLen,
    scriptCount: scripts,
    linkCount: links,
    suspectedJsHeavy,
    emptyOrThin,
    hasNextData,
    hasReactRoot,
    /** If true, HTML still looks JS-driven; log for re-routing review */
    extractionJsRisk: Boolean(
      (hasNextData || hasReactRoot) && !suspectedJsHeavy && !emptyOrThin
    ),
  };
}

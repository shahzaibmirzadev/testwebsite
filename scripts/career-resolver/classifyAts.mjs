/**
 * Conservative ATS hostname → provider id for source_type_guess (ats_<provider>).
 * @param {string} hostname
 * @returns {{ provider: string, sourceType: string } | null}
 */
export function classifyAtsHostname(hostname) {
  const h = (hostname || "").toLowerCase();
  if (!h) return null;

  const rules = [
    [/\.?greenhouse\.io$/, "greenhouse"],
    [/\.?lever\.co$/, "lever"],
    [/\.?ashbyhq\.com$/, "ashby"],
    [/\.?workable\.com$/, "workable"],
    [/\.?teamtailor\.com$/, "teamtailor"],
    [/\.?smartrecruiters\.com$/, "smartrecruiters"],
    [/\.?jobvite\.com$/, "jobvite"],
    [/\.?bamboohr\.com$/, "bamboohr"],
    [/\.?personio\.(com|de)$/, "personio"],
    [/\.?recruitee\.com$/, "recruitee"],
    [/\.?icims\.com$/, "icims"],
    [/\.?myworkdayjobs\.com$/, "workday"],
    [/\.?workday\.com$/, "workday"],
    [/\.?taleo\.net$/, "taleo"],
    [/\.?successfactors\.com$/, "successfactors"],
    [/\.?oraclecloud\.com$/, "oracle"],
    [/\.?applytojob\.com$/, "applytojob"],
    [/\.?jobscore\.com$/, "jobscore"],
    [/\.?rippling\.com$/, "rippling"],
    [/\.?comeet\.(com|co)$/, "comeet"],
    [/\.?hrmdirect\.com$/, "hrmdirect"],
  ];

  for (const [re, provider] of rules) {
    if (re.test(h)) {
      return { provider, sourceType: `ats_${provider}` };
    }
  }
  return null;
}

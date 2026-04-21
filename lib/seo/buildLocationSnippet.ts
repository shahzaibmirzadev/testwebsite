type BuildLocationSnippetArgs = {
  location: string;
  companies?: string[];
  topRoles?: string[];
};

const CITY_TERMS = [
  "berlin",
  "munich",
  "paris",
  "toulouse",
  "amsterdam",
  "delft",
  "london",
  "bristol",
  "cambridge",
  "sydney",
  "melbourne",
  "queensland",
  "bangalore",
  "hyderabad",
  "delhi",
  "california",
  "texas",
  "east coast",
  "germany",
  "france",
  "nordics",
];
const FALLBACK_COMPANIES = ["Anduril", "Skydio", "Zipline"];

export function buildLocationSnippet({
  location,
  companies = [],
  topRoles = [],
}: BuildLocationSnippetArgs) {
  const companyPart =
    companies.length > 0
      ? `Companies like ${companies.slice(0, 2).join(" and ")} are active in the space`
      : `A mix of established companies and newer players are active in the space`;

  const rolePart =
    topRoles.length > 0
      ? `with demand across roles like ${topRoles.slice(0, 2).join(" and ")}`
      : `with demand across engineering, operations, and testing roles`;

  return `${location} has a growing drone sector focused on practical applications like inspection, mapping, and operations. ${companyPart}, ${rolePart}. Activity is typically centered around major cities and regional hubs.`;
}

export function hasCompanyMention(snippet: string, companies: string[]) {
  const text = String(snippet || "").toLowerCase();
  return (companies || []).some((company) => {
    const token = String(company || "").trim().toLowerCase();
    return token && text.includes(token);
  });
}

export function hasCityOrRegionMention(snippet: string) {
  const text = String(snippet || "").toLowerCase();
  if (CITY_TERMS.some((term) => text.includes(term))) return true;
  return (
    text.includes("major cities") ||
    text.includes("regional hubs") ||
    text.includes("capital and surrounding regions")
  );
}

function toSentence(text: string) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildResolvedLocationSnippet({
  location,
  curatedSnippet = "",
  companies = [],
  topRoles = [],
}: BuildLocationSnippetArgs & { curatedSnippet?: string }) {
  const base =
    String(curatedSnippet || "").trim() || buildLocationSnippet({ location, companies, topRoles });

  let finalSnippet = toSentence(base);
  const normalizedCompanies = (companies || []).map((name) => String(name || "").trim()).filter(Boolean);
  const companyPool = normalizedCompanies.length ? normalizedCompanies : FALLBACK_COMPANIES;
  const companyName = String(companyPool[0] || "").trim();
  if (companyName && !hasCompanyMention(finalSnippet, companyPool)) {
    finalSnippet = `${finalSnippet} ${toSentence(`${companyName} is one of the companies currently hiring in this market`)}`;
  }
  if (!hasCityOrRegionMention(finalSnippet)) {
    const locationKey = String(location || "").trim().toLowerCase();
    if (locationKey === "usa") {
      finalSnippet = `${finalSnippet} Activity is concentrated across California, Texas, and the East Coast.`;
    } else if (locationKey === "europe") {
      finalSnippet = `${finalSnippet} Activity is concentrated across Germany, France, and the Nordics.`;
    } else {
      finalSnippet = `${finalSnippet} especially around major hubs like the capital and surrounding regions.`;
    }
  }

  const sentences = finalSnippet
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return sentences.join(" ");
}

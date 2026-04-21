import { getSearchableActiveJobs } from "@/lib/jobs";
import { companySlug } from "@/lib/companyPages";
import { getLocationConfigs, jobMatchesLocation } from "@/lib/locationPages";

async function main() {
  const jobs = await getSearchableActiveJobs();

  const topLocations = getLocationConfigs()
    .map((config) => ({
      slug: config.slug,
      label: config.label,
      count: jobs.filter((job) => jobMatchesLocation(job, config)).length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 10);

  const companyCounts = new Map<string, number>();
  for (const job of jobs) {
    const name = String(job?.company || "").trim();
    if (!name) continue;
    companyCounts.set(name, (companyCounts.get(name) || 0) + 1);
  }
  const topCompanies = Array.from(companyCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, count]) => ({
      name,
      count,
      path: `/company/${companySlug(name)}`,
    }));

  console.log("TOP_LOCATIONS");
  for (const [index, location] of topLocations.entries()) {
    console.log(`${index + 1}. ${location.label} (${location.count}) -> /location/${location.slug}`);
  }

  console.log("TOP_COMPANIES");
  for (const [index, company] of topCompanies.entries()) {
    console.log(`${index + 1}. ${company.name} (${company.count}) -> ${company.path}`);
  }
}

main().catch((error) => {
  console.error("top_index_targets_failed");
  console.error(error);
  process.exitCode = 1;
});

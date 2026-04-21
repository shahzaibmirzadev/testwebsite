import { auditSeo, printSeoAuditSummary } from "@/lib/seo/auditSeo";

async function main() {
  const report = await auditSeo();
  printSeoAuditSummary(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("seo_audit_failed");
  console.error(error);
  process.exitCode = 1;
});

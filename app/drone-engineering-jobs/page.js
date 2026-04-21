import { GuideLandingPage, buildGuideMetadata } from "@/components/guides/GuideLandingPage";
import { GUIDE_PAGES } from "@/lib/guidePages";

export const revalidate = 86400;

const config = GUIDE_PAGES["drone-engineering-jobs"];

export async function generateMetadata() {
  return buildGuideMetadata(config);
}

export default function DroneEngineeringJobsPage() {
  return <GuideLandingPage config={config} />;
}

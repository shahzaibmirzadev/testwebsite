import ComingSoonPage from "@/components/ComingSoonPage";

export const metadata = {
  title: "Get Started | Coming Soon",
  description: "Get Started is coming soon on Drone Roles.",
  alternates: { canonical: "/get-started" },
  robots: { index: false, follow: true },
};

export default function GetStartedComingSoonPage() {
  return (
    <ComingSoonPage
      label="Get Started"
      title="Get Started"
      shortDescription="We are shaping this onboarding flow to quickly connect serious candidates with the right companies, roles, and recruiter visibility."
      finalNote="The Get Started flow will soon guide you through profile setup, role preferences, and recruiter-ready visibility so opportunities can come to you faster."
    />
  );
}


import ComingSoonPage from "@/components/ComingSoonPage";

export const metadata = {
  title: "Sign In | Coming Soon",
  description: "Sign In is coming soon on Drone Roles.",
  alternates: { canonical: "/sign-in" },
  robots: { index: false, follow: true },
};

export default function SignInComingSoonPage() {
  return (
    <ComingSoonPage
      label="Sign In"
      title="Sign In"
      shortDescription="We are building account access in phases so your saved jobs, activity, and future profile tools are reliable from the start."
      finalNote="Soon you will be able to sign in to your own DroneRoles account to manage saved roles, profile settings, and personalized updates in one place."
    />
  );
}


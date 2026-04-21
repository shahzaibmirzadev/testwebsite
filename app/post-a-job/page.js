import ComingSoonPage from "@/components/ComingSoonPage";

export const metadata = {
  title: "Post a Job | Coming Soon",
  description: "Post a Job is coming soon on Drone Roles.",
  alternates: { canonical: "/post-a-job" },
  robots: { index: false, follow: true },
};

export default function PostAJobComingSoonPage() {
  return (
    <ComingSoonPage
      label="Post a Job"
      title="Post a Job"
      shortDescription="We are still finalizing the employer side of DroneRoles and want to make sure posting, filtering, and candidate quality are excellent on day one."
      finalNote="Are you or your firm looking for talent? Soon you will be able to post jobs directly on DroneRoles and get direct access to high-intent profiles in this space."
    />
  );
}

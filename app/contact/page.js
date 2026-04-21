import ContactPageClient from "@/components/contact/ContactPageClient";
import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";

export const metadata = {
  title: "Contact Drone Roles",
  description:
    "Contact Drone Roles for hiring support, listing feedback, and partnership inquiries.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact Drone Roles",
    description:
      "Contact Drone Roles for hiring support, listing feedback, and partnership inquiries.",
    url: `${CANONICAL_SITE_URL}/contact`,
    type: "website",
  },
};

export default function ContactPage() {
  return <ContactPageClient />;
}

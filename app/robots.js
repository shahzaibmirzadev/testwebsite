import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
    host: CANONICAL_SITE_URL,
  };
}

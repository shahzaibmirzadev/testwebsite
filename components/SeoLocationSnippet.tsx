import { buildResolvedLocationSnippet } from "@/lib/seo/buildLocationSnippet";

type SeoLocationSnippetProps = {
  locationName: string;
  curatedSnippet?: string;
  companies?: string[];
  topRoles?: string[];
};

export default function SeoLocationSnippet({
  locationName,
  curatedSnippet = "",
  companies = [],
  topRoles = [],
}: SeoLocationSnippetProps) {
  const text = buildResolvedLocationSnippet({
    location: locationName,
    curatedSnippet,
    companies,
    topRoles,
  });
  if (!text) return null;
  return <p>{text}</p>;
}

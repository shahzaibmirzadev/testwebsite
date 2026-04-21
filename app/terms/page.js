export const metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Drone Roles.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className={"[min-height:70vh] [background:#f6f8fc] [padding:26px_14px_44px]"}>
      <div className={"[max-width:900px] [margin:0_auto] [background:#fff] [border:1px_solid_#e4eaf4] [border-radius:12px] [padding:24px_22px] [box-shadow:0_12px_26px_rgba(15,_23,_42,_0.05)] [&h1]:[margin:0_0_8px] [&h1]:[color:#0f172a] [&h2]:[margin:20px_0_8px] [&h2]:[font-size:1.05rem] [&h2]:[color:#0f172a] [&p]:[color:#334155] [&p]:[line-height:1.65] [&li]:[color:#334155] [&li]:[line-height:1.65]"}>
        <h1>Terms of Service</h1>
        <p>Last updated: April 8, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By using Drone Roles, you agree to these Terms of Service. If you do not agree, you should not use the
          site.
        </p>

        <h2>2. Service Description</h2>
        <p>
          Drone Roles provides job discovery tools and links to third-party job postings. We do not guarantee
          availability, validity, or hiring outcomes for any listing.
        </p>

        <h2>3. Acceptable Use</h2>
        <p>
          You agree not to misuse the platform, attempt unauthorized access, interfere with normal operation, or
          use automated tools in a way that harms service reliability.
        </p>

        <h2>4. Third-Party Content</h2>
        <p>
          Job listings and external apply links are provided by third parties. We are not responsible for third-party
          websites, content accuracy, or external privacy practices.
        </p>

        <h2>5. Intellectual Property</h2>
        <p>
          Site content, branding, and software are protected by applicable intellectual property laws and may not be
          copied or redistributed without permission.
        </p>

        <h2>6. Disclaimer and Limitation of Liability</h2>
        <p>
          Drone Roles is provided &quot;as is&quot; without warranties of any kind. To the maximum extent allowed by law,
          we are not liable for indirect, incidental, or consequential damages.
        </p>

        <h2>7. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Continued use of the site after updates means you accept the
          revised Terms.
        </p>

        <h2>8. Contact</h2>
        <p>
          For Terms questions, contact <a href="mailto:support@droneroles.com">support@droneroles.com</a>.
        </p>
      </div>
    </main>
  );
}

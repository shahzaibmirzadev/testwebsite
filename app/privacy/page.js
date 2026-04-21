export const metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Drone Roles.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className={"[min-height:70vh] [background:#f6f8fc] [padding:26px_14px_44px]"}>
      <div className={"[max-width:900px] [margin:0_auto] [background:#fff] [border:1px_solid_#e4eaf4] [border-radius:12px] [padding:24px_22px] [box-shadow:0_12px_26px_rgba(15,_23,_42,_0.05)] [&h1]:[margin:0_0_8px] [&h1]:[color:#0f172a] [&h2]:[margin:20px_0_8px] [&h2]:[font-size:1.05rem] [&h2]:[color:#0f172a] [&p]:[color:#334155] [&p]:[line-height:1.65] [&li]:[color:#334155] [&li]:[line-height:1.65]"}>
        <h1>Privacy Policy</h1>
        <p>Last updated: April 8, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>
          We collect information you provide directly, such as contact form details. We also collect limited
          technical information used for security, reliability, and analytics.
        </p>

        <h2>2. How We Use Information</h2>
        <p>
          We use information to operate and improve the site, respond to support requests, prevent abuse, and
          understand aggregate product usage.
        </p>

        <h2>3. Cookies and Similar Technologies</h2>
        <p>
          We use essential cookies and privacy-respecting analytics technologies to keep the platform functional
          and monitor performance.
        </p>

        <h2>4. Sharing of Information</h2>
        <p>
          We do not sell personal information. We may share data with trusted service providers that help us host,
          secure, and operate Drone Roles.
        </p>

        <h2>5. Data Retention</h2>
        <p>
          We retain information only as long as necessary for business, legal, and operational purposes.
        </p>

        <h2>6. Your Rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or restrict processing of
          personal information. Contact us to submit a request.
        </p>

        <h2>7. Contact</h2>
        <p>
          For privacy questions, contact <a href="mailto:support@droneroles.com">support@droneroles.com</a>.
        </p>
      </div>
    </main>
  );
}

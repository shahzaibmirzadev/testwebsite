export const metadata = {
  title: "Cookie Policy",
  description: "Cookie Policy for Drone Roles.",
  alternates: { canonical: "/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <main className={"[min-height:70vh] [background:#f6f8fc] [padding:26px_14px_44px]"}>
      <div className={"[max-width:900px] [margin:0_auto] [background:#fff] [border:1px_solid_#e4eaf4] [border-radius:12px] [padding:24px_22px] [box-shadow:0_12px_26px_rgba(15,_23,_42,_0.05)] [&h1]:[margin:0_0_8px] [&h1]:[color:#0f172a] [&h2]:[margin:20px_0_8px] [&h2]:[font-size:1.05rem] [&h2]:[color:#0f172a] [&p]:[color:#334155] [&p]:[line-height:1.65] [&li]:[color:#334155] [&li]:[line-height:1.65]"}>
        <h1>Cookie Policy</h1>
        <p>Last updated: April 8, 2026</p>

        <h2>1. What Are Cookies</h2>
        <p>
          Cookies are small text files stored on your device. They help websites remember preferences, improve
          performance, and support basic functionality.
        </p>

        <h2>2. Cookies We Use</h2>
        <p>Drone Roles uses limited categories of cookies:</p>
        <ul>
          <li>Essential cookies required for core site functionality.</li>
          <li>Analytics cookies to understand aggregate usage and improve performance.</li>
        </ul>

        <h2>3. Managing Cookies</h2>
        <p>
          You can manage cookie settings through your browser controls. Disabling certain cookies may affect site
          functionality.
        </p>

        <h2>4. Third-Party Services</h2>
        <p>
          We may use third-party service providers for analytics and hosting. These providers may set cookies subject
          to their own policies.
        </p>

        <h2>5. Policy Updates</h2>
        <p>
          We may update this Cookie Policy periodically to reflect legal or operational changes.
        </p>

        <h2>6. Contact</h2>
        <p>
          For cookie questions, contact <a href="mailto:support@droneroles.com">support@droneroles.com</a>.
        </p>
      </div>
    </main>
  );
}

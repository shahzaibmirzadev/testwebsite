"use client";



/**
 * @param {{ children: React.ReactNode }} props
 */
export default function JobsSection({ children }) {
  return (
    <section
      id="latest-jobs"
      className={"[padding:14px_0_66px]"}
      aria-labelledby="latest-jobs-heading"
    >
      <div className={"[max-width:1120px] [margin:0_auto] [padding:0_20px] [transition:max-width_0.48s_cubic-bezier(0.4,_0,_0.2,_1)]"}>
        <h2 id="latest-jobs-heading" className={"[font-size:1.2rem] font-bold [letter-spacing:-0.02em] [margin:0_0_18px] [color:var(--text)] [margin:0_0_4px] [font-size:clamp(1.5rem,_2.4vw,_2rem)] [margin-bottom:8px]"}>
          Featured Openings
        </h2>
        <p className={"m-0 [font-size:0.86rem] [margin:0_0_22px] [font-size:0.95rem] [color:#64748b]"}>
          High-priority roles from leading drone manufacturers and operators.
        </p>
        {children}
      </div>
    </section>
  );
}
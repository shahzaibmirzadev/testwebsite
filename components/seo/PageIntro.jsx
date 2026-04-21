
/**
 * Short intro block below H1 for hub/company-style pages.
 * @param {{ children: React.ReactNode, className?: string, paragraphClassName?: string }} props
 */
export default function PageIntro({ children, className = "", paragraphClassName = "job-prose" }) {
  if (children == null || children === "") return null;
  return (
    <div className={className}>
      <p className={paragraphClassName === "job-prose" ? "[line-height:1.65] [font-size:1rem] [color:#374151] [&h1]:[margin:1.25em_0_0.5em] [&h1]:[line-height:1.3] [&h1]:[color:#111827] [&h1]:font-bold [&h2]:[margin:1.25em_0_0.5em] [&h2]:[line-height:1.3] [&h2]:[color:#111827] [&h2]:font-bold [&h3]:[margin:1.25em_0_0.5em] [&h3]:[line-height:1.3] [&h3]:[color:#111827] [&h3]:font-bold [&h4]:[margin:1.25em_0_0.5em] [&h4]:[line-height:1.3] [&h4]:[color:#111827] [&h4]:font-bold [&h5]:[margin:1.25em_0_0.5em] [&h5]:[line-height:1.3] [&h5]:[color:#111827] [&h5]:font-bold [&h6]:[margin:1.25em_0_0.5em] [&h6]:[line-height:1.3] [&h6]:[color:#111827] [&h6]:font-bold [&h1]:[font-size:1.5rem] [&h1:first-child]:[margin-top:0] [&h2:first-child]:[margin-top:0] [&h3:first-child]:[margin-top:0] [&h2]:[font-size:1.25rem] [&h3]:[font-size:1.1rem] [&h4]:[font-size:1.05rem] [&h5]:[font-size:1rem] [&h6]:[font-size:1rem] [&p]:[margin:0_0_1em] [&p:last-child]:[margin-bottom:0] [&br]:[line-height:inherit] [&ul]:[margin:0_0_1em] [&ul]:[padding-left:1.5em] [&ol]:[margin:0_0_1em] [&ol]:[padding-left:1.5em] [&ul]:[list-style-type:disc] [&ol]:[list-style-type:decimal] [&li]:[margin-bottom:0.35em] [&li_>_ul]:[margin-top:0.35em] [&li_>_ul]:[margin-bottom:0.35em] [&li_>_ol]:[margin-top:0.35em] [&li_>_ol]:[margin-bottom:0.35em] [&blockquote]:[margin:0_0_1em] [&blockquote]:[padding-left:1em] [&blockquote]:[border-left:3px_solid_#e5e7eb] [&blockquote]:[color:#4b5563] [&hr]:border-0 [&hr]:[border-top:1px_solid_#e5e7eb] [&hr]:[margin:1.5em_0] [&pre]:[margin:0_0_1em] [&pre]:[padding:12px] [&pre]:overflow-x-auto [&pre]:[background:#f3f4f6] [&pre]:[border-radius:6px] [&pre]:[font-size:0.9em] [&code]:[font-size:0.9em] [&table]:w-full [&table]:[border-collapse:collapse] [&table]:[margin:0_0_1em] [&table]:[font-size:0.95em] [&th]:[border:1px_solid_#e5e7eb] [&th]:[padding:8px_10px] [&th]:[vertical-align:top] [&td]:[border:1px_solid_#e5e7eb] [&td]:[padding:8px_10px] [&td]:[vertical-align:top] [&th]:[background:#f9fafb] [&th]:font-semibold [&th]:text-left [&a]:[word-break:break-word] [color:#334155] [&h2]:[font-size:1.32rem] [&h2]:[margin-top:1.4em] [&h3]:[font-size:1.16rem]" : paragraphClassName} style={{ marginTop: 0 }}>
        {children}
      </p>
    </div>
  );
}

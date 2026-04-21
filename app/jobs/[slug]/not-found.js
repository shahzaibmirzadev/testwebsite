import Link from "next/link";

export default function JobNotFound() {
  return (
    <main className={"[max-width:520px] [margin:80px_auto] [padding:0_16px] text-center [&h1]:[margin-bottom:12px] [min-height:72vh] grid [place-items:center] [max-width:920px] [margin:0_auto] [padding:24px_14px]"}>
      <div className={"w-full [max-width:680px] [border:1px_solid_#e6ebf5] [border-radius:14px] [background:linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] [box-shadow:0_16px_34px_rgba(15,_23,_42,_0.06)] [padding:30px_26px]"}>
        <p className={"[margin:0_0_8px] [font-size:0.78rem] [letter-spacing:0.08em] [text-transform:uppercase] font-bold [color:#2563eb]"}>This one took off</p>
        <h1>Sorry, this job is no longer listed.</h1>
        <p className={"[margin:0_auto] [max-width:50ch] [color:#475569] [line-height:1.65]"}>
          We remove jobs automatically 3 months after they&apos;ve been posted,
          but no worries, we have plenty of fresh ones to check out.
        </p>
        <Link href="/" className={"[margin-top:18px] inline-flex [align-items:center] [justify-content:center] [border-radius:10px] [padding:11px_18px] [min-width:180px] no-underline font-semibold [color:#fff] [background:linear-gradient(135deg,_#2563eb_0%,_#1d4ed8_100%)] [border:1px_solid_rgba(29,_78,_216,_0.35)] hover:[filter:brightness(1.04)]"}>
          Back to all jobs
        </Link>
      </div>
    </main>
  );
}

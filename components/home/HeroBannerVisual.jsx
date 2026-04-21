

export default function HeroBannerVisual() {
  return (
    <div className={"[width:min(100%,_520px)] [min-height:300px] [border-radius:20px] [border:1px_solid_rgba(15,_23,_42,_0.08)] [background:radial-gradient(circle_at_82%_20%,_rgba(37,_99,_235,_0.16),_transparent_45%),_radial-gradient(circle_at_20%_90%,_rgba(37,_99,_235,_0.08),_transparent_52%),_linear-gradient(160deg,_#0c1628_0%,_#0f1e36_54%,_#0f172a_100%)] [box-shadow:0_18px_44px_rgba(15,_23,_42,_0.24),_inset_0_0_0_1px_rgba(148,_163,_184,_0.1)] relative overflow-hidden"}>
      <div className={"absolute [inset:-36%_-18%_auto_auto] [width:220px] [height:220px] [background:radial-gradient(circle,_rgba(59,_130,_246,_0.42),_transparent_65%)] [filter:blur(10px)] pointer-events-none"} />
      <div className={"relative [z-index:1] [padding:30px_28px] [color:#dbeafe]"}>
        <p className={"[margin:0_0_10px] [font-size:0.68rem] [letter-spacing:0.12em] [text-transform:uppercase] [color:#93c5fd] font-bold"}>HOW THIS IS CURATED</p>
        <p className={"m-0 [font-size:clamp(1.06rem,_2.2vw,_1.42rem)] font-bold [line-height:1.3] [color:#eff6ff]"}>Transparent by design</p>
        <ul className={"[margin:14px_0_0] [padding-left:18px] grid [gap:5px] [color:#dbeafe] [font-size:0.78rem] [line-height:1.45]"}>
          <li>Only UAV-specific roles</li>
          <li>Sourced from real company pipelines</li>
          <li>Strict title-based filtering</li>
          <li>Continuously refined</li>
        </ul>
        <p className={"[margin:10px_0_0] [font-size:0.86rem] [color:#cbd5e1] [max-width:32ch] [line-height:1.55]"}>Goal: zero noise</p>
      </div>
    </div>
  );
}
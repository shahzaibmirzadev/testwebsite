"use client";

import { useEffect, useState } from "react";

const KEY = "dr_cookie_notice_v1";

export default function CookieNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(KEY);
      if (!seen) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  return (
    <div className={"fixed [right:14px] [bottom:14px] [z-index:9999] [max-width:min(92vw,_340px)] [border:1px_solid_#dbe4ef] [background:#ffffff] [border-radius:10px] [box-shadow:0_10px_28px_rgba(15,_23,_42,_0.12)] [padding:10px_10px_9px] grid [gap:8px] [&p]:m-0 [&p]:[font-size:0.78rem] [&p]:[line-height:1.35] [&p]:[color:#334155] [&button]:[justify-self:end] [&button]:[border:1px_solid_#cfe0ff] [&button]:[background:#eef4ff] [&button]:[color:#1d4ed8] [&button]:[border-radius:8px] [&button]:[padding:4px_10px] [&button]:font-semibold [&button]:cursor-pointer"} role="status" aria-live="polite">
      <p>
        We only use essential cookies for site functionality and anonymous performance analytics.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {}
          setOpen(false);
        }}
      >
        OK
      </button>
    </div>
  );
}

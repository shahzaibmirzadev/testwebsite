"use client";

import Link from "next/link";


export default function ContactBanner() {
  return (
    <Link href="/contact" className={"fixed [right:14px] [bottom:14px] [z-index:120] inline-flex [align-items:center] [justify-content:center] no-underline [border-radius:999px] [padding:10px_14px] [font-size:0.82rem] font-bold [color:#fff] [background:#1d4ed8] [box-shadow:0_8px_20px_rgba(29,_78,_216,_0.28)] hover:[background:#1e40af]"}>
      Contact Us
    </Link>
  );
}

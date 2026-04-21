"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export default function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(ScrollTrigger);

    let lenis = null;
    let lenisTick = null;

    if (!prefersReducedMotion) {
      lenis = new Lenis({
        duration: 1.08,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 0.88,
        touchMultiplier: 1.1,
      });

      lenis.on("scroll", ScrollTrigger.update);
      lenisTick = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(lenisTick);
      gsap.ticker.lagSmoothing(0);
    }

    const refreshId = window.setTimeout(() => ScrollTrigger.refresh(), 100);

    return () => {
      window.clearTimeout(refreshId);
      if (lenisTick) gsap.ticker.remove(lenisTick);
      if (lenis) lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const refreshId = window.setTimeout(() => ScrollTrigger.refresh(), 160);
    return () => window.clearTimeout(refreshId);
  }, [pathname]);

  return null;
}

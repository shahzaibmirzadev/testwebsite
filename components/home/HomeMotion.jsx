"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function HomeMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-home-line]",
        { yPercent: 90, autoAlpha: 0 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.78,
          ease: "power3.out",
          stagger: 0.07,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        "[data-home-hero-reveal]",
        { y: 18, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.58,
          ease: "power2.out",
          stagger: 0.055,
          delay: 0.12,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.utils.toArray("[data-home-scroll]").forEach((element) => {
        gsap.set(element, { y: 24, autoAlpha: 0 });
        gsap.to(element, {
          y: 0,
          autoAlpha: 1,
          duration: 0.62,
          ease: "power2.out",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        });
      });

      ScrollTrigger.refresh();
    });

    return () => context.revert();
  }, []);

  return null;
}

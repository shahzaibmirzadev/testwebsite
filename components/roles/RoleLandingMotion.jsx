"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function RoleLandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-role-hero-line]",
        { yPercent: 80, autoAlpha: 0 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.72,
          ease: "power3.out",
          stagger: 0.06,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        "[data-role-hero-reveal]",
        { y: 14, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.54,
          ease: "power2.out",
          stagger: 0.055,
          delay: 0.1,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.utils.toArray("[data-role-scroll]").forEach((element) => {
        gsap.set(element, { y: 24, autoAlpha: 0 });
        gsap.to(element, {
          y: 0,
          autoAlpha: 1,
          duration: 0.64,
          ease: "power2.out",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        });
      });

      gsap.fromTo(
        "[data-role-stat]",
        { y: 12, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.42,
          ease: "power2.out",
          stagger: 0.045,
          delay: 0.2,
          clearProps: "transform,opacity,visibility",
        }
      );

      ScrollTrigger.refresh();
    });

    return () => context.revert();
  }, []);

  return null;
}

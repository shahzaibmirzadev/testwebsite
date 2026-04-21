"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * @param {{ children: React.ReactNode }} props
 */
export default function JobDetailMotion({ children }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const q = gsap.utils.selector(rootRef);
      const revealItemsSelector = [
        "[data-job-motion-item]",
        "h1",
        "h2",
        "h3",
        "p",
        "li",
        "article",
        "a",
        "button",
        "svg",
        "iframe",
      ].join(",");

      const getRevealItems = (element) =>
        gsap.utils
          .toArray(element.querySelectorAll(revealItemsSelector))
          .filter((item) => !item.closest("[data-motion-skip]"));

      q("[data-job-hero]").forEach((element) => {
        const heroItems = getRevealItems(element);
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

        timeline.fromTo(
          element,
          { y: 14, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.48,
          },
          0
        );

        if (heroItems.length > 0) {
          timeline.fromTo(
            heroItems,
            { y: 18, autoAlpha: 0, filter: "blur(7px)" },
            {
              y: 0,
              autoAlpha: 1,
              filter: "blur(0px)",
              duration: 0.72,
              stagger: 0.05,
              clearProps: "transform,opacity,visibility,filter",
            },
            0.08
          );
        }
      });

      q("[data-job-reveal]").forEach((element) => {
        const items = getRevealItems(element);
        const timeline = gsap.timeline({
          defaults: { ease: "power3.out" },
          scrollTrigger: {
            trigger: element,
            start: "top 86%",
            end: "bottom 18%",
            toggleActions: "play none none reverse",
          }
        });

        timeline.fromTo(
          element,
          { y: 18, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.48,
          },
          0
        );

        if (items.length > 0) {
          timeline.fromTo(
            items,
            { y: 22, autoAlpha: 0, filter: "blur(6px)" },
            {
              y: 0,
              autoAlpha: 1,
              filter: "blur(0px)",
              duration: 0.68,
              stagger: {
                each: 0.055,
                from: "start",
              },
            },
            0.08
          );
        }
      });

      ScrollTrigger.refresh();
    }, rootRef);

    return () => context.revert();
  }, []);

  return (
    <div ref={rootRef}>
      {children}
    </div>
  );
}

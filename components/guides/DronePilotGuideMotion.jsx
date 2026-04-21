"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function DronePilotGuideMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-guide-hero-bg]",
        { scale: 1.05, y: -16, autoAlpha: 0.78 },
        {
          scale: 1,
          y: 0,
          autoAlpha: 1,
          duration: 1.2,
          ease: "power2.out",
        }
      );

      gsap.fromTo(
        "[data-guide-line]",
        { yPercent: 105, rotateX: -18, autoAlpha: 0 },
        {
          yPercent: 0,
          rotateX: 0,
          autoAlpha: 1,
          duration: 0.95,
          ease: "power4.out",
          stagger: 0.11,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        "[data-guide-reveal]",
        { y: 26, autoAlpha: 0, filter: "blur(8px)" },
        {
          y: 0,
          autoAlpha: 1,
          filter: "blur(0px)",
          duration: 0.72,
          ease: "power3.out",
          stagger: 0.08,
          delay: 0.16,
          clearProps: "transform,opacity,visibility,filter",
        }
      );

      gsap.fromTo(
        "[data-guide-card]",
        { y: 28, autoAlpha: 0, scale: 0.94 },
        {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 0.62,
          ease: "back.out(1.35)",
          stagger: 0.08,
          delay: 0.32,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        "[data-guide-hero-card]",
        { y: 34, x: 18, autoAlpha: 0, rotate: 1.5, scale: 0.96 },
        {
          y: 0,
          x: 0,
          autoAlpha: 1,
          rotate: 0,
          scale: 1,
          duration: 0.86,
          ease: "power3.out",
          delay: 0.28,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.utils.toArray("[data-guide-float]").forEach((element, index) => {
        gsap.to(element, {
          y: index % 2 === 0 ? 18 : -16,
          x: index % 2 === 0 ? 8 : -10,
          rotate: index % 2 === 0 ? 5 : -4,
          duration: 4 + index,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
      });

      gsap.utils.toArray("[data-guide-scroll]").forEach((element) => {
        gsap.fromTo(
          element,
          { y: 42, autoAlpha: 0, scale: 0.985 },
          {
            y: 0,
            autoAlpha: 1,
            scale: 1,
            duration: 0.82,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 84%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });

      gsap.utils.toArray("[data-guide-step-list]").forEach((element) => {
        const rail = element.querySelector("[data-guide-rail]");
        const steps = element.querySelectorAll("[data-guide-step]");
        const dots = element.querySelectorAll("[data-guide-step-dot]");

        if (rail) {
          gsap.fromTo(
            rail,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              scrollTrigger: {
                trigger: element,
                start: "top 75%",
                end: "bottom 65%",
                scrub: 0.45,
              },
            }
          );
        }

        steps.forEach((step, index) => {
          gsap.fromTo(
            step,
            { x: index % 2 === 0 ? 46 : -46, y: 24, autoAlpha: 0, scale: 0.975 },
            {
              x: 0,
              y: 0,
              autoAlpha: 1,
              scale: 1,
              duration: 0.82,
              ease: "power3.out",
              scrollTrigger: {
                trigger: step,
                start: "top 82%",
                toggleActions: "play none none reverse",
              },
            }
          );
        });

        if (dots.length) {
          gsap.fromTo(
            dots,
            { scale: 0.76, autoAlpha: 0 },
            {
              scale: 1,
              autoAlpha: 1,
              duration: 0.42,
              ease: "back.out(1.8)",
              stagger: 0.06,
              scrollTrigger: {
                trigger: element,
                start: "top 78%",
                toggleActions: "play none none reverse",
              },
            }
          );
        }
      });

      gsap.utils.toArray("[data-guide-stagger]").forEach((element) => {
        const items = element.querySelectorAll("[data-guide-stagger-item]");
        if (!items.length) return;

        gsap.fromTo(
          items,
          { y: 28, autoAlpha: 0, scale: 0.98 },
          {
            y: 0,
            autoAlpha: 1,
            scale: 1,
            duration: 0.62,
            ease: "power3.out",
            stagger: 0.065,
            scrollTrigger: {
              trigger: element,
              start: "top 88%",
              toggleActions: "play none none reverse",
            },
            clearProps: "transform,opacity,visibility",
          }
        );
      });

      gsap.utils.toArray("[data-guide-tilt]").forEach((element) => {
        gsap.to(element, {
          y: -10,
          scrollTrigger: {
            trigger: element,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      });

      ScrollTrigger.refresh();
    });

    return () => context.revert();
  }, []);

  return null;
}

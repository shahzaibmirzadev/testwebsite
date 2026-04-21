"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { FiBriefcase, FiGrid, FiLogIn, FiMapPin, FiMenu, FiPlusCircle, FiX } from "react-icons/fi";

const mobileNavItems = [
  { href: "/", label: "Browse Jobs", icon: FiBriefcase },
  { href: "/companies", label: "Company Directory", icon: FiGrid },
  { href: "/locations", label: "Location Directory", icon: FiMapPin },
  { href: "/roles", label: "Role Directory", icon: FiBriefcase },
  { href: "/post-a-job", label: "Post A Job", icon: FiPlusCircle },
  { href: "/sign-in", label: "Sign in", icon: FiLogIn },
];

/**
 * Global primary navigation (shown on inner pages; home uses HeroSection nav).
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const mobilePanelRef = useRef(null);
  const overlayRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const isActivePath = (href) => {
    return pathname === href;
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const panel = mobilePanelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 1180px)").matches;
    if (!isMobile) {
      gsap.set([panel, overlay], { clearProps: "all" });
      return undefined;
    }

    const links = panel.querySelectorAll("[data-site-header-mobile-item]");
    gsap.killTweensOf([panel, overlay, links]);

    if (reduceMotion) {
      gsap.set(overlay, {
        autoAlpha: menuOpen ? 1 : 0,
        pointerEvents: menuOpen ? "auto" : "none",
      });
      gsap.set(panel, {
        height: menuOpen ? "auto" : 0,
        autoAlpha: menuOpen ? 1 : 0,
        y: menuOpen ? 0 : -8,
        pointerEvents: menuOpen ? "auto" : "none",
      });
      return undefined;
    }

    if (menuOpen) {
      gsap.set(panel, { height: "auto", autoAlpha: 1, pointerEvents: "auto" });
      const panelHeight = panel.offsetHeight;
      gsap.fromTo(
        overlay,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.18, ease: "power2.out", pointerEvents: "auto" }
      );
      gsap.fromTo(
        panel,
        { height: 0, y: -10, autoAlpha: 0 },
        { height: panelHeight, y: 0, autoAlpha: 1, duration: 0.34, ease: "power3.out" }
      );
      gsap.fromTo(
        links,
        { y: 10, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.32,
          ease: "power2.out",
          stagger: 0.035,
          delay: 0.08,
        }
      );
    } else {
      gsap.to(overlay, {
        autoAlpha: 0,
        duration: 0.16,
        ease: "power2.out",
        pointerEvents: "none",
      });
      gsap.to(panel, {
        height: 0,
        y: -8,
        autoAlpha: 0,
        duration: 0.24,
        ease: "power2.inOut",
        pointerEvents: "none",
      });
    }

    return undefined;
  }, [menuOpen]);

  return (
    <>
      <button
        ref={overlayRef}
        type="button"
        className="pointer-events-none fixed inset-0 z-[190] hidden bg-[rgba(28,28,26,0.28)] opacity-0 backdrop-blur-[2px] max-[1180px]:block"
        aria-label="Close navigation menu"
        onClick={closeMenu}
        data-site-header-overlay
      />
    <header className={"sticky [top:0] [z-index:200] [padding:10px_16px_0] [background:#FFFFFF] [backdrop-filter:blur(16px)] max-[1180px]:[padding:6px_10px_0]"} data-site-header data-site-header-state={menuOpen ? "open" : "closed"}>
      <div className={"relative z-30 [max-width:1200px] [margin:0_auto] [padding:10px_14px] flex [align-items:center] [justify-content:space-between] [gap:10px_14px] [flex-wrap:wrap] [border-radius:999px] [border:1px_solid_rgba(0,_0,_0,_0.08)] [background:#FFFFFF] [box-shadow:0_18px_40px_rgba(28,_28,_26,_0.08),_inset_0_1px_0_rgba(255,_255,_255,_0.88)] max-[1180px]:[min-height:0] max-[1180px]:[padding:4px_8px_3px_12px] max-[1180px]:[gap:4px_10px] max-[1180px]:[border-radius:999px] max-[1180px]:[box-shadow:0_10px_24px_rgba(28,_28,_26,_0.08),_inset_0_1px_0_rgba(255,_255,_255,_0.88)]"} data-site-header-bar>
        <Link href="/" className={"[flex:1_1_0] min-w-0 font-black [font-size:1rem] [letter-spacing:-0.03em] [color:#1A1160] no-underline text-left hover:[color:#5B4FE8] max-[1180px]:[flex:1_1_auto]"} data-site-header-brand>
          Drone Roles
        </Link>
        <button
          type="button"
          className={"hidden [width:40px] [height:40px] [align-items:center] [justify-content:center] [border:1px_solid_rgba(0,_0,_0,_0.08)] [border-radius:999px] [background:#FFFFFF] [color:#1C1C1A] [box-shadow:0_10px_20px_rgba(28,_28,_26,_0.08)] cursor-pointer [transition:background_180ms_ease,_color_180ms_ease] hover:[background:#EDE9FF] focus:[outline:none] focus:[box-shadow:0_0_0_2px_#5B4FE8] max-[1180px]:inline-flex max-[1180px]:[width:38px] max-[1180px]:[height:38px] max-[1180px]:[background:#EDE9FF] max-[1180px]:[color:#1A1160] max-[1180px]:[box-shadow:none] max-[1180px]:hover:[background:#5B4FE8] max-[1180px]:hover:[color:#FFFFFF]"}
          aria-expanded={menuOpen}
          aria-controls="site-header-mobile-nav"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((open) => !open)}
          data-site-header-menu-button
        >
          {menuOpen ? <FiX aria-hidden className="h-5 w-5" /> : <FiMenu aria-hidden className="h-5 w-5" />}
        </button>
        <nav className={"flex [align-items:center] [flex-wrap:wrap] [justify-content:center] [gap:8px] [flex:0_0_auto] max-[1180px]:hidden"} aria-label="Primary">
          <Link href="/" className={"inline-flex [align-items:center] [justify-content:center] [min-height:36px] [padding:0_12px] [border-radius:999px] [font-size:0.82rem] font-bold [color:#1C1C1A] no-underline [transition:background_0.18s_ease,_color_0.18s_ease,_transform_0.18s_ease,_box-shadow_0.18s_ease] hover:[color:#1A1160] hover:[background:#EDE9FF] hover:[box-shadow:0_8px_18px_rgba(28,_28,_26,_0.08)] hover:[transform:translateY(-1px)]"} data-site-header-link data-site-header-active-link={isActivePath("/") ? "" : undefined}>
            Browse Jobs
          </Link>
          <Link href="/companies" className={"inline-flex [align-items:center] [justify-content:center] [min-height:36px] [padding:0_12px] [border-radius:999px] [font-size:0.82rem] font-bold [color:#1C1C1A] no-underline [transition:background_0.18s_ease,_color_0.18s_ease,_transform_0.18s_ease,_box-shadow_0.18s_ease] hover:[color:#1A1160] hover:[background:#EDE9FF] hover:[box-shadow:0_8px_18px_rgba(28,_28,_26,_0.08)] hover:[transform:translateY(-1px)]"} data-site-header-link data-site-header-active-link={isActivePath("/companies") ? "" : undefined}>
            Company Directory
          </Link>
          <Link href="/locations" className={"inline-flex [align-items:center] [justify-content:center] [min-height:36px] [padding:0_12px] [border-radius:999px] [font-size:0.82rem] font-bold [color:#1C1C1A] no-underline [transition:background_0.18s_ease,_color_0.18s_ease,_transform_0.18s_ease,_box-shadow_0.18s_ease] hover:[color:#1A1160] hover:[background:#EDE9FF] hover:[box-shadow:0_8px_18px_rgba(28,_28,_26,_0.08)] hover:[transform:translateY(-1px)]"} data-site-header-link data-site-header-active-link={isActivePath("/locations") ? "" : undefined}>
            Location Directory
          </Link>
          <Link href="/roles" className={"inline-flex [align-items:center] [justify-content:center] [min-height:36px] [padding:0_12px] [border-radius:999px] [font-size:0.82rem] font-bold [color:#1C1C1A] no-underline [transition:background_0.18s_ease,_color_0.18s_ease,_transform_0.18s_ease,_box-shadow_0.18s_ease] hover:[color:#1A1160] hover:[background:#EDE9FF] hover:[box-shadow:0_8px_18px_rgba(28,_28,_26,_0.08)] hover:[transform:translateY(-1px)]"} data-site-header-link data-site-header-active-link={isActivePath("/roles") ? "" : undefined}>
            Role Directory
          </Link>
          <Link href="/post-a-job" className={"inline-flex [align-items:center] [justify-content:center] [min-height:36px] [padding:0_12px] [border-radius:999px] [font-size:0.82rem] font-bold [color:#1C1C1A] no-underline [transition:background_0.18s_ease,_color_0.18s_ease,_transform_0.18s_ease,_box-shadow_0.18s_ease] hover:[color:#1A1160] hover:[background:#EDE9FF] hover:[box-shadow:0_8px_18px_rgba(28,_28,_26,_0.08)] hover:[transform:translateY(-1px)]"} data-site-header-link data-site-header-active-link={isActivePath("/post-a-job") ? "" : undefined}>
            Post A Job
          </Link>
        </nav>
        <div className={"flex [align-items:center] [flex-wrap:wrap] [justify-content:flex-end] [gap:8px_12px] [flex:1_1_0] min-w-0 max-[1180px]:hidden"}>
          <Link href="/sign-in" className={"inline-flex [align-items:center] [justify-content:center] [min-height:36px] [padding:0_12px] [border-radius:999px] [font-size:0.82rem] font-bold [color:#1C1C1A] no-underline [transition:background_0.18s_ease,_color_0.18s_ease,_transform_0.18s_ease,_box-shadow_0.18s_ease] hover:[color:#1A1160] hover:[background:#EDE9FF] hover:[box-shadow:0_8px_18px_rgba(28,_28,_26,_0.08)] hover:[transform:translateY(-1px)]"} data-site-header-link data-site-header-active-link={isActivePath("/sign-in") ? "" : undefined}>
            Sign in
          </Link>
          <Link href="/get-started" className={"inline-flex [align-items:center] [justify-content:center] [min-height:38px] [padding:0_14px] [border-radius:999px] [font-size:0.8rem] font-extrabold [color:#1C1C1A] no-underline [background:#FFFFFF] [border:1px_solid_rgba(0,_0,_0,_0.08)] [box-shadow:0_14px_28px_rgba(28,_28,_26,_0.08)] hover:[background:#EDE9FF] hover:[color:#1A1160]"} data-site-header-cta>
            Get started
          </Link>
        </div>
        <div
          id="site-header-mobile-nav"
          ref={mobilePanelRef}
          className="hidden h-0 opacity-0 max-[1180px]:fixed max-[1180px]:left-[10px] max-[1180px]:right-[10px] max-[1180px]:top-[66px] max-[1180px]:z-40 max-[1180px]:mx-auto max-[1180px]:block max-[1180px]:max-w-[520px] max-[1180px]:overflow-hidden max-[1180px]:rounded-[22px] max-[1180px]:border max-[1180px]:border-[rgba(0,0,0,0.08)] max-[1180px]:bg-[#FFFFFF] max-[1180px]:shadow-[0_22px_44px_rgba(28,28,26,0.18)] max-[1180px]:pointer-events-none"
          data-site-header-mobile-panel
        >
          <div className={"max-[1180px]:grid max-[1180px]:[gap:8px] max-[1180px]:[padding:10px_2px_4px]"}>
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={"max-[1180px]:flex max-[1180px]:[align-items:center] max-[1180px]:[gap:10px] max-[1180px]:[min-height:44px] max-[1180px]:[padding:0_14px] max-[1180px]:[border-radius:14px] max-[1180px]:no-underline max-[1180px]:[font-size:0.9rem] max-[1180px]:font-bold max-[1180px]:[color:#1C1C1A] max-[1180px]:[background:#FFFFFF] max-[1180px]:[border:1px_solid_rgba(0,_0,_0,_0.08)] max-[1180px]:hover:[background:#EDE9FF]"} onClick={closeMenu} data-site-header-mobile-link data-site-header-mobile-item data-site-header-active-link={isActivePath(item.href) ? "" : undefined}>
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-[#5B4FE8]" data-site-header-mobile-icon />
                  {item.label}
                </Link>
              );
            })}
            <Link href="/get-started" className={"max-[1180px]:flex max-[1180px]:[align-items:center] max-[1180px]:[gap:10px] max-[1180px]:[min-height:44px] max-[1180px]:[padding:0_14px] max-[1180px]:[border-radius:14px] max-[1180px]:no-underline max-[1180px]:[font-size:0.9rem] max-[1180px]:font-bold max-[1180px]:[justify-content:center] max-[1180px]:[color:#FFFFFF] max-[1180px]:[background:#5B4FE8] max-[1180px]:[border:1px_solid_#5B4FE8] max-[1180px]:[box-shadow:0_12px_24px_rgba(91,_79,_232,_0.16)] max-[1180px]:hover:[background:#1A1160]"} onClick={closeMenu} data-site-header-mobile-cta data-site-header-mobile-item>
              <FiPlusCircle aria-hidden className="h-4 w-4 shrink-0 text-[#FFFFFF]" />
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import gsap from "gsap";

export default function CustomSelect({
  value,
  onChange,
  options = [],
  label = "",
  minWidthClass = "min-w-[140px]",
  buttonClassName = "",
  menuAlign = "left",
  buttonMinHeightClass = "min-h-11",
  menuPlacement = "down",
}) {
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const selected = options.find((option) => option.value === value) || options[0] || null;

  useEffect(() => {
    if (open) setRenderMenu(true);
  }, [open]);

  useEffect(() => {
    if (!renderMenu) {
      setMenuStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const minWidth = rect.width;
      const top = menuPlacement === "up" ? rect.top - 8 : rect.bottom + 8;
      const left = menuAlign === "right" ? rect.right - minWidth : rect.left;
      setMenuStyle({
        position: "fixed",
        top,
        left,
        minWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [renderMenu, menuAlign, menuPlacement]);

  useEffect(() => {
    const handleClick = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!renderMenu || !menuRef.current) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!open) setRenderMenu(false);
      return undefined;
    }

    const element = menuRef.current;
    gsap.killTweensOf(element);

    if (open) {
      gsap.fromTo(
        element,
        {
          autoAlpha: 0,
          y: menuPlacement === "up" ? 10 : -10,
          scale: 0.98,
          transformOrigin: menuPlacement === "up" ? "50% 100%" : "50% 0%",
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.22,
          ease: "power2.out",
        }
      );
      return undefined;
    }

    gsap.to(element, {
      autoAlpha: 0,
      y: menuPlacement === "up" ? 8 : -8,
      scale: 0.985,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => setRenderMenu(false),
    });
    return undefined;
  }, [open, renderMenu, menuPlacement]);

  const menu = (
    <div
      ref={menuRef}
      style={
        menuStyle
          ? {
              ...menuStyle,
              transform: menuPlacement === "up" ? "translateY(-100%)" : undefined,
            }
          : undefined
      }
      className={`z-[1200] min-w-full overflow-hidden rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-1 shadow-[0_18px_38px_rgba(28,28,26,0.14)] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      role="listbox"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={`flex min-h-10 w-full items-center justify-between rounded-[7px] px-3 text-left text-sm font-bold transition ${
              active
                ? "bg-[#5B4FE8] text-[#FFFFFF]"
                : "bg-[#FFFFFF] text-[#1C1C1A] hover:bg-[#F7F7F8]"
            }`}
          >
            <span>{option.label}</span>
            {active ? <FiCheck aria-hidden className="h-4 w-4" /> : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className={`relative isolate ${open ? "z-[140]" : "z-[1]"} ${minWidthClass}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex ${buttonMinHeightClass} w-full items-center justify-between gap-3 rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-3 text-left text-sm font-bold text-[#1C1C1A] shadow-[0_10px_24px_rgba(28,28,26,0.04)] transition hover:border-[rgba(91,79,232,0.24)] ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label || selected?.label || "Select option"}
      >
        <span className="truncate">{selected?.label || ""}</span>
        <FiChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-[#5B4FE8] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {renderMenu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}

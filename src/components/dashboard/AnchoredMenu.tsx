"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Menu ancre sous un bouton, rendu hors du tableau.
 *
 * Un menu en position absolue a l'interieur d'un tableau est rogne : le
 * conteneur porte `overflow-x-auto` pour le defilement horizontal, et en
 * CSS un debordement horizontal non visible force aussi le vertical. Le
 * menu se retrouve coupe au ras de la carte, surtout sur la derniere
 * ligne.
 *
 * Il est donc pose dans un calque au niveau du document, positionne a
 * partir de la position reelle du bouton, et bascule au-dessus de
 * celui-ci quand le bas de la fenetre est trop proche.
 */
export default function AnchoredMenu({
  open,
  anchorRef,
  onClose,
  width = 192,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null
  );

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    function place() {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const height = menu?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = height > 0 && spaceBelow < height + 12;

      setPosition({
        top: above ? rect.top - height - 4 : rect.bottom + 4,
        // Aligne le bord droit du menu sur celui du bouton, sans jamais
        // sortir de la fenetre.
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      });
    }

    place();
    // Une seconde passe une fois le menu mesure : sa hauteur decide s'il
    // s'ouvre vers le haut.
    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width,
      }}
      className="z-[80] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
    >
      {children}
    </div>,
    document.body
  );
}

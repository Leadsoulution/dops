"use client";

import { useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import AnchoredMenu from "./AnchoredMenu";

/**
 * Le point d'interrogation d'une carte, et ce qu'il explique.
 *
 * Un chiffre financier ne se discute pas sans sa methode : savoir que
 * le profit vaut onze mille dirhams ne sert a rien si l'on ignore ce
 * qui a ete compte dedans. L'explication est donc a cote du chiffre,
 * cachee tant qu'on ne la demande pas.
 *
 * La bulle est posee dans un calque au niveau du document, comme les
 * menus : les cartes portent `overflow-hidden` pour leurs courbes, et
 * une bulle en position absolue y serait coupee net.
 *
 * Elle s'ouvre au survol pour une souris et au toucher pour un
 * telephone — ou il n'y a pas de survol, et ou un point d'interrogation
 * qui ne repond pas au doigt ne sert a rien.
 */
export default function InfoTip({
  title,
  children,
  width = 272,
}: {
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`Methode de calcul : ${title}`}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Au doigt, le survol n'existe pas : le toucher ouvre, et un
        // toucher ailleurs referme. Ouvrir sans basculer evite que le
        // clic de souris referme la bulle que le survol vient d'ouvrir.
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full text-gray-300 transition-colors hover:text-gray-600"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <AnchoredMenu
        open={open}
        anchorRef={ref}
        onClose={() => setOpen(false)}
        width={width}
      >
        <div className="px-3 py-2.5">
          <p className="mb-1 text-[11.5px] font-semibold text-gray-900">
            {title}
          </p>
          <div className="space-y-1.5 text-[11.5px] leading-relaxed text-gray-600">
            {children}
          </div>
        </div>
      </AnchoredMenu>
    </>
  );
}

/** La formule, mise en evidence au milieu d'une explication. */
export function Formule({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-700">
      {children}
    </p>
  );
}

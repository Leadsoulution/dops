"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  PhoneCall,
  Activity,
  Package,
  Puzzle,
  Users,
  Wallet,
  UserCog,
  MapPin,
  Settings,
  LogOut,
  Loader2,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { useSignOut } from "@/components/auth/useSignOut";
import {
  APP_SECTIONS,
  canAccess,
  effectiveAccess,
  firstAllowedHref,
} from "@/lib/access";
import type { SessionProfile } from "@/lib/supabase/auth";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  leads: ShoppingCart,
  confirmation: PhoneCall,
  "perf-agents": Activity,
  products: Package,
  integrations: Puzzle,
  fournisseurs: Users,
  villes: MapPin,
  finance: Wallet,
  utilisateurs: UserCog,
  parametres: Settings,
};

const GROUPS = [...new Set(APP_SECTIONS.map((s) => s.group))];

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { signOut, signingOut } = useSignOut();
  const router = useRouter();
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  /**
   * La barre laterale porte les regles de navigation : elle masque les
   * pages interdites, et renvoie ailleurs quiconque en ouvre une par son
   * adresse. C'est un garde-fou d'affichage ; les operations sensibles
   * sont refusees cote serveur, dans les routes d'API.
   */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.profile) return;
        setProfile(data.profile);
        if (!canAccess(data.profile, pathname)) {
          router.replace(firstAllowedHref(data.profile));
        }
      })
      .catch(() => {
        /* Sans profil, la barre affiche tout : le serveur reste juge. */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Tant que le profil n'est pas connu, la barre affiche tout : masquer
  // puis reafficher ferait clignoter la navigation a chaque page.
  const allowedKeys = profile ? effectiveAccess(profile) : null;
  const allowed = (key: string) => !allowedKeys || allowedKeys.includes(key);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[248px] shrink-0 flex-col bg-[#0B1120] text-slate-300 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="flex items-center justify-between gap-2.5 px-5 py-5">
        {/*
          Le fond du logo a ete detoure : il se pose directement sur le
          #0B1120 de la barre laterale, sans rectangle visible.
        */}
        <Link href="/" className="min-w-0">
          <Image
            src="/logo-orderly.png"
            alt="Orderly - Gestion des commandes"
            width={720}
            height={168}
            priority
            className="h-9 w-auto lg:h-10"
          />
        </Link>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => {
          const items = APP_SECTIONS.filter(
            (s) => s.group === group && allowed(s.key)
          );
          // Un groupe dont toutes les pages sont interdites disparait,
          // titre compris : un intitule seul n'apprend rien.
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-4">
              <p className="mb-1 px-3 text-[10.5px] font-semibold tracking-wider text-slate-500">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ICONS[item.key];
                  const active = item.href === pathname;
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                          active
                            ? "bg-blue-600 font-medium text-white"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/5 px-3 py-3">
        <button
          onClick={signOut}
          disabled={signingOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 className="h-[17px] w-[17px] animate-spin" />
          ) : (
            <LogOut className="h-[17px] w-[17px]" />
          )}
          <span>{signingOut ? "Deconnexion..." : "Deconnexion"}</span>
        </button>
      </div>
      </aside>
    </>
  );
}

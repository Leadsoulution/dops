"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  Search,
  ShoppingCart,
  CheckCircle2,
  PackageCheck,
  Moon,
  Bell,
  BellRing,
  ChevronDown,
  Settings,
  LogOut,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { leads, type Lead } from "./leads-data";
import OrderWatcher from "./OrderWatcher";
import NotificationNudge from "./NotificationNudge";
import {
  askNotificationPermission,
  notificationState,
  notify,
  unlockAudio,
  subscribeToPush,
  sendTestPush,
  type NotificationPermissionState,
} from "@/lib/notifications";
import type { SessionProfile } from "@/lib/supabase/auth";
import { useSignOut } from "@/components/auth/useSignOut";
import { currentProfile } from "@/lib/session";

const notifications = [
  {
    icon: AlertTriangle,
    color: "text-amber-500",
    text: "8 leads en attente de premiere confirmation",
    time: "Il y a 12 min",
  },
  {
    icon: RefreshCw,
    color: "text-blue-500",
    text: "Google Sheets necessite une reconnexion",
    time: "Il y a 2h",
  },
];

function formatPhone(phone: string) {
  return phone.startsWith("0") ? `+212${phone.slice(1)}` : phone;
}

function SearchResultsPanel({
  results,
  onSelect,
}: {
  results: Lead[];
  onSelect: (lead: Lead) => void;
}) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[280px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
      <p className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-wide text-gray-400">
        RESULTATS
      </p>
      {results.map((lead) => (
        <button
          key={lead.id}
          onClick={() => onSelect(lead)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-gray-800">
              {lead.reference}
            </p>
            <p className="truncate text-[12px] text-gray-400">
              {lead.client} - {formatPhone(lead.phone)}
            </p>
          </div>
          <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-gray-400">
            {lead.status}
          </span>
        </button>
      ))}
    </div>
  );
}

type LeadStats = { total: number; confirmees: number; nonConfirmees: number };

/** Un tiret tant que le compte n'est pas connu : zero serait un mensonge. */
function formatCount(value?: number) {
  return value === undefined ? "—" : value.toLocaleString("fr-FR");
}

/** La permission ne change pas toute seule : rien a surveiller. */
function subscribeNothing() {
  return () => {};
}

/** "Mohamed Alaoui" -> "MA" ; une seule initiale si un seul mot. */
function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const { signOut, signingOut } = useSignOut();
  const [stats, setStats] = useState<LeadStats | null>(null);

  /**
   * Compteurs de commandes, relus toutes les trente secondes : une
   * commande confirmee par un collegue doit se voir dans l'en-tete sans
   * recharger la page.
   */
  useEffect(() => {
    let cancelled = false;

    function load() {
      if (document.hidden) return;
      fetch("/api/leads/stats")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && !data.error) setStats(data);
        })
        .catch(() => {
          /* Compteurs laisses en l'etat plutot qu'a zero. */
        });
    }

    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  // La permission est un etat du navigateur, pas de React : la lire par
  // `useSyncExternalStore` evite un reglage fige au premier rendu, et le
  // serveur rend "default" comme le premier rendu du navigateur.
  const [granted, setGranted] = useState<NotificationPermissionState | null>(
    null
  );
  const browserState = useSyncExternalStore(
    subscribeNothing,
    notificationState,
    () => "default" as NotificationPermissionState
  );
  const alertState = granted ?? browserState;
  const [pushNote, setPushNote] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Qui est connecte : la reponse vient du serveur, le navigateur ne peut
  // pas se l'inventer.
  useEffect(() => {
    let cancelled = false;
    currentProfile().then((profile) => {
      if (!cancelled && profile) setProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = query.trim()
    ? leads
        .filter(
          (lead) =>
            lead.reference.toLowerCase().includes(query.toLowerCase()) ||
            lead.client.toLowerCase().includes(query.toLowerCase()) ||
            lead.phone.includes(query)
        )
        .slice(0, 5)
    : [];

  const showResults = focused && results.length > 0;

  function selectResult(lead: Lead) {
    setQuery("");
    setFocused(false);
    setMobileSearchOpen(false);
    router.push(`/?lead=${lead.id}`);
  }

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white">
      {/* Surveille les commandes depuis toutes les pages. N'affiche rien. */}
      <OrderWatcher />
      <NotificationNudge />
      <div className="flex h-16 items-center gap-2 px-4 lg:gap-4 lg:px-6">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative hidden w-full max-w-md lg:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Rechercher leads, produits, commandes..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-14 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-gray-400">
            Ctrl K
          </span>
          {showResults && (
            <SearchResultsPanel results={results} onSelect={selectResult} />
          )}
        </div>

        <button
          onClick={() => setMobileSearchOpen((v) => !v)}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 lg:hidden"
        >
          <Search className="h-5 w-5" />
        </button>

        <div className="ml-auto flex items-center gap-1 lg:gap-2.5">
          <div className="hidden items-center gap-2.5 lg:flex">
            <div
              title="Total des commandes"
              className="relative flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[13px] font-medium text-blue-700"
            >
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500" />
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="font-mono">{formatCount(stats?.total)}</span>
            </div>
            <div
              title="Commandes confirmees"
              className="flex items-center gap-1.5 rounded-lg border border-green-100 bg-green-50 px-2.5 py-1.5 text-[13px] font-medium text-green-700"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-mono">{formatCount(stats?.confirmees)}</span>
            </div>
            <div
              title="Commandes non confirmees"
              className="flex items-center gap-1.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1.5 text-[13px] font-medium text-orange-700"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              <span className="font-mono">{formatCount(stats?.nonConfirmees)}</span>
            </div>
          </div>

          <button
            disabled
            title="Bientot disponible"
            className="hidden cursor-not-allowed items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-gray-300 lg:ml-1.5 lg:flex"
          >
            FR
            <ChevronDown className="h-3.5 w-3.5 text-gray-300" />
          </button>

          <button
            disabled
            title="Bientot disponible"
            className="cursor-not-allowed rounded-lg p-2 text-gray-300"
          >
            <Moon className="h-[18px] w-[18px]" />
          </button>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-50"
            >
              <Bell className="h-[18px] w-[18px]" />
              {notifications.length > 0 && (
                <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 font-mono text-[9px] font-semibold text-white">
                  {notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
                <p className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-wide text-gray-400">
                  NOTIFICATIONS
                </p>

                {/* Alertes systeme : elles ne s'activent que sur demande
                    explicite, le navigateur l'exige. */}
                <div className="mx-1.5 mb-1.5 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                  {alertState === "granted" ? (
                    <p className="flex items-center gap-1.5 text-[12px] text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Alertes activees
                      <button
                        onClick={async () => {
                          notify("Test", "Une commande livree sonne ainsi.", {
                            kind: "payment",
                          });
                          const { sent, reason } = await sendTestPush();
                          setPushNote(
                            sent > 0
                              ? `Envoye a ${sent} appareil(s).`
                              : (reason ?? "Aucun appareil abonne pour l'instant.")
                          );
                        }}
                        className="ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Tester
                      </button>
                    </p>
                  ) : alertState === "denied" ? (
                    <p className="text-[11.5px] text-gray-500">
                      Les notifications sont bloquees pour ce site. Autorisez-les
                      dans les reglages du navigateur pour etre prevenu.
                    </p>
                  ) : alertState === "unsupported" ? (
                    <p className="text-[11.5px] text-gray-500">
                      Ce navigateur ne gere pas les notifications systeme. Le son
                      reste joue.
                    </p>
                  ) : (
                    <button
                      onClick={async () => {
                        unlockAudio();
                        const state = await askNotificationPermission();
                        setGranted(state);
                        if (state !== "granted") return;
                        // L'abonnement push est ce qui permet de sonner
                        // application fermee.
                        const result = await subscribeToPush();
                        setPushNote(
                          result.ok
                            ? "Cet appareil recevra les alertes, meme application fermee."
                            : result.reason
                        );
                      }}
                      className="flex w-full items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-gray-800"
                    >
                      <BellRing className="h-3.5 w-3.5" />
                      Activer les alertes
                    </button>
                  )}
                  {pushNote && (
                    <p className="mt-1.5 text-[11px] text-gray-500">{pushNote}</p>
                  )}
                </div>
                {notifications.map((notif) => {
                  const Icon = notif.icon;
                  return (
                    <div
                      key={notif.text}
                      className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50"
                    >
                      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${notif.color}`} />
                      <div className="min-w-0">
                        <p className="text-[12.5px] text-gray-700">{notif.text}</p>
                        <p className="text-[11px] text-gray-400">{notif.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 hover:bg-gray-50"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold text-white ${
                  profile?.avatarColor ?? "bg-gray-900"
                }`}
              >
                {initials(profile?.name)}
              </span>
              <span className="hidden text-[13px] font-medium text-gray-700 lg:inline">
                {profile?.name ?? "..."}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 lg:block" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-gray-800">
                    {profile?.name ?? "Utilisateur"}
                  </p>
                  <p className="truncate text-[11.5px] text-gray-400">
                    {profile?.email ?? ""}
                  </p>
                </div>
                <Link
                  href="/parametres"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                >
                  <Settings className="h-3.5 w-3.5 text-gray-400" />
                  Parametres
                </Link>
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {signingOut ? "Deconnexion..." : "Deconnexion"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="border-t border-gray-100 px-4 py-2.5 lg:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Rechercher leads, produits, commandes..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
            />
            {showResults && (
              <SearchResultsPanel results={results} onSelect={selectResult} />
            )}
          </div>
        </div>
      )}
    </header>
  );
}

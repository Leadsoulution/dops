"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Clock,
  Globe,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  RotateCcw,
  Truck,
} from "lucide-react";
import type { FollowUpLead } from "@/lib/supabase/follow-up";
import { whatsappAppChat, whatsappNumber } from "@/lib/whatsapp";
import { openWhatsapp } from "@/lib/open-outside";

/**
 * Les commandes qui attendent un geste.
 *
 * Deux files, deux metiers. Avant l'expedition, un client qu'on
 * n'arrive pas a joindre. Apres, un colis qui stagne chez le
 * transporteur et qui deviendra un retour si personne n'appelle.
 *
 * Les plus anciennes en tete : c'est le dossier de douze jours qu'il
 * faut traiter, pas celui d'hier.
 */

type Data = { confirmation: FollowUpLead[]; livraison: FollowUpLead[] };

const nf = new Intl.NumberFormat("fr-FR");

export default function SuiviPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"confirmation" | "livraison">(
    "confirmation"
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/follow-up")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.error) setError(body.error);
        else setData(body as Data);
      })
      .catch(() => {
        if (!cancelled) setError("Liste indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liste = data?.[onglet] ?? [];
  const enRetard = liste.filter((l) => l.late).length;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-h2 font-semibold text-gray-900">
          <CalendarClock className="h-5 w-5 text-gray-400" />
          Suivi
        </h1>
        <p className="text-[12.5px] text-gray-500">
          Les commandes qui attendent un appel, les plus anciennes d&apos;abord.
        </p>
      </div>

      {/* Les deux files, comme deux pastilles. */}
      <div className="mb-4 flex items-center gap-2">
        <Onglet
          actif={onglet === "confirmation"}
          onClick={() => setOnglet("confirmation")}
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Confirmation"
          count={data?.confirmation.length}
        />
        <Onglet
          actif={onglet === "livraison"}
          onClick={() => setOnglet("livraison")}
          icon={<Truck className="h-3.5 w-3.5" />}
          label="Livraison"
          count={data?.livraison.length}
        />
      </div>

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {!data && !error && (
        <p className="flex items-center gap-2 py-10 text-[13px] text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lecture des dossiers...
        </p>
      )}

      {data && enRetard > 0 && (
        <p className="mb-3 flex items-center gap-2 text-[12.5px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">{nf.format(enRetard)}</span> en
            retard sur {nf.format(liste.length)}.
          </span>
        </p>
      )}

      {data && liste.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white py-16 text-center text-[13px] text-gray-400">
          Rien a relancer dans cette file.
        </p>
      )}

      <div className="space-y-3">
        {liste.map((lead) => (
          <Carte key={lead.id} lead={lead} />
        ))}
      </div>
    </main>
  );
}

function Onglet({
  actif,
  onClick,
  icon,
  label,
  count,
}: {
  actif: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
        actif
          ? "bg-blue-600 text-white"
          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {icon}
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold ${
          actif ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        {count === undefined ? "-" : nf.format(count)}
      </span>
    </button>
  );
}

/**
 * Un dossier.
 *
 * Deux colonnes sur grand ecran : ce qu'il faut savoir a gauche, ce
 * qu'on peut faire a droite. Sur telephone elles s'empilent, les
 * actions en dernier — on lit avant d'agir.
 */
function Carte({ lead }: { lead: FollowUpLead }) {
  const tel = lead.phone?.trim();

  return (
    <article
      className={`overflow-hidden rounded-xl border-2 bg-white ${
        lead.late ? "border-red-200" : "border-gray-200"
      }`}
    >
      <div className="flex flex-col lg:flex-row">
        {/* --- Ce qu'il faut savoir --------------------------------- */}
        <div className="min-w-0 flex-1 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900">
              {lead.client}
            </h2>
            {lead.late && (
              <span className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" />
                EN RETARD
              </span>
            )}
            {/*
              Le statut a droite, en gras et sombre : c'est ce qu'on
              cherche en parcourant la liste, et une pastille pale
              perdue entre le nom et la reference se lisait en dernier.
            */}
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[13.5px] font-bold text-gray-900">
                {lead.status}
              </span>
              <span className="rounded-md border border-gray-200 px-2 py-0.5 font-mono text-[11.5px] text-gray-500">
                {lead.reference}
              </span>
            </span>
          </div>

          <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-gray-500">
            {tel && (
              <span className="flex items-center gap-1 font-mono">
                <Phone className="h-3 w-3 shrink-0" />
                {tel}
              </span>
            )}
            {lead.ville && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {lead.ville}
              </span>
            )}
            {(lead.adresse || lead.quartier) && (
              <span className="min-w-0 truncate">
                {[lead.adresse, lead.quartier].filter(Boolean).join(", ")}
              </span>
            )}
          </p>

          <div className="mb-3 flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            {lead.productImage ? (
              <Image
                src={lead.productImage}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-[10px] font-medium text-gray-500">
                {lead.productLabel || <Package className="h-4 w-4" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-gray-800">
                {lead.productName || "Produit inconnu"}
              </p>
              <p className="text-[12px] text-gray-500">x{lead.itemCount}</p>
            </div>
            <p className="shrink-0 font-mono text-[14px] font-semibold text-gray-900">
              {lead.amount}
            </p>
          </div>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Cree : {lead.date}
            </span>
            {lead.source && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3 shrink-0" />
                {lead.source}
              </span>
            )}
            {lead.trackingNumber && (
              <span className="font-mono">{lead.trackingNumber}</span>
            )}
          </p>

          {lead.note && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] italic text-amber-900">
              <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              &laquo;&nbsp;{lead.note}&nbsp;&raquo;
            </p>
          )}
        </div>

        {/* --- Ce qu'on peut faire ---------------------------------- */}
        <div className="shrink-0 border-t border-gray-100 bg-gray-50/60 p-4 lg:w-60 lg:border-l lg:border-t-0">
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-[12px] ${
              lead.late ? "bg-red-50 text-red-700" : "bg-white text-gray-600"
            }`}
          >
            <p className="flex items-center gap-1.5 font-medium">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              Derniere action
            </p>
            <p className="mt-0.5">
              {lead.daysWaiting === 0
                ? "aujourd'hui"
                : `il y a ${lead.daysWaiting} jour${lead.daysWaiting > 1 ? "s" : ""}`}
            </p>
          </div>

          {tel ? (
            <a
              href={`tel:${tel}`}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-[13px] font-medium text-white hover:bg-blue-700"
            >
              <Phone className="h-4 w-4" />
              Appeler maintenant
            </a>
          ) : (
            <p className="mb-2 rounded-lg border border-gray-200 py-2 text-center text-[12px] text-gray-400">
              Pas de numero
            </p>
          )}

          {tel && (
            <button
              onClick={() =>
                openWhatsapp(
                  whatsappAppChat(tel),
                  `https://wa.me/${whatsappNumber(tel)}`
                )
              }
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2 text-[12.5px] font-medium text-white hover:bg-[#1eb855]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          )}

          <div className="flex gap-2">
            {lead.delivererPhone && (
              <a
                href={`tel:${lead.delivererPhone}`}
                title={lead.deliverer ?? "Livreur"}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                <Truck className="h-3.5 w-3.5" />
                Livreur
              </a>
            )}
            <a
              href={`/?lead=${lead.id}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Ouvrir
            </a>
          </div>

          {lead.trackingNumber && (
            <p className="mt-2 flex items-center justify-center gap-1 text-[11.5px] text-gray-400">
              <RotateCcw className="h-3 w-3" />
              {lead.deliverer ?? "Livreur non attribue"}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

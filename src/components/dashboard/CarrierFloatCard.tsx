"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2, Wallet } from "lucide-react";

/**
 * L'argent encaisse par le transporteur et pas encore verse.
 *
 * Le livreur prend l'argent des la remise du colis ; il arrive sur le
 * compte bien plus tard. Entre les deux, la somme n'est ni dans la
 * caisse ni dans les commandes en cours : elle n'apparait nulle part,
 * alors que c'est souvent le plus gros poste d'un vendeur en paiement a
 * la livraison.
 */

type Float = {
  amount: number;
  orders: number;
  pendingInvoice: { amount: number; orders: number };
  invoiced: { amount: number; orders: number };
  oldestDays: number | null;
  oldestDate: string | null;
  overWeek: number;
};

const nf = new Intl.NumberFormat("fr-FR");

/** Au-dela, la somme dort depuis trop longtemps pour passer inapercue. */
const SEUIL_ALERTE_JOURS = 7;

export default function CarrierFloatCard() {
  const [data, setData] = useState<Float | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/carrier-float")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Chiffre indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const alerte = (data?.oldestDays ?? 0) >= SEUIL_ALERTE_JOURS;

  return (
    <div
      className={`rounded-xl border-2 bg-white p-5 ${
        alerte ? "border-amber-400" : "border-gray-200"
      }`}
    >
      <p
        className={`mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide ${
          alerte ? "text-amber-700" : "text-gray-500"
        }`}
      >
        <Wallet className="h-4 w-4" />
        COD ENCAISSE PAR LE TRANSPORTEUR, PAS ENCORE VERSE
      </p>

      {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}

      {!data && !error && (
        <p className="flex items-center gap-2 py-3 text-[12.5px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Calcul...
        </p>
      )}

      {data && (
        <>
          <p className="font-mono text-[30px] font-semibold text-gray-900">
            {nf.format(data.amount)}{" "}
            <span className="text-[16px] font-medium text-gray-500">DH</span>
          </p>
          <p className="text-[12px] text-gray-500">
            {nf.format(data.orders)} commande{data.orders > 1 ? "s" : ""} livree
            {data.orders > 1 ? "s" : ""}, argent pris par le livreur.
          </p>

          <div className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Livre, pas encore facture</span>
              <span className="shrink-0 font-mono text-gray-800">
                {nf.format(data.pendingInvoice.amount)} DH
                <span className="ml-1.5 text-gray-400">
                  ({data.pendingInvoice.orders})
                </span>
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Facture, versement non constate</span>
              <span className="shrink-0 font-mono text-gray-800">
                {nf.format(data.invoiced.amount)} DH
                <span className="ml-1.5 text-gray-400">
                  ({data.invoiced.orders})
                </span>
              </span>
            </div>
          </div>

          {data.oldestDays !== null && (
            <p
              className={`mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12px] ${
                alerte
                  ? "bg-amber-50 text-amber-800"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              {alerte ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>
                La plus ancienne attend depuis{" "}
                <span className="font-medium">{data.oldestDays} jours</span>
                {data.overWeek > 0 && (
                  <>
                    , et {nf.format(data.overWeek)} depassent la semaine
                  </>
                )}
                .
              </span>
            </p>
          )}

          {/*
            Aucun colis de ce compte n'a jamais porte "Paye" : une facture
            emise et un virement recu s'y ressemblent. Le dire evite de
            prendre ce total pour une dette certaine.
          */}
          {data.invoiced.orders === 0 && data.orders > 0 && (
            <p className="mt-2 text-[11.5px] text-gray-400">
              Le transporteur ne marque jamais &laquo; Paye &raquo; : ce total
              suppose qu&apos;aucun virement n&apos;est arrive. Rapprochez-le de
              votre releve bancaire.
            </p>
          )}
        </>
      )}
    </div>
  );
}

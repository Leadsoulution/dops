import type { Metadata } from "next";
import { Check, MapPin, Package, Truck, Warehouse, XCircle } from "lucide-react";
import { getParcelDetail, getTracking } from "@/lib/forcelog/client";
import {
  STEPS,
  viewForStatus,
  stepDates,
  type StepKey,
} from "@/lib/forcelog/tracking-steps";
import type { ForceLogTrackingEvent } from "@/lib/forcelog/types";

/**
 * Suivi public d'un colis.
 *
 * Page ouverte a tous : c'est son adresse qu'on envoie au client. Elle
 * ne montre donc que ce qu'il sait deja de sa propre commande — ou en
 * est son colis, et dans quelle ville. Ni telephone, ni adresse, ni
 * montant : le numero de suivi voyage par WhatsApp, il peut etre lu par
 * d'autres yeux que les siens.
 */

export const dynamic = "force-dynamic";

const ICONS: Record<StepKey, typeof Package> = {
  created: Package,
  collected: Warehouse,
  processing: Truck,
  delivering: Truck,
  delivered: Check,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Suivi ${code}`,
    description: "Suivez votre colis en temps reel.",
    // Une page de suivi n'a rien a faire dans un moteur de recherche :
    // elle porte le numero de commande d'une personne.
    robots: { index: false, follow: false },
  };
}

export default async function SuiviPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const apiKey = process.env.FORCELOG_API_KEY;

  let parcel = null;
  let history: ForceLogTrackingEvent[] = [];
  let erreur: string | null = null;

  if (!apiKey) {
    erreur = "Le suivi est momentanement indisponible.";
  } else {
    try {
      parcel = await getParcelDetail(apiKey, code);
      // L'historique est un plus : sans lui la ligne reste lisible,
      // seules les dates manquent. Son echec ne doit pas vider la page.
      history = await getTracking(apiKey, code)
        .then((t) => t.HISTORY ?? [])
        .catch(() => []);
    } catch {
      parcel = null;
    }
    if (!parcel && !erreur) erreur = "Aucun colis ne porte ce numero.";
  }

  const vue = viewForStatus(parcel?.STATUS_CODE);
  const dates = stepDates(history);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-center text-[22px] font-semibold text-gray-900">
          Suivi de votre colis
        </h1>
        <p className="mt-1 text-center font-mono text-[13px] text-gray-500">
          {code}
        </p>

        {erreur ? (
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center">
            <XCircle className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-[14px] text-gray-700">{erreur}</p>
            <p className="mt-1 text-[12.5px] text-gray-500">
              Verifiez le numero, ou contactez-nous si le doute persiste.
            </p>
          </div>
        ) : (
          <>
            <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-7">
              {vue.stopped ? (
                <div className="text-center">
                  <XCircle className="mx-auto h-9 w-9 text-red-500" />
                  <p className="mt-2 text-[16px] font-semibold text-gray-900">
                    {vue.stopped}
                  </p>
                  <p className="mt-1 text-[13px] text-gray-500">
                    Ce colis ne sera pas livre. Contactez-nous pour en savoir
                    plus.
                  </p>
                </div>
              ) : (
                <>
                  {/*
                    La ligne des etapes.

                    En colonne sur telephone : cinq pastilles cote a cote
                    y deviennent illisibles, et c'est sur telephone que le
                    client ouvre ce lien.
                  */}
                  <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0">
                    {STEPS.map((step, i) => {
                      const atteinte = i <= vue.currentIndex;
                      const courante = i === vue.currentIndex;
                      const Icone = ICONS[step.key];
                      return (
                        <li
                          key={step.key}
                          className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center"
                        >
                          <div className="flex flex-col items-center sm:w-full sm:flex-row">
                            {/* Le trait de gauche, absent sur la premiere. */}
                            <span
                              className={`hidden h-0.5 flex-1 sm:block ${
                                i === 0
                                  ? "bg-transparent"
                                  : atteinte
                                    ? "bg-emerald-500"
                                    : "bg-gray-200"
                              }`}
                            />
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                                atteinte
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-gray-200 bg-white text-gray-300"
                              } ${courante ? "ring-4 ring-emerald-100" : ""}`}
                            >
                              <Icone className="h-4 w-4" />
                            </span>
                            <span
                              className={`hidden h-0.5 flex-1 sm:block ${
                                i === STEPS.length - 1
                                  ? "bg-transparent"
                                  : i < vue.currentIndex
                                    ? "bg-emerald-500"
                                    : "bg-gray-200"
                              }`}
                            />
                            {/* Sur telephone, le trait descend. */}
                            {i < STEPS.length - 1 && (
                              <span
                                className={`my-1 h-6 w-0.5 sm:hidden ${
                                  i < vue.currentIndex
                                    ? "bg-emerald-500"
                                    : "bg-gray-200"
                                }`}
                              />
                            )}
                          </div>
                          <div className="pb-2 sm:mt-2 sm:pb-0">
                            <p
                              className={`text-[13px] ${
                                courante
                                  ? "font-semibold text-emerald-700"
                                  : atteinte
                                    ? "text-gray-700"
                                    : "text-gray-400"
                              }`}
                            >
                              {step.label}
                            </p>
                            {dates[step.key] && (
                              <p className="font-mono text-[11px] text-gray-400">
                                {dates[step.key]}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <p className="mt-6 border-t border-gray-100 pt-4 text-center text-[14px] font-medium text-gray-800">
                    {parcel?.STATUS ?? "En cours"}
                  </p>
                </>
              )}
            </section>

            {/*
              Ce que le client peut lire sans risque : sa ville et ce
              qu'il a commande. Rien qui permette a un tiers d'en
              apprendre sur lui.
            */}
            {(parcel?.CITY_NAME || parcel?.PRODUCT_NATURE) && (
              <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 text-[13px]">
                {parcel?.PRODUCT_NATURE && (
                  <p className="flex items-start gap-2 text-gray-700">
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    {parcel.PRODUCT_NATURE}
                  </p>
                )}
                {parcel?.CITY_NAME && (
                  <p className="mt-2 flex items-center gap-2 text-gray-700">
                    <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                    {parcel.CITY_NAME}
                  </p>
                )}
              </section>
            )}

            {history.length > 0 && (
              <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
                <p className="mb-3 text-[12px] font-semibold tracking-wide text-gray-500">
                  HISTORIQUE
                </p>
                <ul className="space-y-2.5">
                  {[...history].reverse().map((e, i) => (
                    <li key={`${e.TIME}-${i}`} className="flex gap-3 text-[13px]">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          i === 0 ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      />
                      <div>
                        <p className="text-gray-800">{e.STATUS_NAME}</p>
                        <p className="font-mono text-[11.5px] text-gray-400">
                          {e.TIME}
                          {e.CITY_NAME ? ` · ${e.CITY_NAME}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="mt-6 text-center text-[11.5px] text-gray-400">
          Suivi mis a jour par le transporteur.
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import {
  BadgeCheck,
  Check,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { getParcelDetail, getTracking } from "@/lib/forcelog/client";
import {
  STEPS,
  viewForStatus,
  stepDates,
  publicHistory,
  type StepKey,
} from "@/lib/forcelog/tracking-steps";
import type { ForceLogTrackingEvent } from "@/lib/forcelog/types";

/**
 * Suivi public d'un colis.
 *
 * Page ouverte a tous : c'est son adresse qu'on envoie au client par
 * WhatsApp. Elle lui montre ses propres coordonnees pour qu'il puisse
 * les verifier avant le passage du livreur — une adresse fausse se
 * corrige encore a ce moment-la, plus apres.
 *
 * Aucun mot du transporteur n'y figure : "Attente De Ramassage" ou
 * "Recu Hub" sont des termes d'entrepot qui laissent croire que rien
 * n'avance. Les statuts sont reformules du point de vue du client.
 */

export const dynamic = "force-dynamic";

const ICONS: Record<StepKey, typeof Package> = {
  collected: Package,
  shipping: Truck,
  in_city: MapPin,
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
    // Une page de suivi porte les coordonnees d'une personne : elle n'a
    // rien a faire dans un moteur de recherche.
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
  const etapes = publicHistory(history);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50/60">
      {/* Bandeau : il pose la couleur et porte le numero, que le client
          recopie parfois pour nous ecrire. */}
      <header className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 px-4 pb-16 pt-10 text-white sm:pb-20 sm:pt-14">
        <div className="mx-auto w-full max-w-5xl text-center">
          <h1 className="text-[24px] font-semibold tracking-tight sm:text-[30px]">
            Suivi de votre colis
          </h1>
          <p className="mt-2 inline-block rounded-full bg-white/15 px-3.5 py-1 font-mono text-[13px] tracking-wide backdrop-blur-sm">
            {code}
          </p>
        </div>
      </header>

      {/* Les cartes remontent sur le bandeau : c'est ce chevauchement qui
          donne la profondeur, sans ombre appuyee. */}
      <div className="mx-auto -mt-10 w-full max-w-5xl px-4 pb-14 sm:-mt-12">
        {erreur ? (
          <section className="suivi-monte suivi-relief rounded-2xl bg-white p-8 text-center">
            <XCircle className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-[15px] font-medium text-gray-800">{erreur}</p>
            <p className="mt-1 text-[13px] text-gray-500">
              Verifiez le numero, ou contactez-nous si le doute persiste.
            </p>
          </section>
        ) : (
          <>
            <section className="suivi-monte suivi-relief rounded-2xl bg-white p-5 sm:p-8">
              {vue.stopped ? (
                <div className="text-center">
                  <XCircle className="mx-auto h-11 w-11 text-red-500" />
                  <p className="mt-3 text-[18px] font-semibold text-gray-900">
                    {vue.stopped}
                  </p>
                  <p className="mt-1 text-[13.5px] text-gray-500">
                    Contactez-nous pour en savoir plus.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-6 text-center text-[17px] font-semibold text-gray-900 sm:text-[20px]">
                    {vue.headline}
                  </p>

                  {/*
                    La ligne des etapes. En colonne sur telephone : quatre
                    pastilles cote a cote y deviennent illisibles, et c'est
                    sur telephone que ce lien s'ouvre.
                  */}
                  <ol className="flex flex-col sm:flex-row sm:items-start">
                    {STEPS.map((step, i) => {
                      const atteinte = i <= vue.currentIndex;
                      const courante = i === vue.currentIndex;
                      const Icone = ICONS[step.key];
                      return (
                        <li
                          key={step.key}
                          className="suivi-monte flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-0 sm:text-center"
                          style={{ animationDelay: `${i * 110}ms` }}
                        >
                          <div className="flex flex-col items-center sm:w-full sm:flex-row">
                            <span className="relative hidden h-1 flex-1 overflow-hidden rounded-full bg-blue-100 sm:block">
                              {i > 0 && atteinte && (
                                <span
                                  className="suivi-trait absolute inset-0 rounded-full bg-blue-600"
                                  style={{ animationDelay: `${i * 110}ms` }}
                                />
                              )}
                              {i === 0 && (
                                <span className="absolute inset-0 bg-transparent" />
                              )}
                            </span>

                            <span
                              className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${
                                atteinte
                                  ? "suivi-pastille bg-gradient-to-br from-blue-500 to-blue-700 text-white"
                                  : "border-2 border-blue-100 bg-white text-blue-200"
                              } ${courante ? "suivi-halo" : ""}`}
                            >
                              <Icone className="h-5 w-5" />
                            </span>

                            <span className="relative hidden h-1 flex-1 overflow-hidden rounded-full bg-blue-100 sm:block">
                              {i < vue.currentIndex && (
                                <span
                                  className="suivi-trait absolute inset-0 rounded-full bg-blue-600"
                                  style={{ animationDelay: `${i * 110 + 60}ms` }}
                                />
                              )}
                              {i === STEPS.length - 1 && (
                                <span className="absolute inset-0 bg-transparent" />
                              )}
                            </span>

                            {/* Sur telephone, le trait descend. */}
                            {i < STEPS.length - 1 && (
                              <span
                                className={`my-1 h-7 w-1 rounded-full sm:hidden ${
                                  i < vue.currentIndex ? "bg-blue-600" : "bg-blue-100"
                                }`}
                              />
                            )}
                          </div>

                          <div className="pb-3 sm:mt-3 sm:pb-0">
                            <p
                              className={`text-[13.5px] ${
                                courante
                                  ? "font-semibold text-blue-700"
                                  : atteinte
                                    ? "font-medium text-gray-700"
                                    : "text-gray-400"
                              }`}
                            >
                              {step.label}
                            </p>
                            {dates[step.key] && (
                              <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                                {dates[step.key]}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>

            {/*
              Les informations de la commande.

              Le client les relit pour verifier son adresse et le montant
              a preparer : c'est le moment ou une erreur se corrige encore.
            */}
            <section
              className="suivi-monte suivi-relief mt-5 rounded-2xl bg-white p-5 sm:p-7"
              style={{ animationDelay: "160ms" }}
            >
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <Info icon={Package} label="Produit" value={parcel?.PRODUCT_NATURE} />
                <Info icon={User} label="Nom" value={parcel?.RECEIVER} />
                <Info icon={Phone} label="Telephone" value={parcel?.PHONE} mono />
                <Info icon={MapPin} label="Ville" value={parcel?.CITY_NAME} />
                <div className="sm:col-span-2">
                  <Info icon={MapPin} label="Adresse" value={parcel?.ADDRESS} />
                </div>
              </div>

              {/* Le montant, mis en avant : c'est la somme a preparer. */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3.5 text-white">
                <div>
                  <p className="text-[11.5px] text-blue-100">A payer a la livraison</p>
                  <p className="font-mono text-[22px] font-semibold">
                    {parcel?.PRICE ? `${Math.round(Number(parcel.PRICE))} DH` : "—"}
                  </p>
                </div>
                <p className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-medium backdrop-blur-sm">
                  <BadgeCheck className="h-4 w-4" />
                  Livraison gratuite
                </p>
              </div>
            </section>

            {etapes.length > 0 && (
              <section
                className="suivi-monte suivi-relief mt-5 rounded-2xl bg-white p-5 sm:p-7"
                style={{ animationDelay: "240ms" }}
              >
                <p className="mb-4 text-[12px] font-semibold tracking-wide text-blue-700">
                  HISTORIQUE
                </p>
                <ul className="space-y-0">
                  {[...etapes].reverse().map((e, i, tout) => (
                    <li key={`${e.time}-${i}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            i === 0 ? "bg-blue-600 ring-4 ring-blue-100" : "bg-blue-200"
                          }`}
                        />
                        {i < tout.length - 1 && (
                          <span className="my-1 w-0.5 flex-1 bg-blue-100" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p
                          className={`text-[13.5px] ${
                            i === 0 ? "font-semibold text-gray-900" : "text-gray-700"
                          }`}
                        >
                          {e.label}
                        </p>
                        <p className="font-mono text-[11.5px] text-gray-400">
                          {e.time}
                          {e.city ? ` · ${e.city}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="mt-7 text-center text-[11.5px] text-gray-400">
          Suivi mis a jour automatiquement par le transporteur.
        </p>
      </div>
    </main>
  );
}

/** Une information de la commande. Absente, elle ne laisse pas de trou. */
function Info({
  icon: Icone,
  label,
  value,
  mono,
}: {
  icon: typeof Package;
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icone className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] text-gray-400">{label}</p>
        <p
          className={`break-words text-[13.5px] text-gray-800 ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

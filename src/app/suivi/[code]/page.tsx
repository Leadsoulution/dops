import type { Metadata } from "next";
import {
  BadgeCheck,
  Check,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  PhoneCall,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { getParcelDetail, getTracking } from "@/lib/forcelog/client";
import { whatsappNumber } from "@/lib/whatsapp";
import {
  STEPS,
  viewForStatus,
  stepDates,
  publicHistory,
  noticeFor,
  type StepKey,
  type Bilingue,
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
 * Tout y est dit deux fois, en francais puis en arabe : nos clients
 * lisent l'un ou l'autre, rarement les deux.
 */

export const dynamic = "force-dynamic";

const ICONS: Record<StepKey, typeof Package> = {
  created: ClipboardCheck,
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

  const livreur = parcel?.DELIVERY_AGENT;
  const vue = viewForStatus(parcel?.STATUS_CODE);
  const dates = stepDates(history);
  const etapes = publicHistory(history);
  const avis = noticeFor(parcel?.STATUS_CODE, livreur?.PHONE);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50/60">
      <header className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 px-4 pb-16 pt-10 text-white sm:pb-20 sm:pt-14">
        <div className="mx-auto w-full max-w-5xl text-center">
          <h1
            className="text-[24px] font-semibold tracking-tight sm:text-[30px]"
            dir="rtl"
          >
            تتبع طلبكم
          </h1>
          <p className="mt-1 text-[14px] text-blue-100">Suivi de votre colis</p>
          <p className="mt-3 inline-block rounded-full bg-white/15 px-3.5 py-1 font-mono text-[13px] tracking-wide backdrop-blur-sm">
            {code}
          </p>
        </div>
      </header>

      <div className="mx-auto -mt-10 w-full max-w-5xl px-4 pb-14 sm:-mt-12">
        {erreur ? (
          <section className="suivi-monte suivi-relief rounded-2xl bg-white p-8 text-center">
            <XCircle className="mx-auto h-10 w-10 text-gray-300" />
            <p
              className="mt-3 text-[16px] font-medium text-gray-800"
              dir="rtl"
            >
              لم يتم العثور على أي طلب بهذا الرقم
            </p>
            <p className="mt-1 text-[13px] text-gray-500">{erreur}</p>
          </section>
        ) : (
          <>
            <section className="suivi-monte suivi-relief rounded-2xl bg-white p-5 sm:p-8">
              {vue.stopped ? (
                <div className="text-center">
                  <XCircle className="mx-auto h-11 w-11 text-red-500" />
                  <p
                    className="mt-3 text-[19px] font-semibold text-gray-900"
                    dir="rtl"
                  >
                    {vue.stopped.ar}
                  </p>
                  <p className="text-[14px] text-gray-500">{vue.stopped.fr}</p>
                </div>
              ) : (
                <>
                  <p
                    className="text-center text-[18px] font-semibold text-gray-900 sm:text-[22px]"
                    dir="rtl"
                  >
                    {vue.headline.ar}
                  </p>
                  <p className="mb-6 text-center text-[14px] text-blue-700">
                    {vue.headline.fr}
                  </p>

                  {/*
                    La ligne des etapes. En colonne sur telephone : cinq
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
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          <div className="flex flex-col items-center sm:w-full sm:flex-row">
                            {/* Les traits bordent la pastille ; les deux
                                extremites de la ligne restent nues. */}
                            <span
                              className={`relative hidden h-1 flex-1 overflow-hidden rounded-full sm:block ${
                                i === 0 ? "bg-transparent" : "bg-blue-100"
                              }`}
                            >
                              {i > 0 && atteinte && (
                                <span
                                  className="suivi-trait absolute inset-0 rounded-full bg-blue-600"
                                  style={{ animationDelay: `${i * 100}ms` }}
                                />
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

                            <span
                              className={`relative hidden h-1 flex-1 overflow-hidden rounded-full sm:block ${
                                i === STEPS.length - 1
                                  ? "bg-transparent"
                                  : "bg-blue-100"
                              }`}
                            >
                              {i < vue.currentIndex && (
                                <span
                                  className="suivi-trait absolute inset-0 rounded-full bg-blue-600"
                                  style={{ animationDelay: `${i * 100 + 50}ms` }}
                                />
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
                              className={`text-[14px] ${
                                courante
                                  ? "font-semibold text-blue-700"
                                  : atteinte
                                    ? "font-medium text-gray-700"
                                    : "text-gray-400"
                              }`}
                              dir="rtl"
                            >
                              {step.ar}
                            </p>
                            <p
                              className={`text-[12px] ${
                                courante
                                  ? "font-medium text-blue-600"
                                  : atteinte
                                    ? "text-gray-500"
                                    : "text-gray-300"
                              }`}
                            >
                              {step.fr}
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

                  {/*
                    Ce que le client a a faire, et rien d'autre : rester
                    joignable, ou rappeler le livreur quand il a deja
                    essaye. Un troisieme message serait du bruit sur une
                    page qu'on lit en dix secondes.
                  */}
                  {avis && (
                    <div
                      className={`mt-6 flex items-start gap-3 rounded-xl border-2 px-4 py-3.5 ${
                        avis.kind === "rappel"
                          ? "border-red-300 bg-red-50"
                          : "border-amber-300 bg-amber-50"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          avis.kind === "rappel"
                            ? "bg-red-500 text-white"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {avis.kind === "rappel" ? (
                          <PhoneCall className="h-4 w-4" />
                        ) : (
                          <Phone className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-[14.5px] font-medium ${
                            avis.kind === "rappel"
                              ? "text-red-900"
                              : "text-amber-900"
                          }`}
                          dir="rtl"
                        >
                          {avis.text.ar}
                        </p>
                        <p
                          className={`text-[12.5px] ${
                            avis.kind === "rappel"
                              ? "text-red-800"
                              : "text-amber-800"
                          }`}
                        >
                          {avis.text.fr}
                        </p>
                        {avis.kind === "rappel" && livreur?.PHONE && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <a
                              href={`tel:${livreur.PHONE.replace(/\s/g, "")}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-red-600"
                            >
                              <PhoneCall className="h-3.5 w-3.5" />
                              Appeler le livreur
                            </a>
                            <a
                              href={`https://wa.me/${whatsappNumber(livreur.PHONE)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#1eb855]"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              WhatsApp
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <section
              className="suivi-monte suivi-relief mt-5 rounded-2xl bg-white p-5 sm:p-7"
              style={{ animationDelay: "160ms" }}
            >
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <Info
                  icon={Package}
                  label={{ fr: "Produit", ar: "المنتج" }}
                  value={parcel?.PRODUCT_NATURE}
                />
                <Info
                  icon={User}
                  label={{ fr: "Nom", ar: "الاسم" }}
                  value={parcel?.RECEIVER}
                />
                <Info
                  icon={Phone}
                  label={{ fr: "Telephone", ar: "الهاتف" }}
                  value={parcel?.PHONE}
                  mono
                />
                <Info
                  icon={MapPin}
                  label={{ fr: "Ville", ar: "المدينة" }}
                  value={parcel?.CITY_NAME}
                />
                <div className="sm:col-span-2">
                  <Info
                    icon={MapPin}
                    label={{ fr: "Adresse", ar: "العنوان" }}
                    value={parcel?.ADDRESS}
                  />
                </div>

                {/* Le livreur, une fois attribue : c'est la personne qui
                    sonnera a la porte, et celle qu'on rappelle. */}
                {(livreur?.NAME || livreur?.PHONE) && (
                  <div className="sm:col-span-2">
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-blue-200 bg-blue-50/60 px-3.5 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Truck className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-blue-700">
                          <span dir="rtl">عامل التوصيل</span> · Livreur
                        </p>
                        <p className="text-[13.5px] font-medium text-gray-800">
                          {livreur?.NAME ?? "Livreur"}
                        </p>
                      </div>
                      {livreur?.PHONE && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <a
                            href={`https://wa.me/${whatsappNumber(livreur.PHONE)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-[12.5px] font-medium text-white hover:bg-[#1eb855]"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            WhatsApp
                          </a>
                          <a
                            href={`tel:${livreur.PHONE.replace(/\s/g, "")}`}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 font-mono text-[12.5px] font-medium text-white hover:bg-blue-700"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                            {livreur.PHONE}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3.5 text-white">
                <div>
                  <p className="text-[12px] text-blue-100">
                    <span dir="rtl">الثمن عند التسليم</span> · A payer a la livraison
                  </p>
                  <p className="font-mono text-[22px] font-semibold">
                    {parcel?.PRICE ? `${Math.round(Number(parcel.PRICE))} DH` : "—"}
                  </p>
                </div>
                <p className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-medium backdrop-blur-sm">
                  <BadgeCheck className="h-4 w-4" />
                  <span dir="rtl">التوصيل مجاني</span> · Livraison gratuite
                </p>
              </div>
            </section>

            {etapes.length > 0 && (
              <section
                className="suivi-monte suivi-relief mt-5 rounded-2xl bg-white p-5 sm:p-7"
                style={{ animationDelay: "240ms" }}
              >
                <p className="mb-4 text-[12px] font-semibold tracking-wide text-blue-700">
                  <span dir="rtl">سجل التتبع</span> · HISTORIQUE
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
                          className={`text-[14px] ${
                            i === 0 ? "font-semibold text-gray-900" : "text-gray-700"
                          }`}
                          dir="rtl"
                        >
                          {e.label.ar}
                        </p>
                        <p className="text-[12.5px] text-gray-500">{e.label.fr}</p>
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
  label: Bilingue;
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
        <p className="text-[11.5px] text-gray-400">
          <span dir="rtl">{label.ar}</span> · {label.fr}
        </p>
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

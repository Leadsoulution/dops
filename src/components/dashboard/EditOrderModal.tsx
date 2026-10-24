"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  Minus,
  Pencil,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import SelectDropdown from "./SelectDropdown";
import { moroccanCities, type Lead } from "./leads-data";
import { CARRIERS, carrierOfLead, type CarrierId } from "@/lib/carriers/registry";
import { normalizeCity } from "@/lib/carriers/city-match";
import {
  orderFields,
  orderLines,
  sameLines,
  type CatalogueEntry,
  type OrderLine,
} from "@/lib/order-lines";

type CatalogProduct = {
  name: string;
  price: number;
  image?: string;
  /** Code article du transporteur, pour les produits qu'il heberge. */
  ref?: string;
};

type SelectedProduct = {
  name: string;
  price: number;
  qty: number;
  image?: string;
  ref?: string;
};

/** Une ligne de commande telle que ce formulaire la manipule. */
const versSelection = (l: OrderLine): SelectedProduct => ({
  name: l.name,
  qty: l.qty,
  ref: l.ref,
  price: l.price ?? 0,
  image: l.image,
});

const versLigne = (p: SelectedProduct): OrderLine => ({
  name: p.name,
  qty: p.qty,
  ref: p.ref,
});

/** Vignette d'un produit, ou un carre neutre s'il n'a pas de photo. */
function ProductThumb({
  image,
  size,
}: {
  image?: string;
  size: "sm" | "md";
}) {
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  if (!image) {
    return <div className={`${box} shrink-0 rounded-md bg-gray-100`} />;
  }
  return (
    <div
      className={`relative ${box} shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50`}
    >
      <Image src={image} alt="" fill sizes="48px" className="object-cover" unoptimized />
    </div>
  );
}

/**
 * Les statuts de livraison de ForceLog, avec leur code machine.
 * Le libelle s'affiche, le code decide de la couleur du badge et de ce
 * qui compte comme livre dans les paiements.
 */
const DELIVERY_CHOICES: { label: string; code: string }[] = [
  { label: "Nouveau Colis", code: "NEW_PARCEL" },
  { label: "Attente De Ramassage", code: "WAITING_PICKUP" },
  { label: "Traitement Suivi en cours", code: "TSUIVI" },
  { label: "En cours de livraison", code: "DISTRIBUTION" },
  { label: "Programme", code: "PROGRAMMED" },
  { label: "Reporte", code: "POSTPONED" },
  { label: "Pas de reponse", code: "NO_ANSWER" },
  { label: "Injoignable", code: "UNREACHABLE" },
  { label: "Injoignable ( Suivi )", code: "UNREACHABLE_TEAM" },
  { label: "Livre", code: "DELIVERED" },
  { label: "Retourne", code: "RETURNED" },
  { label: "Annule", code: "CANCELED" },
  { label: "Hors-zone", code: "OUT_OF_AREA" },
  { label: "Relancer", code: "RELAUNCH" },
];

/** "AAAA-MM-JJ HH:MM" a l'heure du Maroc, comme les dates du transporteur. */
function today(): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export default function EditOrderModal({
  lead,
  onClose,
  onSave,
}: {
  lead: Lead;
  onClose: () => void;
  onSave: () => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  /*
   * Les articles de la commande, un par un.
   *
   * Le formulaire n'en montrait qu'un : le nom enregistre, en autant
   * d'exemplaires que la commande comptait d'articles. Une commande de
   * quatre produits differents se relisait donc comme un seul produit
   * en quatre exemplaires, et l'enregistrement suivant n'en gardait que
   * le premier. Les references prelevees disent exactement ce que la
   * commande contient : c'est d'elles que part la liste.
   */
  const { productName, itemCount, stockItems } = lead;
  const lignesMontage = useMemo(
    () => orderLines({ productName, itemCount, stockItems }),
    [productName, itemCount, stockItems]
  );
  const [selected, setSelected] = useState<SelectedProduct[]>(() =>
    lignesMontage.map(versSelection)
  );
  // Les lignes d'origine, pour ne reecrire les produits que s'ils ont
  // vraiment change : corriger une adresse ne doit pas toucher au
  // contenu du colis.
  const lignesInitiales = useRef<OrderLine[]>(lignesMontage);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Statut de livraison, corrigeable a la main.
  //
  // Le transporteur ne rend que ses vingt colis les plus recents : passe
  // cette fenetre, un colis livre reste affiche "en cours" pour
  // toujours, et rien dans l'application ne permettait de le rectifier.
  const [deliveryStatus, setDeliveryStatus] = useState(
    lead.deliveryStatus ?? ""
  );

  /*
   * Le transporteur, et les villes qu'il dessert.
   *
   * Les deux listes ne se recouvrent pas : ForceLog livre des
   * localites que Speedaf ignore, et l'inverse. Changer de
   * transporteur sur une commande dont la ville n'est pas desservie
   * donnerait un colis refuse au moment de l'envoi — et l'erreur
   * n'apparaitrait qu'apres la confirmation. Elle s'affiche ici.
   */
  const [carrier, setCarrier] = useState<CarrierId>(carrierOfLead(lead.carrier));
  const [villesDuTransporteur, setVillesDuTransporteur] = useState<Set<string> | null>(
    null
  );

  const [client, setClient] = useState(lead.client);
  const [phone, setPhone] = useState(lead.phone);
  const [ville, setVille] = useState(lead.ville ?? "");
  const [quartier, setQuartier] = useState(lead.quartier ?? "");
  const [adresse, setAdresse] = useState(lead.adresse ?? "");
  const [cityOptions, setCityOptions] = useState<string[]>(moroccanCities);
  // Le total reste celui de la commande tant que personne ne le change.
  // Le recalculer depuis le catalogue effacerait la livraison, les
  // remises, et tout ce que la boutique avait deja compte.
  const [total, setTotal] = useState(
    (lead.amount ?? "").replace(/[^\d.,]/g, "") || "0"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le catalogue et le dictionnaire des villes viennent de la base : les
  // listes ecrites en dur ne montraient qu'une poignee de choix, sans
  // rapport avec les produits et les villes reellement desservies.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.products)) return;
        const complet = (
          data.products as {
            name: string;
            priceSale: number;
            status: string;
            image?: string;
            forcelogRef?: string;
          }[]
        ).map(
          (p): CatalogueEntry & { status: string } => ({
            name: p.name,
            priceSale: p.priceSale,
            image: p.image,
            forcelogRef: p.forcelogRef,
            status: p.status,
          })
        );
        // Le choix ne propose que les produits actifs ; la relecture des
        // lignes, elle, se sert de tout le catalogue — un produit retire
        // du choix porte encore le nom de ce qui a ete vendu.
        setCatalogProducts(
          complet
            .filter((p) => p.status === "Actif")
            .map((p) => ({
              name: p.name,
              price: p.priceSale ?? 0,
              image: p.image,
              ref: p.forcelogRef,
            }))
        );

        // Les lignes relues avec le catalogue : chaque reference prend
        // son nom, son prix et sa photo. Seulement si personne n'a
        // encore touche a la selection pendant le chargement.
        const enrichies = orderLines(
          { productName, itemCount, stockItems },
          complet
        );
        lignesInitiales.current = enrichies;
        setSelected((prev) =>
          sameLines(prev.map(versLigne), lignesMontage)
            ? enrichies.map(versSelection)
            : prev
        );
      })
      .catch(() => {
        /* Catalogue vide : la commande reste modifiable. */
      });

    fetch(`/api/carriers/cities?carrier=${carrier}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.keys)) return;
        setVillesDuTransporteur(new Set(data.keys as string[]));
      })
      .catch(() => {
        // Liste indisponible : on n'invente pas un refus.
        if (!cancelled) setVillesDuTransporteur(null);
      });

    fetch("/api/cities")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.cities)) return;
        const names = (data.cities as { name: string; active: boolean }[])
          .filter((c) => c.active)
          .map((c) => c.name);
        if (names.length > 0) setCityOptions(names);
      })
      .catch(() => {
        /* Liste de secours conservee. */
      });

    return () => {
      cancelled = true;
    };
  }, [productName, itemCount, stockItems, lignesMontage, carrier]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // Les produits ne repartent que s'ils ont change, et tous ensemble :
      // le nom liste les articles, le compte les totalise et les
      // references disent au transporteur quoi prelever. Les ecrire
      // separement, c'est les laisser se contredire.
      const lignes = selected.map(versLigne);
      const champs = orderFields(lignes);
      // Un article dont on ne connait que le code article n'a pas de nom
      // a enregistrer : le catalogue n'a pas repondu, et ecrire "1FKT5H"
      // comme nom de produit serait pire que ne rien ecrire.
      const nommes = lignes.every((l) => l.name !== l.ref);
      const produitsChanges =
        nommes && !sameLines(lignes, lignesInitiales.current);
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: client.trim(),
          phone: phone.trim(),
          ville: ville.trim(),
          quartier: quartier.trim(),
          adresse: adresse.trim(),
          amount: `${total.trim() || 0} MAD`,
          ...(carrier !== carrierOfLead(lead.carrier) ? { carrier } : {}),
          // Corrige a la main : on enregistre aussi le code, dont
          // dependent la couleur du badge et le calcul des paiements.
          ...(deliveryStatus !== (lead.deliveryStatus ?? "")
            ? {
                deliveryStatus: deliveryStatus || undefined,
                deliveryStatusCode:
                  DELIVERY_CHOICES.find((c) => c.label === deliveryStatus)
                    ?.code ?? undefined,
                // Une commande passee a "Livre" sans date n'apparaitrait
                // pas dans les paiements, qui trient sur cette date.
                ...(DELIVERY_CHOICES.find((c) => c.label === deliveryStatus)
                  ?.code === "DELIVERED" && !lead.deliveryDate
                  ? { deliveryDate: today() }
                  : {}),
              }
            : {}),
          ...(produitsChanges
            ? {
                productName: champs.productName,
                itemCount: champs.itemCount,
                parcelType: champs.parcelType,
                stockItems: champs.stockItems,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const transporteur = CARRIERS.find((c) => c.id === carrier) ?? CARRIERS[0];
  /*
   * Une ville n'est refusee que si la liste a pu etre lue : sans elle,
   * on ne sait rien, et afficher un refus serait pire que se taire.
   */
  const villeRefusee = Boolean(
    ville.trim() &&
      villesDuTransporteur &&
      !villesDuTransporteur.has(normalizeCity(ville))
  );

  const filteredProducts = productQuery
    ? catalogProducts.filter((p) =>
        p.name.toLowerCase().includes(productQuery.toLowerCase())
      )
    : catalogProducts;

  function addProduct(product: (typeof catalogProducts)[number]) {
    setSelected((prev) => {
      const existing = prev.find((p) => p.name === product.name);
      if (existing) {
        return prev.map((p) =>
          p.name === product.name ? { ...p, qty: p.qty + 1 } : p
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }

  function changeQty(name: string, delta: number) {
    setSelected((prev) =>
      prev
        .map((p) => (p.name === name ? { ...p, qty: p.qty + delta } : p))
        .filter((p) => p.qty > 0)
    );
  }

  const subtotal = selected.reduce((sum, p) => sum + p.price * p.qty, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Pencil className="mt-0.5 h-4 w-4 text-gray-700" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Modifier les details de la commande
              </h2>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-gray-500">
                Mettez a jour les informations client et livraison. Les
                valeurs inconnues restent non modifiees.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:max-h-[70vh] sm:flex-none">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Nom client
              </label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Telephone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
              INFORMATIONS COMPLEMENTAIRES
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Telephone WhatsApp (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="06 12 34 56 78"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Transporteur
                </label>
                <div className="flex gap-1.5">
                  {CARRIERS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCarrier(c.id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-medium ${
                        carrier === c.id
                          ? "border-gray-900 bg-gray-50 text-gray-900"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded text-[9.5px] font-semibold ${c.logo.bg} ${c.logo.fg}`}
                      >
                        {c.logo.letter}
                      </span>
                      {c.name}
                    </button>
                  ))}
                </div>
                {lead.trackingNumber && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Le colis est deja parti : changer de transporteur ne
                    deplacera pas celui-la.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Ville
                  </label>
                  <SelectDropdown
                    variant="field"
                    pinnedLabel={ville || "Aucune ville"}
                    options={cityOptions}
                    value={ville || undefined}
                    onSelect={setVille}
                    searchable
                    searchPlaceholder="Rechercher une ville..."
                  />
                  {villeRefusee && (
                    <p className="mt-1 flex items-start gap-1.5 text-[11.5px] font-medium text-red-600">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      {transporteur.name} ne dessert pas {ville}.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Quartier
                  </label>
                  <input
                    type="text"
                    value={quartier}
                    onChange={(e) => setQuartier(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Adresse
                </label>
                <input
                  type="text"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
              PRODUIT
            </p>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Rechercher des produits"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>

            {selected.length > 0 && (
              <div className="mb-2 space-y-2">
                {selected.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <ProductThumb image={p.image} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-gray-800">
                        {p.name}
                      </p>
                      <p className="truncate text-[12px] text-gray-500">
                        <span className="font-mono">{p.price} MAD</span> / unite
                        {p.ref && (
                          <span className="ml-1.5 font-mono text-gray-400">
                            {p.ref}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-1.5 py-1">
                      <button
                        onClick={() => changeQty(p.name, -1)}
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-4 text-center font-mono text-[12.5px] text-gray-700">
                        {p.qty}
                      </span>
                      <button
                        onClick={() => changeQty(p.name, 1)}
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {filteredProducts.map((product) => (
                <button
                  key={product.name}
                  onClick={() => addProduct(product)}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <ProductThumb image={product.image} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700">
                    {product.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-gray-500">
                    <span className="font-mono">{product.price} MAD</span> / unite
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-gray-500">
                  SOUS-TOTAL CATALOGUE
                </p>
                <p className="mt-1 font-mono text-[13px] font-medium text-gray-700">
                  {subtotal} MAD
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-gray-500">
                  TOTAL DE LA COMMANDE
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="w-24 rounded-md border border-gray-200 px-2 py-1 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <span className="text-[13px] text-gray-500">MAD</span>
                  {subtotal > 0 && String(subtotal) !== total.trim() && (
                    <button
                      onClick={() => setTotal(String(subtotal))}
                      title="Reporter le sous-total du catalogue"
                      className="rounded-md px-1.5 py-1 text-[11.5px] font-medium text-blue-600 hover:bg-blue-50"
                    >
                      = {subtotal}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-[12.5px] font-medium text-gray-600"
            >
              Parametres avances
              <ChevronDown
                className={`h-3.5 w-3.5 text-gray-400 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>
            {advancedOpen && (
              <div className="mt-2">
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Statut de livraison
                </label>
                <SelectDropdown
                  variant="field"
                  pinnedLabel="Non suivi"
                  options={DELIVERY_CHOICES.map((c) => c.label)}
                  value={deliveryStatus || undefined}
                  onSelect={setDeliveryStatus}
                />
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-400">
                  A corriger seulement quand le transporteur affiche autre
                  chose que l&apos;application. Son API ne rend que ses vingt
                  colis les plus recents : au-dela, elle ne peut plus rien
                  nous apprendre.
                </p>
              </div>
            )}
          </div>
        </div>

        {/*
          Le colis est deja chez Speedaf, qui ne sait pas le modifier :
          l'enregistrement l'annulera et en creera un autre. Le numero
          de suivi change, et le client a peut-etre deja l'ancien — il
          vaut mieux le lire avant d'enregistrer qu'apres.
        */}
        {lead.trackingNumber && carrierOfLead(lead.carrier) === "speedaf" && (
          <p className="mx-5 mb-1 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Colis{" "}
              <span className="font-mono font-medium">
                {lead.trackingNumber}
              </span>{" "}
              deja chez Speedaf. Corriger le client, le telephone,
              l&apos;adresse, la ville, le montant ou les produits annulera ce
              colis et en creera un nouveau : le numero de suivi changera.
            </span>
          </p>
        )}

        {error && (
          <p className="mx-5 mb-1 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2.5 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer les details
          </button>
        </div>
      </div>
    </div>
  );
}

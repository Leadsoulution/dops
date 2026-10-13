"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ShoppingCart,
  Warehouse,
  Boxes,
  X,
  Phone,
  PhoneCall,
  MessageCircle,
  Search,
  ChevronDown,
  Plus,
  Minus,
  Truck,
  User,
  Tag,
  Package,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { agents, moroccanCities, type Lead } from "./leads-data";
import SelectDropdown from "./SelectDropdown";
import { stockTotal, PRIX_UNITAIRE_MANUEL } from "@/lib/stock-total";
import { orderFields, type OrderLine } from "@/lib/order-lines";

const products = [
  {
    id: "sac-lo",
    name: "SAC LO",
    detail: "2 variantes",
    price: "75 MAD / unite",
  },
  {
    id: "diffuseur-atlas-zen",
    name: "Diffuseur Atlas Zen",
    detail: "Diffuseur d ambiance compact po...",
    price: "259 MAD / unite",
  },
  {
    id: "serum-derma-glow",
    name: "Serum Derma Glow",
    detail: "Serum visage leger pour eclat et h...",
    price: "229 MAD / unite",
  },
  {
    id: "powerbank-magsafe-atlas",
    name: "Powerbank MagSafe Atlas",
    detail: "Batterie magnetique compact po...",
    price: "389 MAD / unite",
  },
];

type StockItem = {
  ref: string;
  name: string;
  productName: string;
  barcode: string | null;
  quantity: number;
  image: string | null;
  /** Prix de vente du catalogue. Nul pour un article non tarife. */
  price: number | null;
};

/**
 * Par quel canal la commande est arrivee.
 *
 * Les memes valeurs que celles que la boutique enregistre d'elle-meme
 * ("fb", "tiktok"...), pour que la colonne Plateforme montre le meme
 * logo, qu'une commande vienne du site ou d'un agent.
 */
const SOURCES: { label: string; value: string }[] = [
  { label: "Aucune", value: "" },
  { label: "Facebook", value: "facebook" },
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
  { label: "Snapchat", value: "snapchat" },
  { label: "Google", value: "google" },
  { label: "YouTube", value: "youtube" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Appel", value: "appel" },
  { label: "Direct", value: "direct" },
];

/** Reference auto si l'utilisateur n'en saisit pas, au format des existantes. */
function generateReference() {
  const now = new Date();
  const suffix = `${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `MO-${random}-${suffix}`;
}

export default function CreateCommandeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (lead: Lead) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [champsAvances, setChampsAvances] = useState(false);
  const [secondaryPhoneEnabled, setSecondaryPhoneEnabled] = useState(false);
  const [contactType, setContactType] = useState<"whatsapp" | "calls">(
    "whatsapp"
  );

  const [client, setClient] = useState("");
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [utmSource, setUtmSource] = useState("");
  /**
   * Le total ecrit a la main, s'il y en a un.
   *
   * Nul tant que personne n'y a touche : le total suit alors la
   * selection. Des que l'agent ecrit un montant, c'est celui-la qui
   * tient — il vient d'etre annonce au client au telephone, et une
   * selection corrigee ensuite ne doit pas l'effacer en silence.
   */
  const [totalSaisi, setTotalSaisi] = useState<string | null>(null);
  const [ville, setVille] = useState("");
  // Toutes les villes du dictionnaire, pas seulement les grandes : une
  // commande peut partir a Mireleft comme a Casablanca.
  const [cityOptions, setCityOptions] = useState<string[]>(moroccanCities);
  const [adresse, setAdresse] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cities")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.cities)) return;
        const names = (data.cities as { name: string; active: boolean }[])
          .filter((c) => c.active)
          .map((c) => c.name);
        // Le dictionnaire vide ou injoignable laisse la liste de secours :
        // mieux vaut quelques villes qu'un champ sans aucun choix.
        if (names.length > 0) setCityOptions(names);
      })
      .catch(() => {
        /* Liste de secours conservee. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [parcelType, setParcelType] = useState<"simple" | "stock">("simple");
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockQuantities, setStockQuantities] = useState<Record<string, number>>({});

  // Le stock ForceLog n'est charge qu'a la demande, au moment ou l'on
  // bascule sur "colis de stock" : inutile d'appeler le transporteur
  // autrement, et cela evite un effet declenche par un changement d'etat.
  async function selectStockParcel() {
    setParcelType("stock");
    if (stockItems.length > 0 || stockLoading) return;

    setStockLoading(true);
    setStockError(null);
    try {
      const res = await fetch("/api/forcelog/stock");
      const data = await res.json();
      if (data.error) setStockError(data.error);
      else setStockItems(data.items ?? []);
    } catch {
      setStockError("Impossible de joindre le serveur.");
    } finally {
      setStockLoading(false);
    }
  }

  /**
   * Change la quantite d'un article.
   *
   * La mise a jour part de l'etat courant et non de celui qu'avait ce
   * rendu : quatre cases cochees coup sur coup tombaient autrement dans
   * le meme lot, et seule la derniere survivait — le client avait
   * demande quatre produits, le transporteur en recevait deux.
   */
  function setStockQuantity(ref: string, quantity: number) {
    setStockQuantities((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[ref];
      else next[ref] = quantity;
      return next;
    });
  }

  /**
   * Ajoute ou retire une unite d'un article.
   *
   * Le "+" de la liste et ceux du panier passent par ici : la quantite
   * se calcule a partir de la derniere connue, pas de celle qu'avait ce
   * rendu, pour que deux clics rapides en ajoutent bien deux.
   */
  function changeStockQuantity(ref: string, delta: number, max?: number) {
    setStockQuantities((prev) => {
      const actuel = prev[ref] ?? 0;
      const vise = actuel + delta;
      const borne = max !== undefined ? Math.min(vise, max) : vise;
      const next = { ...prev };
      if (borne <= 0) delete next[ref];
      else next[ref] = borne;
      return next;
    });
  }

  /** Cocher pose une unite, decocher retire l'article. */
  function toggleStock(item: StockItem) {
    setStockQuantities((prev) => {
      const next = { ...prev };
      if ((prev[item.ref] ?? 0) > 0) delete next[item.ref];
      else next[item.ref] = 1;
      return next;
    });
  }

  const selectedStock = Object.entries(stockQuantities);
  const visibleStock = productQuery.trim()
    ? stockItems.filter(
        (item) =>
          item.name.toLowerCase().includes(productQuery.trim().toLowerCase()) ||
          item.ref.toLowerCase().includes(productQuery.trim().toLowerCase())
      )
    : stockItems;

  /**
   * Le total de la commande : celui qui a ete ecrit, sinon celui que la
   * selection donne. Un article sans prix au catalogue compte pour zero
   * — mieux vaut un total incomplet, visiblement faux, qu'un total
   * invente.
   */
  const totalAuto = String(
    stockTotal(stockQuantities, stockItems, PRIX_UNITAIRE_MANUEL)
  );
  const total = totalSaisi ?? totalAuto;

  function toggleProduct(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const selectedProducts = products.filter((p) => selected.includes(p.id));
  const visibleProducts = productQuery.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(productQuery.trim().toLowerCase())
      )
    : products;

  const catalogueSubtotal = selectedProducts.reduce((sum, p) => {
    const value = Number.parseFloat(p.price.replace(/[^\d.]/g, ""));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  /**
   * Les articles de la commande, un par un.
   *
   * Nom, quantite et code article sortent d'une seule liste, puis d'un
   * seul calcul : les trois champs enregistres ne peuvent plus se
   * contredire, et une commande de quatre produits se relit comme
   * quatre produits.
   */
  const lignes: OrderLine[] =
    parcelType === "stock"
      ? selectedStock.map(([ref, qty]) => ({
          ref,
          qty,
          name: stockItems.find((i) => i.ref === ref)?.name ?? ref,
        }))
      : selectedProducts.map((p) => ({ name: p.name, qty: 1 }));
  const champs = orderFields(lignes);

  async function submit() {
    if (!client.trim() || !phone.trim()) {
      setError("Le nom du client et le telephone sont obligatoires.");
      return;
    }
    if (parcelType === "stock" && selectedStock.length === 0) {
      setError(
        "Choisissez au moins une reference et sa quantite dans le stock ForceLog."
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: reference.trim() || generateReference(),
          client: client.trim(),
          phone: phone.trim(),
          productName: champs.productName,
          productLabel:
            parcelType === "stock"
              ? "STOCK"
              : (selectedProducts[0]?.name.slice(0, 4).toUpperCase() ?? ""),
          itemCount: champs.itemCount || undefined,
          parcelType: champs.parcelType,
          // Format attendu par ForceLog pour prelever dans son depot.
          stockItems: champs.stockItems ?? undefined,
          amount: `${total.replace(/[^\d.]/g, "") || "0"} MAD`,
          ville: ville || undefined,
          adresse: adresse.trim() || undefined,
          assignedTo: assignedTo || "",
          status: "Nouveau",
          shipping: "En attente",
          source: "Agent Manual",
          utmSource: utmSource || undefined,
          date: new Date().toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creation impossible.");
      onCreated?.(data.lead);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:px-4 sm:py-10">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <ShoppingCart className="mt-0.5 h-4 w-4 text-gray-700" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Creer une commande manuelle
              </h2>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-gray-500">
                Capturez une vraie commande manuelle. L&apos;assignation auto
                ne s&apos;applique que si les champs requis de regle sont
                fournis.
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
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <User className="h-3 w-3" />
              NOM CLIENT
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Nom client
                </label>
                <input
                  type="text"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="Yassine El Idrissi"
                  className="w-full rounded-lg border border-blue-400 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none"
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
                  placeholder="06 12 34 56 78"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-[13px] font-medium text-gray-700">
                    Telephone secondaire
                  </p>
                  <p className="text-[12px] text-gray-500">
                    Ajouter un numero de contact alternatif
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSecondaryPhoneEnabled((v) => !v)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
              >
                {secondaryPhoneEnabled ? "Desactiver" : "Activer"}
              </button>
            </div>

            {secondaryPhoneEnabled && (
              <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Numero secondaire
                  </label>
                  <input
                    type="text"
                    placeholder="06XXXXXXXX"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[12.5px] text-gray-600">
                    Type de contact
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setContactType("whatsapp")}
                      className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left ${
                        contactType === "whatsapp"
                          ? "border-gray-900"
                          : "border-gray-200"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                          contactType === "whatsapp"
                            ? "border-gray-900"
                            : "border-gray-300"
                        }`}
                      >
                        {contactType === "whatsapp" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-900" />
                        )}
                      </span>
                      <MessageCircle className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-[12.5px] font-medium text-gray-700">
                        WhatsApp
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactType("calls")}
                      className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left ${
                        contactType === "calls"
                          ? "border-gray-900"
                          : "border-gray-200"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                          contactType === "calls"
                            ? "border-gray-900"
                            : "border-gray-300"
                        }`}
                      >
                        {contactType === "calls" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-900" />
                        )}
                      </span>
                      <PhoneCall className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-[12.5px] font-medium text-gray-700">
                        Appels uniquement
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <Tag className="h-3 w-3" />
              DETAILS DE LA COMMANDE
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Reference (optionnelle)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Laisser vide pour generation"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Cle source
                </label>
                <SelectDropdown
                  variant="field"
                  pinnedLabel="Aucune"
                  options={SOURCES.map((s) => s.label)}
                  value={
                    SOURCES.find((s) => s.value === utmSource)?.label ?? "Aucune"
                  }
                  onSelect={(label) =>
                    setUtmSource(
                      SOURCES.find((s) => s.label === label)?.value ?? ""
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <Package className="h-3 w-3" />
              PRODUIT
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setParcelType("simple")}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left ${
                  parcelType === "simple"
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <Warehouse className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-gray-800">
                    Colis simple
                  </span>
                  <span className="block text-[11.5px] text-gray-500">
                    Marchandise dans mon depot
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={selectStockParcel}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left ${
                  parcelType === "stock"
                    ? "border-gray-900 bg-gray-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-gray-800">
                    Colis de stock
                  </span>
                  <span className="block text-[11.5px] text-gray-500">
                    Marchandise chez ForceLog
                  </span>
                </span>
              </button>
            </div>

            {parcelType === "simple" && selected.length === 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-center text-[12.5px] text-gray-400">
                Aucun produit selectionne
              </div>
            )}

            {parcelType === "stock" && selectedStock.length === 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-center text-[12.5px] text-gray-400">
                Aucune reference selectionnee dans le stock ForceLog
              </div>
            )}

            {/*
              Le panier : ce qui part dans le colis, avec sa photo et sa
              quantite. La liste du stock se parcourt, le panier se
              verifie — melanger les deux obligeait a chercher dans
              quatre-vingts references celles qui etaient cochees.
            */}
            {parcelType === "stock" && selectedStock.length > 0 && (
              <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold tracking-wide text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <ShoppingCart className="h-3 w-3" />
                    PANIER
                  </span>
                  <span className="font-normal text-gray-400">
                    {selectedStock.length} produit
                    {selectedStock.length > 1 ? "s" : ""} &middot;{" "}
                    {selectedStock.reduce((somme, [, qte]) => somme + qte, 0)}{" "}
                    article
                    {selectedStock.reduce((somme, [, qte]) => somme + qte, 0) > 1
                      ? "s"
                      : ""}
                  </span>
                </p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                  {selectedStock.map(([ref, qte]) => {
                    const item = stockItems.find((i) => i.ref === ref);
                    return (
                      <div
                        key={ref}
                        className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                      >
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-gray-100">
                          {item?.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-gray-800">
                            {item?.name ?? ref}
                          </p>
                          <p className="truncate font-mono text-[11px] text-gray-400">
                            {ref} &middot; {PRIX_UNITAIRE_MANUEL * qte} MAD
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => changeStockQuantity(ref, -1)}
                            title="Retirer une unite"
                            className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center font-mono text-[12.5px] text-gray-700">
                            {qte}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              changeStockQuantity(ref, 1, item?.quantity)
                            }
                            title="Ajouter une unite"
                            className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setStockQuantity(ref, 0)}
                          title="Retirer du panier"
                          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder={
                  parcelType === "stock"
                    ? "Rechercher dans le stock ForceLog"
                    : "Rechercher des produits"
                }
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>

            {parcelType === "stock" ? (
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {stockLoading && (
                  <p className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Chargement du stock ForceLog...
                  </p>
                )}
                {stockError && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-600">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {stockError}
                  </p>
                )}
                {!stockLoading && !stockError && visibleStock.length === 0 && (
                  <p className="py-4 text-center text-[12.5px] text-gray-400">
                    Aucune reference disponible.
                  </p>
                )}
                {visibleStock.map((item) => {
                  const chosen = stockQuantities[item.ref] ?? 0;
                  return (
                    <div
                      key={item.ref}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleStock(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleStock(item);
                        }
                      }}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                        chosen > 0
                          ? "border-gray-900 bg-gray-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          chosen > 0
                            ? "border-gray-900 bg-gray-900"
                            : "border-gray-300"
                        }`}
                      >
                        {chosen > 0 && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-gray-100">
                        {item.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-800">
                          {item.name}
                        </p>
                        <p className="truncate font-mono text-[11.5px] text-gray-500">
                          {item.ref} &middot; {item.quantity} dispo
                          {` · ${PRIX_UNITAIRE_MANUEL} MAD`}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={chosen || ""}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setStockQuantity(
                            item.ref,
                            Math.min(
                              Number(e.target.value) || 0,
                              item.quantity
                            )
                          )
                        }
                        className="w-14 shrink-0 rounded-md border border-gray-200 px-2 py-1 text-center font-mono text-[12.5px] text-gray-800 focus:border-blue-400 focus:outline-none"
                      />
                      {/*
                        Le "+" ajoute l'article au panier sans quitter la
                        liste : une commande de trois produits se compose
                        en trois clics, et le panier au-dessus montre ce
                        qu'elle contient deja.
                      */}
                      <button
                        type="button"
                        title="Ajouter au panier"
                        onClick={(e) => {
                          e.stopPropagation();
                          changeStockQuantity(item.ref, 1, item.quantity);
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {visibleProducts.map((product) => {
                const isSelected = selected.includes(product.id);
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => toggleProduct(product.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-gray-900 bg-gray-900"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div className="h-9 w-9 shrink-0 rounded-md bg-gray-100" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-gray-800">
                        {product.name}
                      </p>
                      <p className="truncate text-[12px] text-gray-500">
                        {product.detail}
                      </p>
                    </div>
                    <span className="whitespace-nowrap font-mono text-[12.5px] text-gray-600">
                      {product.price}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  </button>
                );
              })}
            </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-gray-500">
                  SOUS-TOTAL CATALOGUE
                </p>
                <p
                  className={`mt-1 text-[13px] font-medium ${
                    catalogueSubtotal > 0 ? "font-mono text-gray-800" : "text-gray-400"
                  }`}
                >
                  {catalogueSubtotal > 0 ? `${catalogueSubtotal} MAD` : "—"}
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
                    onChange={(e) => setTotalSaisi(e.target.value)}
                    className="w-20 rounded-md border border-gray-200 px-2 py-1 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <span className="text-[13px] text-gray-500">MAD</span>
                  {totalSaisi !== null && totalSaisi.trim() !== totalAuto && (
                    <button
                      type="button"
                      onClick={() => setTotalSaisi(null)}
                      title="Reprendre le total de la selection"
                      className="rounded-md px-1.5 py-1 text-[11.5px] font-medium text-blue-600 hover:bg-blue-50"
                    >
                      = {totalAuto}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {parcelType === "stock" && (
              <p className="mt-2 text-[11.5px] text-gray-400">
                Tarif des commandes saisies a la main :{" "}
                <span className="font-mono text-gray-600">
                  {PRIX_UNITAIRE_MANUEL} MAD
                </span>{" "}
                par article. Un total ecrit a la main est conserve.
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <Truck className="h-3 w-3" />
              LIVRAISON
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Ville
                </label>
                <SelectDropdown
                  variant="field"
                  pinnedLabel="Aucune ville"
                  options={cityOptions}
                  onSelect={setVille}
                  searchable
                  searchPlaceholder="Rechercher une ville..."
                />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Adresse
                </label>
                <input
                  type="text"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Rue Abou Al Waqt, Immeuble 12, App 4"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
              <User className="h-3 w-3" />
              AGENT ASSIGNE
            </p>
            <SelectDropdown
              variant="field"
              pinnedLabel="Laisser non assigne"
              options={agents}
              onSelect={setAssignedTo}
            />
          </div>

          <button
            type="button"
            onClick={() => setChampsAvances((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50"
          >
            <div>
              <p className="text-[13px] font-medium text-gray-700">
                Champs avances
              </p>
              <p className="text-[12px] text-gray-500">
                Inclure les metadonnees optionnelles campagne, page et notes.
              </p>
            </div>
            <span
              className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                champsAvances ? "bg-gray-900" : "bg-gray-200"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  champsAvances ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
          </button>
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          {error && (
            <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              disabled={saving}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:w-auto"
            >
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Creation..." : "Creer commande"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

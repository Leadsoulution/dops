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
  const [total, setTotal] = useState("0");
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
   * Change la quantite d'un article, et recalcule le total.
   *
   * Le total se recalcule a chaque changement de selection, y compris
   * quand on retire un article : c'est ce que l'on attend d'un panier.
   * Un montant saisi a la main tient jusqu'a la selection suivante,
   * apres quoi il repart du prix catalogue — mieux vaut un chiffre juste
   * qu'un chiffre ancien qu'on aurait oublie d'avoir modifie.
   *
   * Un article sans prix au catalogue compte pour zero : il vaut mieux
   * un total incomplet, visiblement faux, qu'un total invente.
   */
  function setStockQuantity(ref: string, quantity: number) {
    const next = { ...stockQuantities };
    if (quantity <= 0) delete next[ref];
    else next[ref] = quantity;
    setStockQuantities(next);

    setTotal(String(stockTotal(next, stockItems, PRIX_UNITAIRE_MANUEL)));
  }

  /** Cocher pose une unite, decocher retire l'article. */
  function toggleStock(item: StockItem) {
    setStockQuantity(item.ref, (stockQuantities[item.ref] ?? 0) > 0 ? 0 : 1);
  }

  const selectedStock = Object.entries(stockQuantities);
  const visibleStock = productQuery.trim()
    ? stockItems.filter(
        (item) =>
          item.name.toLowerCase().includes(productQuery.trim().toLowerCase()) ||
          item.ref.toLowerCase().includes(productQuery.trim().toLowerCase())
      )
    : stockItems;

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
          productName:
            parcelType === "stock"
              ? selectedStock
                  .map(([ref]) => stockItems.find((i) => i.ref === ref)?.name ?? ref)
                  .join(", ")
              : selectedProducts.map((p) => p.name).join(", "),
          productLabel:
            parcelType === "stock"
              ? "STOCK"
              : (selectedProducts[0]?.name.slice(0, 4).toUpperCase() ?? ""),
          itemCount:
            parcelType === "stock"
              ? selectedStock.reduce((sum, [, qty]) => sum + qty, 0) || undefined
              : selectedProducts.length > 1
              ? selectedProducts.length
              : undefined,
          parcelType,
          // Format attendu par ForceLog pour prelever dans son depot.
          stockItems:
            parcelType === "stock"
              ? selectedStock.map(([ref, qty]) => `${ref}:${qty}`).join(",")
              : undefined,
          amount: `${total.replace(/[^\d.]/g, "") || "0"} MAD`,
          ville: ville || undefined,
          adresse: adresse.trim() || undefined,
          assignedTo: assignedTo || "",
          status: "Nouveau",
          shipping: "En attente",
          source: "Agent Manual",
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
                <button className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50">
                  Aucune
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
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
                        className="w-16 shrink-0 rounded-md border border-gray-200 px-2 py-1 text-center font-mono text-[12.5px] text-gray-800 focus:border-blue-400 focus:outline-none"
                      />
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
                    onChange={(e) => setTotal(e.target.value)}
                    className="w-20 rounded-md border border-gray-200 px-2 py-1 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                  <span className="text-[13px] text-gray-500">MAD</span>
                </div>
              </div>
            </div>

            {parcelType === "stock" && (
              <p className="mt-2 text-[11.5px] text-gray-400">
                Tarif des commandes saisies a la main :{" "}
                <span className="font-mono text-gray-600">
                  {PRIX_UNITAIRE_MANUEL} MAD
                </span>{" "}
                par article. Le total reste modifiable.
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

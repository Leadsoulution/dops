"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertCircle, ImagePlus, Loader2, Package, X } from "lucide-react";
import MediaPickerModal from "./MediaPickerModal";
import SelectDropdown from "./SelectDropdown";
import { suppliers } from "./products-data";
import type { StockProduct } from "@/lib/supabase/products";

const STATUSES = ["Actif", "Archive"];

export default function EditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: StockProduct;
  onClose: () => void;
  onSaved: (product: StockProduct) => void;
}) {
  const [name, setName] = useState(product.name);
  const [ref, setRef] = useState(product.ref);
  const [supplier, setSupplier] = useState(product.supplier ?? "");
  const [priceSale, setPriceSale] = useState(String(product.priceSale));
  const [costSupplier, setCostSupplier] = useState(String(product.costSupplier));
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [reorderThreshold, setReorderThreshold] = useState(
    String(product.reorderThreshold)
  );
  const [status, setStatus] = useState<"Actif" | "Archive">(product.status);
  const [image, setImage] = useState<string | null>(product.image ?? null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les fournisseurs connus, plus celui du produit s'il n'y figure pas.
  const supplierOptions = supplier && !suppliers.includes(supplier)
    ? [supplier, ...suppliers]
    : suppliers;

  async function submit() {
    setError(null);
    if (!name.trim() || !ref.trim()) {
      setError("Le nom et la reference sont obligatoires.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ref: ref.trim(),
          supplier: supplier.trim(),
          priceSale: Number(priceSale) || 0,
          costSupplier: Number(costSupplier) || 0,
          quantity: Number(quantity) || 0,
          reorderThreshold: Number(reorderThreshold) || 0,
          status,
          // Chaine vide volontaire : elle efface l'image en base.
          image: image ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved(data.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const margin = (() => {
    const price = Number(priceSale) || 0;
    if (!price) return 0;
    return Math.round(((price - (Number(costSupplier) || 0)) / price) * 100);
  })();

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Package className="mt-0.5 h-4 w-4 text-gray-700" />
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                Modifier le produit
              </h2>
              <p className="mt-0.5 font-mono text-[12px] text-gray-400">
                {product.ref}
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

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">Image</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMediaOpen(true)}
                className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100"
              >
                {image ? (
                  <Image
                    src={image}
                    alt="Image du produit"
                    fill
                    sizes="80px"
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <ImagePlus className="h-5 w-5 text-gray-400" />
                )}
              </button>
              <div className="min-w-0">
                <button
                  onClick={() => setMediaOpen(true)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  {image ? "Changer l'image" : "Choisir une image"}
                </button>
                {image && (
                  <button
                    onClick={() => setImage(null)}
                    className="ml-2 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Reference (SKU)
            </label>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
            />
            {product.source === "forcelog" && (
              <p className="mt-1 text-[11.5px] text-amber-600">
                Code article ForceLog : le changer coupe le lien avec le stock
                du transporteur.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">
              Fournisseur
            </label>
            <SelectDropdown
              variant="field"
              pinnedLabel={supplier || "Aucun fournisseur"}
              options={supplierOptions}
              value={supplier || undefined}
              onSelect={setSupplier}
              searchable
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Prix de vente
              </label>
              <input
                type="number"
                step="0.01"
                value={priceSale}
                onChange={(e) => setPriceSale(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Cout fournisseur
              </label>
              <input
                type="number"
                step="0.01"
                value={costSupplier}
                onChange={(e) => setCostSupplier(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <p className="text-[12px] text-gray-500">
            Marge : <span className="font-mono font-medium">{margin}%</span>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Stock disponible
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12.5px] text-gray-600">
                Seuil de reappro
              </label>
              <input
                type="number"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-gray-600">Statut</label>
            <SelectDropdown
              variant="field"
              pinnedLabel={status}
              options={STATUSES}
              value={status}
              onSelect={(v) => setStatus(v === "Archive" ? "Archive" : "Actif")}
            />
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>

      {mediaOpen && (
        <MediaPickerModal
          onClose={() => setMediaOpen(false)}
          onSelect={(url) => {
            setImage(url);
            setMediaOpen(false);
          }}
        />
      )}
    </div>
  );
}

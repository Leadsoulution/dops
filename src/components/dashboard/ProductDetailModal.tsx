"use client";

import { useState } from "react";
import {
  Archive,
  Boxes,
  CheckCircle2,
  Eye,
  ImagePlus,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import SelectDropdown from "./SelectDropdown";
import AdjustStockModal from "./AdjustStockModal";
import MediaPickerModal from "./MediaPickerModal";
import { adPlatforms, productMargin, type Product } from "./products-data";

const tabs = ["Apercu", "Variantes", "Media", "Ads", "Stock distant"] as const;

export default function ProductDetailModal({
  product,
  onClose,
  onEdit,
  onArchiveToggle,
  onDelete,
  onStockApplied,
  onImageChange,
}: {
  product: Product;
  onClose: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onStockApplied: (type: string, quantity: number) => void;
  onImageChange: (url: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Apercu");
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [stockMode, setStockMode] = useState<"local" | "drop" | "supplier">("local");
  const [platform, setPlatform] = useState(adPlatforms[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <Package className="h-4.5 w-4.5 text-gray-500" />
            </div>
            <div>
              <h2 className="text-h2 font-semibold text-gray-900">
                {product.name}
              </h2>
              <p className="font-mono text-[12px] text-gray-400">{product.sku}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                    product.status === "Actif"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {product.status}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-600">
                  <Eye className="h-2.5 w-2.5" />
                  Visible
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-blue-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </button>
            <button
              onClick={() => setStockModalOpen(true)}
              className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            >
              <Boxes className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onArchiveToggle();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                  >
                    <Archive className="h-3.5 w-3.5 text-gray-400" />
                    {product.status === "Actif" ? "Archiver" : "Reactiver"}
                  </button>
                  <div className="mt-1 border-t border-gray-100 pt-1">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer le produit
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-gray-100 px-5">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 py-2.5 text-[12.5px] font-medium transition-colors ${
                activeTab === tab
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          {activeTab === "Apercu" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              <div className="space-y-5 lg:col-span-3">
                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                    STATUT COMMERCIAL
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <div>
                        <p className="text-[11px] text-gray-400">Actif</p>
                        <p className="text-[12.5px] font-medium text-gray-700">
                          Oui
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                      <Eye className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-[11px] text-gray-400">Visibilite</p>
                        <p className="text-[12.5px] font-medium text-gray-700">
                          Visible
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                      <ShoppingBag className="h-4 w-4 text-violet-500" />
                      <div>
                        <p className="text-[11px] text-gray-400">Backorder</p>
                        <p className="text-[12.5px] font-medium text-gray-700">
                          Autorise
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                      <Package className="h-4 w-4 text-cyan-500" />
                      <div>
                        <p className="text-[11px] text-gray-400">Stock</p>
                        <p className="text-[12.5px] font-medium text-gray-700">
                          Pret a vendre
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                    UTILISATION ET ACTIVITE
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-100 px-3 py-2">
                      <p className="text-[11px] text-gray-400">Fois vendu</p>
                      <p className="font-mono text-[15px] font-semibold text-gray-800">0</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 px-3 py-2">
                      <p className="text-[11px] text-gray-400">Fois retourne</p>
                      <p className="font-mono text-[15px] font-semibold text-gray-800">0</p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-gray-100 px-3 py-2">
                      <p className="text-[11px] text-gray-400">
                        Dernier mouvement
                      </p>
                      <p className="font-mono text-[12.5px] font-medium text-gray-700">
                        {product.dernierMouvement}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-lg border border-gray-100 p-3">
                  <p className="text-[11px] text-gray-400">Prix catalogue</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <p className="font-mono text-[19px] font-semibold text-gray-900">
                      {product.priceVente} MAD
                    </p>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600">
                      Pret a vendre
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-gray-100 px-2.5 py-2 text-center">
                    <p className="font-mono text-[15px] font-semibold text-gray-800">
                      {product.stockTotal}
                    </p>
                    <p className="text-[10px] text-gray-400">Stock total</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 px-2.5 py-2 text-center">
                    <p className="font-mono text-[15px] font-semibold text-gray-800">
                      {product.reserve}
                    </p>
                    <p className="text-[10px] text-gray-400">Reserve</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 px-2.5 py-2 text-center">
                    <p className="font-mono text-[15px] font-semibold text-emerald-600">
                      {product.disponible}
                    </p>
                    <p className="text-[10px] text-gray-400">Disponible</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                    CATALOGUE &amp; FOURNISSEUR
                  </p>
                  <dl className="space-y-1.5 text-[12.5px]">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-400">SKU</dt>
                      <dd className="font-mono font-medium text-gray-700">{product.sku}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-400">Fournisseur</dt>
                      <dd className="font-medium text-gray-700">
                        {product.supplier}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-400">Cout fournisseur</dt>
                      <dd className="font-mono font-medium text-gray-700">
                        {product.coutFournisseur} MAD
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-400">Marge</dt>
                      <dd className="font-mono font-medium text-gray-700">
                        {productMargin(product)}%
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-400">Seuil reappro</dt>
                      <dd className="font-mono font-medium text-gray-700">
                        {product.seuilReappro}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Variantes" && (
            <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-[12.5px] text-gray-400">
              Aucune variante configuree pour ce produit.
            </div>
          )}

          {activeTab === "Media" && (
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                IMAGES PRODUIT
              </p>
              <p className="mb-3 text-[12px] text-gray-500">
                Definissez l&apos;image principale ou gerez la galerie du
                produit.
              </p>
              {product.image ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative h-48 w-48 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="192px"
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMediaOpen(true)}
                      className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Changer l&apos;image
                    </button>
                    <button
                      onClick={() => onImageChange("")}
                      className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-red-600 hover:bg-red-50"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setMediaOpen(true)}
                    className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center hover:bg-gray-50"
                  >
                    <ImagePlus className="h-5 w-5 text-gray-400" />
                    <span className="text-[12.5px] font-medium text-gray-600">
                      Ajouter une image
                    </span>
                    <span className="text-[11px] text-gray-400">
                      PNG, JPG, WEBP, GIF ou AVIF &middot; 5 Mo maximum
                    </span>
                  </button>
                  <p className="mt-3 text-center text-[12px] text-gray-400">
                    Aucune image produit pour le moment.
                  </p>
                </>
              )}
            </div>
          )}

          {activeTab === "Ads" && (
            <div>
              <p className="mb-3 text-[11px] font-semibold tracking-wide text-gray-500">
                DEPENSES PUBLICITAIRE PRODUIT
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Plateforme
                  </label>
                  <SelectDropdown
                    variant="field"
                    pinnedLabel={platform}
                    options={adPlatforms}
                    value={platform}
                    onSelect={setPlatform}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Montant *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      defaultValue={0}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                    />
                    <span className="shrink-0 text-[12.5px] text-gray-500">
                      MAD
                    </span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Date debut *
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] text-gray-600">
                    Date fin
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Tags
                </label>
                <input
                  type="text"
                  placeholder="Ajouter un tag"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[12.5px] text-gray-600">
                  Note
                </label>
                <textarea
                  placeholder="Contexte, audience, test result..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
                />
              </div>
              <button
                disabled
                title="Bientot disponible"
                className="mt-3 flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[12.5px] font-medium text-gray-400 opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12.5px] font-semibold text-gray-800">
                    Depenses recentes
                  </p>
                  <span className="text-[12px] text-gray-500">
                    Total <span className="font-mono">0 MAD</span>
                  </span>
                </div>
                <p className="text-center text-[12px] text-gray-400">
                  Aucune depense publicitaire directe pour ce produit.
                </p>
              </div>
            </div>
          )}

          {activeTab === "Stock distant" && (
            <div>
              <p className="mb-3 text-[11px] font-semibold tracking-wide text-gray-500">
                MODE STOCK FOURNISSEUR
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    { key: "local", label: "Local uniquement" },
                    { key: "drop", label: "Drop + local" },
                    { key: "supplier", label: "Fournisseur uniquement" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.key}
                    onClick={() => setStockMode(mode.key)}
                    className={`rounded-lg border px-3 py-2 text-[12.5px] font-medium ${
                      stockMode === mode.key
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-center text-[12px] text-gray-400">
                Aucun lien de stock distant pour ce produit.
              </p>
            </div>
          )}
        </div>
      </div>

      {stockModalOpen && (
        <AdjustStockModal
          product={product}
          onClose={() => setStockModalOpen(false)}
          onApply={(type, quantity) => {
            onStockApplied(type, quantity);
            setStockModalOpen(false);
          }}
        />
      )}

      {mediaOpen && (
        <MediaPickerModal
          onClose={() => setMediaOpen(false)}
          onSelect={(url) => {
            onImageChange(url);
            setMediaOpen(false);
          }}
        />
      )}
    </div>
  );
}

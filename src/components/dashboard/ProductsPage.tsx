"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  MoreVertical,
  Package,
  PackageCheck,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingDown,
  Loader2,
  X,
} from "lucide-react";
import SelectDropdown from "./SelectDropdown";
import CreateProductModal from "./CreateProductModal";
import EditProductModal from "./EditProductModal";
import type { StockProduct } from "@/lib/supabase/products";
import ProductDetailModal from "./ProductDetailModal";
import AdjustStockModal from "./AdjustStockModal";
import {
  productMargin,
  isLowStock,
  productStatusOptions,
  productStockOptions,
  type Product,
} from "./products-data";

/**
 * Convertit un produit du catalogue vers la forme `Product` attendue par
 * cette page. Les montants viennent maintenant de la base : ils ne sont
 * plus figes a zero comme du temps ou le catalogue n'etait qu'un reflet
 * du stock transporteur.
 */
function toProduct(item: StockProduct): Product {
  return {
    sku: item.ref,
    name: item.name,
    supplier: item.supplier ?? "—",
    priceVente: item.priceSale,
    coutFournisseur: item.costSupplier,
    stockTotal: item.quantity + item.waitingQuantity,
    disponible: item.quantity,
    reserve: 0,
    enCours: item.waitingQuantity,
    seuilReappro: item.reorderThreshold,
    dernierMouvement: item.updatedAt
      ? new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Casablanca",
        }).format(new Date(item.updatedAt))
      : "",
    status: item.status,
  };
}

export default function ProductsPage() {
  const [activeTab, setActiveTab] = useState<"catalogue" | "imports">("catalogue");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [openMenuSku, setOpenMenuSku] = useState<string | null>(null);
  const [rawProducts, setRawProducts] = useState<StockProduct[]>([]);
  const [editProduct, setEditProduct] = useState<StockProduct | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const products = rawProducts.map(toProduct);
  const rawBySku = new Map(rawProducts.map((p) => [p.ref, p]));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setRawProducts(data.products as StockProduct[]);
      })
      .catch(() => {
        /* Le catalogue reste vide, l'ecran affiche l'etat "aucun produit". */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function replaceProduct(updated: StockProduct) {
    setRawProducts((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
  }

  async function patchProduct(id: string, changes: Record<string, unknown>) {
    setActionError(null);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      replaceProduct(data.product);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Enregistrement impossible."
      );
    }
  }

  async function removeProduct(id: string) {
    setActionError(null);
    const previous = rawProducts;
    setRawProducts((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setRawProducts(previous);
      setActionError(
        err instanceof Error ? err.message : "Suppression impossible."
      );
    }
  }

  /**
   * Applique un mouvement de stock. Entree ajoute, sortie retire,
   * ajustement fixe la valeur : c'est la difference entre corriger un
   * inventaire et enregistrer une reception.
   */
  function applyStockMovement(sku: string, type: string, qty: number) {
    const raw = rawBySku.get(sku);
    if (!raw) return;
    const next =
      type === "Entree"
        ? raw.quantity + qty
        : type === "Sortie"
          ? Math.max(0, raw.quantity - qty)
          : qty;
    void patchProduct(raw.id, { quantity: next });
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleProducts = query
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query)
      )
    : products;

  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.status === "Actif").length;
  const totalStock = products.reduce((sum, p) => sum + p.stockTotal, 0);
  const lowStockCount = products.filter(isLowStock).length;

  return (
    <div className="scrollbar-hide flex-1 overflow-y-auto bg-gray-50 px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Package className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h1 className="text-h1 font-semibold text-gray-900">
              Produits
            </h1>
            <p className="text-[13px] text-gray-500">
              <span className="font-mono">{totalProducts}</span> produits enregistres
            </p>
          </div>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau produit
        </button>
      </div>

      {actionError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-[13px] text-red-700">{actionError}</p>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="rounded-md p-0.5 text-red-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Total produits
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {totalProducts}
            </p>
          </div>
          <Package className="h-4 w-4 text-gray-300" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Actifs
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {activeProducts}
            </p>
            <p className="text-[11px] text-gray-400">% catalogue</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Stock total
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {totalStock.toLocaleString("fr-FR")}
            </p>
          </div>
          <PackageCheck className="h-4 w-4 text-blue-300" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
              Stock bas
            </p>
            <p className="font-mono text-[19px] font-semibold text-gray-900">
              {lowStockCount}
            </p>
          </div>
          <TrendingDown className="h-4 w-4 text-orange-400" />
        </div>
      </div>

      <div className="mb-4 flex items-center gap-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("catalogue")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "catalogue"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Catalogue produits
        </button>
        <button
          onClick={() => setActiveTab("imports")}
          className={`whitespace-nowrap border-b-2 pb-2.5 text-[13.5px] transition-colors ${
            activeTab === "imports"
              ? "border-gray-900 font-semibold text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Imports &amp; mouvements
        </button>
      </div>

      {activeTab === "imports" ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center text-[13px] text-gray-400">
          Aucun import ou mouvement de stock enregistre.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative w-full lg:min-w-[260px] lg:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un produit..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-[13px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 lg:w-auto"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtres
            </button>
          </div>

          {filtersOpen && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectDropdown
                pinnedLabel="Tous Statut"
                options={productStatusOptions}
              />
              <SelectDropdown
                pinnedLabel="Tous Stock"
                options={productStockOptions}
              />
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-[14px] font-semibold text-gray-900">
                Catalogue produits
              </p>
              <p className="text-[12.5px] text-gray-500">
                <span className="font-mono">{visibleProducts.length}</span> produits enregistres
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">Produit</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Fournisseur</th>
                    <th className="px-3 py-3">Prix vente</th>
                    <th className="px-3 py-3">Cout</th>
                    <th className="px-3 py-3">Marge</th>
                    <th className="px-3 py-3">Stock total</th>
                    <th className="px-3 py-3">Disponible</th>
                    <th className="px-3 py-3">Reserve</th>
                    <th className="px-3 py-3">En cours</th>
                    <th className="px-3 py-3">Dernier mouvement</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={10} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <p className="text-[13px]">Chargement du catalogue...</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loading && visibleProducts.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Package className="h-6 w-6" />
                          <p className="text-[13px]">Aucun produit dans le catalogue.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {visibleProducts.map((product) => {
                    const lowStock = isLowStock(product);
                    return (
                      <tr
                        key={product.sku}
                        onClick={() => setDetailProduct(product)}
                        className="cursor-pointer border-b border-gray-50 text-[13px] text-gray-700 last:border-0 hover:bg-gray-50/60"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 shrink-0 rounded-md bg-gray-100" />
                            <span className="font-medium text-gray-800">
                              {product.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-500">{product.sku}</td>
                        <td className="px-3 py-3 text-gray-600">
                          {product.supplier}
                        </td>
                        <td className="px-3 py-3 font-mono font-medium text-gray-800">
                          {product.priceVente} MAD
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-500">
                          {product.coutFournisseur} MAD
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-600">
                          {productMargin(product)}%
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-700">
                          {product.stockTotal}
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-700">
                          {product.disponible}
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-500">
                          {product.reserve}
                        </td>
                        <td className="px-3 py-3 font-mono text-gray-500">
                          {product.enCours}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-gray-500">
                          {product.dernierMouvement}
                        </td>
                        <td className="px-3 py-3">
                          {lowStock ? (
                            <span className="rounded-md bg-orange-50 px-2 py-1 text-[12px] font-medium text-orange-600">
                              Stock bas
                            </span>
                          ) : (
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-600">
                              Actif
                            </span>
                          )}
                        </td>
                        <td
                          className="relative px-3 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              setOpenMenuSku((v) =>
                                v === product.sku ? null : product.sku
                              )
                            }
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuSku === product.sku && (
                            <div className="absolute right-3 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                              <button
                                onClick={() => {
                                  setDetailProduct(product);
                                  setOpenMenuSku(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                              >
                                <Package className="h-3.5 w-3.5 text-gray-400" />
                                Voir details
                              </button>
                              <button
                                onClick={() => {
                                  setStockProduct(product);
                                  setOpenMenuSku(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                              >
                                <Boxes className="h-3.5 w-3.5 text-gray-400" />
                                Ajuster le stock
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editProduct && (
        <EditProductModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={(product) => {
            replaceProduct(product);
            setEditProduct(null);
          }}
        />
      )}
      {createOpen && (
        <CreateProductModal
          onClose={() => setCreateOpen(false)}
          onCreated={(product) => {
            setRawProducts((prev) => [product, ...prev]);
            setCreateOpen(false);
          }}
        />
      )}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onEdit={() => {
            const raw = rawBySku.get(detailProduct.sku);
            setDetailProduct(null);
            if (raw) setEditProduct(raw);
          }}
          onArchiveToggle={() => {
            const raw = rawBySku.get(detailProduct.sku);
            if (!raw) return;
            void patchProduct(raw.id, {
              status: raw.status === "Actif" ? "Archive" : "Actif",
            });
            setDetailProduct(null);
          }}
          onDelete={() => {
            const raw = rawBySku.get(detailProduct.sku);
            setDetailProduct(null);
            if (raw) void removeProduct(raw.id);
          }}
          onStockApplied={(type, qty) =>
            applyStockMovement(detailProduct.sku, type, qty)
          }
        />
      )}
      {stockProduct && (
        <AdjustStockModal
          product={stockProduct}
          onClose={() => setStockProduct(null)}
          onApply={(type, qty) => {
            applyStockMovement(stockProduct.sku, type, qty);
            setStockProduct(null);
          }}
        />
      )}
    </div>
  );
}

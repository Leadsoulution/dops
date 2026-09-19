"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  ImageOff,
  ImagePlus,
  Loader2,
  Package,
} from "lucide-react";
import MediaPickerModal from "./MediaPickerModal";
import type { StockProduct } from "@/lib/supabase/products";

/**
 * La photo envoyee avec le message WhatsApp, une par code article.
 *
 * C'est le code article qui designe la photo, et non le nom du produit :
 * le rapprochement par nom depend de l'orthographe de la boutique, et
 * une commande dont le nom avait change se retrouvait sans photo.
 *
 * L'ecran signale aussi les photos mortes. Les adresses de la boutique
 * ne survivent pas a une republication de ses images — quatre sur sept
 * pointaient dans le vide sans que rien ne le dise. Deposer la photo ici
 * la met hors d'atteinte de ces changements.
 */

/** Ce que le navigateur a reussi a faire de la photo. */
type Etat = "ok" | "morte";

export default function WhatsappPhotosPanel({ isAdmin }: { isAdmin: boolean }) {
  const [products, setProducts] = useState<StockProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<StockProduct | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [etats, setEtats] = useState<Record<string, Etat>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setProducts(data.products ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Catalogue indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setImage(product: StockProduct, url: string) {
    setPicking(null);
    setSavingId(product.id);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enregistrement refuse.");

      setProducts((prev) =>
        (prev ?? []).map((p) => (p.id === product.id ? { ...p, image: url } : p))
      );
      // La photo change d'adresse : ce qu'on savait de l'ancienne ne dit
      // plus rien de la nouvelle.
      setEtats((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setJustSaved(product.id);
      setTimeout(() => setJustSaved(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSavingId(null);
    }
  }

  const mortes = (products ?? []).filter((p) => etats[p.id] === "morte").length;
  const sansPhoto = (products ?? []).filter((p) => !p.image).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-1 flex items-center gap-2 text-h3 font-semibold text-gray-900">
        <Package className="h-4 w-4 text-gray-400" />
        Photos par code article
      </p>
      <p className="mb-4 text-[12.5px] text-gray-500">
        La photo envoyee avec le message WhatsApp, choisie par code
        article. Deposez-la ici plutot que de dependre de la boutique :
        une image republiee la-bas change d&apos;adresse et disparait.
      </p>

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {products && (mortes > 0 || sansPhoto > 0) && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          {mortes > 0 && (
            <>
              {mortes} photo{mortes > 1 ? "s" : ""} ne se charge
              {mortes > 1 ? "nt" : ""} plus.{" "}
            </>
          )}
          {sansPhoto > 0 && (
            <>
              {sansPhoto} article{sansPhoto > 1 ? "s" : ""} sans photo : leur
              message partira sans image.
            </>
          )}
        </p>
      )}

      {!products && !error && (
        <p className="flex items-center gap-2 py-6 text-[12.5px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement du catalogue...
        </p>
      )}

      {products?.length === 0 && (
        <p className="py-6 text-center text-[12.5px] text-gray-400">
          Aucun article au catalogue.
        </p>
      )}

      <div className="space-y-2">
        {(products ?? []).map((product) => {
          const morte = etats[product.id] === "morte";
          return (
            <div
              key={product.id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                {product.image && !morte ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                    unoptimized
                    onError={() =>
                      setEtats((prev) => ({ ...prev, [product.id]: "morte" }))
                    }
                    onLoad={() =>
                      setEtats((prev) => ({ ...prev, [product.id]: "ok" }))
                    }
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-4 w-4 text-gray-300" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] font-medium text-gray-800">
                  {product.forcelogRef || product.ref}
                </p>
                <p className="truncate text-[12px] text-gray-500">
                  {product.name}
                </p>
                {morte && (
                  <p className="text-[11.5px] text-red-600">
                    Cette photo ne se charge plus.
                  </p>
                )}
                {!product.image && (
                  <p className="text-[11.5px] text-amber-600">Aucune photo.</p>
                )}
              </div>

              {isAdmin && (
                <button
                  onClick={() => setPicking(product)}
                  disabled={savingId === product.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {savingId === product.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : justSaved === product.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  {product.image ? "Changer" : "Ajouter"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {picking && (
        <MediaPickerModal
          onClose={() => setPicking(null)}
          onSelect={(url) => void setImage(picking, url)}
        />
      )}
    </div>
  );
}

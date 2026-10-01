/**
 * La photo du produit, posee dans le presse-papier.
 *
 * WhatsApp n'accepte pas de piece jointe par un lien : `wa.me` ne
 * transporte que du texte. Le presse-papier est le seul chemin vers
 * une vraie image — un appui long dans la conversation la sort.
 *
 * Le meme geste sert depuis la fiche d'appel et depuis la file de
 * suivi. Deux copies du code auraient fini par diverger, et c'est
 * justement le genre de detail qu'on ne corrige qu'une fois sur deux.
 */

/**
 * Re-encode en PNG ce qui ne l'est pas.
 *
 * Le presse-papier des navigateurs n'accepte que le PNG pour une
 * image, et les photos de la boutique arrivent souvent en webp.
 */
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await new Promise((resolve) =>
      canvas.toBlob((png) => resolve(png ?? blob), "image/png")
    );
  } catch {
    // Format que le navigateur ne decode pas : tenter l'original vaut
    // mieux que renoncer.
    return blob;
  }
}

/**
 * Copie la photo du produit d'une commande.
 *
 * L'image est confiee a `ClipboardItem` sous forme de promesse :
 * Safari refuse une ecriture qui arrive apres un `await`, le geste de
 * l'utilisateur etant alors considere comme termine.
 *
 * Leve si la photo manque ou si le presse-papier est ferme. C'est a
 * l'appelant de decider — et dans les deux cas le message doit partir
 * quand meme, sans image.
 */
export async function copyProductPhoto(leadId: string): Promise<void> {
  const png = (async () => {
    const res = await fetch(`/api/leads/${leadId}/product-image`);
    if (!res.ok) throw new Error("Photo du produit indisponible.");
    return toPng(await res.blob());
  })();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

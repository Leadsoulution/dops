"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  MessageCircle,
  Phone,
  StickyNote,
} from "lucide-react";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "./leads-data";
import {
  messageKeyFor,
  messageLabelFor,
  templateFor,
  whatsappLink,
  whatsappNumber,
} from "@/lib/whatsapp";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Resultat d'un appel de confirmation.
 *
 * Les six statuts mis en avant sont ceux qu'un agent pose apres un
 * appel. Les dix-sept autres restent accessibles derriere "Autre
 * statut" : les afficher tous ferait un mur de boutons ou l'on ne
 * trouverait plus les trois qui servent vraiment.
 */

/**
 * Ce navigateur sait-il mettre une image dans le presse-papier ?
 *
 * Lu par `useSyncExternalStore` et non dans un effet : c'est un etat
 * exterieur a React, et le serveur doit rendre la meme chose que le
 * premier rendu du navigateur.
 */
function subscribeNothing() {
  return () => {};
}

function supportsImageCopy() {
  return (
    typeof navigator !== "undefined" &&
    typeof ClipboardItem === "function" &&
    typeof navigator.clipboard?.write === "function"
  );
}

/**
 * Reencode une image en PNG.
 *
 * Le presse-papier des navigateurs n'accepte qu'un seul format d'image,
 * et c'est le PNG. La boutique publiant ses photos en .webp, il faut
 * donc les convertir — ce que le navigateur sait faire seul, puisqu'il
 * decode le webp pour l'afficher.
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

const QUICK_STATUSES: { label: LeadStatus; className: string }[] = [
  { label: "Confirme", className: "bg-emerald-700 hover:bg-emerald-800" },
  { label: "Rappel", className: "bg-blue-600 hover:bg-blue-700" },
  { label: "Pas de rep 1", className: "bg-slate-500 hover:bg-slate-600" },
  { label: "Injoignable 1", className: "bg-orange-500 hover:bg-orange-600" },
  { label: "Annulee", className: "bg-red-600 hover:bg-red-700" },
  { label: "En attente", className: "bg-purple-600 hover:bg-purple-700" },
];

export default function CallOutcomePanel({
  lead,
  onStatusChange,
  onNoteChange,
}: {
  lead: Lead;
  onStatusChange: (status: LeadStatus) => Promise<void> | void;
  /** Enregistre la consigne du client. Absente, la case n'est pas modifiable. */
  onNoteChange?: (note: string) => Promise<void> | void;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LeadStatus | null>(null);
  /**
   * Les modeles enregistres, et ou en est leur lecture.
   *
   * L'etat de lecture compte autant que le contenu : un modele pas
   * encore arrive est indiscernable d'un modele inexistant, et
   * `templateFor` rend alors le texte propose par defaut. Le bouton
   * restant cliquable, le client recevait le texte generique a la place
   * de celui qui avait ete ecrit pour lui — sans que rien ne le signale.
   */
  const [templates, setTemplates] = useState<{
    map: Record<string, string>;
    loaded: boolean;
    failed: boolean;
  }>({ map: {}, loaded: false, failed: false });
  const [savingNote, setSavingNote] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const canCopyImage = useSyncExternalStore(
    subscribeNothing,
    supportsImageCopy,
    () => false
  );

  /**
   * La note en cours de frappe, et celle qui est enregistree.
   *
   * Les deux voyagent ensemble pour que la saisie se remette au bon
   * texte quand la fiche change de commande, ou quand la base renvoie
   * la valeur ecrite — sans passer par un effet, qui ecraserait la
   * frappe d'un rendu sur l'autre.
   */
  const savedNote = lead.customerNote ?? "";
  const [note, setNote] = useState({
    leadId: lead.id,
    saved: savedNote,
    draft: savedNote,
  });
  if (note.leadId !== lead.id || note.saved !== savedNote) {
    setNote({ leadId: lead.id, saved: savedNote, draft: savedNote });
  }
  const dirty = note.draft.trim() !== savedNote.trim();

  /**
   * Envoie la photo du produit avec le message, par la feuille de
   * partage du telephone.
   *
   * C'est le seul chemin vers une vraie image : un lien wa.me ne
   * transporte que du texte. En contrepartie il ne sait pas designer le
   * destinataire — l'agent choisit le client dans WhatsApp. Le bouton
   * d'appel reste donc a cote, pour les cas ou le texte suffit.
   */
  /**
   * Copie la photo du produit, puis ouvre la conversation du client.
   *
   * La feuille de partage joignait bien l'image, mais elle ne sait pas
   * designer le destinataire : il fallait retrouver le client a la main.
   * Le lien wa.me, lui, ouvre la bonne conversation avec le message deja
   * ecrit. La photo passe donc par le presse-papier, d'ou un appui long
   * la sort dans la conversation.
   *
   * La navigation a lieu quoi qu'il arrive : un presse-papier refuse ne
   * doit pas retenir l'agent devant un bouton qui ne fait rien.
   */
  async function sendWithPhoto() {
    setShareError(null);
    setSharing(true);
    try {
      // L'image est confiee a ClipboardItem sous forme de promesse :
      // Safari refuse une ecriture qui arrive apres un `await`, le geste
      // de l'utilisateur etant alors considere comme termine.
      const png = (async () => {
        const res = await fetch(`/api/leads/${lead.id}/product-image`);
        if (!res.ok) throw new Error("Photo du produit indisponible.");
        return toPng(await res.blob());
      })();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
    } catch {
      // Photo introuvable ou presse-papier ferme : le message part
      // quand meme, sans image.
      setShareError("Photo non copiee : le message part sans elle.");
    } finally {
      setSharing(false);
    }

    window.location.assign(whatsappLink(lead, message));
  }

  async function saveNote() {
    if (!onNoteChange) return;
    setSavingNote(true);
    try {
      await onNoteChange(note.draft.trim());
    } finally {
      setSavingNote(false);
    }
  }

  // Les modeles de messages, relus a l'ouverture de la fiche : un
  // administrateur peut les avoir changes depuis le dernier chargement.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/whatsapp")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (cancelled) return;
        setTemplates({ map: data?.templates ?? {}, loaded: true, failed: false });
      })
      .catch(() => {
        // Session expiree, reseau coupe : on ne sait pas quels textes
        // ont ete ecrits. Le dire vaut mieux que d'en envoyer un autre.
        if (!cancelled) setTemplates({ map: {}, loaded: true, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Le message suit ce dont le client a besoin d'entendre parler. Tant
  // que la commande n'est pas confirmee, c'est la commande ; une fois
  // partie chez le transporteur, c'est ou se trouve son colis.
  const messageKey = messageKeyFor(lead);
  const message = templateFor(messageKey, templates.map);
  const reachable = Boolean(whatsappNumber(lead.phone));
  /** Ce telephone peut-il joindre la photo au message ? */
  const withPhoto = canCopyImage && Boolean(lead.productImage);

  async function apply(status: LeadStatus) {
    setConfirming(null);
    setPending(status);
    try {
      await onStatusChange(status);
    } finally {
      setPending(null);
    }
  }

  /** Reposer le statut deja en place ne change rien : autant l'ignorer. */
  function ask(status: LeadStatus) {
    if (status === lead.status) return;
    setConfirming(status);
  }

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
        <Phone className="h-3 w-3" />
        APPEL ET STATUT
      </p>

      <a
        href={`tel:${lead.phone.replace(/\s/g, "")}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-[13.5px] font-medium text-white hover:bg-blue-700"
      >
        <Phone className="h-4 w-4" />
        Appeler {lead.client.split(" ")[0] || "le client"}
      </a>
      {/*
        Un seul bouton, qui prend le meilleur chemin disponible.

        WhatsApp n'en offre pas qui fasse tout : son lien wa.me designe
        le destinataire mais ne transporte que du texte, sa feuille de
        partage accepte l'image mais ignore le destinataire. Le telephone
        qui sait partager un fichier envoie donc la photo ; partout
        ailleurs — un ordinateur, ou un produit sans photo — le lien
        reprend la main, avec le contact deja choisi.
      */}
      {reachable && withPhoto ? (
        <button
          onClick={sendWithPhoto}
          disabled={sharing || !templates.loaded}
          title={message}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2.5 text-[13.5px] font-medium text-white hover:bg-[#1eb855] disabled:opacity-60"
        >
          {sharing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          WhatsApp &mdash; {messageLabelFor(messageKey)}
        </button>
      ) : reachable && !templates.loaded ? (
        <span className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366]/60 py-2.5 text-[13.5px] font-medium text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
          WhatsApp &mdash; lecture des messages...
        </span>
      ) : reachable ? (
        <a
          href={whatsappLink(lead, message)}
          target="_blank"
          rel="noopener noreferrer"
          title={message}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2.5 text-[13.5px] font-medium text-white hover:bg-[#1eb855] disabled:opacity-60"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp &mdash; {messageLabelFor(messageKey)}
        </a>
      ) : (
        <p className="mt-2 rounded-lg border border-gray-200 py-2 text-center text-[12px] text-gray-400">
          Pas de numero utilisable pour WhatsApp
        </p>
      )}

      {withPhoto ? (
        <p className="mt-1.5 text-center text-[11.5px] text-gray-400">
          La conversation de {lead.client.split(" ")[0] || "ce client"}{" "}
          s&apos;ouvre avec le message. La photo est copiee : appui long dans
          la zone de saisie, puis Coller.
        </p>
      ) : (
        <p className="mt-1.5 text-center text-[11.5px] text-gray-400">
          Si votre navigateur n&apos;ouvre pas le composeur, copiez le numero :{" "}
          <span className="font-mono text-gray-500">{lead.phone}</span>
        </p>
      )}
      {templates.failed && (
        <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-center text-[11.5px] text-amber-800">
          Vos messages enregistres n&apos;ont pas pu etre lus : c&apos;est le
          texte par defaut qui partira. Rechargez la page.
        </p>
      )}
      {shareError && (
        <p className="mt-1 text-center text-[11.5px] text-red-600">
          {shareError}
        </p>
      )}
      {/*
        La vraie photo, jointe au message. WhatsApp ne sait pas prendre
        une image par un lien wa.me : il faut passer par la feuille de
        partage du telephone, qui accepte le fichier et met le texte en
        legende. Le prix a payer est le destinataire, que ce chemin ne
        sait pas designer.
      */}

      {/*
        La consigne du client. Elle vit ici, sous le bouton WhatsApp,
        parce que c'est au telephone qu'on l'apprend : "livrer apres
        19H" se note pendant l'appel, pas dans un second ecran.
      */}
      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-gray-500">
          <StickyNote className="h-3 w-3" />
          NOTE DU CLIENT
        </p>
        <textarea
          value={note.draft}
          onChange={(e) => setNote({ ...note, draft: e.target.value })}
          rows={2}
          maxLength={255}
          placeholder="Ex. livrer apres 19H, appeler avant de passer..."
          className="w-full resize-y rounded-lg border border-gray-300 px-2.5 py-2 text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />

        {/*
          Le transporteur ne sait pas modifier un colis deja cree : une
          note ajoutee apres l'expedition ne descendra jamais jusqu'au
          livreur, et le dire ici evite de compter sur elle.
        */}
        <p className="mt-1 text-[11.5px] text-gray-400">
          {lead.trackingNumber ? (
            <span className="text-amber-600">
              Colis deja cree : cette note reste dans l&apos;application et ne
              sera pas transmise au livreur.
            </span>
          ) : (
            "Elle partira chez le transporteur avec le colis."
          )}
        </p>

        {dirty && (
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={saveNote}
              disabled={savingNote}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2 text-[12.5px] font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {savingNote && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enregistrer la note
            </button>
            <button
              onClick={() => setNote({ ...note, draft: note.saved })}
              disabled={savingNote}
              className="rounded-lg border border-gray-300 px-3 py-2 text-[12.5px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      <p className="mb-2 mt-3 text-[12.5px] text-gray-600">
        Resultat de l&apos;appel
      </p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_STATUSES.map((option) => {
          const active = lead.status === option.label;
          return (
            <button
              key={option.label}
              onClick={() => ask(option.label)}
              disabled={pending !== null}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[12.5px] font-medium text-white transition-colors disabled:opacity-60 ${option.className} ${
                active ? "ring-2 ring-gray-900 ring-offset-1" : ""
              }`}
            >
              {pending === option.label ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : active ? (
                <Check className="h-3.5 w-3.5" />
              ) : null}
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setAllOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50"
      >
        Autre statut
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${allOpen ? "rotate-180" : ""}`}
        />
      </button>

      {allOpen && (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {LEAD_STATUSES.filter(
              (s) => !QUICK_STATUSES.some((q) => q.label === s.label)
            ).map((status) => {
              const active = lead.status === status.label;
              return (
                <button
                  key={status.label}
                  onClick={() => ask(status.label)}
                  disabled={pending !== null}
                  className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium disabled:opacity-60 ${status.badge} ${
                    active ? "ring-2 ring-gray-900 ring-offset-1" : ""
                  }`}
                >
                  {pending === status.label ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : active ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  {status.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Confirmer le changement de statut"
          message={
            <>
              Passer <span className="font-medium text-gray-700">{lead.client}</span>{" "}
              en <span className="font-medium text-gray-700">{confirming}</span> ?
              {confirming === "Confirme" && !lead.trackingNumber && (
                <span className="mt-1.5 block text-amber-600">
                  Le colis partira aussitot chez le transporteur.
                </span>
              )}
            </>
          }
          confirmLabel="Appliquer le statut"
          pending={pending !== null}
          onConfirm={() => apply(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      <p className="mt-2 text-[11.5px] text-gray-400">
        Statut actuel :{" "}
        <span className="font-medium text-gray-600">{lead.status}</span>
        {lead.status === "Confirme" && !lead.trackingNumber && (
          <span className="text-amber-600">
            {" "}
            &middot; en cours d&apos;envoi chez le transporteur
          </span>
        )}
      </p>
    </div>
  );
}

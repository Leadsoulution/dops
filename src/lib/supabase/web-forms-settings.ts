import "server-only";
import { randomBytes } from "node:crypto";
import {
  getIntegrationSettings,
  saveIntegrationSettings,
} from "./integrations";
import { WEB_FORMS_SETTINGS_ID } from "@/lib/web-forms";

/**
 * La cle d'un site fait a la main.
 *
 * Elle n'est pas un secret et ne peut pas l'etre : une page HTML
 * statique porte son code dans le navigateur, donc n'importe quel
 * visiteur peut la lire. Elle sert a ce qu'une adresse publique ne
 * recoive pas les commandes de tout internet, pas a authentifier
 * quelqu'un. Le vrai filtre est l'origine autorisee, que le
 * navigateur, lui, ne laisse pas falsifier.
 *
 * D'ou le stockage en clair : la chiffrer donnerait l'illusion d'un
 * secret la ou il n'y en a pas.
 */

export type WebFormsSettings = {
  /** Vide tant que personne n'a demande de cle. */
  token: string;
  /**
   * Le site autorise a poster, par exemple "https://loora.ma".
   * Vide : toutes les origines sont acceptees.
   */
  origin: string;
};

type Stocke = Record<string, string>;

export async function getWebFormsSettings(): Promise<WebFormsSettings> {
  const s = (await getIntegrationSettings<Stocke>(WEB_FORMS_SETTINGS_ID).catch(
    () => ({})
  )) as Stocke;
  return { token: s.token ?? "", origin: s.origin ?? "" };
}

/** Une cle neuve. L'ancienne cesse de marcher a l'instant. */
export async function rotateWebFormsToken(): Promise<WebFormsSettings> {
  const actuel = await getWebFormsSettings();
  const settings: WebFormsSettings = {
    token: randomBytes(24).toString("base64url"),
    origin: actuel.origin,
  };
  await saveIntegrationSettings(WEB_FORMS_SETTINGS_ID, settings);
  return settings;
}

export async function setWebFormsOrigin(
  origin: string
): Promise<WebFormsSettings> {
  const actuel = await getWebFormsSettings();
  // Sans le protocole, la comparaison avec l'en-tete Origin du
  // navigateur echouerait toujours : "loora.ma" n'est pas
  // "https://loora.ma".
  const propre = origin.trim().replace(/\/+$/, "");
  const settings: WebFormsSettings = { token: actuel.token, origin: propre };
  await saveIntegrationSettings(WEB_FORMS_SETTINGS_ID, settings);
  return settings;
}

/**
 * L'origine est-elle celle qu'on attend ?
 *
 * Aucune origine configuree : on laisse passer, sinon la premiere
 * commande d'un site qu'on vient de brancher serait rejetee sans que
 * personne comprenne pourquoi. Une origine configuree ferme la porte
 * a tout le reste.
 */
export function origineAutorisee(
  attendue: string,
  recue: string | null
): boolean {
  if (!attendue) return true;
  if (!recue) return true; // curl, serveur a serveur : pas de navigateur.
  return recue.replace(/\/+$/, "") === attendue;
}

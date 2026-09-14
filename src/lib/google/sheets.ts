import "server-only";
import { getIntegrationSettings } from "@/lib/supabase/integrations";
import { getAccessToken, GoogleError, type ServiceAccount } from "./auth";

/**
 * Feuille de sauvegarde des commandes.
 *
 * Le sens principal va de l'application vers la feuille : elle est un
 * miroir, pas une source. Une seule colonne fait le chemin inverse, le
 * statut de confirmation, parce que c'est la seule decision qu'une
 * equipe prend parfois dans la feuille plutot que dans l'application.
 *
 * Laisser revenir le reste rouvrirait la porte aux conflits : deux
 * personnes modifiant la meme commande des deux cotes, sans savoir qui
 * l'emporte.
 */

const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Colonnes de la feuille, dans l'ordre. La reference sert de clef. */
export const SHEET_HEADERS = [
  "Reference",
  "Date",
  "Client",
  "Telephone",
  "Ville",
  "Adresse",
  "Produit",
  "Quantite",
  "Montant",
  "Source",
  "Assigne a",
  "Statut de confirmation",
  "Transporteur",
  "Code suivi",
  "Statut livraison",
  "Statut paiement",
  "Date de livraison",
];

/** Position de la colonne relue, seule a revenir vers l'application. */
export const STATUS_COLUMN_INDEX = SHEET_HEADERS.indexOf(
  "Statut de confirmation"
);

export type SheetsSettings = {
  spreadsheetId: string;
  sheetName: string;
  serviceAccount: string;
};

export async function getSheetsSettings(): Promise<Partial<SheetsSettings>> {
  return getIntegrationSettings<SheetsSettings>("google-sheets");
}

export async function isSheetsConfigured(): Promise<boolean> {
  const s = await getSheetsSettings();
  return Boolean(s.spreadsheetId && s.serviceAccount);
}

function parseAccount(raw?: string): ServiceAccount {
  if (!raw) {
    throw new GoogleError("Aucun compte de service enregistre.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GoogleError(
      "Le compte de service n'est pas un JSON valide. Collez le fichier telecharge depuis Google Cloud."
    );
  }
  const account = parsed as Partial<ServiceAccount>;
  if (!account.client_email || !account.private_key) {
    throw new GoogleError(
      "Ce JSON n'est pas une cle de compte de service : il lui manque client_email ou private_key."
    );
  }
  return account as ServiceAccount;
}

async function sheetsRequest<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {}
): Promise<T> {
  const settings = await getSheetsSettings();
  if (!settings.spreadsheetId) {
    throw new GoogleError("Aucune feuille Google configuree.");
  }
  const token = await getAccessToken(parseAccount(settings.serviceAccount));

  const url = new URL(`${API}/${settings.spreadsheetId}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message ?? `Google a repondu ${res.status}.`;
    if (res.status === 403) {
      throw new GoogleError(
        `${message} Partagez la feuille avec l'adresse du compte de service, en droit Editeur.`
      );
    }
    if (res.status === 404) {
      throw new GoogleError(
        "Feuille introuvable. Verifiez l'identifiant du document."
      );
    }
    throw new GoogleError(message);
  }
  return data as T;
}

/** Nom de l'onglet, entre apostrophes si besoin, pour une plage A1. */
function range(sheetName: string, cells: string) {
  const safe = sheetName.replace(/'/g, "''");
  return `'${safe}'!${cells}`;
}

export async function readColumn(
  columnLetter: string
): Promise<string[][]> {
  const settings = await getSheetsSettings();
  const sheet = settings.sheetName || "Commandes";
  const data = await sheetsRequest<{ values?: string[][] }>(
    `/values/${encodeURIComponent(range(sheet, `A:${columnLetter}`))}`
  );
  return data.values ?? [];
}

export async function writeRange(
  cells: string,
  values: (string | number)[][]
): Promise<void> {
  const settings = await getSheetsSettings();
  const sheet = settings.sheetName || "Commandes";
  await sheetsRequest(
    `/values/${encodeURIComponent(range(sheet, cells))}`,
    {
      method: "PUT",
      query: { valueInputOption: "RAW" },
      body: JSON.stringify({ values }),
    }
  );
}

/** Cree l'onglet s'il n'existe pas encore. Sans effet s'il est la. */
export async function ensureSheetExists(): Promise<void> {
  const settings = await getSheetsSettings();
  const sheet = settings.sheetName || "Commandes";
  const meta = await sheetsRequest<{
    sheets?: { properties?: { title?: string } }[];
  }>("", { query: { fields: "sheets.properties.title" } });

  const exists = (meta.sheets ?? []).some((s) => s.properties?.title === sheet);
  if (exists) return;

  // Creer un onglet passe par :batchUpdate, pas par le document lui-meme.
  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheet } } }],
    }),
  }).catch(() => {
    /* Deja cree entre-temps : rien a faire. */
  });
}

/** Verifie que la feuille est joignable et modifiable. */
export async function checkSheetsConnection(): Promise<{ title: string }> {
  const meta = await sheetsRequest<{ properties?: { title?: string } }>("", {
    query: { fields: "properties.title" },
  });
  return { title: meta.properties?.title ?? "Document" };
}

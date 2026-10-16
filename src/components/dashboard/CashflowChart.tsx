"use client";

/**
 * Le cashflow du mois : ce qui est entre, ce qui est sorti, ce qui
 * reste.
 *
 * C'etait une courbe de surface. Sur deux mois, une courbe n'a que
 * deux points : elle tracait deux droites obliques dont les
 * remplissages se recouvraient en un aplat gris, sans un seul chiffre
 * lisible, et les graduations de l'axe ne tombaient pas en face des
 * valeurs. Une forme faite pour montrer une tendance sur trente points
 * ne dit rien de deux.
 *
 * Des colonnes, donc : une paire par mois, le montant pose sur chaque
 * tete, et le profit sous le mois. Chaque valeur se lit sans survol ni
 * calcul, ce qui est la seule chose qu'on demande a ce graphique.
 *
 * Le vert et le rouge sont ceux du reste de l'application. Leur ecart
 * percu sous deutanopie est juste au-dessus du seuil : les montants
 * ecrits sur chaque colonne et la legende portent donc l'identite des
 * series, la couleur ne fait que la rappeler.
 */

export type CashflowPoint = {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
};

const REVENU = "#10b981";
const DEPENSE = "#ef4444";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nfCourt = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 0,
});

/** "2026-09" devient "sept. 2026". */
function moisCourt(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function CashflowChart({ months }: { months: CashflowPoint[] }) {
  if (months.length === 0) return null;

  const max = Math.max(
    1,
    ...months.flatMap((m) => [m.revenue, m.expenses])
  );
  // Un peu d'air au-dessus de la plus haute colonne : son montant s'y
  // ecrit, et une etiquette collee au bord de la carte se lit mal.
  const plafond = max * 1.14;

  /*
   * Le montant pose sur une colonne ne doit pas deborder sur sa
   * voisine : deux colonnes ne sont separees que de deux pixels. Un
   * chiffre court tient, un chiffre long s'abrege — "34 010" devient
   * "34 k" — et le tableau juste en dessous garde la valeur exacte.
   */
  const etiquette = (v: number) => {
    const exact = nf.format(v);
    return exact.length <= 5 ? exact : nfCourt.format(v);
  };

  /*
   * Deux mois ne remplissent pas une carte de mille pixels.
   *
   * Les colonnes sont plafonnees a vingt-quatre pixels — au-dela elles
   * deviennent des aplats — et sans largeur maximale, deux paires de
   * batonnets flottaient au milieu d'un vide. Le graphique prend donc
   * la place de ses mois, et pas plus.
   */
  const largeur = months.length * 120;

  return (
    <div className="w-full" style={{ maxWidth: largeur }}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: REVENU }}
          />
          Revenu livre
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: DEPENSE }}
          />
          Depenses
        </span>
      </div>

      <div className="relative h-[200px]">
        {/* Quatre filets pleins, une nuance au-dessus du fond : ils
            situent sans peser. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span
            key={f}
            className="absolute inset-x-0 h-px bg-gray-100"
            style={{ bottom: `${f * 100}%` }}
          />
        ))}

        <div className="relative flex h-full items-end gap-1.5 sm:gap-3">
          {months.map((m) => (
            <div
              key={m.month}
              title={`${moisCourt(m.month)} — revenu ${nf.format(
                m.revenue
              )} DH · depenses ${nf.format(m.expenses)} DH · profit ${nf.format(
                m.profit
              )} DH`}
              className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
            >
              {/* Posee avant les colonnes et non positionnee au-dessus
                  d'elles : un calque en retrait passerait derriere le
                  fond blanc de la carte et ne se verrait jamais. */}
              <span className="pointer-events-none absolute inset-x-0 -inset-y-1 rounded-lg bg-gray-50 opacity-0 transition-opacity group-hover:opacity-100" />
              <Colonne value={m.revenue} ceiling={plafond} color={REVENU} label={etiquette(m.revenue)} />
              <Colonne value={m.expenses} ceiling={plafond} color={DEPENSE} label={etiquette(m.expenses)} />
            </div>
          ))}
        </div>
      </div>

      {/* La bande des mois vit hors du cadre trace : une hauteur fixe
          qui engloberait les etiquettes les couperait. */}
      <div className="mt-2 flex items-start gap-1.5 sm:gap-3">
        {months.map((m) => (
          <div key={m.month} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[11.5px] font-medium text-gray-700">
              {moisCourt(m.month)}
            </p>
            <p
              className={`truncate text-[11.5px] font-semibold ${
                m.profit < 0 ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {m.profit > 0 ? "+" : ""}
              {nf.format(m.profit)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Une colonne et son montant.
 *
 * Vingt-quatre pixels au plus : une colonne qui remplit tout son
 * emplacement devient un aplat, et c'est l'air autour d'elle qui la
 * rend lisible. Le sommet est arrondi, le pied reste carre — il pose
 * sur la ligne de base.
 */
function Colonne({
  value,
  ceiling,
  color,
  label,
}: {
  value: number;
  ceiling: number;
  color: string;
  label: string;
}) {
  return (
    <div className="relative flex h-full max-w-[24px] flex-1 flex-col justify-end">
      <p className="mb-1 whitespace-nowrap text-center text-[10px] font-medium text-gray-600">
        {label}
      </p>
      <div
        className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-90"
        style={{
          height: `${Math.max(2, (value / ceiling) * 100)}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

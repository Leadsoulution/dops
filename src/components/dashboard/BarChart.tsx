/**
 * Diagramme en barres.
 *
 * Une courbe relie ses points, ce qui suggere un passage continu d'une
 * valeur a l'autre. Des livraisons par jour ne se comportent pas ainsi :
 * ce sont des quantites separees, et chacune se lit et se compare mieux
 * comme une barre.
 *
 * Construit en HTML plutot qu'en SVG : les barres s'adaptent alors
 * d'elles-memes a la largeur disponible, sans recalcul a chaque rendu.
 */
export default function BarChart({
  data,
  color = "#2563eb",
  height = 180,
  valueLabel = (v) => String(v),
}: {
  data: { label: string; value: number; title?: string }[];
  color?: string;
  height?: number;
  /** Texte de l'infobulle, pour donner l'unite. */
  valueLabel?: (value: number) => string;
}) {
  // L'echelle part de zero : commencer au minimum exagererait les
  // ecarts, et une barre n'a de sens que mesuree depuis rien.
  const max = Math.max(...data.map((d) => d.value), 1);

  // Au-dela d'une vingtaine de jours, tout etiqueter rendrait l'axe
  // illisible : on n'en garde qu'un sur n, le premier et le dernier
  // toujours compris.
  const step = Math.ceil(data.length / 8);

  return (
    <div>
      <div
        className="flex items-end gap-1"
        style={{ height }}
        role="img"
        aria-label={`Diagramme en barres, ${data.length} valeurs`}
      >
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            style={{ height: "100%" }}
            title={`${d.title ?? d.label} — ${valueLabel(d.value)}`}
          >
            {/*
              Une valeur nulle garde un filet visible : une colonne vide
              se confondrait avec une absence de donnee.
            */}
            <div
              className="w-full rounded-t-[3px] transition-[height]"
              style={{
                height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 1)}%`,
                backgroundColor: d.value > 0 ? color : "#e5e7eb",
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1">
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}-label`}
            className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-gray-400"
          >
            {i % step === 0 || i === data.length - 1 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Courbe de tendance.
 *
 * Elle est tracee dans un repere fixe puis etiree a la largeur qui lui
 * est donnee (`preserveAspectRatio="none"`), ce qui lui permet de
 * traverser toute la carte quelle que soit sa taille, sans recalculer
 * les points a chaque rendu.
 */
export default function Sparkline({
  data,
  positive,
  width = 120,
  height = 40,
  className,
  neutral = false,
}: {
  data: number[];
  positive: boolean;
  /** Ni hausse ni baisse : aucune comparaison n'etait possible. */
  neutral?: boolean;
  width?: number;
  height?: number;
  /** Laisse l'appelant decider de la largeur reelle a l'ecran. */
  className?: string;
}) {
  // Une courbe a besoin d'au moins deux points ; une valeur seule est
  // doublee pour tracer une ligne plate plutot que rien.
  const serie = data.length > 1 ? data : [data[0] ?? 0, data[0] ?? 0];
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const range = max - min || 1;

  const points = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  // Le rouge annonce une baisse. Sans periode de comparaison, il
  // alarmerait sans raison : la courbe reste alors bleue.
  const color = neutral ? "#2563eb" : positive ? "#10b981" : "#ef4444";
  const tone = neutral ? "neutre" : positive ? "pos" : "neg";
  const gradientId = `spark-${tone}-${serie.join("-")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className ?? "overflow-visible"}
      style={className ? undefined : { width, height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        // L'etirement horizontal deformerait l'epaisseur du trait.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

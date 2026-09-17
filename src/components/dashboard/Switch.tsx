/**
 * L'interrupteur seul, sans intitule.
 *
 * `Toggle` l'habille d'un libelle et d'une description pour les listes
 * de reglages ; les ecrans qui composent leur propre ligne s'en servent
 * directement. Une seule definition visuelle, donc un seul endroit ou la
 * changer.
 */
export default function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Lu par les lecteurs d'ecran, l'interrupteur n'ayant pas de texte. */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        checked ? "bg-gray-900" : "bg-gray-200"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

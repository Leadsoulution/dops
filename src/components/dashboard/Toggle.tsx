import Switch from "./Switch";

/** Une ligne de reglage : intitule, explication, et son interrupteur. */
export default function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-4 py-3 text-left">
      <button type="button" onClick={onChange} className="min-w-0 text-left">
        <p className="text-[13px] font-medium text-gray-700">{label}</p>
        <p className="text-[12px] text-gray-500">{description}</p>
      </button>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

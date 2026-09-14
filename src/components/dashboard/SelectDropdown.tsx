"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import type { ComponentType } from "react";
import AnchoredMenu from "./AnchoredMenu";

type BaseProps = {
  /**
   * - "filter" : pave large, pour un panneau de filtres deplie
   * - "field"  : champ de formulaire pleine largeur
   * - "chip"   : pastille compacte, pour une barre de filtres en ligne
   */
  variant?: "filter" | "field" | "chip";
  icon?: ComponentType<{ className?: string }>;
  panelTitle?: string;
  pinnedLabel: string;
  /**
   * Intitule de la ligne "tout afficher" en tete de panneau. Par defaut
   * `pinnedLabel`, mais en pastille celui-ci sert de nom de filtre.
   */
  allLabel?: string;
  options: string[];
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Single-select only: controls the displayed value externally. */
  value?: string;
  /** Single-select only: called when an option is chosen. */
  onSelect?: (value: string) => void;
};

type SingleSelectProps = BaseProps & {
  multi?: false;
};

type MultiSelectProps = BaseProps & {
  multi: true;
  /** Appelee a chaque changement de selection, avec la liste complete. */
  onMultiChange?: (values: string[]) => void;
};

type SelectDropdownProps = SingleSelectProps | MultiSelectProps;

export default function SelectDropdown(props: SelectDropdownProps) {
  const {
    variant = "filter",
    icon: Icon,
    panelTitle,
    pinnedLabel,
    allLabel,
    options,
    multi,
    searchable,
    searchPlaceholder = "Rechercher...",
    value,
    onSelect,
  } = props;
  const onMultiChange = multi ? props.onMultiChange : undefined;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const selected = !multi && value !== undefined ? value : internalSelected;

  function selectOption(option: string | null) {
    if (!multi) {
      if (onSelect && option !== null) onSelect(option);
      if (value === undefined) setInternalSelected(option);
    }
    setOpen(false);
  }
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchable || !query) return options;
    return options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  }, [options, query, searchable]);

  // En pastille, l'intitule du filtre reste visible et la selection est
  // resumee par un compteur : la barre garde des largeurs stables.
  const triggerLabel =
    multi && variant !== "chip"
      ? multiSelected.length > 0
        ? `${multiSelected.length} selectionne${multiSelected.length > 1 ? "s" : ""}`
        : pinnedLabel
      : multi
        ? pinnedLabel
        : (selected ?? pinnedLabel);

  function toggleMultiOption(option: string) {
    // La nouvelle valeur est calculee avant l'appel a setState : prevenir
    // le parent depuis l'interieur d'une fonction de mise a jour
    // declencherait un setState du parent pendant le rendu de ce
    // composant, ce que React signale comme une erreur.
    const next = multiSelected.includes(option)
      ? multiSelected.filter((o) => o !== option)
      : [...multiSelected, option];
    setMultiSelected(next);
    onMultiChange?.(next);
  }

  function clearMultiSelection() {
    setMultiSelected([]);
    onMultiChange?.([]);
  }

  const chipActive = variant === "chip" && (multi ? multiSelected.length > 0 : !!selected);

  const triggerClasses =
    variant === "field"
      ? "flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50"
      : variant === "chip"
        ? `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[12.5px] whitespace-nowrap transition-colors ${
            chipActive
              ? "border-blue-200 bg-blue-50 font-medium text-blue-700"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          }`
        : "flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[12.5px] text-gray-600 hover:bg-gray-50";

  const panelClasses = `overflow-hidden rounded-xl border border-gray-200 bg-white ${
    variant === "chip" ? "" : "shadow-lg"
  }`;

  const panelContent = (
    <>
          {panelTitle && (
            <p className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold text-gray-500">
              {panelTitle}
            </p>
          )}

          {searchable && (
            <div className="relative border-b border-gray-100 p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-gray-200 py-1.5 pl-7 pr-2 text-[12.5px] text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {!multi && value === undefined && (
              <button
                onClick={() => selectOption(null)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] ${
                  selected === null
                    ? "bg-blue-50 font-medium text-blue-600"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Check
                  className={`h-3.5 w-3.5 shrink-0 ${selected === null ? "opacity-100" : "opacity-0"}`}
                />
                {allLabel ?? pinnedLabel}
              </button>
            )}

            {multi && (
              <button
                onClick={clearMultiSelection}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] ${
                  multiSelected.length === 0
                    ? "bg-blue-50 font-medium text-blue-600"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {allLabel ?? pinnedLabel}
              </button>
            )}

            {filteredOptions.map((option) =>
              multi ? (
                <label
                  key={option}
                  className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-gray-700 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={multiSelected.includes(option)}
                    onChange={() => toggleMultiOption(option)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  {option}
                </label>
              ) : (
                <button
                  key={option}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] ${
                    selected === option
                      ? "bg-blue-50 font-medium text-blue-600"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${selected === option ? "opacity-100" : "opacity-0"}`}
                  />
                  {option}
                </button>
              )
            )}
          </div>
    </>
  );

  return (
    <div className={variant === "chip" ? "shrink-0" : "relative"} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClasses}
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon && (
            <Icon
              className={`h-3.5 w-3.5 shrink-0 ${chipActive ? "text-blue-500" : "text-gray-400"}`}
            />
          )}
          <span className="truncate">{triggerLabel}</span>
        </span>
        {variant === "chip" && multi && multiSelected.length > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-[10.5px] font-semibold leading-[17px] text-white tabular-nums">
            {multiSelected.length}
          </span>
        )}
        {variant === "field" ? (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 ${chipActive ? "text-blue-500" : "text-gray-400"}`}
          />
        )}
      </button>

      {open && variant === "chip" && (
        <AnchoredMenu
          open={open}
          anchorRef={buttonRef}
          onClose={() => setOpen(false)}
          width={240}
        >
          <div className={panelClasses}>{panelContent}</div>
        </AnchoredMenu>
      )}

      {open && variant !== "chip" && (
        <div
          className={`absolute left-0 top-full z-30 mt-1.5 shadow-lg ${panelClasses} ${
            variant === "field" ? "w-full" : "w-64"
          }`}
        >
          {panelContent}
        </div>
      )}
    </div>
  );
}

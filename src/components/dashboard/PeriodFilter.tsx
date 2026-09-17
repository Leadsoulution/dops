"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import DateRangeCalendar from "./DateRangeCalendar";
import type { Range } from "./useTeamStats";

/**
 * Selecteur de periode, partage par les pages de la confirmation.
 *
 * Les bornes sont calculees ailleurs (`useTeamStats`) : ici on ne fait
 * que choisir, pour que le meme choix donne partout le meme intervalle.
 */

const RANGES = [
  "Aujourd'hui",
  "Hier",
  "7 derniers jours",
  "Ce mois-ci",
  "Maximum",
  "Personnalisee",
];

export default function PeriodFilter({
  range,
  onChange,
}: {
  range: Range;
  onChange: (range: Range) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const customLabel = range.custom
    ? `${fmt(range.custom.start)} - ${fmt(range.custom.end)}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGES.map((label) => (
        <div key={label} className="relative">
          <button
            onClick={() => {
              if (label === "Personnalisee") setCalendarOpen((v) => !v);
              else {
                onChange({ label, custom: null });
                setCalendarOpen(false);
              }
            }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              range.label === label
                ? "bg-gray-900 text-white"
                : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label === "Maximum" && <Calendar className="h-3.5 w-3.5" />}
            {label === "Personnalisee" && customLabel ? customLabel : label}
          </button>

          {label === "Personnalisee" && calendarOpen && (
            <DateRangeCalendar
              initialStart={range.custom?.start}
              initialEnd={range.custom?.end}
              onApply={(start, end) => {
                onChange({ label: "Personnalisee", custom: { start, end } });
                setCalendarOpen(false);
              }}
              onClear={() => {
                onChange({ label: "Maximum", custom: null });
                setCalendarOpen(false);
              }}
              onCancel={() => setCalendarOpen(false)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** "3 sept." — assez court pour tenir dans la pastille. */
function fmt(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

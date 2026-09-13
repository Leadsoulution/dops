"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const monthNames = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

const weekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];

type Cell = { date: Date; inMonth: boolean };

function getMonthMatrix(year: number, month: number): Cell[] {
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: Cell[] = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

function sameDay(a?: Date | null, b?: Date | null) {
  return !!a && !!b && a.toDateString() === b.toDateString();
}

export default function DateRangeCalendar({
  onApply,
  onCancel,
  initialStart,
  initialEnd,
  onClear,
}: {
  onApply: (start: Date, end: Date) => void;
  onCancel: () => void;
  /**
   * Plage deja appliquee, reaffichee a l'ouverture : sans elle, le
   * calendrier s'ouvre vide alors qu'un filtre est actif.
   */
  initialStart?: Date | null;
  initialEnd?: Date | null;
  /**
   * Appele par "Effacer". Vider la seule selection interne ne suffit
   * pas : la liste reste filtree sur la plage precedemment appliquee, et
   * le bouton parait sans effet. C'est au parent de retirer son filtre.
   */
  onClear?: () => void;
}) {
  const today = new Date();
  // Le calendrier s'ouvre sur le mois de la plage en cours, sinon sur le
  // mois courant.
  const [viewYear, setViewYear] = useState(
    (initialStart ?? today).getFullYear()
  );
  const [viewMonth, setViewMonth] = useState((initialStart ?? today).getMonth());
  const [rangeStart, setRangeStart] = useState<Date | null>(initialStart ?? null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(initialEnd ?? null);

  function pickDay(d: Date) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(d);
      setRangeEnd(null);
    } else if (d < rangeStart) {
      setRangeEnd(rangeStart);
      setRangeStart(d);
    } else {
      setRangeEnd(d);
    }
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  function renderMonth(year: number, month: number, showPrev: boolean, showNext: boolean) {
    const cells = getMonthMatrix(year, month);
    return (
      <div className="flex-1">
        <div className="mb-2 flex items-center justify-between px-1">
          {showPrev ? (
            <button
              onClick={() => shiftMonth(-1)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <p className="text-[12.5px] font-medium text-gray-700">
            {monthNames[month]} {year}
          </p>
          {showNext ? (
            <button
              onClick={() => shiftMonth(1)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <span className="w-4" />
          )}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {weekdayLabels.map((w, i) => (
            <span key={i} className="text-[10.5px] font-medium text-gray-400">
              {w}
            </span>
          ))}
          {cells.map((cell, i) => {
            const inRange =
              rangeStart && rangeEnd && cell.date >= rangeStart && cell.date <= rangeEnd;
            const isEdge = sameDay(cell.date, rangeStart) || sameDay(cell.date, rangeEnd);
            return (
              <button
                key={i}
                disabled={!cell.inMonth}
                onClick={() => pickDay(cell.date)}
                className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full font-mono text-[12px] ${
                  !cell.inMonth
                    ? "text-gray-300"
                    : isEdge
                      ? "bg-gray-900 font-medium text-white"
                      : inRange
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {cell.date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const summary = rangeStart
    ? `${rangeStart.getDate()} ${monthNames[rangeStart.getMonth()].slice(0, 3)} ${
        rangeEnd
          ? `- ${rangeEnd.getDate()} ${monthNames[rangeEnd.getMonth()].slice(0, 3)} ${rangeEnd.getFullYear()}`
          : rangeStart.getFullYear()
      }`
    : "Selectionnez une periode";

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-[calc(100vw-2rem)] max-w-[520px] rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
      <div className="flex gap-6">
        {renderMonth(viewYear, viewMonth, true, false)}
        {renderMonth(nextYear, nextMonth, false, true)}
      </div>
      <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-gray-600">{summary}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              setRangeStart(null);
              setRangeEnd(null);
              onClear?.();
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            Effacer
          </button>
          <button
            disabled={!rangeStart}
            onClick={() => rangeStart && onApply(rangeStart, rangeEnd ?? rangeStart)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-gray-800 disabled:opacity-40"
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}

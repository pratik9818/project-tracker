import { useState } from 'react'
import type { ActivityCalendar } from '@shared/types'

/**
 * A GitHub-style contribution graph of entries closed per day.
 *
 * The data layer already shaped the year into a grid (`counts[0]` is a
 * Sunday), so the layout is just a CSS grid that flows down columns: 7 rows,
 * one column per week. No date maths happens here except for the labels.
 */

const CELL = 11
const GAP = 3

/** GitHub's dark-theme scale: empty, then four greens. */
const LEVEL_CLASSES = [
  'bg-[#161b22]',
  'bg-[#0e4429]',
  'bg-[#006d32]',
  'bg-[#26a641]',
  'bg-[#39d353]'
] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * 0 for nothing, otherwise 1–4 relative to your own busiest day — so the
 * shading means something whether you close 2 things a day or 40.
 */
function levelFor(count: number, max: number): number {
  if (count === 0 || max === 0) return 0
  return Math.max(1, Math.ceil((count / max) * 4))
}

/** `YYYY-MM-DD` -> a local Date, `offset` days later. */
function dayAt(startDay: string, offset: number): Date {
  const [year, month, day] = startDay.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + offset)
}

/** One label per month, on the first week column whose Sunday is in it. */
function monthLabels(startDay: string, weeks: number): Array<{ week: number; label: string }> {
  const labels: Array<{ week: number; label: string }> = []
  let previousMonth = -1
  for (let week = 0; week < weeks; week += 1) {
    const month = dayAt(startDay, week * 7).getMonth()
    if (month === previousMonth) continue
    previousMonth = month
    // Skip a label that would collide with the one just placed (e.g. the
    // grid starts in the last days of a month).
    const last = labels[labels.length - 1]
    if (last !== undefined && week - last.week < 3) labels.pop()
    labels.push({ week, label: MONTHS[month] ?? '' })
  }
  return labels
}

export function ContributionGraph({ calendar }: { calendar: ActivityCalendar }): JSX.Element {
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)

  const { startDay, counts, total } = calendar
  const weeks = Math.ceil(counts.length / 7)
  const max = Math.max(0, ...counts)
  const track = { gridAutoColumns: `${CELL}px`, columnGap: `${GAP}px` }

  const hovered = hover === null ? null : { count: counts[hover.index] ?? 0, date: dayAt(startDay, hover.index) }

  return (
    <section className="relative">
      <h3 className="mb-2 text-base text-slate-200">
        {total} {total === 1 ? 'entry' : 'entries'} closed in the last year
      </h3>

      <div className="rounded-md border border-slate-700/70 px-4 pb-3 pt-4">
        <div className="overflow-x-auto">
          <div className="inline-flex flex-col">
            {/* Month labels, on the same column track as the grid. */}
            <div className="grid grid-flow-col pl-9 text-xs text-slate-300" style={track}>
              {monthLabels(startDay, weeks).map(({ week, label }) => (
                <span key={week} className="whitespace-nowrap" style={{ gridColumnStart: week + 1 }}>
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-1.5 flex">
              {/* Weekday labels: only Mon / Wed / Fri, like GitHub. */}
              <div
                className="grid w-9 shrink-0 text-xs text-slate-300"
                style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` }}
              >
                {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((label, row) => (
                  <span key={row} className="leading-[11px]">
                    {label}
                  </span>
                ))}
              </div>

              <div
                className="grid grid-flow-col"
                style={{ ...track, gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` }}
                onMouseLeave={() => setHover(null)}
              >
                {counts.map((count, index) => (
                  <div
                    key={index}
                    className={`rounded-sm outline-1 outline-offset-0 outline-white/5 [outline-style:solid] ${LEVEL_CLASSES[levelFor(count, max)]}`}
                    onMouseEnter={(event) => {
                      const cell = event.currentTarget.getBoundingClientRect()
                      const box = event.currentTarget.closest('section')?.getBoundingClientRect()
                      setHover({
                        index,
                        x: cell.left + cell.width / 2 - (box?.left ?? 0),
                        y: cell.top - (box?.top ?? 0)
                      })
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>Every entry marked done, in any list, on the day you closed it.</span>
          <span className="flex items-center gap-1">
            Less
            {LEVEL_CLASSES.map((className) => (
              <span
                key={className}
                className={`inline-block rounded-sm ${className}`}
                style={{ width: CELL, height: CELL }}
              />
            ))}
            More
          </span>
        </div>
      </div>

      {hover !== null && hovered !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 shadow-lg"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          {hovered.count === 0 ? 'Nothing' : `${hovered.count} closed`} on{' '}
          {hovered.date.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      )}
    </section>
  )
}

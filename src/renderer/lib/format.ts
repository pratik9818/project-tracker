const DAY = 24 * 60 * 60 * 1000

function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * A due date as a human would say it: "today", "tomorrow", "3 days ago".
 * Falls back to a date once it is far enough away to be worth spelling out.
 */
export function formatDueDate(dueAt: number, now: number = Date.now()): string {
  const days = Math.round((startOfLocalDay(dueAt) - startOfLocalDay(now)) / DAY)

  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < 0) return `${Math.abs(days)} days ago`
  if (days < 7) return `in ${days} days`

  return new Date(dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** True if a due date is before today — drives the overdue styling. */
export function isOverdue(dueAt: number, now: number = Date.now()): boolean {
  return startOfLocalDay(dueAt) < startOfLocalDay(now)
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** Priority 1 is the most urgent. Anything unset shows nothing. */
export function priorityLabel(priority: number | null): string | null {
  if (priority === null) return null
  return `P${priority}`
}

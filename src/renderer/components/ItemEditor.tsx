import { useEffect, useState } from 'react'
import { ITEM_STATUSES, type Item, type ItemStatus, type Project, type Tag } from '@shared/types'
import { useAppStore } from '@renderer/store/useAppStore'
import { useAsync } from '@renderer/hooks/useAsync'

/**
 * Inline editor for one item.
 *
 * Status and the content fields go through separate IPC calls because they
 * have separate rules in the data layer: status keeps done_at truthful, while
 * editing text is a plain update. Lists are edited live, one tag at a time.
 */
export function ItemEditor({
  item,
  onClose,
  onSaved
}: {
  item: Item
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [title, setTitle] = useState(item.title ?? '')
  const [content, setContent] = useState(item.content ?? '')
  const [url, setUrl] = useState(item.url ?? '')
  const [language, setLanguage] = useState(item.language ?? '')
  const [priority, setPriority] = useState(item.priority?.toString() ?? '')
  const [dueAt, setDueAt] = useState(toDateInput(item.dueAt))
  const [status, setStatus] = useState<ItemStatus>(item.status ?? 'open')
  const [projectId, setProjectId] = useState<number | null>(item.projectId)
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dataVersion = useAppStore((state) => state.dataVersion)
  const refresh = useAppStore((state) => state.refresh)

  const projects = useAsync<Project[]>(() => window.api.projects.list({}), [dataVersion])
  const [tags, setTags] = useState<Tag[]>([])

  useEffect(() => {
    void window.api.tags.forItem({ itemId: item.id }).then(setTags)
  }, [item.id])

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await window.api.items.update({
        id: item.id,
        patch: {
          title: title.trim() === '' ? null : title.trim(),
          content: content.trim() === '' ? null : content.trim(),
          url: url.trim() === '' ? null : url.trim(),
          language: language.trim() === '' ? null : language.trim(),
          priority: priority !== '' ? Number(priority) : null,
          dueAt: fromDateInput(dueAt)
        }
      })

      if (status !== item.status) {
        await window.api.items.setStatus({ id: item.id, status })
      }

      if (projectId !== item.projectId) {
        await window.api.items.move({
          id: item.id,
          scope: projectId === null ? { kind: 'inbox' } : { kind: 'project', projectId }
        })
      }

      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm('Delete this item? This cannot be undone.')) return
    await window.api.items.delete({ id: item.id })
    onSaved()
  }

  async function addTag(): Promise<void> {
    const name = newTag.trim()
    if (name === '') return
    await window.api.tags.add({ itemId: item.id, name })
    setNewTag('')
    setTags(await window.api.tags.forItem({ itemId: item.id }))
    // Lists changed: the row chips and project tabs behind the editor re-query.
    refresh()
  }

  async function removeTag(tagId: number): Promise<void> {
    await window.api.tags.remove({ itemId: item.id, tagId })
    setTags(await window.api.tags.forItem({ itemId: item.id }))
    refresh()
  }

  return (
    <div
      className="border-b border-slate-700 bg-slate-900/80 px-3 py-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save()
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Body — notes, a snippet, whatever you dumped"
        rows={4}
        className="mt-2 w-full rounded bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Field label="Project">
          <select
            value={projectId ?? ''}
            onChange={(event) =>
              setProjectId(event.target.value === '' ? null : Number(event.target.value))
            }
            className="rounded bg-slate-800 px-2 py-1 text-slate-200"
          >
            <option value="">Inbox</option>
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ItemStatus)}
            className="rounded bg-slate-800 px-2 py-1 text-slate-200"
          >
            {ITEM_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="rounded bg-slate-800 px-2 py-1 text-slate-200"
          >
            <option value="">none</option>
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
          </select>
        </Field>

        <Field label="Due">
          <input
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="rounded bg-slate-800 px-2 py-1 text-slate-200"
          />
        </Field>

        <Field label="URL">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            className="w-56 rounded bg-slate-800 px-2 py-1 text-slate-200"
          />
        </Field>

        <Field label="Language">
          <input
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="ts"
            className="w-16 rounded bg-slate-800 px-2 py-1 text-slate-200"
          />
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300"
          >
            #{tag.name}
            <button
              type="button"
              onClick={() => void removeTag(tag.id)}
              className="text-slate-500 hover:text-rose-400"
              aria-label={`Remove from list ${tag.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void addTag()
            }
          }}
          placeholder="add to list"
          className="w-24 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-500"
        />
      </div>

      {error !== null && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          Cancel
        </button>
        <span className="text-[11px] text-slate-500">Ctrl+Enter saves · Esc closes</span>
        <button
          type="button"
          onClick={() => void remove()}
          className="ml-auto rounded px-3 py-1 text-xs text-rose-400 hover:bg-rose-950/50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-slate-500">{label}</span>
      {children}
    </label>
  )
}

/** Unix ms -> the yyyy-mm-dd an <input type="date"> expects, in local time. */
function toDateInput(ms: number | null): string {
  if (ms === null) return ''
  const date = new Date(ms)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** yyyy-mm-dd -> Unix ms at local midday, so a timezone shift cannot move the day. */
function fromDateInput(value: string): number | null {
  if (value === '') return null
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return null
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime()
}

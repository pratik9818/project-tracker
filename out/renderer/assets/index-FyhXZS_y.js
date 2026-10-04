import { r as reactExports, R as React, j as jsxRuntimeExports, s as splitHighlights, I as ITEM_STATUSES, p as parseLine, P as PROJECT_STATUSES, a as parseBuffer, D as DEFAULT_LIST, n as nextMarker, c as createRoot } from "./index-DH-wEsFj.js";
function useAsync(run, deps) {
  const [state, setState] = reactExports.useState({ data: null, error: null, loading: true });
  reactExports.useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true }));
    run().then((data) => {
      if (!cancelled) setState({ data, error: null, loading: false });
    }).catch((cause) => {
      if (!cancelled) {
        setState({ data: null, error: cause instanceof Error ? cause.message : String(cause), loading: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, deps);
  return state;
}
function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = reactExports.useState(value);
  reactExports.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
const createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;
const identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    () => selector(api.getState()),
    () => selector(api.getInitialState())
  );
  React.useDebugValue(slice);
  return slice;
}
const createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
const create = (createState) => createState ? createImpl(createState) : createImpl;
const useAppStore = create((set) => ({
  // The Scratchpad is the landing view: the app opens ready to be typed into,
  // not showing you a list of things you already captured.
  view: { kind: "scratchpad" },
  setView: (view) => set({ view }),
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  dataVersion: 0,
  refresh: () => set((state) => ({ dataVersion: state.dataVersion + 1 }))
}));
function Highlighted({ marked }) {
  if (marked === null || marked.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: splitHighlights(marked).map(
    (segment, index) => segment.match ? /* @__PURE__ */ jsxRuntimeExports.jsx("mark", { className: "rounded-sm bg-amber-400/25 px-0.5 text-amber-200", children: segment.text }, index) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: segment.text }, index)
  ) });
}
function ItemEditor({
  item,
  onClose,
  onSaved
}) {
  const [title, setTitle] = reactExports.useState(item.title ?? "");
  const [content, setContent] = reactExports.useState(item.content ?? "");
  const [url, setUrl] = reactExports.useState(item.url ?? "");
  const [language, setLanguage] = reactExports.useState(item.language ?? "");
  const [priority, setPriority] = reactExports.useState(item.priority?.toString() ?? "");
  const [dueAt, setDueAt] = reactExports.useState(toDateInput(item.dueAt));
  const [status, setStatus] = reactExports.useState(item.status ?? "open");
  const [projectId, setProjectId] = reactExports.useState(item.projectId);
  const [newTag, setNewTag] = reactExports.useState("");
  const [error, setError] = reactExports.useState(null);
  const [saving, setSaving] = reactExports.useState(false);
  const dataVersion = useAppStore((state) => state.dataVersion);
  const projects = useAsync(() => window.api.projects.list({}), [dataVersion]);
  const [tags, setTags] = reactExports.useState([]);
  reactExports.useEffect(() => {
    void window.api.tags.forItem({ itemId: item.id }).then(setTags);
  }, [item.id]);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await window.api.items.update({
        id: item.id,
        patch: {
          title: title.trim() === "" ? null : title.trim(),
          content: content.trim() === "" ? null : content.trim(),
          url: url.trim() === "" ? null : url.trim(),
          language: language.trim() === "" ? null : language.trim(),
          priority: priority !== "" ? Number(priority) : null,
          dueAt: fromDateInput(dueAt)
        }
      });
      if (status !== item.status) {
        await window.api.items.setStatus({ id: item.id, status });
      }
      if (projectId !== item.projectId) {
        await window.api.items.move({
          id: item.id,
          scope: projectId === null ? { kind: "inbox" } : { kind: "project", projectId }
        });
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    await window.api.items.delete({ id: item.id });
    onSaved();
  }
  async function addTag() {
    const name = newTag.trim();
    if (name === "") return;
    await window.api.tags.add({ itemId: item.id, name });
    setNewTag("");
    setTags(await window.api.tags.forItem({ itemId: item.id }));
  }
  async function removeTag(tagId) {
    await window.api.tags.remove({ itemId: item.id, tagId });
    setTags(await window.api.tags.forItem({ itemId: item.id }));
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "border-b border-slate-700 bg-slate-900/80 px-3 py-3",
      onKeyDown: (event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            autoFocus: true,
            value: title,
            onChange: (event) => setTitle(event.target.value),
            placeholder: "Title",
            className: "w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            value: content,
            onChange: (event) => setContent(event.target.value),
            placeholder: "Body — notes, a snippet, whatever you dumped",
            rows: 4,
            className: "mt-2 w-full rounded bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-2 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Project", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: projectId ?? "",
              onChange: (event) => setProjectId(event.target.value === "" ? null : Number(event.target.value)),
              className: "rounded bg-slate-800 px-2 py-1 text-slate-200",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Inbox" }),
                (projects.data ?? []).map((project) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: project.id, children: project.name }, project.id))
              ]
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Status", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: status,
              onChange: (event) => setStatus(event.target.value),
              className: "rounded bg-slate-800 px-2 py-1 text-slate-200",
              children: ITEM_STATUSES.map((value) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value, children: value }, value))
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Priority", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: priority,
              onChange: (event) => setPriority(event.target.value),
              className: "rounded bg-slate-800 px-2 py-1 text-slate-200",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "none" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "1", children: "P1" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "2", children: "P2" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "3", children: "P3" })
              ]
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Due", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: dueAt,
              onChange: (event) => setDueAt(event.target.value),
              className: "rounded bg-slate-800 px-2 py-1 text-slate-200"
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "URL", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: url,
              onChange: (event) => setUrl(event.target.value),
              placeholder: "https://",
              className: "w-56 rounded bg-slate-800 px-2 py-1 text-slate-200"
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Language", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: language,
              onChange: (event) => setLanguage(event.target.value),
              placeholder: "ts",
              className: "w-16 rounded bg-slate-800 px-2 py-1 text-slate-200"
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-1.5", children: [
          tags.map((tag) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "span",
            {
              className: "flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300",
              children: [
                "#",
                tag.name,
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => void removeTag(tag.id),
                    className: "text-slate-500 hover:text-rose-400",
                    "aria-label": `Remove from list ${tag.name}`,
                    children: "×"
                  }
                )
              ]
            },
            tag.id
          )),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: newTag,
              onChange: (event) => setNewTag(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addTag();
                }
              },
              placeholder: "add to list",
              className: "w-24 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-500"
            }
          )
        ] }),
        error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-rose-400", children: error }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: saving,
              onClick: () => void save(),
              className: "rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50",
              children: "Save"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "rounded bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-slate-500", children: "Ctrl+Enter saves · Esc closes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => void remove(),
              className: "ml-auto rounded px-3 py-1 text-xs text-rose-400 hover:bg-rose-950/50",
              children: "Delete"
            }
          )
        ] })
      ]
    }
  );
}
function Field({ label, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-500", children: label }),
    children
  ] });
}
function toDateInput(ms) {
  if (ms === null) return "";
  const date = new Date(ms);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
function fromDateInput(value) {
  if (value === "") return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === void 0 || month === void 0 || day === void 0) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}
const PROJECT_LIMIT = 5;
const ITEM_LIMIT = 30;
function SearchPalette() {
  const [open, setOpen] = reactExports.useState(false);
  reactExports.useEffect(() => window.api.onToggleSearch(() => setOpen((current) => !current)), []);
  if (!open) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(Palette, { onClose: () => setOpen(false) });
}
function Palette({ onClose }) {
  const setView = useAppStore((state) => state.setView);
  const refresh = useAppStore((state) => state.refresh);
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [query, setQuery] = reactExports.useState("");
  const [activeIndex, setActiveIndex] = reactExports.useState(0);
  const [editing, setEditing] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  const listRef = reactExports.useRef(null);
  const debounced = useDebounced(query.trim(), 80);
  const projects = useAsync(() => window.api.projects.list({}), [dataVersion]);
  const results = useAsync(
    () => debounced === "" ? Promise.resolve([]) : window.api.search.query({ query: debounced, limit: ITEM_LIMIT }),
    [debounced, dataVersion]
  );
  const needle = debounced.toLowerCase();
  const matchingProjects = needle === "" ? [] : (projects.data ?? []).filter((project) => project.name.toLowerCase().includes(needle)).slice(0, PROJECT_LIMIT);
  const rows = [
    ...matchingProjects.map((project) => ({ kind: "project", project })),
    ...(results.data ?? []).map((result) => ({ kind: "item", result }))
  ];
  const projectNames = new Map((projects.data ?? []).map((project) => [project.id, project.name]));
  reactExports.useEffect(() => setActiveIndex(0), [debounced]);
  reactExports.useEffect(() => {
    const active = listRef.current?.querySelector(`[data-row="${activeIndex}"]`);
    if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  function pick(row) {
    if (row.kind === "project") {
      setView({ kind: "project", projectId: row.project.id });
      onClose();
    } else {
      setEditing(row.result.item);
    }
  }
  function backToResults() {
    setEditing(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (rows.length > 0) setActiveIndex((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length > 0) setActiveIndex((index) => (index - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row !== void 0) pick(row);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[12vh]",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full max-w-2xl overflow-hidden rounded-lg border border-slate-700 bg-[#0d1219] shadow-xl", children: editing !== null ? (
        // ItemEditor handles Esc itself by calling onClose — here that means
        // "back to the results", not "close the palette".
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ItemEditor,
          {
            item: editing,
            onClose: backToResults,
            onSaved: () => {
              refresh();
              backToResults();
            }
          }
        )
      ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            ref: inputRef,
            autoFocus: true,
            value: query,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown,
            placeholder: "search notes, todos, bugs, snippets, projects…",
            spellCheck: false,
            className: "w-full border-b border-slate-800 bg-transparent px-4 py-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: listRef, className: "max-h-[60vh] overflow-y-auto py-1", children: debounced === "" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Hint, { children: "Type to search everything." }) : rows.length === 0 && !results.loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs(Hint, { children: [
          "Nothing matches “",
          debounced,
          "”."
        ] }) : rows.map((row, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            "data-row": index,
            onMouseEnter: () => setActiveIndex(index),
            onClick: () => pick(row),
            className: `flex w-full items-center gap-3 px-4 py-2 text-left ${index === activeIndex ? "bg-slate-800" : ""}`,
            children: row.kind === "project" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300", children: "project" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate text-sm text-slate-100", children: row.project.name })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
              ItemRowContent,
              {
                result: row.result,
                projectName: row.result.item.projectId === null ? "Inbox" : projectNames.get(row.result.item.projectId) ?? ""
              }
            )
          },
          row.kind === "project" ? `p${row.project.id}` : `i${row.result.item.id}`
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-slate-800 px-4 py-2 font-mono text-[10px] text-slate-600", children: "↑↓ move · enter opens · esc closes" })
      ] }) })
    }
  );
}
function ItemRowContent({
  result,
  projectName
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block truncate text-sm text-slate-100", children: result.titleMarked !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx(Highlighted, { marked: result.titleMarked }) : result.item.title ?? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "italic text-slate-500", children: "untitled" }) }),
      result.contentMarked !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block truncate text-xs text-slate-500", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Highlighted, { marked: result.contentMarked }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[11px] text-slate-500", children: projectName })
  ] });
}
function Hint({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 text-xs text-slate-600", children });
}
function DeleteProjectDialog({
  project,
  onClose,
  onDeleted
}) {
  const [busy, setBusy] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const stats = useAsync(() => window.api.projects.stats({ id: project.id }), [
    project.id
  ]);
  const itemCount = stats.data?.items ?? 0;
  async function remove(mode) {
    setBusy(true);
    setError(null);
    try {
      await window.api.projects.delete({ id: project.id, mode });
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6",
      onKeyDown: (event) => {
        if (event.key === "Escape") onClose();
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-slate-100", children: [
          "Delete “",
          project.name,
          "”?"
        ] }),
        itemCount === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-slate-400", children: "This project has no items." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm text-slate-400", children: [
          "It holds",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-medium text-slate-200", children: [
            itemCount,
            " ",
            itemCount === 1 ? "item" : "items"
          ] }),
          ". What should happen to them?"
        ] }),
        error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-rose-400", children: error }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => void remove("move_to_inbox"),
              className: "rounded bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50",
              children: [
                "Move ",
                itemCount > 0 ? "them " : "",
                "to Inbox, then delete the project"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => void remove("delete_items"),
              className: "rounded bg-rose-700 px-3 py-2 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50",
              children: [
                "Delete the project and ",
                itemCount > 0 ? "all its items" : "it"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: onClose,
              className: "rounded bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700",
              children: "Cancel"
            }
          )
        ] })
      ] })
    }
  );
}
function Sidebar() {
  const { view, setView, dataVersion, refresh } = useAppStore();
  const [deleting, setDeleting] = reactExports.useState(null);
  const [creating, setCreating] = reactExports.useState(false);
  const [newName, setNewName] = reactExports.useState("");
  const projects = useAsync(() => window.api.projects.list({}), [dataVersion]);
  const counts = useAsync(() => window.api.work.counts(), [dataVersion]);
  const inbox = useAsync(() => window.api.items.inboxCount(), [dataVersion]);
  async function createProject() {
    const name = newName.trim();
    if (name === "") return;
    const project = await window.api.projects.create({ name });
    setNewName("");
    setCreating(false);
    refresh();
    setView({ kind: "project", projectId: project.id });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "flex h-full w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-sm font-semibold tracking-tight text-slate-100", children: "DevVault" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavItem,
        {
          label: "Scratchpad",
          active: view.kind === "scratchpad",
          onClick: () => setView({ kind: "scratchpad" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavItem,
        {
          label: "Inbox",
          count: inbox.data ?? 0,
          active: view.kind === "inbox",
          onClick: () => setView({ kind: "inbox" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavItem,
        {
          label: "Today",
          count: counts.data?.today ?? 0,
          highlight: (counts.data?.today ?? 0) > 0,
          active: view.kind === "today",
          onClick: () => setView({ kind: "today" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavItem,
        {
          label: "All Open",
          count: counts.data?.open ?? 0,
          active: view.kind === "allTodos",
          onClick: () => setView({ kind: "allTodos" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavItem,
        {
          label: "Search",
          active: view.kind === "search",
          onClick: () => setView({ kind: "search" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NavItem,
        {
          label: "Activity",
          active: view.kind === "activity",
          onClick: () => setView({ kind: "activity" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex items-center justify-between px-4 pb-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-medium uppercase tracking-wide text-slate-500", children: "Projects" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setCreating(true),
          className: "text-slate-500 hover:text-slate-200",
          "aria-label": "New project",
          children: "+"
        }
      )
    ] }),
    creating && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-2 pb-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        value: newName,
        onChange: (event) => setNewName(event.target.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") void createProject();
          if (event.key === "Escape") {
            setCreating(false);
            setNewName("");
          }
        },
        onBlur: () => {
          if (newName.trim() === "") setCreating(false);
        },
        placeholder: "Project name",
        className: "w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-2 pb-4", children: [
      (projects.data ?? []).map((project) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "group relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          NavItem,
          {
            label: project.name,
            muted: project.status !== "active",
            active: view.kind === "project" && view.projectId === project.id,
            onClick: () => setView({ kind: "project", projectId: project.id })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setDeleting(project),
            className: "absolute right-1 top-1.5 hidden px-1 text-xs text-slate-600 hover:text-rose-400 group-hover:block",
            "aria-label": `Delete ${project.name}`,
            children: "×"
          }
        )
      ] }, project.id)),
      projects.data !== null && projects.data.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-2 py-1 text-xs text-slate-600", children: "No projects yet" })
    ] }),
    deleting !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(
      DeleteProjectDialog,
      {
        project: deleting,
        onClose: () => setDeleting(null),
        onDeleted: () => {
          setDeleting(null);
          if (view.kind === "project" && view.projectId === deleting.id) {
            setView({ kind: "inbox" });
          }
          refresh();
        }
      }
    )
  ] });
}
function NavItem({
  label,
  count,
  active,
  muted,
  highlight,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick,
      className: `flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${active ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"} ${muted === true ? "opacity-50" : ""}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: label }),
        count !== void 0 && count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `ml-2 shrink-0 text-[11px] ${highlight === true ? "text-rose-400" : "text-slate-500"}`, children: count })
      ]
    }
  );
}
function useShortcuts() {
  const setView = useAppStore((state) => state.setView);
  reactExports.useEffect(() => {
    function isTyping(target) {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
    }
    function onKeyDown(event) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      switch (event.key.toLowerCase()) {
        case "k": {
          event.preventDefault();
          setView({ kind: "search" });
          requestAnimationFrame(() => {
            document.querySelector("[data-search-input]")?.focus();
          });
          return;
        }
        case "n": {
          if (isTyping(event.target)) return;
          event.preventDefault();
          document.querySelector("[data-composer]")?.focus();
          return;
        }
        case "1":
          event.preventDefault();
          setView({ kind: "scratchpad" });
          return;
        case "2":
          event.preventDefault();
          setView({ kind: "inbox" });
          return;
        case "3":
          event.preventDefault();
          setView({ kind: "today" });
          return;
        case "4":
          event.preventDefault();
          setView({ kind: "allTodos" });
          return;
        case "5":
          event.preventDefault();
          setView({ kind: "search" });
          return;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setView]);
}
const CELL = 11;
const GAP = 3;
const LEVEL_CLASSES = [
  "bg-[#161b22]",
  "bg-[#0e4429]",
  "bg-[#006d32]",
  "bg-[#26a641]",
  "bg-[#39d353]"
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function levelFor(count, max) {
  if (count === 0 || max === 0) return 0;
  return Math.max(1, Math.ceil(count / max * 4));
}
function dayAt(startDay, offset) {
  const [year, month, day] = startDay.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + offset);
}
function monthLabels(startDay, weeks) {
  const labels = [];
  let previousMonth = -1;
  for (let week = 0; week < weeks; week += 1) {
    const month = dayAt(startDay, week * 7).getMonth();
    if (month === previousMonth) continue;
    previousMonth = month;
    const last = labels[labels.length - 1];
    if (last !== void 0 && week - last.week < 3) labels.pop();
    labels.push({ week, label: MONTHS[month] ?? "" });
  }
  return labels;
}
function ContributionGraph({ calendar }) {
  const [hover, setHover] = reactExports.useState(null);
  const { startDay, counts, total } = calendar;
  const weeks = Math.ceil(counts.length / 7);
  const max = Math.max(0, ...counts);
  const track = { gridAutoColumns: `${CELL}px`, columnGap: `${GAP}px` };
  const hovered = hover === null ? null : { count: counts[hover.index] ?? 0, date: dayAt(startDay, hover.index) };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "relative", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "mb-2 text-base text-slate-200", children: [
      total,
      " ",
      total === 1 ? "entry" : "entries",
      " closed in the last year"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md border border-slate-700/70 px-4 pb-3 pt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex flex-col", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-flow-col pl-9 text-xs text-slate-300", style: track, children: monthLabels(startDay, weeks).map(({ week, label }) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "whitespace-nowrap", style: { gridColumnStart: week + 1 }, children: label }, week)) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "grid w-9 shrink-0 text-xs text-slate-300",
              style: { gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` },
              children: ["", "Mon", "", "Wed", "", "Fri", ""].map((label, row) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "leading-[11px]", children: label }, row))
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "grid grid-flow-col",
              style: { ...track, gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: `${GAP}px` },
              onMouseLeave: () => setHover(null),
              children: counts.map((count, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: `rounded-sm outline-1 outline-offset-0 outline-white/5 [outline-style:solid] ${LEVEL_CLASSES[levelFor(count, max)]}`,
                  onMouseEnter: (event) => {
                    const cell = event.currentTarget.getBoundingClientRect();
                    const box = event.currentTarget.closest("section")?.getBoundingClientRect();
                    setHover({
                      index,
                      x: cell.left + cell.width / 2 - (box?.left ?? 0),
                      y: cell.top - (box?.top ?? 0)
                    });
                  }
                },
                index
              ))
            }
          )
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center justify-between text-xs text-slate-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Every entry marked done, in any list, on the day you closed it." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          "Less",
          LEVEL_CLASSES.map((className) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `inline-block rounded-sm ${className}`,
              style: { width: CELL, height: CELL }
            },
            className
          )),
          "More"
        ] })
      ] })
    ] }),
    hover !== null && hovered !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 shadow-lg",
        style: { left: hover.x, top: hover.y - 6 },
        children: [
          hovered.count === 0 ? "Nothing" : `${hovered.count} closed`,
          " on",
          " ",
          hovered.date.toLocaleDateString(void 0, {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
          })
        ]
      }
    )
  ] });
}
function ViewHeader({
  title,
  subtitle,
  right
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between border-b border-slate-800 px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold tracking-tight text-slate-100", children: title }),
      subtitle !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-xs text-slate-500", children: subtitle })
    ] }),
    right
  ] });
}
function EmptyState({
  children,
  tone = "muted"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `px-4 py-8 text-sm ${tone === "error" ? "text-rose-400" : "text-slate-500"}`, children });
}
function Tabs({
  tabs,
  active,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1 border-b border-slate-800 px-3 py-2", children: tabs.map((tab) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: () => onChange(tab.id),
      className: `rounded px-2.5 py-1 text-xs ${active === tab.id ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"}`,
      children: [
        tab.label,
        tab.count !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1.5 text-slate-500", children: tab.count })
      ]
    },
    tab.id
  )) });
}
function ActivityView() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const calendar = useAsync(() => window.api.activity.calendar(), [dataVersion]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewHeader, { title: "Activity", subtitle: "What you closed, day by day, across every project." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto px-4 py-5", children: [
      calendar.error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { tone: "error", children: calendar.error }),
      calendar.data === null && calendar.error === null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Loading…" }),
      calendar.data !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(ContributionGraph, { calendar: calendar.data })
    ] })
  ] });
}
const DAY = 24 * 60 * 60 * 1e3;
function startOfLocalDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function formatDueDate(dueAt, now = Date.now()) {
  const days = Math.round((startOfLocalDay(dueAt) - startOfLocalDay(now)) / DAY);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 7) return `in ${days} days`;
  return new Date(dueAt).toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
function isOverdue(dueAt, now = Date.now()) {
  return startOfLocalDay(dueAt) < startOfLocalDay(now);
}
function priorityLabel(priority) {
  if (priority === null) return null;
  return `P${priority}`;
}
function ItemRow({
  item,
  projectName,
  titleMarked,
  contentMarked,
  tags
}) {
  const refresh = useAppStore((state) => state.refresh);
  const [editing, setEditing] = reactExports.useState(false);
  const [busy, setBusy] = reactExports.useState(false);
  const done = item.status === "done";
  async function toggleDone() {
    setBusy(true);
    try {
      await window.api.items.toggleDone({ id: item.id });
      refresh();
    } finally {
      setBusy(false);
    }
  }
  if (editing) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      ItemEditor,
      {
        item,
        onClose: () => setEditing(false),
        onSaved: () => {
          setEditing(false);
          refresh();
        }
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "group flex items-start gap-3 border-b border-slate-800/70 px-3 py-2.5 hover:bg-slate-900/60", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "checkbox",
        checked: done,
        disabled: busy,
        onChange: () => void toggleDone(),
        "aria-label": done ? "Mark as not done" : "Mark as done",
        className: "mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-800 accent-emerald-500"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setEditing(true),
        className: "min-w-0 flex-1 text-left",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `truncate text-sm ${done ? "text-slate-500 line-through" : "text-slate-100"}`,
                children: titleMarked !== void 0 && titleMarked !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx(Highlighted, { marked: titleMarked }) : item.title ?? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "italic text-slate-500", children: "untitled" })
              }
            ),
            item.priority !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400", children: priorityLabel(item.priority) }),
            item.dueAt !== null && !done && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `text-[11px] ${isOverdue(item.dueAt) ? "font-medium text-rose-400" : "text-slate-400"}`,
                children: formatDueDate(item.dueAt)
              }
            )
          ] }),
          (contentMarked ?? item.content) !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 truncate text-xs text-slate-400", children: contentMarked !== void 0 && contentMarked !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx(Highlighted, { marked: contentMarked }) : item.content }),
          item.url !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 truncate text-xs text-sky-400", children: item.url }),
          tags !== void 0 && tags.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1.5 flex flex-wrap gap-1", children: tags.map((tag) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400", children: [
            "#",
            tag.name
          ] }, tag.id)) })
        ]
      }
    ),
    projectName !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-0.5 shrink-0 text-[11px] text-slate-500", children: projectName ?? "Inbox" })
  ] });
}
function AllTodosView() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [bucket, setBucket] = reactExports.useState("open");
  const counts = useAsync(() => window.api.work.counts(), [dataVersion]);
  const items = useAsync(() => {
    switch (bucket) {
      case "today":
        return window.api.work.today();
      case "upcoming":
        return window.api.work.upcoming();
      case "done":
        return window.api.work.done({ limit: 200 });
      case "open":
        return window.api.work.allOpen();
    }
  }, [dataVersion, bucket]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewHeader, { title: "All Open", subtitle: "Every open entry, in every list, from every project." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Tabs,
      {
        active: bucket,
        onChange: setBucket,
        tabs: [
          { id: "today", label: "Today", count: counts.data?.today },
          { id: "upcoming", label: "Upcoming", count: counts.data?.upcoming },
          { id: "open", label: "All open", count: counts.data?.open },
          { id: "done", label: "Done", count: counts.data?.done }
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto", children: [
      items.loading && items.data === null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Loading…" }),
      items.error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { tone: "error", children: items.error }),
      items.data?.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Nothing in this bucket." }),
      (items.data ?? []).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(ItemRow, { item, projectName: item.projectName }, item.id))
    ] })
  ] });
}
function Composer({
  scope,
  defaultList,
  placeholder = "Capture anything…  #list  @due"
}) {
  const refresh = useAppStore((state) => state.refresh);
  const [text, setText] = reactExports.useState("");
  const [saving, setSaving] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  async function create2() {
    const parsed = parseLine(text);
    if (!parsed.actionable || saving) return;
    const lists = parsed.tags.length > 0 || defaultList === void 0 ? parsed.tags : [defaultList];
    setSaving(true);
    setError(null);
    try {
      await window.api.items.create({
        lists,
        scope: scope.kind === "all" ? { kind: "inbox" } : scope,
        title: parsed.title,
        dueAt: parsed.dueAt
      });
      setText("");
      refresh();
      inputRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-slate-800 bg-slate-900/40 px-3 py-2.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          ref: inputRef,
          value: text,
          onChange: (event) => setText(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") void create2();
          },
          placeholder,
          "data-composer": true,
          className: "flex-1 rounded bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => void create2(),
          disabled: saving || text.trim() === "",
          className: "rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40",
          children: "Add"
        }
      )
    ] }),
    error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-xs text-rose-400", children: error })
  ] });
}
function InboxView() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [listFilter, setListFilter] = reactExports.useState("all");
  const items = useAsync(
    () => window.api.items.list({
      scope: { kind: "inbox" },
      ...listFilter === "all" ? {} : { tagId: listFilter },
      limit: 500
    }),
    [dataVersion, listFilter]
  );
  const lists = useAsync(
    () => window.api.tags.listWithCounts({ scope: { kind: "inbox" } }),
    [dataVersion]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewHeader, { title: "Inbox", subtitle: "Unfiled captures. Move them into a project when ready." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Composer, { scope: { kind: "inbox" } }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(FilterBar, { listFilter, onListChange: setListFilter, lists: lists.data ?? [] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto", children: [
      items.loading && items.data === null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Loading…" }),
      items.error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { tone: "error", children: items.error }),
      items.data?.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Nothing here. Capture something above." }),
      (items.data ?? []).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(ItemRow, { item }, item.id))
    ] })
  ] });
}
function FilterBar({
  listFilter,
  onListChange,
  lists
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "select",
    {
      value: listFilter,
      onChange: (event) => onListChange(event.target.value === "all" ? "all" : Number(event.target.value)),
      className: "rounded bg-slate-800 px-2 py-1 text-slate-300",
      "aria-label": "Filter by list",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "All lists" }),
        lists.map((list) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: list.id, children: [
          "#",
          list.name,
          " (",
          list.itemCount,
          ")"
        ] }, list.id))
      ]
    }
  ) });
}
function ProjectView({ projectId }) {
  const { dataVersion, refresh } = useAppStore();
  const [tab, setTab] = reactExports.useState("all");
  const [renaming, setRenaming] = reactExports.useState(false);
  const [name, setName] = reactExports.useState("");
  const project = useAsync(
    () => window.api.projects.get({ id: projectId }),
    [projectId, dataVersion]
  );
  const stats = useAsync(
    () => window.api.projects.stats({ id: projectId }),
    [projectId, dataVersion]
  );
  const lists = useAsync(
    () => window.api.tags.listWithCounts({ scope: { kind: "project", projectId } }),
    [projectId, dataVersion]
  );
  const activeList = (lists.data ?? []).find((list) => String(list.id) === tab) ?? null;
  const items = useAsync(
    () => window.api.items.list({
      scope: { kind: "project", projectId },
      ...activeList === null ? {} : { tagId: activeList.id },
      limit: 500
    }),
    [projectId, activeList?.id, dataVersion]
  );
  reactExports.useEffect(() => {
    if (project.data !== null) setName(project.data.name);
  }, [project.data]);
  reactExports.useEffect(() => {
    setTab("all");
  }, [projectId]);
  if (project.data === null && !project.loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Project not found." });
  }
  const current = project.data;
  async function rename() {
    if (name.trim() === "" || current === null) return;
    await window.api.projects.rename({ id: projectId, name: name.trim() });
    setRenaming(false);
    refresh();
  }
  async function setStatus(status) {
    await window.api.projects.setStatus({ id: projectId, status });
    refresh();
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ViewHeader,
      {
        title: current?.name ?? "…",
        subtitle: current?.repoPath ?? void 0,
        right: current !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(StatBadge, { label: "open", value: stats.data?.open ?? 0, tone: "open" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(StatBadge, { label: "done", value: stats.data?.done ?? 0, tone: "done" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(StatBadge, { label: "items", value: stats.data?.items ?? 0 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: current.status,
              onChange: (event) => void setStatus(event.target.value),
              className: "rounded bg-slate-800 px-2 py-1 text-xs text-slate-300",
              "aria-label": "Project status",
              children: PROJECT_STATUSES.map((status) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: status, children: status === "paused" ? "paused (archived)" : status }, status))
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => setRenaming(true),
              className: "rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700",
              children: "Rename"
            }
          )
        ] })
      }
    ),
    renaming && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-slate-800 px-4 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        value: name,
        onChange: (event) => setName(event.target.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") void rename();
          if (event.key === "Escape") {
            setRenaming(false);
            setName(current?.name ?? "");
          }
        },
        className: "w-64 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Tabs,
      {
        active: activeList === null ? "all" : String(activeList.id),
        onChange: setTab,
        tabs: [
          { id: "all", label: "All", count: stats.data?.items ?? 0 },
          ...(lists.data ?? []).map((list) => ({
            id: String(list.id),
            label: `#${list.name}`,
            count: list.itemCount
          }))
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      Composer,
      {
        scope: { kind: "project", projectId },
        ...activeList === null ? {} : { defaultList: activeList.name },
        placeholder: `Add to ${activeList === null ? current?.name ?? "project" : `#${activeList.name}`}…  #list  @due`
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto", children: [
      items.loading && items.data === null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Loading…" }),
      items.error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { tone: "error", children: items.error }),
      items.data?.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Nothing here yet." }),
      (items.data ?? []).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(ItemRow, { item }, item.id))
    ] })
  ] });
}
function StatBadge({
  label,
  value,
  tone
}) {
  const colour = tone === "open" ? "text-amber-300" : tone === "done" ? "text-emerald-300" : "text-slate-300";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded bg-slate-800 px-2 py-1 text-xs", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-medium ${colour}`, children: value }),
    " ",
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-500", children: label })
  ] });
}
const INBOX = { projectId: null, name: "Inbox" };
const RECENT_LIMIT = 5;
function ProjectPicker({
  onPick,
  onClose
}) {
  const [query, setQuery] = reactExports.useState("");
  const [activeIndex, setActiveIndex] = reactExports.useState(0);
  const listRef = reactExports.useRef(null);
  const recent = useAsync(() => window.api.projects.recent({ limit: RECENT_LIMIT }), []);
  const all = useAsync(() => window.api.projects.list({}), []);
  const needle = query.trim().toLowerCase();
  const choices = needle === "" ? [INBOX, ...(recent.data ?? []).map(toChoice)] : [INBOX, ...(all.data ?? []).map(toChoice)].filter(
    (choice) => choice.name.toLowerCase().includes(needle)
  );
  reactExports.useEffect(() => setActiveIndex(0), [needle]);
  reactExports.useEffect(() => {
    const active = listRef.current?.children[activeIndex];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (choices.length > 0) setActiveIndex((index) => (index + 1) % choices.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (choices.length > 0) setActiveIndex((index) => (index - 1 + choices.length) % choices.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = choices[activeIndex];
      if (picked !== void 0) onPick(picked.projectId);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[15vh]",
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md overflow-hidden rounded-lg border border-slate-700 bg-[#0d1219] font-mono shadow-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            autoFocus: true,
            value: query,
            onChange: (event) => setQuery(event.target.value),
            onKeyDown,
            placeholder: "save into which project?",
            spellCheck: false,
            className: "w-full border-b border-slate-800 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pb-1 pt-2 text-[10px] uppercase tracking-wider text-slate-600", children: needle === "" ? "recent" : "matching" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: listRef, className: "max-h-72 overflow-y-auto pb-2", role: "listbox", children: choices.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-2 text-xs text-slate-600", children: [
          "No project matches “",
          query,
          "”"
        ] }) : choices.map((choice, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            role: "option",
            "aria-selected": index === activeIndex,
            onMouseEnter: () => setActiveIndex(index),
            onClick: () => onPick(choice.projectId),
            className: `block w-full px-4 py-1.5 text-left text-xs ${index === activeIndex ? "bg-slate-800 text-slate-100" : "text-slate-400"}`,
            children: choice.name
          },
          choice.projectId ?? "inbox"
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-slate-800 px-4 py-2 text-[10px] text-slate-600", children: "↑↓ move · enter commits here · esc cancels" })
      ] })
    }
  );
}
function toChoice(project) {
  return { projectId: project.id, name: project.name };
}
const KIND_STYLES = {
  tag: "text-sky-400",
  date: "text-amber-400",
  time: "text-amber-300"
};
function SuggestionList({
  suggestions,
  activeIndex,
  top,
  left,
  onPick
}) {
  const listRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const active = listRef.current?.children[activeIndex];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  if (suggestions.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: listRef,
      className: "absolute z-20 max-h-56 w-64 overflow-y-auto rounded border border-slate-700 bg-[#0d1219] py-1 shadow-xl",
      style: { top, left },
      role: "listbox",
      children: suggestions.map((suggestion, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          role: "option",
          "aria-selected": index === activeIndex,
          onMouseDown: (event) => {
            event.preventDefault();
            onPick(suggestion);
          },
          className: `flex w-full items-baseline justify-between gap-3 px-2.5 py-1 text-left font-mono text-xs ${index === activeIndex ? "bg-slate-800" : "hover:bg-slate-800/50"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: KIND_STYLES[suggestion.kind], children: suggestion.value }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[10px] text-slate-600", children: suggestion.hint })
          ]
        },
        `${suggestion.kind}-${suggestion.value}`
      ))
    }
  );
}
const MIRRORED_PROPERTIES = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
  "tabSize"
];
function caretCoordinates(textarea, position) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = computed[property];
  }
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  document.body.removeChild(mirror);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 18;
  return {
    top: top - textarea.scrollTop,
    left: left - textarea.scrollLeft,
    lineHeight
  };
}
function activeToken(value, caret) {
  let index = caret - 1;
  while (index >= 0) {
    const char = value[index];
    if (char === void 0) return null;
    if (char === "#" || char === "@") {
      const before = index === 0 ? " " : value[index - 1];
      if (before !== void 0 && !/\s/.test(before)) return null;
      return {
        sigil: char,
        query: value.slice(index + 1, caret),
        start: index,
        end: caret
      };
    }
    if (/\s/.test(char)) return null;
    index -= 1;
  }
  return null;
}
const SAVE_DEBOUNCE_MS = 400;
const DATE_SUGGESTIONS = [
  { value: "today", hint: "today, midday", kind: "date" },
  { value: "tomorrow", hint: "tomorrow", kind: "date" },
  { value: "mon", hint: "next Monday", kind: "date" },
  { value: "tue", hint: "next Tuesday", kind: "date" },
  { value: "wed", hint: "next Wednesday", kind: "date" },
  { value: "thu", hint: "next Thursday", kind: "date" },
  { value: "fri", hint: "next Friday", kind: "date" },
  { value: "sat", hint: "next Saturday", kind: "date" },
  { value: "sun", hint: "next Sunday", kind: "date" },
  { value: "3d", hint: "in 3 days", kind: "date" },
  { value: "1w", hint: "in a week", kind: "date" },
  { value: "09:00", hint: "today 09:00", kind: "time" },
  { value: "14:00", hint: "today 14:00", kind: "time" },
  { value: "2pm", hint: "today 14:00", kind: "time" },
  { value: "tomorrow+09:00", hint: "date + time", kind: "time" }
];
function ScratchpadView() {
  const refresh = useAppStore((state) => state.refresh);
  const dataVersion = useAppStore((state) => state.dataVersion);
  const [content, setContent] = reactExports.useState("");
  const [projectId, setProjectId] = reactExports.useState(null);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [status, setStatus] = reactExports.useState("idle");
  const [committing, setCommitting] = reactExports.useState(false);
  const [lastCommit, setLastCommit] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const [pickerOpen, setPickerOpen] = reactExports.useState(false);
  const [suggestions, setSuggestions] = reactExports.useState([]);
  const [suggestIndex, setSuggestIndex] = reactExports.useState(0);
  const [suggestAt, setSuggestAt] = reactExports.useState(null);
  const textareaRef = reactExports.useRef(null);
  const highlightRef = reactExports.useRef(null);
  const projects = useAsync(() => window.api.projects.list({}), [dataVersion]);
  const tags = useAsync(() => window.api.tags.list(), [dataVersion]);
  reactExports.useEffect(() => {
    void window.api.scratchpad.get().then((pad) => {
      setContent(pad.content);
      setProjectId(pad.projectId);
      setLoaded(true);
      textareaRef.current?.focus();
    }).catch((cause) => setError(String(cause)));
  }, []);
  const save = reactExports.useCallback((nextContent, nextProjectId) => {
    setStatus("saving");
    void window.api.scratchpad.save({ content: nextContent, projectId: nextProjectId }).then(() => setStatus("saved")).catch((cause) => setError(String(cause)));
  }, []);
  reactExports.useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => save(content, projectId), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, projectId, loaded, save]);
  const lines = reactExports.useMemo(() => parseBuffer(content), [content]);
  const actionable = lines.filter((line) => line.actionable);
  const hasActionable = actionable.length > 0;
  reactExports.useEffect(() => {
    function onKeyDown2(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (!pickerOpen && hasActionable) setPickerOpen(true);
    }
    window.addEventListener("keydown", onKeyDown2);
    return () => window.removeEventListener("keydown", onKeyDown2);
  }, [pickerOpen, hasActionable]);
  const closeSuggestions = reactExports.useCallback(() => {
    setSuggestions([]);
    setSuggestAt(null);
    setSuggestIndex(0);
  }, []);
  const updateSuggestions = reactExports.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const token = activeToken(textarea.value, textarea.selectionStart);
    if (token === null || textarea.selectionStart !== textarea.selectionEnd) {
      closeSuggestions();
      return;
    }
    const query = token.query.toLowerCase();
    let options;
    if (token.sigil === "#") {
      options = (tags.data ?? []).map((tag) => ({ value: tag.name, hint: "list", kind: "tag" }));
    } else {
      options = DATE_SUGGESTIONS;
    }
    const matches = options.filter((option) => option.value.toLowerCase().startsWith(query));
    if (matches.length === 0) {
      closeSuggestions();
      return;
    }
    const caret = caretCoordinates(textarea, token.start);
    setSuggestions(matches.slice(0, 40));
    setSuggestIndex(0);
    setSuggestAt({ top: caret.top + caret.lineHeight + 4, left: caret.left });
  }, [tags.data, closeSuggestions]);
  function applySuggestion(suggestion) {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const token = activeToken(textarea.value, textarea.selectionStart);
    if (token === null) return;
    const before = textarea.value.slice(0, token.start);
    const after = textarea.value.slice(token.end);
    const inserted = `${token.sigil}${suggestion.value} `;
    const next = `${before}${inserted}${after}`;
    setContent(next);
    closeSuggestions();
    const caretAt = before.length + inserted.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caretAt, caretAt);
    });
  }
  function insertNextMarker() {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const caret = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", caret - 1) + 1;
    const currentLine = textarea.value.slice(lineStart, caret);
    const marker = nextMarker(parseLine(currentLine).marker);
    const insertion = `
${marker} `;
    const next = textarea.value.slice(0, caret) + insertion + textarea.value.slice(caret);
    setContent(next);
    const caretAt = caret + insertion.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caretAt, caretAt);
    });
  }
  async function commit(target = projectId) {
    if (actionable.length === 0 || committing) return;
    setCommitting(true);
    setError(null);
    setProjectId(target);
    try {
      await window.api.scratchpad.save({ content, projectId: target });
      const result = await window.api.scratchpad.commit();
      setContent(result.content);
      setLastCommit(
        `Committed ${result.created.length} ${result.created.length === 1 ? "item" : "items"}`
      );
      refresh();
      textareaRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCommitting(false);
    }
  }
  function onKeyDown(event) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestIndex((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Tab" || event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const picked = suggestions[suggestIndex];
        if (picked !== void 0) {
          event.preventDefault();
          applySuggestion(picked);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeSuggestions();
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void commit();
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      insertNextMarker();
    }
  }
  function syncScroll() {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    if (highlightRef.current !== null) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }
    closeSuggestions();
  }
  const projectName = projectId === null ? "Inbox" : (projects.data ?? []).find((project) => project.id === projectId)?.name ?? "Inbox";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col bg-[#0a0e14]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center gap-3 border-b border-slate-800 px-4 py-2.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "ml-auto flex items-center gap-2 font-mono text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-600", children: "file into" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: projectId ?? "",
            onChange: (event) => setProjectId(event.target.value === "" ? null : Number(event.target.value)),
            className: "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Inbox" }),
              (projects.data ?? []).map((project) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: project.id, children: project.name }, project.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => void commit(),
          disabled: actionable.length === 0 || committing,
          className: "rounded bg-emerald-600 px-3 py-1 font-mono text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-30",
          children: [
            "commit ",
            actionable.length > 0 ? actionable.length : "",
            " → ",
            projectName
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative flex min-h-0 flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "pre",
        {
          ref: highlightRef,
          "aria-hidden": true,
          className: "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-3 font-mono text-[13px] leading-[22px]",
          children: lines.map((line, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(HighlightedLine, { line }, index))
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          ref: textareaRef,
          value: content,
          onChange: (event) => setContent(event.target.value),
          onKeyUp: updateSuggestions,
          onClick: updateSuggestions,
          onBlur: closeSuggestions,
          onScroll: syncScroll,
          onKeyDown,
          spellCheck: false,
          placeholder: PLACEHOLDER,
          className: "absolute inset-0 resize-none whitespace-pre-wrap break-words bg-transparent px-3 py-3 font-mono text-[13px] leading-[22px] text-transparent caret-emerald-400 placeholder:text-slate-700 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        }
      ),
      suggestAt !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(
        SuggestionList,
        {
          suggestions,
          activeIndex: suggestIndex,
          top: suggestAt.top,
          left: suggestAt.left,
          onPick: applySuggestion
        }
      )
    ] }) }),
    pickerOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ProjectPicker,
      {
        onPick: (target) => {
          setPickerOpen(false);
          void commit(target);
        },
        onClose: () => {
          setPickerOpen(false);
          textareaRef.current?.focus();
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("footer", { className: "flex items-center gap-4 border-t border-slate-800 px-4 py-2 font-mono text-[11px] text-slate-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Legend, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto", children: error !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-rose-400", children: error }) : lastCommit !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-500", children: lastCommit }) : status === "saving" ? "saving…" : status === "saved" ? "saved" : "" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "shift+enter new line · ctrl+enter commits · ctrl+s commits to…" })
    ] })
  ] });
}
const PLACEHOLDER = `1. wire the export button #urgent @tomorrow+14:30
2. #bug search drops the last keystroke #regression @fri
3. #note just a loose thought
a. #snippet the incantation I always forget
.  standup @09:30

// lines starting with // are kept, never committed`;
function HighlightedLine({ line }) {
  if (line.raw.trim() === "") return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: " " });
  if (!line.actionable && line.raw.trim().startsWith("//")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-slate-700", children: line.raw });
  }
  const tokens = line.raw.split(/(\s+)/);
  let markerConsumed = line.marker === null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: tokens.map((token, index) => {
    if (!markerConsumed && token === line.marker) {
      markerConsumed = true;
      return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-600", children: token }, index);
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: tokenClass(token), children: token }, index);
  }) });
}
function tokenClass(token) {
  if (/^#[\p{L}\p{N}_-]+$/u.test(token)) return "text-sky-400";
  if (/^@[\p{L}\p{N}:+._-]+$/u.test(token)) return "text-amber-400";
  return "text-slate-200";
}
function Legend() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-500", children: "1." }),
      " list"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sky-400", children: "#bug" }),
      " list"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", children: "@tomorrow+14:30" }),
      " due"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-700", children: "// ignored" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-slate-700", children: [
      "no #list → #",
      DEFAULT_LIST
    ] })
  ] });
}
function SearchView() {
  const { searchQuery, setSearchQuery, dataVersion } = useAppStore();
  const [listFilter, setListFilter] = reactExports.useState("all");
  const inputRef = reactExports.useRef(null);
  const debounced = useDebounced(searchQuery, 80);
  reactExports.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const filter = listFilter === "all" ? {} : { tagId: listFilter };
  const results = useAsync(
    () => window.api.search.query({ query: debounced, ...filter, limit: 100 }),
    [debounced, listFilter, dataVersion]
  );
  const total = useAsync(
    () => window.api.search.count({ query: debounced, ...filter }),
    [debounced, listFilter, dataVersion]
  );
  const lists = useAsync(() => window.api.tags.listWithCounts(), [dataVersion]);
  const shown = results.data?.length ?? 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewHeader, { title: "Search", subtitle: "Title and body, across every project and the Inbox." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 border-b border-slate-800 px-3 py-2.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          ref: inputRef,
          value: searchQuery,
          onChange: (event) => setSearchQuery(event.target.value),
          placeholder: "Search everything…",
          "data-search-input": true,
          className: "flex-1 rounded bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: listFilter,
          onChange: (event) => setListFilter(event.target.value === "all" ? "all" : Number(event.target.value)),
          className: "rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-300",
          "aria-label": "Filter by list",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "All lists" }),
            (lists.data ?? []).map((list) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: list.id, children: [
              "#",
              list.name
            ] }, list.id))
          ]
        }
      )
    ] }),
    debounced.trim() !== "" && total.data !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "border-b border-slate-800 px-4 py-1.5 text-[11px] text-slate-500", children: total.data === 0 ? "No matches" : shown < total.data ? `Showing ${shown} of ${total.data} matches` : `${total.data} ${total.data === 1 ? "match" : "matches"}` }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto", children: [
      searchQuery.trim() === "" && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Start typing. Prefix matching means “expo” already finds “export”." }),
      results.error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { tone: "error", children: results.error }),
      (results.data ?? []).map((result) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        ItemRow,
        {
          item: result.item,
          titleMarked: result.titleMarked,
          contentMarked: result.contentMarked
        },
        result.item.id
      ))
    ] })
  ] });
}
function TodayView() {
  const dataVersion = useAppStore((state) => state.dataVersion);
  const items = useAsync(() => window.api.work.today(), [dataVersion]);
  const all = items.data ?? [];
  const overdue = all.filter((item) => item.dueAt !== null && isOverdue(item.dueAt));
  const dueToday = all.filter((item) => item.dueAt === null || !isOverdue(item.dueAt));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(ViewHeader, { title: "Today", subtitle: "Overdue work and anything due before midnight." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto", children: [
      items.loading && items.data === null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Loading…" }),
      items.error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { tone: "error", children: items.error }),
      items.data?.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { children: "Nothing due. Clear day." }),
      overdue.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(SectionLabel, { tone: "danger", children: [
          "Overdue · ",
          overdue.length
        ] }),
        overdue.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(ItemRow, { item, projectName: item.projectName }, item.id))
      ] }),
      dueToday.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(SectionLabel, { children: [
          "Due today · ",
          dueToday.length
        ] }),
        dueToday.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx(ItemRow, { item, projectName: item.projectName }, item.id))
      ] })
    ] })
  ] });
}
function SectionLabel({
  children,
  tone = "muted"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: `sticky top-0 bg-slate-950/95 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide backdrop-blur ${tone === "danger" ? "text-rose-400" : "text-slate-500"}`,
      children
    }
  );
}
function App() {
  const view = useAppStore((state) => state.view);
  const refresh = useAppStore((state) => state.refresh);
  useShortcuts();
  reactExports.useEffect(() => window.api.onDataChanged(refresh), [refresh]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Sidebar, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "min-w-0 flex-1", children: renderView(view) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SearchPalette, {})
  ] });
}
function renderView(view) {
  switch (view.kind) {
    case "scratchpad":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ScratchpadView, {});
    case "inbox":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(InboxView, {});
    case "today":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(TodayView, {});
    case "allTodos":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(AllTodosView, {});
    case "search":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(SearchView, {});
    case "activity":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ActivityView, {});
    case "project":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectView, { projectId: view.projectId }, view.projectId);
  }
}
const container = document.getElementById("root");
if (container === null) throw new Error("#root not found in index.html");
createRoot(container).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(App, {}) })
);

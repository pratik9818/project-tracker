import { c as createRoot, j as jsxRuntimeExports, r as reactExports, p as parseLine, D as DEFAULT_LIST } from "./index-DH-wEsFj.js";
function QuickCapture() {
  const [text, setText] = reactExports.useState("");
  const [saving, setSaving] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    function onFocus() {
      setText("");
      setError(null);
      inputRef.current?.focus();
    }
    window.addEventListener("focus", onFocus);
    inputRef.current?.focus();
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  async function save() {
    if (saving) return;
    if (!parseLine(text).actionable) {
      void window.api.capture.close();
      return;
    }
    setSaving(true);
    try {
      await window.api.capture.save({ text });
      setText("");
      await window.api.capture.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }
  const preview = parseLine(text);
  const previewLists = preview.tags.length > 0 ? preview.tags : [DEFAULT_LIST];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col justify-center px-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        ref: inputRef,
        value: text,
        onChange: (event) => setText(event.target.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            void window.api.capture.close();
          }
        },
        placeholder: "Capture anything…",
        className: "w-full rounded-md bg-slate-800 px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center justify-between px-1 text-[11px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-500", children: !preview.actionable ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Hint, { children: "#bug" }),
        " or any ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(Hint, { children: "#list" }),
        " · ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(Hint, { children: "@tomorrow" }),
        " to schedule"
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        "Saves to",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-300", children: previewLists.map((name) => `#${name}`).join(" ") }),
        " ",
        "in the Inbox"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-slate-600", children: "Enter saves · Esc cancels" })
    ] }),
    error !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-1 pt-1 text-[11px] text-rose-400", children: error })
  ] });
}
function Hint({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "rounded bg-slate-800 px-1 text-slate-400", children });
}
const container = document.getElementById("root");
if (container === null) throw new Error("#root not found in quickCapture.html");
createRoot(container).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(QuickCapture, {}) })
);

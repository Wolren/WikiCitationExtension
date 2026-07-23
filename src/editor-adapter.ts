/** Minimal CodeMirror 5 instance shape */
interface CodeMirror5 {
  getValue(): string;
  setValue(text: string): void;
  getSelection(): string;
  setSelection(from: { line: number; ch: number }, to: { line: number; ch: number }): void;
  getCursor(which: "from" | "to"): { line: number; ch: number };
  indexFromPos(pos: { line: number; ch: number }): number;
  posFromIndex(index: number): { line: number; ch: number };
  focus(): void;
  dom: HTMLElement;
}

/** Minimal CodeMirror 6 state shape used in dispatch */
interface CodeMirror6State {
  doc: { length: number; toString(): string; sliceString(from: number, to: number): string };
  selection: { main: { from: number; to: number; empty: boolean } };
}

/** Minimal CodeMirror 6 instance shape */
interface CodeMirror6 {
  dispatch(changes: Record<string, unknown>): void;
  focus(): void;
  state: CodeMirror6State;
  dom: HTMLElement;
}

/** Union of CM5 and CM6 minimal shapes */
type CodeMirrorInstance = CodeMirror5 | CodeMirror6;

/** Minimal Monaco model shape */
interface MonacoModel {
  getValue(): string;
  setValue(text: string): void;
  getOffsetAt(pos: { lineNumber: number; column: number }): number;
  getPositionAt(offset: number): { lineNumber: number; column: number };
}

/** Minimal Monaco editor shape */
interface MonacoEditor {
  getSelection(): { isEmpty(): boolean; getStartPosition(): { lineNumber: number; column: number }; getEndPosition(): { lineNumber: number; column: number } };
  getModel(): MonacoModel | null;
  setSelection(selection: unknown): void;
  focus(): void;
}

/** Minimal Monaco global shape */
interface MonacoGlobal {
  editor: {
    getModels(): MonacoModel[];
    getEditors(): MonacoEditor[];
  };
  Selection: new (startLine: number, startCol: number, endLine: number, endCol: number) => unknown;
}

/** Minimal CKEditor instance shape */
interface CKEditorInstance {
  mode: string;
  setData(text: string): void;
}

/** Minimal CKEditor global shape */
interface CKEditorGlobal {
  instances: Record<string, CKEditorInstance>;
}

/** Minimal MediaWiki global shape */
interface MediaWikiGlobal {
  codemirror?: {
    editors?: CodeMirrorInstance[];
    editor?: CodeMirrorInstance;
  };
  hook(name: string): { add(fn: (...args: unknown[]) => void): void };
  util?: Record<string, unknown>;
}

/** Browser-independent access to globals injected by wiki software */
export function getMediaWiki(): MediaWikiGlobal | null {
  return (globalThis as Record<string, unknown>).mw as MediaWikiGlobal | null;
}

function getMonacoGlobal(): MonacoGlobal | null {
  return (globalThis as Record<string, unknown>).monaco as MonacoGlobal | null;
}

function getCKEditorGlobal(): CKEditorGlobal | null {
  return (globalThis as Record<string, unknown>).CKEDITOR as CKEditorGlobal | null;
}

// ── CodeMirror type guards ───────────────────────────────────────────

function isCodeMirror5(cm: CodeMirrorInstance): cm is CodeMirror5 {
  return typeof (cm as CodeMirror5).getValue === "function";
}

function isCodeMirror6(cm: CodeMirrorInstance): cm is CodeMirror6 {
  return typeof (cm as CodeMirror6).dispatch === "function";
}

export interface EditorHandle {
  readonly type: string;
  readonly element: HTMLElement;
  getText(): string | null;
  setText(text: string): boolean;
  /** Returns selected text with absolute character offsets, or null if no selection or unsupported */
  getSelection(): { text: string; start: number; end: number } | null;
  /** Restore selection by absolute character offsets after setText(). Returns true if supported. */
  setSelection(start: number, end: number): boolean;
}

interface Strategy {
  name: string;
  priority: number;
  /** Returns the editor element if this strategy applies, or null */
  detect(): HTMLElement | null;
  read(el: HTMLElement): string | null;
  write(el: HTMLElement, text: string): boolean;
  /** Returns selected text with absolute char offsets, or null if no selection / unsupported */
  readSelection?(el: HTMLElement): { text: string; start: number; end: number } | null;
  /** Restore selection by absolute char offsets. Returns true if supported. */
  writeSelection?(el: HTMLElement, start: number, end: number): boolean;
}

// ── CodeMirror helpers ──────────────────────────────────────────────
const cmCache = new WeakMap<HTMLElement, CodeMirrorInstance>();

function getCodeMirror(): CodeMirrorInstance | null {
  const mw = getMediaWiki();
  return mw?.codemirror?.editors?.[0] || mw?.codemirror?.editor || null;
}

function readCodeMirror(cm: CodeMirrorInstance): string | null {
  if (isCodeMirror5(cm)) return cm.getValue();
  if (isCodeMirror6(cm)) return cm.state.doc.toString();
  return null;
}

function writeCodeMirror(cm: CodeMirrorInstance, text: string): boolean {
  if (isCodeMirror5(cm)) { cm.setValue(text); return true; }
  if (isCodeMirror6(cm)) {
    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } });
    return true;
  }
  return false;
}

// ── CodeMirror selection helpers ─────────────────────────────────────
function readCodeMirrorSelection(cm: CodeMirrorInstance): { text: string; start: number; end: number } | null {
  // CM5
  if (isCodeMirror5(cm)) {
    const text = cm.getSelection();
    if (!text) return null;
    const fromPos = cm.getCursor("from");
    const toPos = cm.getCursor("to");
    const start = cm.indexFromPos(fromPos);
    const end = cm.indexFromPos(toPos);
    return { text, start, end };
  }
  // CM6
  if (isCodeMirror6(cm)) {
    const { from, to } = cm.state.selection.main;
    if (from === to) return null;
    const text = cm.state.doc.sliceString(from, to);
    if (!text) return null;
    return { text, start: from, end: to };
  }
  return null;
}

function writeCodeMirrorSelection(cm: CodeMirrorInstance, start: number, end: number): boolean {
  // CM5
  if (isCodeMirror5(cm)) {
    const from = cm.posFromIndex(start);
    const to = cm.posFromIndex(end);
    cm.setSelection(from, to);
    cm.focus();
    return true;
  }
  // CM6
  if (isCodeMirror6(cm)) {
    try {
      cm.dispatch({ selection: { anchor: start, head: end } });
      cm.focus();
      return true;
    } catch { /* fall through */ }
  }
  return false;
}

// ── Textarea helpers ────────────────────────────────────────────────
function findLargeTextarea(): HTMLTextAreaElement | null {
  let best: HTMLTextAreaElement | null = null;
  let bestArea = 0;
  const textareas = document.querySelectorAll<HTMLTextAreaElement>("textarea");
  for (const ta of textareas) {
    const area = ta.offsetWidth * ta.offsetHeight;
    if (area > bestArea) { bestArea = area; best = ta; }
  }
  return best && bestArea > 300 * 150 ? best : null;
}

function textareaRead(el: HTMLElement): string | null {
  return (el as HTMLTextAreaElement).value ?? null;
}

function textareaWrite(el: HTMLElement, text: string): boolean {
  (el as HTMLTextAreaElement).value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function textareaReadSelection(el: HTMLElement): { text: string; start: number; end: number } | null {
  const ta = el as HTMLTextAreaElement;
  const { selectionStart: start, selectionEnd: end, value } = ta;
  if (start === end) return null;
  return { text: value.substring(start, end), start, end };
}

function textareaWriteSelection(el: HTMLElement, start: number, end: number): boolean {
  const ta = el as HTMLTextAreaElement;
  ta.setSelectionRange(start, end);
  ta.focus();
  return true;
}

// ── VisualEditor helpers ────────────────────────────────────────────
function isVisualEditorActive(): boolean {
  if (window.location.search.includes("veaction=edit")) return true;
  if (document.querySelector(".ve-ui-surface, .ve-ce-documentNode, .ve-init-mw-viewPageTarget-surface, .ve-init-mw-desktopArticleTarget-surface")) return true;
  return false;
}

/** Detect if VE is in source (wikitext) mode vs rich-visual mode */
function isVeSourceMode(): boolean {
  return !!document.querySelector(".ve-init-target-source, .ve-ui-source-mode");
}

function findVeSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    ".ve-ui-surface, .ve-ce-documentNode, .ve-init-mw-viewPageTarget-surface, .ve-init-mw-desktopArticleTarget-surface"
  );
}

/** Find the VE source-mode contenteditable editor (used by Fandom) */
function findVeSourceEditor(): HTMLElement | null {
  // VE source mode surfaces are contenteditable divs holding wikitext
  const container = document.querySelector<HTMLElement>(
    ".ve-init-mw-desktopArticleTarget-targetContainer .ve-ui-surface, " +
    ".ve-init-target-source .ve-ui-surface, " +
    '#content.ve-init-mw-desktopArticleTarget-targetContainer [contenteditable="true"]'
  );
  if (container) return container;

  // Fallback: any contenteditable inside a VE source-mode wrapper
  const wrapper = document.querySelector<HTMLElement>(".ve-init-target-source");
  if (wrapper) {
    const editable = wrapper.querySelector<HTMLElement>('[contenteditable="true"]');
    if (editable) return editable;
  }

  return null;
}

function findVeSourceTab(): HTMLElement | null {
  if (!isVisualEditorActive()) return null;
  const tabSelectors = [
    ".oo-ui-tabOptionWidget",
    ".ve-ui-mwTemplatePage-menu",
    ".ve-ui-mwTransclusionDialog-menu",
    ".ve-ui-mwDialog-surface .oo-ui-tabPanelLayout",
  ];
  for (const sel of tabSelectors) {
    const tabs = document.querySelectorAll<HTMLElement>(sel);
    for (const tab of tabs) {
      if (tab.textContent?.toLowerCase().includes("source") || tab.textContent?.toLowerCase().includes("wikitext")) {
        return tab;
      }
    }
  }
  const sourceBtns = document.querySelectorAll<HTMLElement>(".oo-ui-tool");
  for (const btn of sourceBtns) {
    if (btn.textContent?.toLowerCase().includes("source")) return btn;
  }
  return null;
}

// ── Monaco helpers ──────────────────────────────────────────────────
const monacoCache = new WeakMap<HTMLElement, MonacoModel>();

function getMonacoModels(): MonacoModel[] | null {
  const m = getMonacoGlobal();
  if (!m?.editor?.getModels) return null;
  return m.editor.getModels();
}

function readMonaco(model: MonacoModel): string | null {
  return model?.getValue() ?? null;
}

function writeMonaco(model: MonacoModel, text: string): boolean {
  if (model) { model.setValue(text); return true; }
  return false;
}

// ── Strategy definitions ────────────────────────────────────────────
const strategies: Strategy[] = [
  {
    name: "codemirror",
    priority: 100,
    detect: () => {
      const cm = getCodeMirror();
      if (cm?.dom) {
        cmCache.set(cm.dom, cm);
        return cm.dom;
      }
      return null;
    },
    read: (el) => {
      const cm = cmCache.get(el);
      return cm ? readCodeMirror(cm) : null;
    },
    write: (el, text) => {
      const cm = cmCache.get(el);
      return cm ? writeCodeMirror(cm, text) : false;
    },
    readSelection: (el) => {
      const cm = cmCache.get(el);
      return cm ? readCodeMirrorSelection(cm) : null;
    },
    writeSelection: (el, start, end) => {
      const cm = cmCache.get(el);
      return cm ? writeCodeMirrorSelection(cm, start, end) : false;
    },
  },
  {
    name: "monaco",
    priority: 95,
    detect: () => {
      const el = document.querySelector<HTMLElement>(".monaco-editor");
      if (!el) return null;
      const models = getMonacoModels();
      if (models?.[0]) monacoCache.set(el, models[0]);
      return el;
    },
    read: (el) => {
      const model = monacoCache.get(el);
      return model ? readMonaco(model) : null;
    },
    write: (el, text) => {
      const model = monacoCache.get(el);
      return model ? writeMonaco(model, text) : false;
    },
    readSelection: () => {
      const m = getMonacoGlobal();
      const editor = m?.editor?.getEditors?.()?.[0];
      if (!editor) return null;
      const sel = editor.getSelection();
      if (!sel || sel.isEmpty()) return null;
      const model = editor.getModel();
      if (!model) return null;
      const start = model.getOffsetAt(sel.getStartPosition());
      const end = model.getOffsetAt(sel.getEndPosition());
      const text = model.getValue().substring(start, end);
      return { text, start, end };
    },
    writeSelection: (_, start, end) => {
      const m = getMonacoGlobal();
      const editor = m?.editor?.getEditors?.()?.[0];
      if (!editor) return false;
      const model = editor.getModel();
      if (!model) return false;
      const startPos = model.getPositionAt(start);
      const endPos = model.getPositionAt(end);
      const sel = new m.Selection(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
      editor.setSelection(sel);
      editor.focus();
      return true;
    },
  },
  {
    name: "ckeditor",
    priority: 90,
    detect: () => {
      const ck = getCKEditorGlobal();
      if (!ck?.instances) return null;
      for (const id of Object.keys(ck.instances)) {
        const inst = ck.instances[id];
        if (inst.mode === "source") {
          return document.getElementById(id) as HTMLTextAreaElement | null;
        }
      }
      return null;
    },
    read: textareaRead,
    write: (el, text) => {
      (el as HTMLTextAreaElement).value = text;
      const ck = getCKEditorGlobal();
      if (ck?.instances?.[el.id]) {
        ck.instances[el.id].setData(text);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    readSelection: (el) => textareaReadSelection(el),
    writeSelection: (el, start, end) => textareaWriteSelection(el, start, end),
  },
  {
    name: "classic-textarea",
    priority: 80,
    detect: () => document.getElementById("wpTextbox1") as HTMLTextAreaElement | null,
    read: textareaRead,
    write: textareaWrite,
    readSelection: (el) => textareaReadSelection(el),
    writeSelection: (el, start, end) => textareaWriteSelection(el, start, end),
  },
  {
    name: "ve-source",
    priority: 85,
    detect: () => isVeSourceMode() ? findVeSourceEditor() : null,
    read: (el) => {
      // In source mode the contenteditable holds raw wikitext
      // Prefer hidden textarea value (it's always the canonical source)
      const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement | null;
      return ta?.value ?? el.textContent ?? null;
    },
    write: (el, text) => {
      // Write to the visible contenteditable surface (source mode = wikitext)
      el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      // Also sync hidden textarea — VE source mode watches this for changes
      const ta = document.getElementById("wpTextbox1") as HTMLTextAreaElement | null;
      if (ta) {
        ta.value = text;
        ta.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      }
      return true;
    },
  },
  {
    name: "visualeditor",
    priority: 70,
    detect: () => isVisualEditorActive() ? findVeSurface() : null,
    read: (el) => el.textContent || null,
    write: () => {
      // VE contenteditable — can't write wikitext directly to the surface model.
      // Returning false signals callers to use the source-tab or API path.
      return false;
    },
  },
  {
    name: "any-textarea",
    priority: 60,
    detect: () => findLargeTextarea(),
    read: textareaRead,
    write: textareaWrite,
    readSelection: (el) => textareaReadSelection(el),
    writeSelection: (el, start, end) => textareaWriteSelection(el, start, end),
  },
  {
    name: "contenteditable",
    priority: 40,
    detect: () => document.querySelector<HTMLElement>('[contenteditable="true"]'),
    read: (el) => el.textContent || null,
    write: (el, text) => {
      el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
  },
];

export { isVisualEditorActive, isVeSourceMode, findVeSourceTab, findVeSourceEditor };

strategies.sort((a, b) => b.priority - a.priority);

export function findEditor(): EditorHandle | null {
  for (const s of strategies) {
    const el = s.detect();
    if (el) {
      return {
        type: s.name,
        element: el,
        getText: () => s.read(el),
        setText: (text: string) => s.write(el, text),
        getSelection: () => s.readSelection?.(el) ?? null,
        setSelection: (start, end) => s.writeSelection?.(el, start, end) ?? false,
      };
    }
  }
  return null;
}

export async function waitForEditor(options?: {
  timeout?: number;
  signal?: AbortSignal;
}): Promise<EditorHandle | null> {
  const timeout = options?.timeout ?? 15000;
  const signal = options?.signal;
  const start = Date.now();

  return new Promise((resolve) => {
    let stopped = false;
    const check = () => {
      if (stopped) return;
      if (signal?.aborted) { stopped = true; resolve(null); return; }
      const handle = findEditor();
      if (handle) { resolve(handle); return; }
      if (Date.now() - start >= timeout) { resolve(null); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

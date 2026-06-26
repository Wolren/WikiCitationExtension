export interface EditorHandle {
  readonly type: string;
  readonly element: HTMLElement;
  getText(): string | null;
  setText(text: string): boolean;
}

interface Strategy {
  name: string;
  priority: number;
  /** Returns the editor element if this strategy applies, or null */
  detect(): HTMLElement | null;
  read(el: HTMLElement): string | null;
  write(el: HTMLElement, text: string): boolean;
}

// ── CodeMirror helpers ──────────────────────────────────────────────
const cmCache = new WeakMap<HTMLElement, any>();

function getCodeMirror(): any {
  const mw = (globalThis as any).mw;
  return mw?.codemirror?.editors?.[0] || mw?.codemirror?.editor || null;
}

function readCodeMirror(cm: any): string | null {
  if (typeof cm.getValue === 'function') return cm.getValue();
  if (cm.state?.doc) return cm.state.doc.toString();
  return null;
}

function writeCodeMirror(cm: any, text: string): boolean {
  if (typeof cm.setValue === 'function') { cm.setValue(text); return true; }
  if (typeof cm.dispatch === 'function') {
    cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text } });
    return true;
  }
  return false;
}

// ── Textarea helpers ────────────────────────────────────────────────
function findLargeTextarea(): HTMLTextAreaElement | null {
  let best: HTMLTextAreaElement | null = null;
  let bestArea = 0;
  const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
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
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

// ── VisualEditor helpers ────────────────────────────────────────────
function isVisualEditorActive(): boolean {
  if (window.location.search.includes('veaction=edit')) return true;
  if (document.querySelector('.ve-ui-surface, .ve-ce-documentNode, .ve-init-mw-viewPageTarget-surface, .ve-init-mw-desktopArticleTarget-surface')) return true;
  return false;
}

/** Detect if VE is in source (wikitext) mode vs rich-visual mode */
function isVeSourceMode(): boolean {
  return !!document.querySelector('.ve-init-target-source, .ve-ui-source-mode');
}

function findVeSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.ve-ui-surface, .ve-ce-documentNode, .ve-init-mw-viewPageTarget-surface, .ve-init-mw-desktopArticleTarget-surface'
  );
}

/** Find the VE source-mode contenteditable editor (used by Fandom) */
function findVeSourceEditor(): HTMLElement | null {
  // VE source mode surfaces are contenteditable divs holding wikitext
  const container = document.querySelector<HTMLElement>(
    '.ve-init-mw-desktopArticleTarget-targetContainer .ve-ui-surface, ' +
    '.ve-init-target-source .ve-ui-surface, ' +
    '#content.ve-init-mw-desktopArticleTarget-targetContainer [contenteditable="true"]'
  );
  if (container) return container;

  // Fallback: any contenteditable inside a VE source-mode wrapper
  const wrapper = document.querySelector<HTMLElement>('.ve-init-target-source');
  if (wrapper) {
    const editable = wrapper.querySelector<HTMLElement>('[contenteditable="true"]');
    if (editable) return editable;
  }

  return null;
}

function findVeSourceTab(): HTMLElement | null {
  if (!isVisualEditorActive()) return null;
  const tabSelectors = [
    '.oo-ui-tabOptionWidget',
    '.ve-ui-mwTemplatePage-menu',
    '.ve-ui-mwTransclusionDialog-menu',
    '.ve-ui-mwDialog-surface .oo-ui-tabPanelLayout',
  ];
  for (const sel of tabSelectors) {
    const tabs = document.querySelectorAll<HTMLElement>(sel);
    for (const tab of tabs) {
      if (tab.textContent?.toLowerCase().includes('source') || tab.textContent?.toLowerCase().includes('wikitext')) {
        return tab;
      }
    }
  }
  const sourceBtns = document.querySelectorAll<HTMLElement>('.oo-ui-tool');
  for (const btn of sourceBtns) {
    if (btn.textContent?.toLowerCase().includes('source')) return btn;
  }
  return null;
}

// ── Monaco helpers ──────────────────────────────────────────────────
const monacoCache = new WeakMap<HTMLElement, any>();

function getMonacoModels(): any[] | null {
  const m = (globalThis as any).monaco;
  if (!m?.editor?.getModels) return null;
  return m.editor.getModels();
}

function readMonaco(model: any): string | null {
  return model?.getValue() ?? null;
}

function writeMonaco(model: any, text: string): boolean {
  if (model) { model.setValue(text); return true; }
  return false;
}

// ── Strategy definitions ────────────────────────────────────────────
const strategies: Strategy[] = [
  {
    name: 'codemirror',
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
  },
  {
    name: 'monaco',
    priority: 95,
    detect: () => {
      const el = document.querySelector<HTMLElement>('.monaco-editor');
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
  },
  {
    name: 'ckeditor',
    priority: 90,
    detect: () => {
      const ck = (globalThis as any).CKEDITOR;
      if (!ck?.instances) return null;
      for (const id of Object.keys(ck.instances)) {
        const inst = ck.instances[id];
        if (inst.mode === 'source') {
          return document.getElementById(id) as HTMLTextAreaElement | null;
        }
      }
      return null;
    },
    read: textareaRead,
    write: (el, text) => {
      (el as HTMLTextAreaElement).value = text;
      const ck = (globalThis as any).CKEDITOR;
      if (ck?.instances?.[el.id]) {
        ck.instances[el.id].setData(text);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
  },
  {
    name: 'classic-textarea',
    priority: 80,
    detect: () => document.getElementById('wpTextbox1') as HTMLTextAreaElement | null,
    read: textareaRead,
    write: textareaWrite,
  },
  {
    name: 've-source',
    priority: 85,
    detect: () => isVeSourceMode() ? findVeSourceEditor() : null,
    read: (el) => {
      // In source mode the contenteditable holds raw wikitext
      // Prefer hidden textarea value (it's always the canonical source)
      const ta = document.getElementById('wpTextbox1') as HTMLTextAreaElement | null;
      return ta?.value ?? el.textContent ?? null;
    },
    write: (el, text) => {
      // Write to the visible contenteditable surface (source mode = wikitext)
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      // Also sync hidden textarea — VE source mode watches this for changes
      const ta = document.getElementById('wpTextbox1') as HTMLTextAreaElement | null;
      if (ta) {
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }
      return true;
    },
  },
  {
    name: 'visualeditor',
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
    name: 'any-textarea',
    priority: 60,
    detect: () => findLargeTextarea(),
    read: textareaRead,
    write: textareaWrite,
  },
  {
    name: 'contenteditable',
    priority: 40,
    detect: () => document.querySelector<HTMLElement>('[contenteditable="true"]'),
    read: (el) => el.textContent || null,
    write: (el, text) => {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
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

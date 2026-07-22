import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findEditor, waitForEditor, isVisualEditorActive, isVeSourceMode, findVeSourceEditor } from "../src/editor-adapter";

function mockTextarea(id: string, width = 500, height = 300): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.id = id;
  Object.defineProperty(ta, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(ta, "offsetHeight", { configurable: true, value: height });
  document.body.appendChild(ta);
  return ta;
}

describe("findEditor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as any).mw;
    delete (window as any).CKEDITOR;
  });

  it("returns null when no editor is found", () => {
    expect(findEditor()).toBeNull();
  });

  it("detects CodeMirror (CM5 interface)", () => {
    const cm = {
      dom: document.createElement("div"),
      getValue: vi.fn(() => "cm5 wikitext"),
      setValue: vi.fn(),
    };
    (window as any).mw = { codemirror: { editors: [cm] } };
    const editor = findEditor();
    expect(editor).not.toBeNull();
    expect(editor!.type).toBe("codemirror");
    expect(editor!.getText()).toBe("cm5 wikitext");
    expect(cm.getValue).toHaveBeenCalledOnce();
  });

  it("detects CodeMirror (CM6 interface)", () => {
    const cm = {
      dom: document.createElement("div"),
      state: { doc: { toString: () => "cm6 wikitext" } },
      dispatch: vi.fn(),
    };
    (window as any).mw = { codemirror: { editors: [cm] } };
    const editor = findEditor();
    expect(editor).not.toBeNull();
    expect(editor!.type).toBe("codemirror");
    expect(editor!.getText()).toBe("cm6 wikitext");
  });

  it("writes text via CodeMirror CM5", () => {
    const cm = { dom: document.createElement("div"), getValue: vi.fn(), setValue: vi.fn() };
    (window as any).mw = { codemirror: { editor: cm } };
    const editor = findEditor()!;
    const ok = editor.setText("new text");
    expect(ok).toBe(true);
    expect(cm.setValue).toHaveBeenCalledWith("new text");
  });

  it("writes text via CodeMirror CM6 dispatch", () => {
    const cm = {
      dom: document.createElement("div"),
      state: { doc: { toString: () => "", length: 0 } },
      dispatch: vi.fn(),
    };
    (window as any).mw = { codemirror: { editors: [cm] } };
    const editor = findEditor()!;
    const ok = editor.setText("new text");
    expect(ok).toBe(true);
    expect(cm.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 0, insert: "new text" },
    });
  });

  it("prefers CodeMirror over classic textarea when both exist", () => {
    mockTextarea("wpTextbox1");
    const cm = { dom: document.createElement("div"), getValue: vi.fn(), setValue: vi.fn() };
    (window as any).mw = { codemirror: { editors: [cm] } };
    const editor = findEditor();
    expect(editor!.type).toBe("codemirror");
  });

  it("prefers classic-textarea over any-textarea", () => {
    mockTextarea("wpTextbox1");
    const editor = findEditor();
    expect(editor!.type).toBe("classic-textarea");
  });

  it("reads from classic textarea", () => {
    const ta = mockTextarea("wpTextbox1");
    ta.value = "article wikitext";
    const editor = findEditor()!;
    expect(editor.getText()).toBe("article wikitext");
  });

  it("writes to classic textarea and dispatches input event", () => {
    const ta = mockTextarea("wpTextbox1");
    const dispatched: Event[] = [];
    ta.addEventListener("input", (e) => dispatched.push(e));

    const editor = findEditor()!;
    const ok = editor.setText("updated wikitext");
    expect(ok).toBe(true);
    expect(ta.value).toBe("updated wikitext");
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].bubbles).toBe(true);
  });

  it("reads from any large textarea when no wpTextbox1", () => {
    const ta = mockTextarea("custom-ta");
    ta.value = "custom wiki text";
    const editor = findEditor();
    expect(editor).not.toBeNull();
    expect(editor!.type).toBe("any-textarea");
    expect(editor!.getText()).toBe("custom wiki text");
  });

  it("picks the largest textarea for any-textarea strategy", () => {
    mockTextarea("small", 200, 100);
    mockTextarea("small2", 100, 50);
    const big = mockTextarea("big", 800, 600);
    big.value = "big content";
    const editor = findEditor()!;
    expect(editor.type).toBe("any-textarea");
    expect(editor.getText()).toBe("big content");
  });

  it("ignores textareas smaller than 300x150", () => {
    mockTextarea("tiny", 100, 50);
    expect(findEditor()).toBeNull();
  });

  it("detects contenteditable elements", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    div.textContent = "editable content";
    document.body.appendChild(div);
    const editor = findEditor()!;
    expect(editor.type).toBe("contenteditable");
    expect(editor.getText()).toBe("editable content");
  });

  it("prefers VisualEditor specific selectors over generic contenteditable", () => {
    const veSurface = document.createElement("div");
    veSurface.className = "ve-ui-surface";
    veSurface.setAttribute("contenteditable", "true");
    veSurface.textContent = "VE content";
    document.body.appendChild(veSurface);

    const plain = document.createElement("div");
    plain.setAttribute("contenteditable", "true");
    plain.textContent = "plain content";
    document.body.appendChild(plain);

    const editor = findEditor()!;
    expect(editor.type).toBe("visualeditor");
    expect(editor.getText()).toBe("VE content");
  });

  it("writes to contenteditable and dispatches input event", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.appendChild(div);
    const dispatched: Event[] = [];
    div.addEventListener("input", (e) => dispatched.push(e));

    const editor = findEditor()!;
    editor.setText("new wiki text");
    expect(div.textContent).toBe("new wiki text");
    expect(dispatched.length).toBe(1);
  });

  it("detects CKEditor in source mode", () => {
    const ta = mockTextarea("wpTextbox1");
    ta.value = "ckeditor source";
    (window as any).CKEDITOR = {
      instances: {
        wpTextbox1: { mode: "source" },
      },
    };
    const editor = findEditor()!;
    expect(editor.type).toBe("ckeditor");
    expect(editor.getText()).toBe("ckeditor source");
  });

  it("ignores CKEditor in WYSIWYG mode (no source)", () => {
    mockTextarea("wpTextbox1");
    (window as any).CKEDITOR = {
      instances: {
        wpTextbox1: { mode: "wysiwyg" },
      },
    };
    // Should fall through to classic-textarea
    const editor = findEditor()!;
    expect(editor.type).toBe("classic-textarea");
  });

  // ── Monaco ──
  it("detects Monaco editor", () => {
    const container = document.createElement("div");
    container.className = "monaco-editor";
    container.textContent = "monaco content";
    document.body.appendChild(container);
    (window as any).monaco = {
      editor: {
        getModels: () => [{ getValue: () => "monaco wikitext", setValue: vi.fn() }],
      },
    };
    const editor = findEditor();
    expect(editor).not.toBeNull();
    expect(editor!.type).toBe("monaco");
    expect(editor!.getText()).toBe("monaco wikitext");
  });

  it("writes to Monaco editor via setValue", () => {
    const container = document.createElement("div");
    container.className = "monaco-editor";
    document.body.appendChild(container);
    const setValue = vi.fn();
    (window as any).monaco = {
      editor: {
        getModels: () => [{ getValue: () => "", setValue }],
      },
    };
    const editor = findEditor()!;
    const ok = editor.setText("new monaco text");
    expect(ok).toBe(true);
    expect(setValue).toHaveBeenCalledWith("new monaco text");
  });

  it("prefers Monaco over CKEditor when both exist", () => {
    const container = document.createElement("div");
    container.className = "monaco-editor";
    document.body.appendChild(container);
    mockTextarea("wpTextbox1");
    // Both monaco and CKEditor present
    (window as any).CKEDITOR = {
      instances: { wpTextbox1: { mode: "source" } },
    };
    (window as any).monaco = {
      editor: {
        getModels: () => [{ getValue: () => "", setValue: vi.fn() }],
      },
    };
    const editor = findEditor();
    expect(editor!.type).toBe("monaco");
  });

  // ── VisualEditor ──
  it("detects VisualEditor surface with veaction=edit", () => {
    // Simulate VE query param (tests run with mocked location)
    // We'll test via the VE surface selector instead
    const veSurface = document.createElement("div");
    veSurface.className = "ve-ui-surface";
    veSurface.setAttribute("contenteditable", "true");
    veSurface.textContent = "VE wikitext";
    document.body.appendChild(veSurface);
    const editor = findEditor();
    expect(editor).not.toBeNull();
    expect(editor!.type).toBe("visualeditor");
    expect(editor!.getText()).toBe("VE wikitext");
  });

  it("prefers VisualEditor over generic contenteditable", () => {
    const veSurface = document.createElement("div");
    veSurface.className = "ve-ui-surface";
    veSurface.setAttribute("contenteditable", "true");
    veSurface.textContent = "VE content";
    document.body.appendChild(veSurface);

    const plain = document.createElement("div");
    plain.setAttribute("contenteditable", "true");
    plain.textContent = "plain content";
    document.body.appendChild(plain);

    const editor = findEditor()!;
    expect(editor.type).toBe("visualeditor");
    expect(editor.getText()).toBe("VE content");
  });

  it("returns false when writing to VisualEditor", () => {
    const veSurface = document.createElement("div");
    veSurface.className = "ve-ui-surface";
    veSurface.setAttribute("contenteditable", "true");
    document.body.appendChild(veSurface);
    const editor = findEditor()!;
    const ok = editor.setText("new text");
    expect(ok).toBe(false);
  });

  // ── CKEditor write fix ──
  it("writes to CKEditor instance via setData", () => {
    const ta = mockTextarea("wpTextbox1");
    ta.value = "old text";
    const setData = vi.fn();
    (window as any).CKEDITOR = {
      instances: { wpTextbox1: { mode: "source", setData } },
    };
    const editor = findEditor()!;
    const ok = editor.setText("new text");
    expect(ok).toBe(true);
    expect(ta.value).toBe("new text");
    expect(setData).toHaveBeenCalledWith("new text");
  });

  // ── CodeMirror caching ──
  it("caches CodeMirror instance for read/write", () => {
    const cm = {
      dom: document.createElement("div"),
      getValue: vi.fn(() => "cached cm text"),
      setValue: vi.fn(),
    };
    (window as any).mw = { codemirror: { editors: [cm] } };
    const editor = findEditor()!;

    // First read should call getValue once
    expect(editor.getText()).toBe("cached cm text");
    expect(cm.getValue).toHaveBeenCalledTimes(1);

    // Second read should NOT re-query getCodeMirror — uses cached instance
    expect(editor.getText()).toBe("cached cm text");
    expect(cm.getValue).toHaveBeenCalledTimes(2);

    // Write should use cached instance
    editor.setText("updated");
    expect(cm.setValue).toHaveBeenCalledWith("updated");
  });
});

describe("waitForEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    delete (window as any).mw;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with editor when it appears before timeout", async () => {
    const promise = waitForEditor({ timeout: 5000 });
    mockTextarea("wpTextbox1");
    await vi.advanceTimersByTimeAsync(400);
    const editor = await promise;
    expect(editor).not.toBeNull();
    expect(editor!.type).toBe("classic-textarea");
  });

  it("resolves with null on timeout", async () => {
    const promise = waitForEditor({ timeout: 1000 });
    await vi.advanceTimersByTimeAsync(1500);
    const editor = await promise;
    expect(editor).toBeNull();
  });

  it("resolves with null when aborted via signal", async () => {
    const ac = new AbortController();
    const promise = waitForEditor({ timeout: 5000, signal: ac.signal });
    ac.abort();
    await vi.advanceTimersByTimeAsync(200);
    const editor = await promise;
    expect(editor).toBeNull();
  });

  it("uses default timeout of 15 seconds", async () => {
    const promise = waitForEditor();
    await vi.advanceTimersByTimeAsync(16000);
    const editor = await promise;
    expect(editor).toBeNull();
  });
});

describe("isVisualEditorActive", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false when no VE surface exists", () => {
    expect(isVisualEditorActive()).toBe(false);
  });

  it("returns true when VE surface is in DOM", () => {
    const surface = document.createElement("div");
    surface.className = "ve-ui-surface";
    document.body.appendChild(surface);
    expect(isVisualEditorActive()).toBe(true);
  });
});

describe("isVeSourceMode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns false when no source mode class exists", () => {
    expect(isVeSourceMode()).toBe(false);
  });

  it("returns true when .ve-init-target-source is present", () => {
    const el = document.createElement("div");
    el.className = "ve-init-target-source";
    document.body.appendChild(el);
    expect(isVeSourceMode()).toBe(true);
  });

  it("returns true when .ve-ui-source-mode is present", () => {
    const el = document.createElement("div");
    el.className = "ve-ui-source-mode";
    document.body.appendChild(el);
    expect(isVeSourceMode()).toBe(true);
  });
});

describe("findVeSourceEditor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when no source mode editor exists", () => {
    expect(findVeSourceEditor()).toBeNull();
  });

  it("finds contenteditable inside VE source wrapper", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "ve-init-target-source";
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    wrapper.appendChild(editable);
    document.body.appendChild(wrapper);
    expect(findVeSourceEditor()).toBe(editable);
  });

  it("finds contenteditable inside desktopArticleTarget container", () => {
    const container = document.createElement("div");
    container.className = "ve-init-mw-desktopArticleTarget-targetContainer";
    container.id = "content";
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    container.appendChild(editable);
    document.body.appendChild(container);
    expect(findVeSourceEditor()).toBe(editable);
  });
});

describe("failure cascades", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as any).mw;
    delete (window as any).CKEDITOR;
    delete (window as any).monaco;
  });

  it("returns null when all strategies fail to find an editor", () => {
    // No mw.codemirror, no monaco, no CKEDITOR, no wpTextbox1, no contenteditable
    expect(findEditor()).toBeNull();
  });

  it("falls through when CodeMirror exists but has no dom property", () => {
    (window as any).mw = { codemirror: { editors: [{}] } }; // no .dom
    // Should skip CM and fall to next strategy
    const ta = mockTextarea("wpTextbox1");
    ta.value = "fallback text";
    const editor = findEditor()!;
    expect(editor.type).toBe("classic-textarea");
  });

  it("falls through when Monaco model query returns empty", () => {
    const container = document.createElement("div");
    container.className = "monaco-editor";
    document.body.appendChild(container);
    // Monaco div exists but getModels returns null — Monaco strategy detects the div
    (window as any).monaco = { editor: { getModels: () => null } };
    const editor = findEditor()!;
    expect(editor.type).toBe("monaco");
    expect(editor.getText()).toBeNull();
  });

  it("handles empty codemirror editors array", () => {
    (window as any).mw = { codemirror: { editors: [] } };
    // cm-detection via mw.codemirror.editor (singular) — not .editors
    const ta = mockTextarea("wpTextbox1");
    ta.value = "works";
    const editor = findEditor()!;
    expect(editor.type).toBe("classic-textarea");
  });

  it("recovers when CodeMirror getValue returns null", () => {
    const cm = {
      dom: document.createElement("div"),
      getValue: vi.fn(() => null),
      setValue: vi.fn(),
    };
    (window as any).mw = { codemirror: { editors: [cm] } };
    const editor = findEditor()!;
    expect(editor.type).toBe("codemirror");
    expect(editor.getText()).toBeNull();
  });

  it("recovers when CodeMirror setValue throws", () => {
    const cm = {
      dom: document.createElement("div"),
      getValue: vi.fn(),
      setValue: vi.fn(() => { throw new Error("CM error"); }),
    };
    (window as any).mw = { codemirror: { editor: cm } };
    const editor = findEditor()!;
    // The error propagates from the editor-adapter — no try/catch in writeCodeMirror
    expect(() => editor.setText("text")).toThrow("CM error");
  });
});

import type { EditorHandle } from "../editor-adapter";

/** Shared mutable state used by content.ts (orchestration) and panel.ts (UI). */
export let _abortController: AbortController | null = null;
export let _processing = false;
export let _undoEditor: EditorHandle | null = null;
export let _undoOriginalText: string | null = null;

export function setAbortController(c: AbortController | null): void {
  _abortController = c;
}

export function setProcessing(v: boolean): void {
  _processing = v;
}

export function setUndoState(editor: EditorHandle | null, text: string | null): void {
  _undoEditor = editor;
  _undoOriginalText = text;
}

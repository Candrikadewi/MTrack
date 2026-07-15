"use client";
// Minimal global toast store — actions.ts functions are plain functions
// (not components), so error feedback needs a channel outside React's tree,
// the same reasoning that motivated the Store pattern in lib/storage.ts.
// Replaces window.alert(), which blocks the tab and reads as a browser
// "site says" prompt rather than part of the product.

export interface Toast {
  id: string;
  message: string;
  tone: "error" | "success";
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

export function subscribeToasts(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getToasts(): Toast[] {
  return toasts;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function pushToast(message: string, tone: Toast["tone"] = "error"): void {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  toasts = [...toasts, { id, message, tone }];
  notify();
  setTimeout(() => dismissToast(id), 6000);
}

// Minimal stand-in for the "obsidian" module so plugin logic can run under Node in tests.
export class TFile {
  constructor(public path: string, public content = "") {}
  get name() { return this.path.split("/").pop()!; }
  get extension() { return this.name.includes(".") ? this.name.split(".").pop()! : ""; }
  get basename() { return this.name.replace(/\.[^.]+$/, ""); }
  get parent() { return { path: this.path.includes("/") ? this.path.slice(0, this.path.lastIndexOf("/")) : "/" }; }
  stat = { mtime: Date.UTC(2026, 10, 1), size: 10 };
}
export function arrayBufferToBase64(buf: ArrayBuffer) { return Buffer.from(buf).toString("base64"); }
export function getLinkpath(link: string) { return link.split("#")[0].split("|")[0]; }
export function normalizePath(p: string) { return p.replace(/\/+/g, "/"); }
export class Notice { constructor(public msg: string) {} hide() {} }
export type App = unknown;
export class PluginSettingTab {}
export class SecretComponent {}
export class Setting {}
export const Platform = { isMobile: false };
export function requestUrl(p: unknown) { return (globalThis as any).__requestUrl(p); }
export class Modal { constructor(public app: unknown) {} open() {} close() {} setTitle() { return this; } }
export class MarkdownView {}

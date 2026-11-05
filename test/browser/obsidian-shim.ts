// Browser stand-in for the "obsidian" module: just enough API to render the plugin's views
// in plain Chromium for screenshots. Not shipped with the plugin.
import { createElement, icons } from "lucide";

type Info = { cls?: string; text?: string; attr?: Record<string, string>; type?: string; placeholder?: string; value?: string };
const P = HTMLElement.prototype as any;
function applyInfo(el: HTMLElement, o?: Info | string) {
  if (!o) return;
  if (typeof o === "string") { el.className = o; return; }
  if (o.cls) el.className = o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.type) (el as HTMLInputElement).type = o.type;
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
}
P.createEl = function (tag: string, o?: Info) { const el = document.createElement(tag); applyInfo(el, o); this.appendChild(el); return el; };
P.createDiv = function (o?: Info) { return this.createEl("div", o); };
P.createSpan = function (o?: Info) { return this.createEl("span", o); };
P.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
P.addClass = function (...c: string[]) { this.classList.add(...c); };
P.removeClass = function (...c: string[]) { this.classList.remove(...c); };
P.toggleClass = function (c: string, on: boolean) { this.classList.toggle(c, on); };
P.setText = function (t: string) { this.textContent = t; };
P.appendText = function (t: string) { this.appendChild(document.createTextNode(t)); };
P.setAttr = function (k: string, v: string) { this.setAttribute(k, v); };
P.show = function () { this.style.display = ""; };
P.hide = function () { this.style.display = "none"; };
P.toggle = function (on: boolean) { this.style.display = on ? "" : "none"; };
P.detach = function () { this.remove(); };
(SVGElement.prototype as any).addClass = P.addClass;
(window as any).createDiv = (o?: Info) => { const el = document.createElement("div"); applyInfo(el, o); return el; };
(window as any).moment = (t?: number) => ({ format: (f: string) => new Date(t ?? Date.now()).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) });

const pascal = (n: string) => n.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
export function setIcon(el: HTMLElement, name: string) {
  el.querySelectorAll("svg").forEach((s) => s.remove());
  const node = (icons as any)[pascal(name)];
  if (!node) { el.textContent = "?"; return; }
  const svg = createElement(node);
  svg.setAttribute("width", "20"); svg.setAttribute("height", "20");
  svg.classList.add("svg-icon");
  el.prepend(svg);
}
export const setTooltip = () => {};
export const Platform = { isMobile: true, isAndroidApp: true };
export const normalizePath = (p: string) => p.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
export function loadPdfJs(): Promise<never> { return Promise.reject(new Error("no pdf.js in harness")); }
export function arrayBufferToBase64() { return ""; }
export function getLinkpath(l: string) { return l; }
export function requestUrl() { throw new Error("offline"); }

export class TAbstractFile { parent: TFolder | null = null; constructor(public path: string) {} get name() { return this.path.split("/").pop()!; } }
export class TFile extends TAbstractFile {
  stat = { mtime: Date.now(), size: 1, ctime: 0 };
  constructor(path: string, public content = "") { super(path); }
  get extension() { const n = this.name; return n.includes(".") ? n.split(".").pop()! : ""; }
  get basename() { return this.name.replace(/\.[^.]+$/, ""); }
}
export class TFolder extends TAbstractFile { children: TAbstractFile[] = []; isRoot() { return this.path === ""; } }

export class Events { on() { return {}; } }
export class Component { addChild<T>(c: T) { return c; } removeChild() {} registerEvent() {} register() {} }
export class Scope { constructor(public parent?: unknown) {} register() {} }
export class ItemView extends Component {
  contentEl: HTMLElement; containerEl: HTMLElement; app: any; scope: any = null;
  constructor(public leaf: any) { super(); this.app = leaf.app; this.containerEl = leaf.containerEl; this.contentEl = leaf.containerEl.createDiv({ cls: "view-content" }); }
  async setState() {}
  getState() { return {}; }
}
export class TextFileView extends ItemView {
  file: TFile | null = null; data = "";
  requestSave = () => { (window as any).__saves = ((window as any).__saves ?? 0) + 1; };
}
export class Notice { constructor(public message: string) { console.log("[Notice]", message); } hide() {} setMessage(m: string) { this.message = m; return this; } }
export class Menu {
  items: any[] = [];
  addItem(cb: (i: any) => void) { const item: any = { title: "", setTitle(t: string) { this.title = t; return this; }, setIcon() { return this; }, setChecked() { return this; }, setWarning() { return this; }, onClick(f: () => void) { this.f = f; return this; } }; cb(item); this.items.push(item); return this; }
  addSeparator() { return this; }
  showAtMouseEvent() { (window as any).__menu = this; return this; }
  showAtPosition() { (window as any).__menu = this; return this; }
}
export class Modal { contentEl = document.createElement("div"); modalEl = document.createElement("div"); constructor(public app: unknown) {} open() {} close() {} setTitle() { return this; } }
export class FuzzySuggestModal<T> extends Modal { setPlaceholder() {} }
export class Setting { controlEl = document.createElement("div"); constructor(public el: HTMLElement) {} setName() { return this; } setDesc() { return this; } addButton() { return this; } addText() { return this; } addDropdown() { return this; } }
export const MarkdownRenderer = { render: async () => {} };
export class MarkdownView {}
export class PluginSettingTab {}
export class SecretComponent {}
export class Plugin {}
export class WorkspaceLeaf {}
export type ViewStateResult = unknown;

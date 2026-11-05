import { Menu, Notice, Platform, Scope, TextFileView, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import {
  Element,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  Notebook,
  PAGE_WIDTH,
  PAPER_LABELS,
  PEN_COLORS,
  PEN_WIDTHS,
  Page,
  PaperColor,
  ShapeKind,
  Stroke,
  TEMPLATE_LABELS,
  Template,
  cloneElements,
  elementBounds,
  hitsElement,
  insideLasso,
  newId,
  newNotebook,
  newPage,
  parseNotebook,
  serializeNotebook,
  shapePoints,
  translateElement,
  COVER_COLORS,
  COLOR_NAMES,
} from "./model";
import { PAPER_FILL, canvasToBlob, drawBackground, drawElements, drawStroke, invalidateStroke, renderPageImage } from "./render";
import { exportNotebookPdf, pagesFromPdf } from "./pdf";
import { availablePath, pickDeviceFile, pickFromList, promptText, saveDeviceFile, vaultImages, vaultPdfs, confirmDialog } from "../ui";

export const VIEW_TYPE_NOTEBOOK = "claude-research-notebook";

export type NotebookClaudeAction = "transcribe-page" | "transcribe-all" | "ask-page";

/** What the notebook needs from the plugin (kept as an interface to avoid import cycles). */
export interface NotebookHost {
  penOnly(): boolean;
  setPenOnly(value: boolean): Promise<void>;
  openLibrary(folder?: string, leaf?: WorkspaceLeaf): Promise<void>;
  notebookClaude(view: NotebookView, action: NotebookClaudeAction): Promise<void>;
  /** Writes the companion "(Text)" note with all page transcripts. */
  syncTranscriptNote(file: TFile, nb: Notebook): Promise<void>;
}

type Tool = "pen" | "highlighter" | "eraser" | "lasso" | "shape" | "text" | "hand";

interface PageUI {
  page: Page;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  live: HTMLCanvasElement;
  label: HTMLElement;
  visible: boolean;
  scale: number;
}

type Op =
  | { kind: "page"; pageId: string; before: Element[]; after: Element[] }
  | { kind: "pages"; before: string; after: string };

interface ActiveInput {
  pointerId: number;
  ui: PageUI;
  tool: Tool | "move";
  before: Element[];
  stroke?: Stroke;
  lasso?: number[];
  start?: { x: number; y: number };
  last?: { x: number; y: number };
  erased?: boolean;
  pan?: { x: number; y: number };
  /** Last client position (to hand a drawing finger over to a pinch gesture). */
  client?: { x: number; y: number; t: number };
  pointerType?: string;
}

const MAX_CANVAS_AREA = 8_000_000;
const TOOL_ICONS: Record<Tool, [string, string]> = {
  pen: ["pen", "Stift"],
  highlighter: ["highlighter", "Textmarker"],
  eraser: ["eraser", "Radierer"],
  lasso: ["lasso", "Lasso: auswählen, verschieben"],
  shape: ["shapes", "Formen"],
  text: ["type", "Text"],
  hand: ["hand", "Hand: verschieben/scrollen"],
};

export class NotebookView extends TextFileView {
  nb: Notebook = newNotebook();
  private uis: PageUI[] = [];
  private built = false;
  private toolbar!: HTMLElement;
  private subbar!: HTMLElement;
  private scroller!: HTMLElement;
  private stack!: HTMLElement;
  private toolButtons = new Map<Tool, HTMLElement>();
  private undoBtn!: HTMLElement;
  private redoBtn!: HTMLElement;

  private tool: Tool = "pen";
  private penColor = PEN_COLORS[0];
  private penWidth = PEN_WIDTHS[1];
  private hlColor = HIGHLIGHTER_COLORS[0];
  private hlWidth = HIGHLIGHTER_WIDTHS[1];
  private shapeKind: ShapeKind = "line";

  private zoom = 1;
  private baseWidth = 760;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private observer: IntersectionObserver | null = null;
  private resizeObs: ResizeObserver | null = null;
  private active: ActiveInput | null = null;
  private liveFrame = 0;
  private renderTimer = 0;
  private selection: { ui: PageUI; elements: Element[] } | null = null;
  private selBar: HTMLElement | null = null;

  private touches = new Map<number, { x: number; y: number; t: number }>();
  /** Last time the stylus touched or hovered over the paper (palm rejection). */
  private lastPenTime = -Infinity;
  private tap: { id: number; ui: PageUI; x: number; y: number; t: number; pt: { x: number; y: number } } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private velocity = { x: 0, y: 0 };
  private inertiaFrame = 0;

  constructor(leaf: WorkspaceLeaf, private host: NotebookHost) {
    super(leaf);
    this.scope = new Scope(this.app.scope);
    this.scope.register(["Mod"], "z", () => {
      this.undo();
      return false;
    });
    this.scope.register(["Mod", "Shift"], "z", () => {
      this.redo();
      return false;
    });
    this.scope.register(["Mod"], "y", () => {
      this.redo();
      return false;
    });
  }

  getViewType(): string {
    return VIEW_TYPE_NOTEBOOK;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Notizbuch";
  }

  getIcon(): string {
    return "notebook-pen";
  }

  // ---------- TextFileView ----------

  getViewData(): string {
    return serializeNotebook(this.nb);
  }

  setViewData(data: string, clear: boolean): void {
    this.build();
    try {
      this.nb = parseNotebook(data);
    } catch {
      new Notice("Dieses Notizbuch konnte nicht gelesen werden (beschädigte Datei?).");
      this.nb = newNotebook();
    }
    if (clear) {
      this.undoStack = [];
      this.redoStack = [];
      this.zoom = 1;
    }
    this.rebuildPages();
    this.updateUndoButtons();
  }

  clear(): void {
    this.nb = newNotebook();
    this.undoStack = [];
    this.redoStack = [];
  }

  async onOpen(): Promise<void> {
    this.build();
  }

  async onClose(): Promise<void> {
    this.observer?.disconnect();
    this.resizeObs?.disconnect();
    window.cancelAnimationFrame(this.inertiaFrame);
  }

  onResize(): void {
    if (this.built) this.relayout(true);
  }

  // ---------- public helpers for the plugin ----------

  currentPageIndex(): number {
    if (!this.uis.length) return 0;
    const mid = this.scroller.getBoundingClientRect().top + this.scroller.clientHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    this.uis.forEach((ui, i) => {
      const r = ui.el.getBoundingClientRect();
      const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  async pagePng(index: number, pixelWidth = 1400): Promise<Blob> {
    const canvas = await renderPageImage(this.app, this.nb.pages[index], this.nb.paper, pixelWidth);
    return canvasToBlob(canvas, "image/png");
  }

  async setTranscript(pageId: string, text: string): Promise<void> {
    const page = this.nb.pages.find((p) => p.id === pageId);
    if (!page) return;
    page.transcript = text.trim();
    this.touch();
    if (this.file) await this.host.syncTranscriptNote(this.file, this.nb);
  }

  // ---------- layout ----------

  private build(): void {
    if (this.built) return;
    this.built = true;
    const root = this.contentEl;
    root.empty();
    root.addClass("cr-notebook");

    this.toolbar = root.createDiv({ cls: "cr-nb-toolbar" });
    this.subbar = root.createDiv({ cls: "cr-nb-subbar" });
    this.scroller = root.createDiv({ cls: "cr-nb-scroller" });
    this.stack = this.scroller.createDiv({ cls: "cr-nb-stack" });
    this.buildToolbar();
    this.buildSubbar();

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ui = this.uis.find((u) => u.el === entry.target);
          if (!ui) continue;
          ui.visible = entry.isIntersecting;
          if (ui.visible) this.renderPage(ui);
          else this.releasePage(ui);
        }
      },
      { root: this.scroller, rootMargin: "500px 0px" },
    );
    this.resizeObs = new ResizeObserver(() => this.relayout(true));
    this.resizeObs.observe(this.scroller);

    this.scroller.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY, false);
      },
      { passive: false },
    );
  }

  private buildToolbar(): void {
    const tb = this.toolbar;
    tb.empty();
    const left = tb.createDiv({ cls: "cr-nb-group cr-nb-left" });
    this.iconBtn(left, "chevron-left", "Zur Bibliothek", () => void this.host.openLibrary(this.file?.parent?.path, this.leaf));
    left.createSpan({ cls: "cr-nb-title", text: this.file?.basename ?? "Notizbuch" });

    const tools = tb.createDiv({ cls: "cr-nb-group cr-nb-tools" });
    for (const tool of Object.keys(TOOL_ICONS) as Tool[]) {
      const [icon, label] = TOOL_ICONS[tool];
      const btn = this.iconBtn(tools, icon, label, () => this.setTool(tool));
      this.toolButtons.set(tool, btn);
    }
    this.iconBtn(tools, "image-plus", "Bild einfügen", (e) => this.imageMenu(e));

    const right = tb.createDiv({ cls: "cr-nb-group cr-nb-right" });
    this.undoBtn = this.iconBtn(right, "undo-2", "Rückgängig", () => this.undo());
    this.redoBtn = this.iconBtn(right, "redo-2", "Wiederholen", () => this.redo());
    this.iconBtn(right, "file-plus-2", "Seite hinzufügen", (e) => this.addPageMenu(e, this.nb.pages.length - 1));
    this.iconBtn(right, "sparkles", "Claude", (e) => this.claudeMenu(e), "cr-nb-claude");
    this.iconBtn(right, "more-horizontal", "Mehr", (e) => this.moreMenu(e));
    this.highlightTool();
  }

  private buildSubbar(): void {
    const sb = this.subbar;
    sb.empty();
    const t = this.tool;
    if (t === "pen" || t === "shape" || t === "text") {
      if (t === "shape") {
        const kinds: [ShapeKind, string, string][] = [
          ["line", "minus", "Linie"],
          ["arrow", "move-up-right", "Pfeil"],
          ["rect", "square", "Rechteck"],
          ["ellipse", "circle", "Ellipse"],
        ];
        const g = sb.createDiv({ cls: "cr-nb-chips" });
        for (const [kind, icon, label] of kinds) {
          const b = this.iconBtn(g, icon, label, () => {
            this.shapeKind = kind;
            this.buildSubbar();
          });
          b.toggleClass("is-active", this.shapeKind === kind);
        }
      }
      this.swatches(sb, PEN_COLORS, this.penColor, (c) => (this.penColor = c));
      if (t !== "text") this.widths(sb, PEN_WIDTHS, this.penWidth, (w) => (this.penWidth = w), false);
      if (t === "text") sb.createSpan({ cls: "cr-nb-hint", text: "Auf die Seite tippen, um Text einzufügen." });
    } else if (t === "highlighter") {
      this.swatches(sb, HIGHLIGHTER_COLORS, this.hlColor, (c) => (this.hlColor = c));
      this.widths(sb, HIGHLIGHTER_WIDTHS, this.hlWidth, (w) => (this.hlWidth = w), true);
    } else if (t === "eraser") {
      sb.createSpan({ cls: "cr-nb-hint", text: "Über Striche wischen löscht sie. Tipp: Mit gedrückter S Pen-Taste radierst du mit jedem Werkzeug." });
    } else if (t === "lasso") {
      sb.createSpan({ cls: "cr-nb-hint", text: "Striche einkreisen, dann verschieben, umfärben, duplizieren oder löschen." });
    } else {
      sb.createSpan({ cls: "cr-nb-hint", text: "Ziehen verschiebt die Seiten. Zwei Finger: zoomen." });
    }

    const spacer = sb.createDiv({ cls: "cr-nb-spacer" });
    spacer.setAttr("aria-hidden", "true");
    const chip = sb.createEl("button", { cls: "cr-nb-toggle", text: this.host.penOnly() ? "Nur Stift zeichnet" : "Finger zeichnet auch" });
    chip.toggleClass("is-active", this.host.penOnly());
    setTooltip(chip, "An: Nur der Stift zeichnet, Finger scrollen und zoomen (Handballen werden ignoriert).");
    chip.addEventListener("click", async () => {
      await this.host.setPenOnly(!this.host.penOnly());
      this.buildSubbar();
    });
  }

  private swatches(parent: HTMLElement, colors: string[], current: string, set: (c: string) => void): void {
    const g = parent.createDiv({ cls: "cr-nb-chips" });
    for (const c of colors) {
      const b = g.createEl("button", { cls: "cr-nb-swatch", attr: { "aria-label": c } });
      b.style.setProperty("--swatch", c);
      b.toggleClass("is-active", c.toLowerCase() === current.toLowerCase());
      b.addEventListener("click", () => {
        set(c);
        this.buildSubbar();
      });
    }
    const custom = g.createEl("input", { type: "color", cls: "cr-nb-color-input", attr: { "aria-label": "Eigene Farbe" } });
    custom.value = current.length === 7 ? current : "#000000";
    custom.addEventListener("change", () => {
      set(custom.value);
      this.buildSubbar();
    });
  }

  private widths(parent: HTMLElement, widths: number[], current: number, set: (w: number) => void, wide: boolean): void {
    const g = parent.createDiv({ cls: "cr-nb-chips" });
    widths.forEach((w) => {
      const b = g.createEl("button", { cls: "cr-nb-width", attr: { "aria-label": `Stärke ${w}` } });
      const dot = b.createSpan({ cls: wide ? "cr-nb-width-bar" : "cr-nb-width-dot" });
      const px = wide ? Math.max(4, w / 2.2) : Math.max(3, w * 2.2);
      dot.style.setProperty("--w", `${px}px`);
      b.toggleClass("is-active", w === current);
      b.addEventListener("click", () => {
        set(w);
        this.buildSubbar();
      });
    });
  }

  private iconBtn(parent: HTMLElement, icon: string, label: string, onClick: (e: MouseEvent) => void, extraCls = ""): HTMLElement {
    const b = parent.createEl("button", { cls: `clickable-icon cr-nb-btn ${extraCls}`.trim(), attr: { "aria-label": label } });
    setIcon(b, icon);
    b.addEventListener("click", onClick);
    return b;
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== "lasso") this.clearSelection();
    this.highlightTool();
    this.buildSubbar();
  }

  private highlightTool(): void {
    for (const [t, b] of this.toolButtons) b.toggleClass("is-active", t === this.tool);
  }

  private rebuildPages(): void {
    this.clearSelection();
    this.observer?.disconnect();
    this.stack.empty();
    this.uis = [];
    this.nb.pages.forEach((page, i) => this.uis.push(this.createPageUI(page, i)));

    const add = this.stack.createEl("button", { cls: "cr-nb-addpage" });
    setIcon(add.createSpan(), "plus");
    add.createSpan({ text: "Seite hinzufügen" });
    add.addEventListener("click", (e) => this.addPageMenu(e, this.nb.pages.length - 1));

    const title = this.toolbar.querySelector(".cr-nb-title");
    if (title) title.textContent = this.file?.basename ?? "Notizbuch";
    this.relayout(false);
    for (const ui of this.uis) this.observer?.observe(ui.el);
  }

  private createPageUI(page: Page, index: number): PageUI {
    const wrap = this.stack.createDiv({ cls: "cr-nb-pagewrap" });
    const el = wrap.createDiv({ cls: "cr-nb-page" });
    el.style.background = page.bg ? "#ffffff" : PAPER_FILL[this.nb.paper];
    const canvas = el.createEl("canvas", { cls: "cr-nb-canvas" });
    const live = el.createEl("canvas", { cls: "cr-nb-live" });
    const footer = wrap.createDiv({ cls: "cr-nb-pagefooter" });
    const label = footer.createSpan({ text: `Seite ${index + 1} von ${this.nb.pages.length}` });
    if (page.transcript) footer.createSpan({ cls: "cr-nb-badge", text: "Text erkannt" });
    const more = footer.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Seitenmenü" } });
    setIcon(more, "more-horizontal");
    const ui: PageUI = { page, el, canvas, live, label, visible: false, scale: 0 };
    more.addEventListener("click", (e) => this.pageMenu(e, ui));

    live.addEventListener("pointerdown", (e) => this.onDown(e, ui));
    live.addEventListener("pointermove", (e) => this.onMove(e, ui));
    live.addEventListener("pointerup", (e) => this.onUp(e, ui, false));
    live.addEventListener("pointercancel", (e) => this.onUp(e, ui, true));
    live.addEventListener("contextmenu", (e) => e.preventDefault());
    // Keep Obsidian's mobile swipe gestures (sidebars, command palette) away from the paper.
    const stop = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };
    live.addEventListener("touchstart", stop, { passive: false });
    live.addEventListener("touchmove", stop, { passive: false });
    return ui;
  }

  private relayout(rerender: boolean): void {
    const avail = this.scroller.clientWidth - 32;
    if (avail > 0) this.baseWidth = Math.max(260, Math.min(avail, 980));
    const w = this.baseWidth * this.zoom;
    for (const ui of this.uis) {
      ui.el.style.width = `${w}px`;
      ui.el.style.height = `${(w * ui.page.h) / PAGE_WIDTH}px`;
    }
    this.stack.style.setProperty("--cr-page-width", `${w}px`);
    if (rerender) this.scheduleRender();
  }

  private scheduleRender(delay = 160): void {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      for (const ui of this.uis) if (ui.visible) this.renderPage(ui);
      if (this.selection) this.drawSelection();
    }, delay);
  }

  /** Device pixels per page unit for a page, capped so canvases stay within memory limits. */
  private pxScale(ui: PageUI): number {
    const css = (this.baseWidth * this.zoom) / PAGE_WIDTH;
    const dpr = window.devicePixelRatio || 1;
    const cap = Math.sqrt(MAX_CANVAS_AREA / (PAGE_WIDTH * ui.page.h));
    return Math.min(css * dpr, cap);
  }

  private renderPage(ui: PageUI): void {
    if (!ui.visible) return;
    const s = this.pxScale(ui);
    const w = Math.round(PAGE_WIDTH * s);
    const h = Math.round(ui.page.h * s);
    if (ui.canvas.width !== w || ui.canvas.height !== h) {
      ui.canvas.width = w;
      ui.canvas.height = h;
    }
    const ctx = ui.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const env = { app: this.app, paper: this.nb.paper, scale: s, redraw: () => this.renderPage(ui) };
    drawBackground(ctx, ui.page, env);
    drawElements(ctx, ui.page.elements, env);
    ui.scale = s;
  }

  private releasePage(ui: PageUI): void {
    ui.canvas.width = 0;
    ui.canvas.height = 0;
    ui.scale = 0;
  }

  private prepareLive(ui: PageUI): CanvasRenderingContext2D | null {
    const s = this.pxScale(ui);
    const w = Math.round(PAGE_WIDTH * s);
    const h = Math.round(ui.page.h * s);
    if (ui.live.width !== w || ui.live.height !== h) {
      ui.live.width = w;
      ui.live.height = h;
    }
    const ctx = ui.live.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    return ctx;
  }

  private releaseLive(ui: PageUI): void {
    ui.live.width = 0;
    ui.live.height = 0;
  }

  // ---------- input ----------

  private toPage(e: PointerEvent, ui: PageUI): { x: number; y: number } {
    const r = ui.el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAGE_WIDTH, y: ((e.clientY - r.top) / r.height) * ui.page.h };
  }

  /** Page units per CSS pixel. */
  private unitsPerPx(): number {
    return PAGE_WIDTH / (this.baseWidth * this.zoom);
  }

  private onDown(e: PointerEvent, ui: PageUI): void {
    if (e.pointerType === "pen") this.lastPenTime = e.timeStamp;
    if (e.pointerType === "touch") {
      // Palm rejection: ignore touches while the stylus is writing or hovering nearby.
      if (this.active?.pointerType === "pen" || e.timeStamp - this.lastPenTime < 600) {
        e.preventDefault();
        return;
      }
      // Finger: scroll/zoom (always for a second finger, and for every finger in pen-only mode).
      if (this.host.penOnly() || this.touches.size > 0 || (this.active && this.active.pointerId !== e.pointerId)) {
        // A finger that was drawing becomes the first finger of a pinch.
        const drawing = this.active;
        if (drawing && drawing.pointerType === "touch" && drawing.client) {
          this.cancelActive();
          this.touches.set(drawing.pointerId, drawing.client);
        }
        this.touchDown(e, ui);
        return;
      }
    }
    if (this.active) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    capture(ui.live, e.pointerId);
    window.cancelAnimationFrame(this.inertiaFrame);

    const pt = this.toPage(e, ui);
    let tool: Tool = this.tool;
    // S Pen side button (barrel) or an eraser tip turns any tool into the eraser.
    if (e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0 || (e.buttons & 2) !== 0)) tool = "eraser";

    const a: ActiveInput = {
      pointerId: e.pointerId,
      ui,
      tool,
      before: cloneElements(ui.page.elements),
      start: pt,
      last: pt,
      client: { x: e.clientX, y: e.clientY, t: e.timeStamp },
      pointerType: e.pointerType,
    };
    if (tool === "hand") {
      a.pan = { x: e.clientX, y: e.clientY };
    } else if (tool === "pen" || tool === "highlighter") {
      a.stroke = {
        type: "stroke",
        tool,
        color: tool === "pen" ? this.penColor : this.hlColor,
        width: tool === "pen" ? this.penWidth : this.hlWidth,
        p: [pt.x, pt.y, this.pressure(e)],
        plain: tool === "highlighter" ? true : undefined,
      };
    } else if (tool === "lasso") {
      if (this.selection && this.selection.ui === ui && this.inSelection(pt)) {
        a.tool = "move";
      } else {
        this.clearSelection();
        a.lasso = [pt.x, pt.y];
      }
    } else if (tool === "eraser") {
      this.eraseAt(a, pt);
    } else if (tool === "shape") {
      a.stroke = { type: "stroke", tool: "pen", color: this.penColor, width: this.penWidth, p: shapePoints(this.shapeKind, pt.x, pt.y, pt.x, pt.y), plain: true };
    }
    this.active = a;
    this.requestLive();
  }

  private onMove(e: PointerEvent, ui: PageUI): void {
    if (e.pointerType === "pen") this.lastPenTime = e.timeStamp;
    if (this.touches.has(e.pointerId)) {
      this.touchMove(e);
      return;
    }
    const a = this.active;
    if (!a || a.pointerId !== e.pointerId || a.ui !== ui) {
      if (!a && e.pointerType === "pen" && this.tool === "eraser") this.hoverEraser(e, ui);
      return;
    }
    e.preventDefault();
    a.client = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const list = events.length ? events : [e];
    const minDist = this.unitsPerPx() * 0.6;

    for (const ev of list) {
      const pt = this.toPage(ev, ui);
      switch (a.tool) {
        case "pen":
        case "highlighter": {
          const p = a.stroke!.p;
          const lx = p[p.length - 3];
          const ly = p[p.length - 2];
          if (Math.hypot(pt.x - lx, pt.y - ly) >= minDist) p.push(pt.x, pt.y, this.pressure(ev));
          break;
        }
        case "eraser":
          this.eraseAt(a, pt);
          break;
        case "lasso":
          a.lasso!.push(pt.x, pt.y);
          break;
        case "shape":
          a.stroke!.p = shapePoints(this.shapeKind, a.start!.x, a.start!.y, pt.x, pt.y);
          break;
        case "move": {
          const dx = pt.x - a.last!.x;
          const dy = pt.y - a.last!.y;
          for (const el of this.selection?.elements ?? []) {
            translateElement(el, dx, dy);
            if (el.type === "stroke") invalidateStroke(el);
          }
          break;
        }
        case "hand": {
          this.scroller.scrollLeft -= ev.clientX - a.pan!.x;
          this.scroller.scrollTop -= ev.clientY - a.pan!.y;
          a.pan = { x: ev.clientX, y: ev.clientY };
          break;
        }
        case "text":
          break;
      }
      a.last = pt;
    }
    if (a.tool === "move") {
      this.renderPage(ui);
      this.positionSelBar();
    }
    this.requestLive();
  }

  private onUp(e: PointerEvent, ui: PageUI, cancelled: boolean): void {
    if (this.touches.has(e.pointerId)) {
      this.touchUp(e);
      return;
    }
    const a = this.active;
    if (!a || a.pointerId !== e.pointerId) return;
    this.active = null;
    window.cancelAnimationFrame(this.liveFrame);
    this.liveFrame = 0;
    if (cancelled && (a.tool === "pen" || a.tool === "highlighter" || a.tool === "shape")) {
      this.clearLive(ui);
      return;
    }
    const page = ui.page;

    switch (a.tool) {
      case "pen":
      case "highlighter":
      case "shape": {
        const s = a.stroke!;
        if (a.tool === "shape" && s.p.length >= 6 && Math.hypot(s.p[0] - s.p[3], s.p[1] - s.p[4]) < 4) break;
        invalidateStroke(s);
        page.elements.push(s);
        this.commit(ui, a.before);
        if (s.tool === "pen") this.drawOnto(ui, s);
        else this.renderPage(ui);
        break;
      }
      case "eraser":
        if (a.erased) this.commit(ui, a.before);
        break;
      case "lasso": {
        const poly = a.lasso!;
        const picked = page.elements.filter((el) => insideLasso(el, poly));
        if (picked.length) this.selection = { ui, elements: picked };
        break;
      }
      case "move":
        this.commit(ui, a.before);
        break;
      case "text":
        void this.addText(ui, a.start!);
        break;
      case "hand":
        break;
    }
    this.clearLive(ui);
    if (this.selection && this.selection.ui === ui) this.drawSelection();
  }

  private pressure(e: PointerEvent): number {
    if (e.pointerType === "pen") return Math.max(0.05, Math.min(1, e.pressure || 0.5));
    return 0.5;
  }

  private cancelActive(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    if (a.erased || a.tool === "move") {
      a.ui.page.elements = a.before;
      this.renderPage(a.ui);
    }
    this.clearLive(a.ui);
  }

  private eraseAt(a: ActiveInput, pt: { x: number; y: number }): void {
    const r = this.unitsPerPx() * 11;
    const els = a.ui.page.elements;
    const keep = els.filter((el) => !hitsElement(el, pt.x, pt.y, r));
    if (keep.length !== els.length) {
      a.ui.page.elements = keep;
      a.erased = true;
      this.renderPage(a.ui);
    }
  }

  private hoverEraser(e: PointerEvent, ui: PageUI): void {
    const ctx = this.prepareLive(ui);
    if (!ctx) return;
    const pt = this.toPage(e, ui);
    this.drawEraserRing(ctx, pt);
  }

  private drawEraserRing(ctx: CanvasRenderingContext2D, pt: { x: number; y: number }): void {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, this.unitsPerPx() * 11, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,120,120,0.8)";
    ctx.lineWidth = this.unitsPerPx();
    ctx.stroke();
  }

  private requestLive(): void {
    if (this.liveFrame) return;
    this.liveFrame = window.requestAnimationFrame(() => {
      this.liveFrame = 0;
      const a = this.active;
      if (!a) return;
      const ctx = this.prepareLive(a.ui);
      if (!ctx) return;
      if (a.stroke) {
        invalidateStroke(a.stroke);
        drawStroke(ctx, a.stroke, this.nb.paper);
      } else if (a.lasso) {
        ctx.beginPath();
        for (let i = 0; i < a.lasso.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, a.lasso[i], a.lasso[i + 1]);
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "#2b7de9";
        ctx.lineWidth = this.unitsPerPx() * 1.5;
        ctx.stroke();
      } else if (a.tool === "eraser" && a.last) {
        this.drawEraserRing(ctx, a.last);
      } else if (a.tool === "move") {
        this.drawSelectionBox(ctx);
      }
    });
  }

  private clearLive(ui: PageUI): void {
    if (this.selection && this.selection.ui === ui) {
      this.drawSelection();
      return;
    }
    this.releaseLive(ui);
  }

  /** Draws one stroke onto the committed canvas without a full redraw. */
  private drawOnto(ui: PageUI, s: Stroke): void {
    if (!ui.visible || !ui.scale) {
      this.renderPage(ui);
      return;
    }
    const ctx = ui.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ui.scale, 0, 0, ui.scale, 0, 0);
    drawStroke(ctx, s, this.nb.paper);
  }

  // ---------- touch gestures (pen-only mode) ----------

  private touchDown(e: PointerEvent, ui: PageUI): void {
    e.preventDefault();
    capture(e.target as HTMLElement, e.pointerId);
    window.cancelAnimationFrame(this.inertiaFrame);
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    this.tap = this.touches.size === 1 ? { id: e.pointerId, ui, x: e.clientX, y: e.clientY, t: e.timeStamp, pt: this.toPage(e, ui) } : null;
    this.velocity = { x: 0, y: 0 };
    if (this.touches.size === 2) this.pinch = { dist: this.touchDistance(), zoom: this.zoom };
  }

  private touchMove(e: PointerEvent): void {
    const prev = this.touches.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    const now = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    this.touches.set(e.pointerId, now);
    if (this.touches.size === 1) {
      const dx = now.x - prev.x;
      const dy = now.y - prev.y;
      this.scroller.scrollLeft -= dx;
      this.scroller.scrollTop -= dy;
      const dt = Math.max(1, now.t - prev.t);
      this.velocity = { x: 0.8 * (dx / dt) + 0.2 * this.velocity.x, y: 0.8 * (dy / dt) + 0.2 * this.velocity.y };
    } else if (this.touches.size === 2 && this.pinch) {
      const pts = [...this.touches.values()];
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      this.setZoom((this.pinch.zoom * this.touchDistance()) / this.pinch.dist, mid.x, mid.y, true);
    }
  }

  private touchUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    // A short finger tap with the text tool places a text box (no stylus needed).
    const tap = this.tap;
    this.tap = null;
    if (tap && tap.id === e.pointerId && this.tool === "text" && e.timeStamp - tap.t < 450 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) {
      void this.addText(tap.ui, tap.pt);
      return;
    }
    if (this.touches.size < 2 && this.pinch) {
      this.pinch = null;
      this.velocity = { x: 0, y: 0 };
      this.scheduleRender(0);
    }
    if (this.touches.size === 0 && (Math.abs(this.velocity.x) > 0.05 || Math.abs(this.velocity.y) > 0.05)) this.startInertia();
  }

  private touchDistance(): number {
    const pts = [...this.touches.values()];
    return Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
  }

  private startInertia(): void {
    let v = { ...this.velocity };
    let last = performance.now();
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      this.scroller.scrollLeft -= v.x * dt;
      this.scroller.scrollTop -= v.y * dt;
      const decay = Math.pow(0.995, dt);
      v = { x: v.x * decay, y: v.y * decay };
      if (Math.abs(v.x) > 0.02 || Math.abs(v.y) > 0.02) this.inertiaFrame = window.requestAnimationFrame(step);
    };
    this.inertiaFrame = window.requestAnimationFrame(step);
  }

  private setZoom(z: number, clientX: number, clientY: number, gesture: boolean): void {
    const zoom = Math.max(0.4, Math.min(4, z));
    if (Math.abs(zoom - this.zoom) < 0.001) return;
    const r = this.scroller.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    const ratio = zoom / this.zoom;
    const left = (this.scroller.scrollLeft + px) * ratio - px;
    const top = (this.scroller.scrollTop + py) * ratio - py;
    this.zoom = zoom;
    this.relayout(false);
    this.scroller.scrollLeft = left;
    this.scroller.scrollTop = top;
    this.scheduleRender(gesture ? 220 : 120);
  }

  // ---------- selection ----------

  private selectionBounds(): { x: number; y: number; w: number; h: number } | null {
    if (!this.selection?.elements.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of this.selection.elements) {
      const b = elementBounds(el);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    const pad = 10;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }

  private inSelection(pt: { x: number; y: number }): boolean {
    const b = this.selectionBounds();
    return !!b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
  }

  private drawSelectionBox(ctx: CanvasRenderingContext2D): void {
    const b = this.selectionBounds();
    if (!b) return;
    ctx.fillStyle = "rgba(43,125,233,0.07)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([10, 7]);
    ctx.strokeStyle = "#2b7de9";
    ctx.lineWidth = this.unitsPerPx() * 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }

  private drawSelection(): void {
    if (!this.selection) return;
    const ctx = this.prepareLive(this.selection.ui);
    if (ctx) this.drawSelectionBox(ctx);
    this.showSelBar();
  }

  private showSelBar(): void {
    if (!this.selection) return;
    if (!this.selBar) {
      this.selBar = createDiv({ cls: "cr-nb-selbar" });
      const btn = (icon: string, label: string, fn: (e: MouseEvent) => void) => {
        const b = this.selBar!.createEl("button", { cls: "cr-nb-selbtn" });
        setIcon(b.createSpan(), icon);
        b.createSpan({ text: label });
        b.addEventListener("click", fn);
      };
      btn("palette", "Farbe", (e) => this.recolorMenu(e));
      btn("copy", "Duplizieren", () => this.duplicateSelection());
      btn("trash-2", "Löschen", () => this.deleteSelection());
    }
    if (this.selBar.parentElement !== this.selection.ui.el) this.selection.ui.el.appendChild(this.selBar);
    this.positionSelBar();
  }

  private positionSelBar(): void {
    const b = this.selectionBounds();
    if (!b || !this.selBar || !this.selection) return;
    const k = 1 / this.unitsPerPx();
    const top = b.y * k - 46;
    this.selBar.style.left = `${Math.max(4, b.x * k)}px`;
    this.selBar.style.top = `${top < 4 ? (b.y + b.h) * k + 8 : top}px`;
  }

  private clearSelection(): void {
    const sel = this.selection;
    this.selection = null;
    this.selBar?.remove();
    this.selBar = null;
    if (sel) this.releaseLive(sel.ui);
  }

  private recolorMenu(e: MouseEvent): void {
    const sel = this.selection;
    if (!sel) return;
    const menu = new Menu();
    for (const c of [...PEN_COLORS, ...HIGHLIGHTER_COLORS]) {
      menu.addItem((item) =>
        item.setTitle(COLOR_NAMES[c] ?? c).setIcon("circle").onClick(() => {
          const before = cloneElements(sel.ui.page.elements);
          for (const el of sel.elements) {
            if (el.type === "stroke") {
              el.color = c;
              invalidateStroke(el);
            } else if (el.type === "text") el.color = c;
          }
          this.commit(sel.ui, before, true);
          this.renderPage(sel.ui);
          this.drawSelection();
        }),
      );
    }
    menu.showAtMouseEvent(e);
  }

  private duplicateSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    const before = cloneElements(sel.ui.page.elements);
    const copies = cloneElements(sel.elements);
    copies.forEach((el) => translateElement(el, 24, 24));
    sel.ui.page.elements.push(...copies);
    this.commit(sel.ui, before, true);
    this.selection = { ui: sel.ui, elements: copies };
    this.renderPage(sel.ui);
    this.drawSelection();
  }

  private deleteSelection(): void {
    const sel = this.selection;
    if (!sel) return;
    const before = cloneElements(sel.ui.page.elements);
    const drop = new Set(sel.elements);
    sel.ui.page.elements = sel.ui.page.elements.filter((el) => !drop.has(el));
    this.clearSelection();
    this.commit(sel.ui, before);
    this.renderPage(sel.ui);
  }

  // ---------- text & images ----------

  private async addText(ui: PageUI, at: { x: number; y: number }): Promise<void> {
    const text = await promptText(this.app, { title: "Text einfügen", multiline: true, placeholder: "Text (auch mit „S Pen zu Text“)", cta: "Einfügen" });
    if (!text?.trim()) return;
    const before = cloneElements(ui.page.elements);
    ui.page.elements.push({ type: "text", x: at.x, y: at.y, text: text.trim(), size: 30, color: this.penColor });
    this.commit(ui, before);
    this.renderPage(ui);
  }

  private imageMenu(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Foto oder Bild vom Gerät").setIcon("camera").onClick(() => void this.insertDeviceImage()));
    menu.addItem((i) => i.setTitle("Bild aus dem Vault").setIcon("image").onClick(() => void this.insertVaultImage()));
    menu.showAtMouseEvent(e);
  }

  private async insertDeviceImage(): Promise<void> {
    const picked = await pickDeviceFile("image/*");
    if (!picked || !this.file) return;
    const file = await saveDeviceFile(this.app, picked, this.file.path);
    await this.insertImage(file);
  }

  private async insertVaultImage(): Promise<void> {
    const file = await pickFromList(this.app, vaultImages(this.app), "Bild auswählen …");
    if (file) await this.insertImage(file);
  }

  private async insertImage(file: TFile): Promise<void> {
    const ui = this.uis[this.currentPageIndex()];
    if (!ui) return;
    const img = new Image();
    img.src = this.app.vault.getResourcePath(file);
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.75;
    const w = 600;
    const h = Math.min(w * ratio, ui.page.h * 0.8);
    const before = cloneElements(ui.page.elements);
    ui.page.elements.push({ type: "image", path: file.path, x: (PAGE_WIDTH - h / ratio) / 2, y: (ui.page.h - h) / 2, w: h / ratio, h });
    this.commit(ui, before);
    this.renderPage(ui);
    this.setTool("lasso");
    new Notice("Bild eingefügt. Mit dem Lasso kannst du es verschieben.");
  }

  // ---------- pages ----------

  private addPageMenu(e: MouseEvent, afterIndex: number): void {
    const menu = new Menu();
    for (const t of Object.keys(TEMPLATE_LABELS) as Template[]) {
      menu.addItem((i) => i.setTitle(`Neue Seite: ${TEMPLATE_LABELS[t]}`).setIcon("file-plus-2").onClick(() => this.insertPage(afterIndex, newPage(t))));
    }
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("PDF-Seiten einfügen (z. B. aus GoodNotes)").setIcon("file-text").onClick(() => void this.insertPdf(afterIndex)));
    menu.showAtMouseEvent(e);
  }

  private insertPage(afterIndex: number, page: Page): void {
    this.changePages(() => this.nb.pages.splice(afterIndex + 1, 0, page));
    window.setTimeout(() => this.uis[afterIndex + 1]?.el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  private async insertPdf(afterIndex: number): Promise<void> {
    const menu = new Menu();
    const run = async (path: string) => {
      try {
        const pages = await pagesFromPdf(this.app, path);
        this.changePages(() => this.nb.pages.splice(afterIndex + 1, 0, ...pages));
        new Notice(`${pages.length} PDF-Seite(n) eingefügt – du kannst jetzt darauf schreiben.`);
      } catch (err) {
        new Notice(`PDF konnte nicht geöffnet werden: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    menu.addItem((i) =>
      i.setTitle("PDF aus dem Vault").setIcon("file-text").onClick(async () => {
        const f = await pickFromList(this.app, vaultPdfs(this.app), "PDF auswählen …");
        if (f) await run(f.path);
      }),
    );
    menu.addItem((i) =>
      i.setTitle("PDF vom Gerät").setIcon("upload").onClick(async () => {
        const picked = await pickDeviceFile("application/pdf");
        if (!picked || !this.file) return;
        const f = await saveDeviceFile(this.app, picked, this.file.path);
        await run(f.path);
      }),
    );
    menu.showAtPosition({ x: window.innerWidth / 2, y: 120 });
  }

  private pageMenu(e: MouseEvent, ui: PageUI): void {
    const index = this.uis.indexOf(ui);
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Neue Seite danach").setIcon("file-plus-2").onClick(() => this.insertPage(index, newPage(ui.page.bg ? "lined" : ui.page.template))));
    menu.addItem((i) =>
      i.setTitle("Seite duplizieren").setIcon("copy").onClick(() => {
        const copy: Page = { ...JSON.parse(JSON.stringify(ui.page)), id: newId() };
        this.insertPage(index, copy);
      }),
    );
    if (!ui.page.bg) {
      menu.addSeparator();
      for (const t of Object.keys(TEMPLATE_LABELS) as Template[]) {
        menu.addItem((i) =>
          i
            .setTitle(`Vorlage: ${TEMPLATE_LABELS[t]}`)
            .setChecked(ui.page.template === t)
            .onClick(() => this.changePages(() => (this.nb.pages[index].template = t))),
        );
      }
    }
    menu.addSeparator();
    if (index > 0) menu.addItem((i) => i.setTitle("Nach oben").setIcon("arrow-up").onClick(() => this.movePage(index, -1)));
    if (index < this.uis.length - 1) menu.addItem((i) => i.setTitle("Nach unten").setIcon("arrow-down").onClick(() => this.movePage(index, 1)));
    menu.addItem((i) =>
      i
        .setTitle("Seite löschen")
        .setIcon("trash-2")
        .setWarning(true)
        .onClick(async () => {
          if (this.nb.pages.length === 1) {
            new Notice("Ein Notizbuch braucht mindestens eine Seite.");
            return;
          }
          if (ui.page.elements.length && !(await confirmDialog(this.app, "Seite löschen?", `Seite ${index + 1} wird gelöscht. Mit „Rückgängig“ holst du sie zurück.`))) return;
          this.changePages(() => this.nb.pages.splice(index, 1));
        }),
    );
    menu.showAtMouseEvent(e);
  }

  private movePage(index: number, dir: number): void {
    this.changePages(() => {
      const [p] = this.nb.pages.splice(index, 1);
      this.nb.pages.splice(index + dir, 0, p);
    });
  }

  /** Structural page change with undo support. */
  private changePages(fn: () => void): void {
    const before = JSON.stringify(this.nb.pages);
    fn();
    const after = JSON.stringify(this.nb.pages);
    if (before === after) return;
    this.pushOp({ kind: "pages", before, after });
    this.rebuildPages();
    this.touch();
  }

  // ---------- undo / save ----------

  private commit(ui: PageUI, before: Element[], keepSelection = false): void {
    this.pushOp({ kind: "page", pageId: ui.page.id, before, after: cloneElements(ui.page.elements) });
    if (!keepSelection && this.active?.tool !== "move" && this.selection && this.selection.ui === ui && !this.selection.elements.every((e) => ui.page.elements.includes(e))) {
      this.clearSelection();
    }
    this.touch();
  }

  private pushOp(op: Op): void {
    this.undoStack.push(op);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.updateUndoButtons();
  }

  private touch(): void {
    this.nb.updated = Date.now();
    this.requestSave();
  }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    this.applyOp(op, "before");
    this.redoStack.push(op);
    this.updateUndoButtons();
  }

  redo(): void {
    const op = this.redoStack.pop();
    if (!op) return;
    this.applyOp(op, "after");
    this.undoStack.push(op);
    this.updateUndoButtons();
  }

  private applyOp(op: Op, side: "before" | "after"): void {
    this.clearSelection();
    if (op.kind === "pages") {
      this.nb.pages = JSON.parse(op[side]) as Page[];
      this.rebuildPages();
    } else {
      const ui = this.uis.find((u) => u.page.id === op.pageId);
      if (!ui) return;
      ui.page.elements = cloneElements(op[side]);
      this.renderPage(ui);
    }
    this.touch();
  }

  private updateUndoButtons(): void {
    this.undoBtn?.toggleClass("is-disabled", !this.undoStack.length);
    this.redoBtn?.toggleClass("is-disabled", !this.redoStack.length);
  }

  // ---------- menus ----------

  private claudeMenu(e: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Diese Seite in Text umwandeln").setIcon("scan-text").onClick(() => void this.host.notebookClaude(this, "transcribe-page")));
    menu.addItem((i) => i.setTitle("Ganzes Notizbuch in Text umwandeln").setIcon("files").onClick(() => void this.host.notebookClaude(this, "transcribe-all")));
    menu.addItem((i) => i.setTitle("Frage zu dieser Seite …").setIcon("message-circle-question").onClick(() => void this.host.notebookClaude(this, "ask-page")));
    menu.showAtMouseEvent(e);
  }

  private moreMenu(e: MouseEvent): void {
    const menu = new Menu();
    for (const p of Object.keys(PAPER_LABELS) as PaperColor[]) {
      menu.addItem((i) =>
        i
          .setTitle(`Papier: ${PAPER_LABELS[p]}`)
          .setChecked(this.nb.paper === p)
          .onClick(() => {
            this.nb.paper = p;
            this.rebuildPages();
            this.touch();
          }),
      );
    }
    menu.addItem((i) =>
      i.setTitle("Umschlagfarbe ändern").setIcon("palette").onClick(() => {
        const idx = COVER_COLORS.indexOf(this.nb.cover);
        this.nb.cover = COVER_COLORS[(idx + 1) % COVER_COLORS.length];
        this.touch();
        new Notice("Umschlagfarbe geändert (siehe Bibliothek).");
      }),
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("Als PDF exportieren").setIcon("file-down").onClick(() => void this.exportPdf()));
    menu.addItem((i) => i.setTitle("Aktuelle Seite als Bild speichern").setIcon("image-down").onClick(() => void this.exportPng()));
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("Zoom zurücksetzen").setIcon("zoom-in").onClick(() => {
        this.zoom = 1;
        this.relayout(true);
      }),
    );
    menu.showAtMouseEvent(e);
  }

  private async exportPdf(): Promise<void> {
    if (!this.file) return;
    const note = new Notice("PDF wird erstellt …", 0);
    try {
      const bytes = await exportNotebookPdf(this.app, this.nb, (d, t) => note.setMessage(`PDF wird erstellt … Seite ${d} von ${t}`));
      const path = availablePath(this.app, this.file.parent?.path ?? "", this.file.basename, "pdf");
      await this.app.vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      note.hide();
      new Notice(`Gespeichert: ${path}`);
    } catch (err) {
      note.hide();
      new Notice(`PDF-Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async exportPng(): Promise<void> {
    if (!this.file) return;
    const index = this.currentPageIndex();
    const blob = await this.pagePng(index, 1600);
    const path = availablePath(this.app, this.file.parent?.path ?? "", `${this.file.basename} – Seite ${index + 1}`, "png");
    await this.app.vault.createBinary(path, await blob.arrayBuffer());
    new Notice(`Gespeichert: ${path}`);
  }
}

/** Pointer capture keeps moves coming to the page; some web views reject it, which is harmless. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // ignore
  }
}

/** Platform default for pen-only drawing: tablets/phones yes, desktop (mouse) no. */
export function defaultPenOnly(): boolean {
  return Platform.isMobile;
}

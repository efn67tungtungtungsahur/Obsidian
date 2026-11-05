/**
 * Data model of a handwriting notebook (`.notizbuch` file, JSON).
 *
 * Coordinates are page units: every page is PAGE_WIDTH units wide; its height depends on the
 * paper format (A4 portrait by default, or the aspect ratio of an imported PDF page).
 */

export const NOTEBOOK_EXTENSION = "notizbuch";
export const PAGE_WIDTH = 1000;
export const A4_HEIGHT = Math.round(PAGE_WIDTH * Math.SQRT2); // 1414

export type Template = "blank" | "lined" | "grid" | "dots" | "cornell";
export type PaperColor = "white" | "cream" | "dark";
export type ToolKind = "pen" | "highlighter";

/** A freehand or shape stroke. `p` holds flat triples x,y,pressure (pressure 0..1). */
export interface Stroke {
  type: "stroke";
  tool: ToolKind;
  color: string;
  width: number;
  p: number[];
  /** Drawn as a plain polyline with uniform width (shapes, highlighter). */
  plain?: boolean;
}

export interface TextBox {
  type: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
}

export interface ImageBox {
  type: "image";
  /** Vault path of the image file. */
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Element = Stroke | TextBox | ImageBox;

export interface PdfBackground {
  /** Vault path of the PDF. */
  pdf: string;
  /** 1-based page number. */
  page: number;
}

export interface Page {
  id: string;
  template: Template;
  /** Height in page units (width is always PAGE_WIDTH). */
  h: number;
  bg?: PdfBackground;
  elements: Element[];
  /** Text of the page as transcribed by Claude. */
  transcript?: string;
}

export interface Notebook {
  version: 1;
  cover: string;
  paper: PaperColor;
  pages: Page[];
  created: number;
  updated: number;
}

export const COVER_COLORS = ["#3d6db5", "#c0504d", "#4f8f5b", "#8064a2", "#d48a2c", "#2f3b4c", "#b65c88", "#3a8e9c"];

export const PEN_COLORS = ["#1f1f1f", "#1f4e9c", "#c62828", "#2e7d32", "#6a1b9a", "#ef6c00", "#00838f", "#ffffff"];
export const HIGHLIGHTER_COLORS = ["#ffe74c", "#a5e887", "#ffb3d1", "#8fd3ff", "#ffc27a"];
export const PEN_WIDTHS = [1.6, 2.8, 4.5, 7];

export const COLOR_NAMES: Record<string, string> = {
  "#1f1f1f": "Schwarz",
  "#1f4e9c": "Dunkelblau",
  "#c62828": "Rot",
  "#2e7d32": "Grün",
  "#6a1b9a": "Lila",
  "#ef6c00": "Orange",
  "#00838f": "Türkis",
  "#ffffff": "Weiß",
  "#ffe74c": "Gelb",
  "#a5e887": "Hellgrün",
  "#ffb3d1": "Rosa",
  "#8fd3ff": "Hellblau",
  "#ffc27a": "Apricot",
};
export const HIGHLIGHTER_WIDTHS = [14, 22, 32];

export const TEMPLATE_LABELS: Record<Template, string> = {
  blank: "Leer",
  lined: "Liniert",
  grid: "Kariert",
  dots: "Punktraster",
  cornell: "Cornell",
};

export const PAPER_LABELS: Record<PaperColor, string> = {
  white: "Weiß",
  cream: "Creme",
  dark: "Dunkel",
};

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newPage(template: Template = "lined", h = A4_HEIGHT): Page {
  return { id: newId(), template, h, elements: [] };
}

export function newNotebook(opts: { template?: Template; cover?: string; paper?: PaperColor } = {}): Notebook {
  const now = Date.now();
  return {
    version: 1,
    cover: opts.cover ?? COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
    paper: opts.paper ?? "white",
    pages: [newPage(opts.template ?? "lined")],
    created: now,
    updated: now,
  };
}

/** Parses a `.notizbuch` file; tolerates missing fields so older or hand-edited files still open. */
export function parseNotebook(data: string): Notebook {
  if (!data.trim()) return newNotebook();
  const raw = JSON.parse(data) as Partial<Notebook>;
  const pages = Array.isArray(raw.pages) && raw.pages.length ? raw.pages : [newPage()];
  return {
    version: 1,
    cover: typeof raw.cover === "string" ? raw.cover : COVER_COLORS[0],
    paper: raw.paper === "cream" || raw.paper === "dark" ? raw.paper : "white",
    pages: pages.map((p) => ({
      id: typeof p.id === "string" ? p.id : newId(),
      template: (["blank", "lined", "grid", "dots", "cornell"] as const).includes(p.template as Template) ? p.template : "lined",
      h: typeof p.h === "number" && p.h > 100 ? p.h : A4_HEIGHT,
      bg: p.bg && typeof p.bg.pdf === "string" && typeof p.bg.page === "number" ? p.bg : undefined,
      elements: Array.isArray(p.elements) ? p.elements.filter(isElement) : [],
      transcript: typeof p.transcript === "string" ? p.transcript : undefined,
    })),
    created: typeof raw.created === "number" ? raw.created : Date.now(),
    updated: typeof raw.updated === "number" ? raw.updated : Date.now(),
  };
}

function isElement(e: unknown): e is Element {
  if (!e || typeof e !== "object") return false;
  const t = (e as { type?: unknown }).type;
  if (t === "stroke") return Array.isArray((e as Stroke).p);
  if (t === "text") return typeof (e as TextBox).text === "string";
  if (t === "image") return typeof (e as ImageBox).path === "string";
  return false;
}

/** Compact JSON: coordinates rounded to 0.1 units, pressure to 0.01. */
export function serializeNotebook(nb: Notebook): string {
  return JSON.stringify(nb, (key, value) => {
    if (key === "p" && Array.isArray(value)) {
      return value.map((v: number, i: number) => (i % 3 === 2 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10));
    }
    return value;
  });
}

export function cloneElements(elements: Element[]): Element[] {
  return JSON.parse(JSON.stringify(elements)) as Element[];
}

/** Bounding box of an element in page units. */
export function elementBounds(e: Element): { x: number; y: number; w: number; h: number } {
  if (e.type === "stroke") {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < e.p.length; i += 3) {
      minX = Math.min(minX, e.p[i]);
      maxX = Math.max(maxX, e.p[i]);
      minY = Math.min(minY, e.p[i + 1]);
      maxY = Math.max(maxY, e.p[i + 1]);
    }
    const pad = e.width / 2;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
  }
  if (e.type === "text") {
    const lines = e.text.split("\n");
    const longest = Math.max(...lines.map((l) => l.length));
    return { x: e.x, y: e.y, w: Math.max(20, longest * e.size * 0.55), h: lines.length * e.size * 1.3 };
  }
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

export function translateElement(e: Element, dx: number, dy: number): void {
  if (e.type === "stroke") {
    for (let i = 0; i < e.p.length; i += 3) {
      e.p[i] += dx;
      e.p[i + 1] += dy;
    }
  } else {
    e.x += dx;
    e.y += dy;
  }
}

// ---------- geometry ----------

export function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/** True if the circle (x, y, r) touches the element. */
export function hitsElement(e: Element, x: number, y: number, r: number): boolean {
  if (e.type === "stroke") {
    const rr = (r + e.width / 2) ** 2;
    const p = e.p;
    if (p.length === 3) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= rr;
    for (let i = 3; i < p.length; i += 3) {
      if (distToSegmentSq(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= rr) return true;
    }
    return false;
  }
  const b = elementBounds(e);
  return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i];
    const yi = poly[i + 1];
    const xj = poly[j];
    const yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Lasso selection: strokes with at least half their points inside, boxes with their centre inside. */
export function insideLasso(e: Element, poly: number[]): boolean {
  if (poly.length < 6) return false;
  if (e.type === "stroke") {
    let inside = 0;
    const n = e.p.length / 3;
    for (let i = 0; i < e.p.length; i += 3) if (pointInPolygon(e.p[i], e.p[i + 1], poly)) inside++;
    return inside >= Math.max(1, n / 2);
  }
  const b = elementBounds(e);
  return pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, poly);
}

/** Points (flat x,y,pressure) for a shape dragged from (x0, y0) to (x1, y1). */
export function shapePoints(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  const add = (x: number, y: number) => out.push(x, y, 0.5);
  if (kind === "line" || kind === "arrow") {
    add(x0, y0);
    add(x1, y1);
    if (kind === "arrow") {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const len = Math.min(40, Math.hypot(x1 - x0, y1 - y0) * 0.35);
      add(x1 - len * Math.cos(ang - 0.45), y1 - len * Math.sin(ang - 0.45));
      add(x1, y1);
      add(x1 - len * Math.cos(ang + 0.45), y1 - len * Math.sin(ang + 0.45));
    }
  } else if (kind === "rect") {
    add(x0, y0);
    add(x1, y0);
    add(x1, y1);
    add(x0, y1);
    add(x0, y0);
  } else {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      add(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    }
  }
  return out;
}

export type ShapeKind = "line" | "arrow" | "rect" | "ellipse";

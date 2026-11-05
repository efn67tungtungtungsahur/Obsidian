import { getStroke } from "perfect-freehand";
import { App, TFile, loadPdfJs } from "obsidian";
import { Element, ImageBox, Page, PaperColor, PdfBackground, Stroke, PAGE_WIDTH } from "./model";

export const PAPER_FILL: Record<PaperColor, string> = { white: "#ffffff", cream: "#fbf6e6", dark: "#2b2d31" };

// ---------- strokes ----------

const pathCache = new WeakMap<Stroke, Path2D>();

function hasRealPressure(p: number[]): boolean {
  let min = 1;
  let max = 0;
  for (let i = 2; i < p.length; i += 3) {
    min = Math.min(min, p[i]);
    max = Math.max(max, p[i]);
  }
  return max - min > 0.02;
}

/** Outline of a stroke in page units (cached per stroke object; invalidate after mutation). */
export function strokePath(s: Stroke): Path2D {
  const cached = pathCache.get(s);
  if (cached) return cached;
  const path = new Path2D();
  const p = s.p;
  if (s.plain) {
    path.moveTo(p[0], p[1]);
    for (let i = 3; i < p.length; i += 3) path.lineTo(p[i], p[i + 1]);
    if (p.length === 3) path.lineTo(p[0] + 0.01, p[1]);
  } else {
    const pts: number[][] = [];
    for (let i = 0; i < p.length; i += 3) pts.push([p[i], p[i + 1], p[i + 2]]);
    const outline = getStroke(pts, {
      size: s.width * 1.6,
      thinning: 0.55,
      smoothing: 0.55,
      streamline: 0.35,
      simulatePressure: !hasRealPressure(p),
      last: true,
    });
    if (outline.length) {
      path.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) {
        const [x0, y0] = outline[i - 1];
        const [x1, y1] = outline[i];
        path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      }
      path.closePath();
    }
  }
  pathCache.set(s, path);
  return path;
}

export function invalidateStroke(s: Stroke): void {
  pathCache.delete(s);
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, paper: PaperColor): void {
  const path = strokePath(s);
  ctx.save();
  if (s.tool === "highlighter") {
    ctx.globalAlpha = 0.42;
    ctx.globalCompositeOperation = paper === "dark" ? "source-over" : "multiply";
  }
  if (s.plain) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = s.tool === "highlighter" ? "square" : "round";
    ctx.lineJoin = "round";
    ctx.stroke(path);
  } else {
    ctx.fillStyle = s.color;
    ctx.fill(path);
  }
  ctx.restore();
}

// ---------- paper ----------

export function drawPaper(ctx: CanvasRenderingContext2D, page: Page, paper: PaperColor): void {
  const W = PAGE_WIDTH;
  const H = page.h;
  ctx.fillStyle = page.bg ? "#ffffff" : PAPER_FILL[paper];
  ctx.fillRect(0, 0, W, H);
  if (page.bg) return;

  const line = paper === "dark" ? "rgba(255,255,255,0.13)" : "rgba(70,110,170,0.24)";
  const accent = paper === "dark" ? "rgba(255,130,130,0.35)" : "rgba(214,80,80,0.42)";
  const step = 36;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = line;
  ctx.fillStyle = line;

  const hLines = (from: number, to: number, x0 = 0) => {
    ctx.beginPath();
    for (let y = from; y < to; y += step) {
      ctx.moveTo(x0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  };

  switch (page.template) {
    case "lined":
      hLines(140, H - 30);
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.moveTo(110, 0);
      ctx.lineTo(110, H);
      ctx.stroke();
      break;
    case "grid":
      ctx.beginPath();
      for (let x = step; x < W; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = step; y < H; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      break;
    case "dots":
      for (let y = step; y < H; y += step) {
        for (let x = step; x < W; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "cornell": {
      const summary = H - 270;
      hLines(176, summary - 10, 0);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 140);
      ctx.lineTo(W, 140);
      ctx.moveTo(300, 140);
      ctx.lineTo(300, summary);
      ctx.moveTo(0, summary);
      ctx.lineTo(W, summary);
      ctx.stroke();
      break;
    }
    case "blank":
      break;
  }
}

// ---------- assets (images, PDF pages) ----------

const imageCache = new Map<string, HTMLImageElement>();

function getImage(app: App, path: string, onLoad: () => void): HTMLImageElement | null {
  let img = imageCache.get(path);
  if (!img) {
    const file = app.vault.getFileByPath(path);
    if (!file) return null;
    img = new Image();
    img.src = app.vault.getResourcePath(file);
    imageCache.set(path, img);
  }
  if (img.complete && img.naturalWidth) return img;
  img.addEventListener("load", onLoad, { once: true });
  return null;
}

async function loadImage(app: App, path: string): Promise<HTMLImageElement | null> {
  const img = getImage(app, path, () => undefined);
  if (img) return img;
  const pending = imageCache.get(path);
  if (!pending) return null;
  await new Promise<void>((resolve) => {
    pending.addEventListener("load", () => resolve(), { once: true });
    pending.addEventListener("error", () => resolve(), { once: true });
  });
  return pending.naturalWidth ? pending : null;
}

// pdf.js objects are untyped in Obsidian's API.
/* eslint-disable @typescript-eslint/no-explicit-any */
const pdfDocs = new Map<string, Promise<any>>();

export function getPdfDocument(app: App, path: string): Promise<any> {
  let doc = pdfDocs.get(path);
  if (!doc) {
    doc = (async () => {
      const file = app.vault.getFileByPath(path);
      if (!(file instanceof TFile)) throw new Error(`PDF nicht gefunden: ${path}`);
      const pdfjs = await loadPdfJs();
      const data = new Uint8Array(await app.vault.readBinary(file));
      return pdfjs.getDocument({ data }).promise;
    })();
    doc.catch(() => pdfDocs.delete(path));
    pdfDocs.set(path, doc);
  }
  return doc;
}

/** Forget a cached PDF (e.g. after the file was replaced by a newer export). */
export function forgetPdf(path: string): void {
  pdfDocs.delete(path);
  for (const key of [...bgCache.keys()]) if (key.startsWith(path + "#")) bgCache.delete(key);
}

/** Aspect ratios (height / width) of all pages of a PDF. */
export async function pdfPageRatios(app: App, path: string): Promise<number[]> {
  const doc = await getPdfDocument(app, path);
  const ratios: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    ratios.push(vp.height / vp.width);
  }
  return ratios;
}

const bgCache = new Map<string, { width: number; canvas: HTMLCanvasElement }>();
const bgPending = new Map<string, Promise<HTMLCanvasElement>>();
const BG_CACHE_LIMIT = 16;

export async function renderPdfBackground(app: App, bg: PdfBackground, pixelWidth: number): Promise<HTMLCanvasElement> {
  const key = `${bg.pdf}#${bg.page}`;
  const hit = bgCache.get(key);
  if (hit && hit.width >= pixelWidth * 0.9) return hit.canvas;
  const pendingKey = `${key}@${Math.round(pixelWidth)}`;
  const pending = bgPending.get(pendingKey);
  if (pending) return pending;

  const job = (async () => {
    const doc = await getPdfDocument(app, bg.pdf);
    const page = await doc.getPage(bg.page);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pixelWidth / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar");
    await page.render({ canvasContext: ctx, viewport }).promise;
    bgCache.delete(key);
    bgCache.set(key, { width: pixelWidth, canvas });
    while (bgCache.size > BG_CACHE_LIMIT) bgCache.delete(bgCache.keys().next().value as string);
    return canvas;
  })();
  bgPending.set(pendingKey, job);
  try {
    return await job;
  } finally {
    bgPending.delete(pendingKey);
  }
}

/** Cached PDF background if ready; otherwise starts rendering and calls onReady when done. */
function pdfBackgroundSync(app: App, bg: PdfBackground, pixelWidth: number, onReady: () => void): HTMLCanvasElement | null {
  const hit = bgCache.get(`${bg.pdf}#${bg.page}`);
  if (hit && hit.width >= pixelWidth * 0.9) return hit.canvas;
  renderPdfBackground(app, bg, pixelWidth).then(onReady, () => undefined);
  return hit?.canvas ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- page ----------

export interface DrawEnv {
  app: App;
  paper: PaperColor;
  /** Device pixels per page unit. */
  scale: number;
  /** Called when an asset finished loading and the page should be redrawn. */
  redraw: () => void;
}

/** Paper (template or PDF page) into a context whose transform is page units → pixels. */
export function drawBackground(ctx: CanvasRenderingContext2D, page: Page, env: DrawEnv): void {
  drawPaper(ctx, page, env.paper);
  if (page.bg) {
    const canvas = pdfBackgroundSync(env.app, page.bg, PAGE_WIDTH * env.scale, env.redraw);
    if (canvas) ctx.drawImage(canvas, 0, 0, PAGE_WIDTH, page.h);
  }
}

export function drawElements(ctx: CanvasRenderingContext2D, elements: Element[], env: DrawEnv, hidden?: Set<Element>): void {
  // Highlighter strokes go underneath the ink, like a real highlighter on paper.
  for (const e of elements) if (e.type === "stroke" && e.tool === "highlighter" && !hidden?.has(e)) drawStroke(ctx, e, env.paper);
  for (const e of elements) {
    if (hidden?.has(e)) continue;
    if (e.type === "stroke") {
      if (e.tool !== "highlighter") drawStroke(ctx, e, env.paper);
    } else if (e.type === "text") {
      drawText(ctx, e.text, e.x, e.y, e.size, e.color);
    } else {
      drawImage(ctx, e, env);
    }
  }
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${size}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "top";
  text.split("\n").forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.3));
  ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, e: ImageBox, env: DrawEnv): void {
  const img = getImage(env.app, e.path, env.redraw);
  if (img) {
    ctx.drawImage(img, e.x, e.y, e.w, e.h);
  } else {
    ctx.save();
    ctx.strokeStyle = "rgba(128,128,128,0.6)";
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(e.x, e.y, e.w, e.h);
    ctx.restore();
  }
}

/**
 * Renders a whole page (paper + content) into a new canvas, waiting for PDF backgrounds and
 * images. Used for export, thumbnails and sending pages to Claude.
 */
export async function renderPageImage(app: App, page: Page, paper: PaperColor, pixelWidth: number): Promise<HTMLCanvasElement> {
  const scale = pixelWidth / PAGE_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pixelWidth);
  canvas.height = Math.round(page.h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  if (page.bg) await renderPdfBackground(app, page.bg, pixelWidth).catch(() => undefined);
  await Promise.all(page.elements.filter((e): e is ImageBox => e.type === "image").map((e) => loadImage(app, e.path)));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const env: DrawEnv = { app, paper, scale, redraw: () => undefined };
  drawBackground(ctx, page, env);
  drawElements(ctx, page.elements, env);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht erzeugt werden"))), type, quality),
  );
}

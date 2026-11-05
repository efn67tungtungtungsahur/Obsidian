import { App, TFile } from "obsidian";
import { parseNotebook } from "../notebook/model";
import { getPdfDocument, renderPageImage } from "../notebook/render";

/** Thumbnail data URLs for library cards, generated lazily (two at a time) and cached in memory. */

const cache = new Map<string, string>();
const queue: (() => Promise<void>)[] = [];
let running = 0;
const MAX_PARALLEL = 2;
const THUMB_WIDTH = 300;

function key(file: TFile): string {
  return `${file.path}:${file.stat.mtime}`;
}

export function cachedThumbnail(file: TFile): string | undefined {
  return cache.get(key(file));
}

export function requestThumbnail(app: App, file: TFile, onReady: (url: string) => void): void {
  const k = key(file);
  const hit = cache.get(k);
  if (hit) {
    onReady(hit);
    return;
  }
  queue.push(async () => {
    try {
      const url = await makeThumbnail(app, file);
      if (url) {
        cache.set(k, url);
        onReady(url);
      }
    } catch {
      // No thumbnail: the card keeps its placeholder.
    }
  });
  pump();
}

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    running++;
    job().finally(() => {
      running--;
      pump();
    });
  }
}

async function makeThumbnail(app: App, file: TFile): Promise<string | null> {
  const ext = file.extension.toLowerCase();
  if (ext === "notizbuch") {
    const nb = parseNotebook(await app.vault.cachedRead(file));
    const canvas = await renderPageImage(app, nb.pages[0], nb.paper, THUMB_WIDTH);
    return canvas.toDataURL("image/jpeg", 0.8);
  }
  if (ext === "pdf") {
    const doc = await getPdfDocument(app, file.path);
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  }
  return null;
}

/** First lines of a Markdown note as plain text (frontmatter, embeds and syntax stripped). */
export async function notePreview(app: App, file: TFile, maxChars = 220): Promise<string> {
  const text = await app.vault.cachedRead(file);
  return text
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

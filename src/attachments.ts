import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { App, TFile, arrayBufferToBase64, getLinkpath } from "obsidian";

type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const IMAGE_MIME: Record<string, ImageMime> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** API limit is 5 MB per image; stay a bit below and downscale larger ones. */
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 4000;
/** Requests are limited to 32 MB in total. */
const MAX_PDF_BYTES = 24 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;

export interface CollectedAttachments {
  blocks: BetaContentBlockParam[];
  /** Human-readable names of what was attached. */
  labels: string[];
  /** Embeds that could not be used, with a reason. */
  skipped: string[];
}

export function isExcalidraw(app: App, file: TFile): boolean {
  if (file.extension === "excalidraw" || file.path.endsWith(".excalidraw.md")) return true;
  return file.extension === "md" && !!app.metadataCache.getFileCache(file)?.frontmatter?.["excalidraw-plugin"];
}

/** Files that hold handwriting/images themselves (as opposed to a note that embeds them). */
export function isVisualFile(app: App, file: TFile): boolean {
  return file.extension in IMAGE_MIME || file.extension === "pdf" || file.extension === "writing" || file.extension === "drawing" || isExcalidraw(app, file);
}

/**
 * Collects everything visual in `file` for Claude: the file itself if it is an image, PDF,
 * Excalidraw drawing or Ink file; otherwise all images/PDFs/drawings embedded in the note
 * (`![[…]]`, `![](…)`) and Ink handwriting blocks.
 */
export async function collectAttachments(app: App, file: TFile): Promise<CollectedAttachments> {
  const result: CollectedAttachments = { blocks: [], labels: [], skipped: [] };
  const { targets, skipped } = await visualTargets(app, file);
  result.skipped.push(...skipped);

  for (const target of targets) {
    if (result.blocks.length >= MAX_ATTACHMENTS) {
      result.skipped.push(`${target.name} (mehr als ${MAX_ATTACHMENTS} Anhänge)`);
      continue;
    }
    await addFile(app, target, result);
  }
  return result;
}

/** The visual files of `file`: the file itself if it is one, else its embeds and Ink blocks. */
async function visualTargets(app: App, file: TFile): Promise<{ targets: TFile[]; skipped: string[] }> {
  const skipped: string[] = [];
  if (isVisualFile(app, file)) return { targets: [file], skipped };
  if (file.extension !== "md") return { targets: [], skipped };

  const targets: TFile[] = [];
  const seen = new Set<string>();
  const push = (f: TFile | null) => {
    if (f && !seen.has(f.path)) {
      seen.add(f.path);
      targets.push(f);
    }
  };

  for (const embed of app.metadataCache.getFileCache(file)?.embeds ?? []) {
    push(app.metadataCache.getFirstLinkpathDest(getLinkpath(embed.link), file.path));
  }
  // The Ink plugin embeds handwriting as ```handwritten-ink / ```handdrawn-ink JSON code blocks.
  const text = await app.vault.cachedRead(file);
  for (const m of text.matchAll(/```(?:handwritten|handdrawn)-ink\s*\n([\s\S]*?)```/g)) {
    try {
      const data = JSON.parse(m[1]) as { filepath?: unknown };
      if (typeof data.filepath === "string") push(app.vault.getFileByPath(data.filepath));
    } catch {
      skipped.push("Ink-Block mit ungültigem Inhalt");
    }
  }
  return { targets: targets.filter((t) => isVisualFile(app, t)), skipped };
}

export interface ManualAttachments {
  /** Vault paths of files the user can attach in the Claude app as they are. */
  paths: string[];
  /** Visual content that cannot be attached directly, with what to do instead. */
  hints: string[];
}

/**
 * For use without the API: which files of `file` the user should attach by hand in the
 * Claude app. Excalidraw drawings map to their auto-exported PNG; Ink files have no
 * attachable image file.
 */
export async function listManualAttachments(app: App, file: TFile): Promise<ManualAttachments> {
  const { targets, skipped } = await visualTargets(app, file);
  const out: ManualAttachments = { paths: [], hints: [...skipped] };
  for (const t of targets) {
    const ext = t.extension.toLowerCase();
    if (ext in IMAGE_MIME || ext === "pdf") out.paths.push(t.path);
    else if (isExcalidraw(app, t)) {
      const png = excalidrawExportFile(app, t);
      if (png) out.paths.push(png.path);
      else out.hints.push(`${t.name}: kein PNG vorhanden – in Excalidraw „Auto-export PNG“ einschalten oder einen Screenshot anhängen`);
    } else {
      out.hints.push(`${t.name} (Ink): Screenshot der Handschrift machen und anhängen`);
    }
  }
  return out;
}

async function addFile(app: App, file: TFile, out: CollectedAttachments): Promise<void> {
  try {
    const ext = file.extension.toLowerCase();
    if (ext in IMAGE_MIME) {
      const data = await app.vault.readBinary(file);
      out.blocks.push(await imageBlock(data, IMAGE_MIME[ext]));
      out.labels.push(file.name);
    } else if (ext === "pdf") {
      if (file.stat.size > MAX_PDF_BYTES) {
        out.skipped.push(`${file.name} (PDF größer als 24 MB – bitte aufteilen)`);
        return;
      }
      const data = await app.vault.readBinary(file);
      out.blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: arrayBufferToBase64(data) },
        title: file.name,
      });
      out.labels.push(file.name);
    } else if (ext === "writing" || ext === "drawing") {
      const png = await inkPreview(app, file);
      if (!png) {
        out.skipped.push(`${file.name} (keine Vorschau gespeichert – Datei in Ink einmal öffnen und bearbeiten)`);
        return;
      }
      out.blocks.push(await imageBlock(png.data, png.mime));
      out.labels.push(file.name);
    } else if (isExcalidraw(app, file)) {
      const png = await excalidrawPng(app, file);
      if (!png) {
        out.skipped.push(`${file.name} (kein PNG – in Excalidraw „Auto-export PNG“ aktivieren)`);
        return;
      }
      out.blocks.push(await imageBlock(png, "image/png"));
      out.labels.push(file.name);
    }
  } catch (err) {
    out.skipped.push(`${file.name} (${err instanceof Error ? err.message : String(err)})`);
  }
}

async function imageBlock(data: ArrayBuffer, mime: ImageMime): Promise<BetaContentBlockParam> {
  const fitted = await fitImage(data, mime);
  return { type: "image", source: { type: "base64", media_type: fitted.mime, data: arrayBufferToBase64(fitted.data) } };
}

/**
 * Downscales images above the API size limit. Transparent backgrounds (typical for pen
 * drawings) are flattened onto white so strokes stay readable after JPEG conversion.
 */
async function fitImage(data: ArrayBuffer, mime: ImageMime): Promise<{ data: ArrayBuffer; mime: ImageMime }> {
  if (data.byteLength <= MAX_IMAGE_BYTES || mime === "image/gif") return { data, mime };
  const bitmap = await createImageBitmap(new Blob([data], { type: mime }));
  let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (blob && blob.size <= MAX_IMAGE_BYTES) return { data: await blob.arrayBuffer(), mime: "image/jpeg" };
    scale *= 0.7;
  }
  throw new Error("Bild ist zu groß und ließ sich nicht verkleinern");
}

/** Ink plugin files (.writing / .drawing) are JSON and keep a PNG preview as a data URI. */
async function inkPreview(app: App, file: TFile): Promise<{ data: ArrayBuffer; mime: ImageMime } | null> {
  const json = JSON.parse(await app.vault.read(file)) as { previewUri?: unknown };
  return typeof json.previewUri === "string" ? dataUriToBuffer(json.previewUri) : null;
}

function dataUriToBuffer(uri: string): { data: ArrayBuffer; mime: ImageMime } | null {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(uri);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { data: bytes.buffer, mime: m[1] as ImageMime };
}

/**
 * PNG of an Excalidraw drawing: first the file written by Excalidraw's "Auto-export PNG"
 * setting next to the drawing, then (best effort) the Excalidraw plugin's scripting API.
 */
/** The PNG that Excalidraw's "Auto-export PNG" setting writes next to a drawing, if any. */
function excalidrawExportFile(app: App, file: TFile): TFile | null {
  const folder = file.parent && file.parent.path !== "/" ? file.parent.path + "/" : "";
  const stem = file.basename; // "Skizze.excalidraw" for "Skizze.excalidraw.md"
  const candidates = [`${stem}.png`, `${stem.replace(/\.excalidraw$/, "")}.png`, `${stem}.dark.png`, `${stem}.light.png`];
  for (const name of candidates) {
    const png = app.vault.getFileByPath(folder + name);
    if (png) return png;
  }
  return null;
}

async function excalidrawPng(app: App, file: TFile): Promise<ArrayBuffer | null> {
  const exported = excalidrawExportFile(app, file);
  if (exported) return app.vault.readBinary(exported);

  // Excalidraw exposes ExcalidrawAutomate for scripts; its API is not part of Obsidian's,
  // so everything here is guarded and failures fall back to the auto-export hint.
  type ExcalidrawAutomate = { reset?: () => void; createPNG?: (templatePath?: string, scale?: number) => Promise<Blob> };
  const w = globalThis as unknown as { ExcalidrawAutomate?: ExcalidrawAutomate };
  const plugins = (app as unknown as { plugins?: { plugins?: Record<string, { ea?: ExcalidrawAutomate }> } }).plugins?.plugins;
  const ea = plugins?.["obsidian-excalidraw-plugin"]?.ea ?? w.ExcalidrawAutomate;
  if (!ea?.createPNG) return null;
  try {
    ea.reset?.();
    const blob = await ea.createPNG(file.path, 2);
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

import { unzipSync } from "fflate";
import { App, Notice, TAbstractFile, TFile, normalizePath } from "obsidian";
import { forgetPdf } from "./notebook/render";
import { ensureFolder } from "./ui";

/**
 * Connects GoodNotes with the vault. GoodNotes has no open folder format, but it exports
 * notebooks as PDF and whole folders as a ZIP of PDFs (folder structure preserved). This module
 * imports such exports into the GoodNotes folder of the vault, keeps one companion note per PDF
 * (for text, links, tags and transcripts) and notices when a PDF is exported again.
 */

export interface GoodNotesSettings {
  goodnotesFolder: string;
  goodnotesCompanions: boolean;
  goodnotesAutoImportZip: boolean;
}

export interface ImportStats {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

const ARCHIVE = "_Import-Archiv";

export function inFolder(path: string, folder: string): boolean {
  const f = normalizePath(folder);
  return path === f || path.startsWith(f + "/");
}

/** Which ZIP entries are imported: PDFs (and images), no macOS/system leftovers. */
export function wantedZipEntry(name: string): boolean {
  if (name.endsWith("/")) return false;
  const parts = name.split("/");
  if (parts.some((p) => p === "__MACOSX" || p.startsWith("."))) return false;
  return /\.(pdf|png|jpe?g)$/i.test(name);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function writeIfChanged(app: App, path: string, data: Uint8Array): Promise<"added" | "updated" | "unchanged"> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const existing = app.vault.getFileByPath(path);
  if (existing) {
    if (existing.stat.size === data.length && sameBytes(new Uint8Array(await app.vault.readBinary(existing)), data)) return "unchanged";
    await app.vault.modifyBinary(existing, buffer);
    return "updated";
  }
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (parent) await ensureFolder(app, parent);
  await app.vault.createBinary(path, buffer);
  return "added";
}

/** Extracts a GoodNotes ZIP export into `root`, keeping the folder structure. */
export async function importZip(app: App, bytes: Uint8Array, root: string): Promise<ImportStats> {
  const stats: ImportStats = { added: 0, updated: 0, unchanged: 0, skipped: 0 };
  const entries = unzipSync(bytes, { filter: (f) => wantedZipEntry(f.name) });
  for (const [name, data] of Object.entries(entries)) {
    const clean = name
      .split("/")
      .map((p) => p.replace(/[\\:*?"<>|#^[\]]/g, " ").trim())
      .filter(Boolean)
      .join("/");
    if (!clean) {
      stats.skipped++;
      continue;
    }
    stats[await writeIfChanged(app, normalizePath(`${root}/${clean}`), data)]++;
  }
  return stats;
}

/** Imports a file picked on the device: a ZIP (whole GoodNotes folder) or a single PDF. */
export async function importGoodNotesFile(app: App, file: File, root: string): Promise<ImportStats> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return importZip(app, bytes, root);
  if (/\.pdf$/i.test(file.name)) {
    const stats: ImportStats = { added: 0, updated: 0, unchanged: 0, skipped: 0 };
    await ensureFolder(app, root);
    stats[await writeIfChanged(app, normalizePath(`${root}/${file.name}`), bytes)]++;
    return stats;
  }
  throw new Error("Bitte eine PDF- oder ZIP-Datei aus GoodNotes wählen.");
}

export function describeStats(s: ImportStats): string {
  const parts = [];
  if (s.added) parts.push(`${s.added} neu`);
  if (s.updated) parts.push(`${s.updated} aktualisiert`);
  if (s.unchanged) parts.push(`${s.unchanged} unverändert`);
  if (s.skipped) parts.push(`${s.skipped} übersprungen`);
  return parts.join(", ") || "keine PDFs gefunden";
}

export function companionPath(pdf: TFile): string {
  return pdf.path.replace(/\.pdf$/i, ".md");
}

export function companionContent(pdf: TFile): string {
  const now = window.moment().format("YYYY-MM-DDTHH:mm");
  return [
    "---",
    "goodnotes: true",
    `quelle: "[[${pdf.path}]]"`,
    `importiert: ${now}`,
    `aktualisiert: ${now}`,
    "tags: [goodnotes]",
    "---",
    "",
    `![[${pdf.path}]]`,
    "",
    "## Notizen",
    "",
    "",
    "## Transkription",
    "",
    "*Noch keine. In der Bibliothek bei der PDF „⋯ → Mit Claude in Text umwandeln“ wählen.*",
    "",
  ].join("\n");
}

/**
 * Keeps the GoodNotes folder tidy: companion notes for PDFs, auto-import of ZIP exports that
 * are saved straight into the folder, and change detection for re-exported PDFs.
 */
export class GoodNotesConnector {
  private busy = new Set<string>();

  constructor(private app: App, private settings: () => GoodNotesSettings) {}

  root(): string {
    return normalizePath(this.settings().goodnotesFolder || "GoodNotes");
  }

  isCompanionNote(file: TFile): boolean {
    if (file.extension !== "md" || !inFolder(file.path, this.root())) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.goodnotes === true && !!this.app.vault.getFileByPath(file.path.replace(/\.md$/, ".pdf"));
  }

  companionNote(pdf: TFile): TFile | null {
    return this.app.vault.getFileByPath(companionPath(pdf));
  }

  /** Called once after the layout is ready: companion notes for PDFs that have none yet. */
  async scan(): Promise<void> {
    if (!this.settings().goodnotesCompanions) return;
    for (const f of this.app.vault.getFiles()) {
      if (f.extension.toLowerCase() === "pdf" && inFolder(f.path, this.root()) && !this.companionNote(f) && !inFolder(f.path, `${this.root()}/${ARCHIVE}`)) {
        await this.ensureCompanion(f, false);
      }
    }
  }

  async onCreate(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || !inFolder(file.path, this.root()) || inFolder(file.path, `${this.root()}/${ARCHIVE}`)) return;
    const ext = file.extension.toLowerCase();
    if (ext === "pdf" && this.settings().goodnotesCompanions) await this.ensureCompanion(file, false);
    if (ext === "zip" && this.settings().goodnotesAutoImportZip) await this.importZipFile(file);
  }

  async onModify(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "pdf" || !inFolder(file.path, this.root())) return;
    forgetPdf(file.path);
    if (this.settings().goodnotesCompanions) await this.ensureCompanion(file, true);
  }

  private async ensureCompanion(pdf: TFile, updated: boolean): Promise<void> {
    const path = companionPath(pdf);
    if (this.busy.has(path)) return;
    this.busy.add(path);
    try {
      const existing = this.app.vault.getFileByPath(path);
      if (!existing) {
        await this.app.vault.create(path, companionContent(pdf));
      } else if (updated) {
        await this.app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => {
          fm.aktualisiert = window.moment().format("YYYY-MM-DDTHH:mm");
          fm["transkription-veraltet"] = true;
        });
      }
    } catch {
      // Another process created it in the meantime, or the vault is read-only: nothing to do.
    } finally {
      this.busy.delete(path);
    }
  }

  /** A ZIP saved into the GoodNotes folder is unpacked there and then archived. */
  async importZipFile(zip: TFile): Promise<void> {
    if (this.busy.has(zip.path)) return;
    this.busy.add(zip.path);
    const note = new Notice(`GoodNotes-Export „${zip.name}“ wird importiert …`, 0);
    try {
      const parent = zip.parent && zip.parent.path !== "/" ? zip.parent.path : this.root();
      const stats = await importZip(this.app, new Uint8Array(await this.app.vault.readBinary(zip)), parent);
      const archive = normalizePath(`${this.root()}/${ARCHIVE}`);
      await ensureFolder(this.app, archive);
      let target = normalizePath(`${archive}/${zip.name}`);
      for (let i = 2; this.app.vault.getAbstractFileByPath(target); i++) target = normalizePath(`${archive}/${zip.basename} ${i}.zip`);
      await this.app.fileManager.renameFile(zip, target);
      note.hide();
      new Notice(`GoodNotes importiert: ${describeStats(stats)}.`, 8000);
    } catch (err) {
      note.hide();
      new Notice(`Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, 10000);
    } finally {
      this.busy.delete(zip.path);
    }
  }
}

/** Puts `text` right below `heading` (replacing a placeholder line in italics), or appends it. */
export function insertUnderHeading(data: string, heading: string, text: string): string {
  const idx = data.indexOf(heading);
  if (idx < 0) return data.replace(/\s*$/, "") + `\n\n${heading}\n\n${text.trim()}\n`;
  const after = idx + heading.length;
  const rest = data.slice(after).replace(/^\s*\*Noch keine\.[^\n]*\n?/, "\n");
  return data.slice(0, after) + "\n\n" + text.trim() + "\n" + rest.replace(/^\n+/, "\n");
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { TFile } from "obsidian";
import {
  A4_HEIGHT, PAGE_WIDTH, hitsElement, insideLasso, newNotebook, parseNotebook, serializeNotebook, shapePoints, elementBounds, translateElement, Stroke,
} from "../src/notebook/model";
import { buildImagePdf } from "../src/notebook/pdf";
import { importZip, wantedZipEntry, companionContent, insertUnderHeading, describeStats } from "../src/goodnotes";
import { splitByPage, transcriptNoteContent } from "../src/notebookClaude";
import { runAgentTool, AgentContext, PendingChange, AppliedChange } from "../src/agentTools";

(globalThis as any).window = globalThis;
(globalThis as any).moment = () => ({ format: () => "2026-11-05T12:00" });

// ---------- in-memory vault ----------
class MemVault {
  files = new Map<string, TFile & { data: Uint8Array | string }>();
  folders = new Set<string>([""]);
  add(path: string, data: Uint8Array | string) {
    const f = Object.assign(new TFile(path), { data });
    f.stat = { mtime: Date.now(), size: typeof data === "string" ? data.length : data.length };
    this.files.set(path, f as any);
    return f;
  }
  getFileByPath = (p: string) => this.files.get(p) ?? null;
  getAbstractFileByPath = (p: string) => this.files.get(p) ?? (this.folders.has(p) ? { path: p } : null);
  createFolder = async (p: string) => { this.folders.add(p); };
  createBinary = async (p: string, d: ArrayBuffer) => this.add(p, new Uint8Array(d));
  modifyBinary = async (f: any, d: ArrayBuffer) => { f.data = new Uint8Array(d); f.stat.size = f.data.length; };
  readBinary = async (f: any) => (f.data as Uint8Array).slice().buffer;
  read = async (f: any) => f.data as string;
  create = async (p: string, d: string) => { if (this.files.has(p)) throw new Error("exists"); return this.add(p, d); };
  modify = async (f: any, d: string) => { f.data = d; };
  process = async (f: any, fn: (d: string) => string) => { f.data = fn(f.data); return f.data; };
  getRoot = () => ({ children: [] });
  getFolderByPath = () => null;
}

async function main() {
  // ---------- model ----------
  const nb = newNotebook({ template: "grid" });
  assert.equal(nb.pages.length, 1);
  assert.equal(nb.pages[0].h, A4_HEIGHT);
  const stroke: Stroke = { type: "stroke", tool: "pen", color: "#000", width: 3, p: [100.123456, 200.98765, 0.512345, 300, 200, 0.7] };
  nb.pages[0].elements.push(stroke, { type: "text", x: 10, y: 10, text: "Hallo\nWelt", size: 30, color: "#111" });
  const json = serializeNotebook(nb);
  assert.match(json, /\[100\.1,201,0\.51,300,200,0\.7\]/, "coordinates rounded to 0.1, pressure to 0.01");
  const back = parseNotebook(json);
  assert.equal(back.pages[0].template, "grid");
  assert.equal(back.pages[0].elements.length, 2);
  // tolerant parsing: junk elements dropped, missing fields defaulted
  const repaired = parseNotebook(JSON.stringify({ pages: [{ elements: [{ type: "bogus" }, { type: "stroke", p: [1, 2, 0.5] }], template: "weird" }] }));
  assert.equal(repaired.pages[0].elements.length, 1);
  assert.equal(repaired.pages[0].template, "lined");
  assert.equal(repaired.paper, "white");
  assert.equal(parseNotebook("").pages.length, 1, "empty file opens as new notebook");
  console.log("ok model + serialization");

  // ---------- geometry ----------
  assert.ok(hitsElement(stroke, 200, 201, 2), "eraser on the stroke");
  assert.ok(!hitsElement(stroke, 200, 260, 10), "eraser far away");
  const square = [0, 0, 400, 0, 400, 400, 0, 400];
  assert.ok(insideLasso(stroke, square));
  assert.ok(!insideLasso(stroke, [500, 500, 900, 500, 900, 900, 500, 900]));
  const b = elementBounds(stroke);
  assert.ok(b.x < 100 && b.w > 199);
  translateElement(stroke, 10, -5);
  assert.equal(Math.round(stroke.p[0]), 110);
  assert.equal(shapePoints("rect", 0, 0, 10, 20).length, 15);
  assert.equal(shapePoints("arrow", 0, 0, 100, 0).length, 15);
  const ell = shapePoints("ellipse", 0, 0, 100, 50);
  assert.ok(Math.abs(ell[0] - 100) < 1e-9 && Math.abs(ell[1] - 25) < 1e-9);
  console.log("ok geometry (eraser, lasso, shapes)");

  // ---------- PDF writer: validate with pypdf and pdfinfo ----------
  // A tiny real JPEG (1x1 px, white).
  const jpeg = Uint8Array.from(Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z",
    "base64"));
  const pdf = buildImagePdf([
    { jpeg, pxWidth: 1, pxHeight: 1, ptWidth: 595.28, ptHeight: 841.89 },
    { jpeg, pxWidth: 1, pxHeight: 1, ptWidth: 595.28, ptHeight: 420 },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "nbpdf-"));
  const pdfPath = join(dir, "test.pdf");
  writeFileSync(pdfPath, pdf);
  const info = execFileSync("python3", ["-I", "-c", "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1], strict=True); print(len(r.pages), [round(float(p.mediabox.height)) for p in r.pages], list(r.pages[0]['/Resources']['/XObject'].keys()))", pdfPath]).toString().trim();
  assert.equal(info, "2 [842, 420] ['/Im0']");
  const pdfinfo = execFileSync("pdfinfo", [pdfPath]).toString();
  assert.match(pdfinfo, /Pages:\s+2/);
  assert.doesNotMatch(execFileSync("pdfinfo", [pdfPath], { stdio: ["ignore", "pipe", "pipe"] }).toString(), /Syntax Error/i);
  console.log("ok PDF export structure (pypdf strict + pdfinfo)");

  // ---------- GoodNotes ZIP import ----------
  assert.ok(wantedZipEntry("Uni/Bio/Zelle.pdf"));
  assert.ok(!wantedZipEntry("__MACOSX/Uni/._Zelle.pdf"));
  assert.ok(!wantedZipEntry("Uni/.DS_Store"));
  assert.ok(!wantedZipEntry("Uni/"));
  const zip = zipSync({
    "Uni/Biologie/Zelle.pdf": strToU8("%PDF-zelle-v1"),
    "Uni/Mathe/Analysis: Teil 1.pdf": strToU8("%PDF-mathe"),
    "__MACOSX/Uni/._Zelle.pdf": strToU8("junk"),
    "Uni/notes.txt": strToU8("ignored"),
  });
  const vault = new MemVault();
  const app = { vault, metadataCache: { getFirstLinkpathDest: () => null }, fileManager: {} } as any;
  const s1 = await importZip(app, zip, "GoodNotes");
  assert.deepEqual(s1, { added: 2, updated: 0, unchanged: 0, skipped: 0 });
  assert.ok(vault.files.has("GoodNotes/Uni/Biologie/Zelle.pdf"));
  assert.ok(vault.files.has("GoodNotes/Uni/Mathe/Analysis  Teil 1.pdf"), "':' is not allowed in vault names");
  assert.ok(vault.folders.has("GoodNotes/Uni/Biologie"), "folder structure created");
  // Re-export: one notebook changed, one unchanged
  const zip2 = zipSync({ "Uni/Biologie/Zelle.pdf": strToU8("%PDF-zelle-v2!"), "Uni/Mathe/Analysis: Teil 1.pdf": strToU8("%PDF-mathe") });
  const s2 = await importZip(app, zip2, "GoodNotes");
  assert.deepEqual(s2, { added: 0, updated: 1, unchanged: 1, skipped: 0 });
  assert.equal(Buffer.from(vault.files.get("GoodNotes/Uni/Biologie/Zelle.pdf")!.data as Uint8Array).toString(), "%PDF-zelle-v2!");
  assert.equal(describeStats(s2), "1 aktualisiert, 1 unverändert");
  const companion = companionContent(new TFile("GoodNotes/Uni/Biologie/Zelle.pdf"));
  assert.match(companion, /^---\ngoodnotes: true\nquelle: "\[\[GoodNotes\/Uni\/Biologie\/Zelle\.pdf\]\]"/);
  assert.match(companion, /!\[\[GoodNotes\/Uni\/Biologie\/Zelle\.pdf\]\]/);
  const filled = insertUnderHeading(companion, "## Transkription", "# Zelle\n- Membran");
  assert.match(filled, /## Transkription\n\n# Zelle\n- Membran\n/);
  assert.doesNotMatch(filled, /Noch keine/);
  assert.match(insertUnderHeading("Text", "## Transkription", "X"), /Text\n\n## Transkription\n\nX\n$/);
  console.log("ok GoodNotes import (structure, re-export detection, companion note)");

  // ---------- transcripts ----------
  const parts = splitByPage("## Seite 1\nA\n\n## Seite 3\nC\nmehr\n## Seite 9\nZ", 3);
  assert.deepEqual([...parts.entries()], [[0, "A"], [2, "C\nmehr"]]);
  assert.deepEqual([...splitByPage("nur Text", 2).entries()], [[0, "nur Text"]]);
  const tnb = newNotebook();
  tnb.pages[0].transcript = "Erste Seite";
  tnb.pages.push({ id: "b", template: "lined", h: A4_HEIGHT, elements: [], transcript: "Zweite" });
  const tnote = transcriptNoteContent(new TFile("Uni/Bio.notizbuch"), tnb);
  assert.match(tnote, /notizbuch: "\[\[Uni\/Bio\.notizbuch\]\]"/);
  assert.match(tnote, /## Seite 1\n\nErste Seite\n\n## Seite 2\n\nZweite/);
  console.log("ok transcript note");

  // ---------- agent tools ----------
  const notes = new MemVault();
  const note = notes.add("Bio/Zelle.md", "# Zelle\n\nDie Mitochondrien sind das Kraftwerk.\n");
  const renamed: string[] = [];
  const trashed: string[] = [];
  const aApp = {
    vault: notes,
    metadataCache: { getFirstLinkpathDest: (p: string) => [...notes.files.values()].find((f) => f.path === p + ".md" || f.basename === p) ?? null },
    fileManager: {
      renameFile: async (f: any, to: string) => { renamed.push(`${f.path}->${to}`); notes.files.delete(f.path); f.path = to; notes.files.set(to, f); },
      trashFile: async (f: any) => { trashed.push(f.path); notes.files.delete(f.path); },
    },
  } as any;
  const approvals: PendingChange[] = [];
  const applied: AppliedChange[] = [];
  let answer = true;
  const ctx: AgentContext = {
    onStatus: () => {},
    approve: async (c) => { approvals.push(c); return answer; },
    onApplied: (c) => applied.push(c),
    activeFile: () => note,
    selection: () => "Kraftwerk",
  };
  const active = await runAgentTool(aApp, "get_active_note", {}, ctx);
  assert.match(active.content as string, /Path: Bio\/Zelle\.md\nSelected text:\n<selection>\nKraftwerk/);

  const edit = await runAgentTool(aApp, "edit_note", { path: "Bio/Zelle.md", old_text: "das Kraftwerk", new_text: "das „Kraftwerk der Zelle“ ($ATP$)" }, ctx);
  assert.equal(edit.is_error, undefined);
  assert.equal(note.data, "# Zelle\n\nDie Mitochondrien sind das „Kraftwerk der Zelle“ ($ATP$).\n", "replacement is literal ($ patterns not expanded)");
  assert.equal(approvals.at(-1)!.kind, "edit");
  assert.equal(approvals.at(-1)!.before, "das Kraftwerk");
  await applied.at(-1)!.undo();
  assert.equal(note.data, "# Zelle\n\nDie Mitochondrien sind das Kraftwerk.\n", "undo restores the note");

  const notFound = await runAgentTool(aApp, "edit_note", { path: "Bio/Zelle.md", old_text: "gibt es nicht", new_text: "x" }, ctx);
  assert.equal(notFound.is_error, true);
  notes.add("Bio/Doppelt.md", "a b a");
  const dup = await runAgentTool(aApp, "edit_note", { path: "Bio/Doppelt.md", old_text: "a", new_text: "x" }, ctx);
  assert.match(dup.content as string, /occurs 2 times/);

  const created = await runAgentTool(aApp, "create_note", { path: "Bio/Karteikarten", content: "Q: ?\nA: !" }, ctx);
  assert.equal(created.content, "Created Bio/Karteikarten.md.");
  assert.equal(notes.files.get("Bio/Karteikarten.md")!.data, "Q: ?\nA: !");
  const again = await runAgentTool(aApp, "create_note", { path: "Bio/Karteikarten.md", content: "x" }, ctx);
  assert.equal(again.is_error, true, "never overwrites an existing note");

  await runAgentTool(aApp, "append_to_note", { path: "Zelle", content: "## Zusammenfassung\nKurz." }, ctx);
  assert.match(note.data as string, /Kraftwerk\.\n\n## Zusammenfassung\nKurz\.\n$/);

  answer = false;
  const before = note.data;
  const declined = await runAgentTool(aApp, "append_to_note", { path: "Bio/Zelle.md", content: "nein" }, ctx);
  assert.equal(declined.is_error, true);
  assert.match(declined.content as string, /declined/);
  assert.equal(note.data, before, "declined change is not applied");
  answer = true;

  const moved = await runAgentTool(aApp, "move_note", { path: "Bio/Karteikarten.md", new_path: "Lernen/Karteikarten.md" }, ctx);
  assert.equal(moved.content, "Moved Bio/Karteikarten.md to Lernen/Karteikarten.md.");
  await applied.at(-1)!.undo();
  assert.deepEqual(renamed, ["Bio/Karteikarten.md->Lernen/Karteikarten.md", "Lernen/Karteikarten.md->Bio/Karteikarten.md"]);
  const bad = await runAgentTool(aApp, "edit_note", { path: 5 }, ctx);
  assert.equal(bad.is_error, true);
  console.log("ok agent tools (approve, decline, undo, safety checks)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

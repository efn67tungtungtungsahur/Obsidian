import { TFile, TFolder } from "obsidian";
import { LibraryView } from "../../src/library/libraryView";
import { NotebookView } from "../../src/notebook/view";
import { newNotebook, serializeNotebook, newPage, Stroke } from "../../src/notebook/model";

// ---------- sample vault ----------
const root = new TFolder("");
const all: (TFile | TFolder)[] = [];
function folder(path: string) {
  const f = new TFolder(path);
  const parent = path.includes("/") ? (all.find((x) => x.path === path.slice(0, path.lastIndexOf("/"))) as TFolder) : root;
  f.parent = parent; parent.children.push(f); all.push(f);
  return f;
}
function file(path: string, content: string, ageDays = 0) {
  const f = new TFile(path, content);
  f.stat.mtime = Date.now() - ageDays * 86400000;
  const parent = path.includes("/") ? (all.find((x) => x.path === path.slice(0, path.lastIndexOf("/"))) as TFolder) : root;
  f.parent = parent; parent.children.push(f); all.push(f);
  return f;
}

/** Pseudo-handwriting: loopy cursive-like strokes along a line, with pen pressure. */
function scribble(x0: number, y: number, width: number, seed: number, color = "#1f1f1f"): Stroke[] {
  const strokes: Stroke[] = [];
  let x = x0;
  let r = seed;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  while (x < x0 + width) {
    const wordLen = 40 + rand() * 90;
    const p: number[] = [];
    for (let t = 0; t <= wordLen; t += 2) {
      const ph = t / 7;
      const hgt = 9 + 6 * Math.sin(t / 13 + seed);
      p.push(x + t + 3 * Math.cos(ph * 2.2), y - hgt * (0.5 + 0.5 * Math.sin(ph * 2.2)) + (rand() - 0.5), 0.35 + 0.4 * Math.abs(Math.sin(ph)));
    }
    strokes.push({ type: "stroke", tool: "pen", color, width: 2.6, p });
    x += wordLen + 16 + rand() * 10;
  }
  return strokes;
}

function sampleNotebook(cover: string, template: "lined" | "grid" | "dots" | "cornell", lines: number, title?: string) {
  const nb = newNotebook({ template, cover });
  const page = nb.pages[0];
  if (title) page.elements.push({ type: "text", x: 130, y: 70, text: title, size: 46, color: "#1f4e9c" });
  if (title) page.elements.push({ type: "stroke", tool: "highlighter", color: "#ffe74c", width: 22, plain: true, p: [125, 100, 0.5, 520, 100, 0.5] });
  for (let i = 0; i < lines; i++) page.elements.push(...scribble(130, 212 + i * 36, 700 - (i % 3) * 120, i + 3, i % 5 === 4 ? "#c62828" : "#1f1f1f"));
  if (lines > 6) {
    page.elements.push({ type: "stroke", tool: "pen", color: "#2e7d32", width: 2.8, plain: true, p: [160, 760, 0.5, 420, 760, 0.5, 420, 900, 0.5, 160, 900, 0.5, 160, 760, 0.5] });
    page.elements.push({ type: "text", x: 200, y: 815, text: "Chloroplast", size: 30, color: "#2e7d32" });
    page.elements.push({ type: "stroke", tool: "pen", color: "#1f1f1f", width: 2.8, plain: true, p: [430, 830, 0.5, 600, 830, 0.5, 575, 815, 0.5, 600, 830, 0.5, 575, 845, 0.5] });
    page.elements.push(...scribble(620, 840, 260, 11));
  }
  nb.pages.push(newPage(template));
  return nb;
}

folder("Uni");
folder("Uni/Biologie");
folder("GoodNotes");
folder("GoodNotes/Semester 3");
file("Biologie – Vorlesung.notizbuch", serializeNotebook(sampleNotebook("#3d6db5", "lined", 14, "Photosynthese")), 0);
file("Mathe Übungen.notizbuch", serializeNotebook(sampleNotebook("#c0504d", "grid", 6, "Analysis")), 1);
file("Projektskizzen.notizbuch", serializeNotebook(sampleNotebook("#4f8f5b", "dots", 3)), 3);
file("Tagebuch.notizbuch", serializeNotebook(sampleNotebook("#8064a2", "lined", 9)), 6);
file("Einkaufsliste.md", "# Einkaufsliste\n- Milch\n- Brot\n- Äpfel\n- Kaffee", 2);
file("Projektideen.md", "# Projektideen\nObsidian-Plugin für Handschrift mit Claude, Lernkarten aus Mitschriften, Wochenplanung.", 4);
file("Skript Chemie.pdf", "%PDF", 8);
file("GoodNotes/Semester 3/Physik Mitschrift.pdf", "%PDF", 5);

const vault = {
  getName: () => "Notizen",
  getRoot: () => root,
  getFiles: () => all.filter((f): f is TFile => f instanceof TFile),
  getAllLoadedFiles: () => [root, ...all],
  getAbstractFileByPath: (p: string) => all.find((f) => f.path === p) ?? (p === "" || p === "/" ? root : null),
  getFolderByPath: (p: string) => (all.find((f) => f.path === p && f instanceof TFolder) as TFolder) ?? (p === "" ? root : null),
  getFileByPath: (p: string) => (all.find((f) => f.path === p && f instanceof TFile) as TFile) ?? null,
  cachedRead: async (f: TFile) => f.content,
  read: async (f: TFile) => f.content,
  getResourcePath: () => "",
  on: () => ({}),
};
const app: any = {
  vault,
  metadataCache: { getFileCache: () => ({}), getFirstLinkpathDest: () => null },
  workspace: { requestSaveLayout: () => {}, getLeaf: () => ({ openFile: async () => {} }) },
  fileManager: {},
  scope: {},
};
const host: any = {
  libraryRoot: () => "",
  goodnotesFolder: () => "GoodNotes",
  favorites: () => ["Biologie – Vorlesung.notizbuch"],
  sortMode: () => "date",
  companionNote: () => null,
  isCompanionNote: () => false,
  penOnly: () => true,
  setPenOnly: async () => {},
  openLibrary: async () => {},
  notebookClaude: async () => {},
  syncTranscriptNote: async () => {},
};

const mount = document.getElementById("app")!;
const which = new URLSearchParams(location.search).get("view") ?? "library";
const leaf: any = { app, containerEl: mount, openFile: async () => {} };
(window as any).__app = app;
if (which === "library") {
  const v = new LibraryView(leaf, host);
  (window as any).__view = v;
  void v.onOpen();
} else {
  const v = new NotebookView(leaf, host);
  (window as any).__view = v;
  void v.onOpen().then(() => {
    const f = vault.getFileByPath("Biologie – Vorlesung.notizbuch")!;
    v.file = f;
    v.setViewData(f.content, true);
    (window as any).__ready = true;
  });
}

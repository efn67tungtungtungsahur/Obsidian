import { ItemView, Menu, Notice, TAbstractFile, TFile, TFolder, ViewStateResult, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import { cachedThumbnail, notePreview, requestThumbnail } from "./thumbnails";
import { confirmDialog, pickFromList, promptText, IMAGE_EXTENSIONS, availablePath, ensureFolder } from "../ui";
import { NOTEBOOK_EXTENSION } from "../notebook/model";

export const VIEW_TYPE_LIBRARY = "claude-research-library";

type Tab = "docs" | "favorites" | "recent" | "goodnotes";

const TAB_LABELS: Record<Tab, string> = {
  docs: "Dokumente",
  favorites: "Favoriten",
  recent: "Zuletzt",
  goodnotes: "GoodNotes",
};

/** What the library needs from the plugin. */
export interface LibraryHost {
  libraryRoot(): string;
  goodnotesFolder(): string;
  favorites(): string[];
  toggleFavorite(path: string): Promise<void>;
  sortMode(): "date" | "name";
  setSortMode(mode: "date" | "name"): Promise<void>;
  openAssistant(): Promise<void>;
  createNotebook(folder: string): Promise<TFile | null>;
  pdfToNotebook(pdf: TFile): Promise<TFile | null>;
  newPdfNotebook(folder: string, source: "vault" | "device"): Promise<TFile | null>;
  importGoodNotes(): Promise<void>;
  transcribe(file: TFile): Promise<void>;
  /** The companion note of a GoodNotes PDF, if any. */
  companionNote(pdf: TFile): TFile | null;
  isCompanionNote(file: TFile): boolean;
}

interface LibraryState {
  folder?: string;
  tab?: Tab;
}

export class LibraryView extends ItemView {
  private folder = "";
  private tab: Tab = "docs";
  private query = "";
  private gridEl: HTMLElement | null = null;
  private renderTimer = 0;
  private searchEl: HTMLInputElement | null = null;

  constructor(leaf: WorkspaceLeaf, private host: LibraryHost) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LIBRARY;
  }

  getDisplayText(): string {
    return "Bibliothek";
  }

  getIcon(): string {
    return "library";
  }

  getState(): Record<string, unknown> {
    return { folder: this.folder, tab: this.tab };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const s = (state ?? {}) as LibraryState;
    if (typeof s.folder === "string") this.folder = s.folder;
    if (s.tab && s.tab in TAB_LABELS) this.tab = s.tab;
    this.render();
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    if (!this.folder) this.folder = this.host.libraryRoot();
    const refresh = () => this.scheduleRender();
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (f instanceof TFile && [NOTEBOOK_EXTENSION, "pdf"].includes(f.extension)) refresh();
    }));
    this.render();
  }

  /** Shows a folder (and the matching tab). */
  showFolder(folder: string): void {
    const gn = this.host.goodnotesFolder();
    this.tab = folder === gn || folder.startsWith(gn + "/") ? "goodnotes" : "docs";
    this.folder = folder;
    this.render();
    this.app.workspace.requestSaveLayout();
  }

  private scheduleRender(): void {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 250);
  }

  // ---------- rendering ----------

  private render(): void {
    const root = this.contentEl;
    const scroll = this.gridEl?.parentElement?.scrollTop ?? 0;
    const hadFocus = document.activeElement === this.searchEl;
    root.empty();
    root.addClass("cr-library");

    const header = root.createDiv({ cls: "cr-lib-header" });
    const top = header.createDiv({ cls: "cr-lib-top" });
    top.createEl("h1", { cls: "cr-lib-title", text: TAB_LABELS[this.tab] });
    const actions = top.createDiv({ cls: "cr-lib-actions" });

    const search = actions.createDiv({ cls: "cr-lib-search" });
    setIcon(search.createSpan({ cls: "cr-lib-search-icon" }), "search");
    this.searchEl = search.createEl("input", { type: "search", attr: { placeholder: "Suchen" } });
    this.searchEl.value = this.query;
    this.searchEl.addEventListener("input", () => {
      this.query = this.searchEl!.value;
      this.renderGrid();
    });

    const sortBtn = actions.createEl("button", { cls: "clickable-icon cr-lib-iconbtn", attr: { "aria-label": "Sortieren" } });
    setIcon(sortBtn, this.host.sortMode() === "date" ? "calendar-clock" : "arrow-down-a-z");
    sortBtn.addEventListener("click", (e) => {
      const m = new Menu();
      m.addItem((i) => i.setTitle("Nach Datum").setChecked(this.host.sortMode() === "date").onClick(() => void this.host.setSortMode("date").then(() => this.render())));
      m.addItem((i) => i.setTitle("Nach Name").setChecked(this.host.sortMode() === "name").onClick(() => void this.host.setSortMode("name").then(() => this.render())));
      m.showAtMouseEvent(e);
    });

    const claude = actions.createEl("button", { cls: "cr-lib-claude", attr: { "aria-label": "Claude-Assistent" } });
    setIcon(claude.createSpan(), "sparkles");
    claude.createSpan({ text: "Claude" });
    claude.addEventListener("click", () => void this.host.openAssistant());

    const add = actions.createEl("button", { cls: "mod-cta cr-lib-new" });
    setIcon(add.createSpan(), "plus");
    add.createSpan({ text: "Neu" });
    add.addEventListener("click", (e) => this.newMenu(e));

    const tabs = header.createDiv({ cls: "cr-lib-tabs" });
    for (const t of Object.keys(TAB_LABELS) as Tab[]) {
      const b = tabs.createEl("button", { cls: "cr-lib-tab", text: TAB_LABELS[t] });
      b.toggleClass("is-active", t === this.tab);
      b.addEventListener("click", () => {
        this.tab = t;
        this.folder = t === "goodnotes" ? this.host.goodnotesFolder() : t === "docs" ? this.host.libraryRoot() : this.folder;
        this.render();
        this.app.workspace.requestSaveLayout();
      });
    }

    const body = root.createDiv({ cls: "cr-lib-body" });
    this.gridEl = body.createDiv();
    this.renderGrid();
    body.scrollTop = scroll;
    if (hadFocus) {
      this.searchEl.focus();
      this.searchEl.setSelectionRange(this.query.length, this.query.length);
    }
  }

  private renderGrid(): void {
    const host = this.gridEl;
    if (!host) return;
    host.empty();

    if (this.query.trim()) {
      const q = this.query.trim().toLowerCase();
      const hits = this.app.vault
        .getFiles()
        .filter((f) => this.isListed(f) && f.basename.toLowerCase().includes(q))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, 200);
      host.createDiv({ cls: "cr-lib-crumbs", text: `${hits.length} Treffer für „${this.query.trim()}“` });
      this.grid(host, hits);
      return;
    }

    if (this.tab === "favorites") {
      const favs = this.host
        .favorites()
        .map((p) => this.app.vault.getAbstractFileByPath(p))
        .filter((f): f is TFile | TFolder => !!f);
      if (!favs.length) this.empty(host, "star", "Noch keine Favoriten", "Tippe bei einem Dokument auf „⋯“ → „Zu Favoriten“.");
      else this.grid(host, favs);
      return;
    }

    if (this.tab === "recent") {
      const recent = this.app.vault
        .getFiles()
        .filter((f) => this.isListed(f))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, 60);
      if (!recent.length) this.empty(host, "clock", "Noch nichts bearbeitet", "Erstelle mit „+ Neu“ dein erstes Notizbuch.");
      else this.grid(host, recent);
      return;
    }

    const base = this.tab === "goodnotes" ? this.host.goodnotesFolder() : this.host.libraryRoot();
    if (!this.folder.startsWith(base)) this.folder = base;
    const folder = this.folder ? this.app.vault.getFolderByPath(this.folder) : this.app.vault.getRoot();

    this.crumbs(host, base);
    if (!folder) {
      if (this.tab === "goodnotes") this.goodnotesIntro(host);
      else this.empty(host, "folder-x", "Ordner nicht gefunden", this.folder);
      return;
    }
    const children = folder.children.filter((c) => (c instanceof TFolder ? this.isListedFolder(c) : this.isListed(c as TFile)));
    if (!children.length) {
      if (this.tab === "goodnotes") this.goodnotesIntro(host);
      else this.empty(host, "notebook-pen", "Hier ist noch nichts", "Tippe auf „+ Neu“ für ein Notizbuch, einen Ordner oder eine Notiz.");
      return;
    }
    this.grid(host, children);
  }

  private crumbs(host: HTMLElement, base: string): void {
    const bar = host.createDiv({ cls: "cr-lib-crumbs" });
    const parts = this.folder.slice(base.length).split("/").filter(Boolean);
    const rootLabel = this.tab === "goodnotes" ? "GoodNotes" : "Dokumente";
    const link = (label: string, path: string, current: boolean) => {
      const a = bar.createEl("button", { cls: "cr-lib-crumb", text: label });
      a.toggleClass("is-current", current);
      a.addEventListener("click", () => this.showFolder(path));
    };
    link(rootLabel, base, parts.length === 0);
    let acc = base;
    parts.forEach((p, i) => {
      bar.createSpan({ cls: "cr-lib-crumb-sep", text: "›" });
      acc = acc ? `${acc}/${p}` : p;
      link(p, acc, i === parts.length - 1);
    });
  }

  private empty(host: HTMLElement, icon: string, title: string, text: string): void {
    const box = host.createDiv({ cls: "cr-lib-empty" });
    setIcon(box.createDiv({ cls: "cr-lib-empty-icon" }), icon);
    box.createEl("h3", { text: title });
    box.createEl("p", { text });
  }

  private goodnotesIntro(host: HTMLElement): void {
    const box = host.createDiv({ cls: "cr-lib-empty cr-lib-gn" });
    setIcon(box.createDiv({ cls: "cr-lib-empty-icon" }), "folder-sync");
    box.createEl("h3", { text: "GoodNotes verbinden" });
    const ol = box.createEl("ol");
    ol.createEl("li", { text: "In GoodNotes: Ordner oder Notizbuch → Teilen/Exportieren → PDF." });
    ol.createEl("li", { text: "Die PDF bzw. ZIP-Datei (ganzer Ordner) hier importieren – oder direkt in den Vault-Ordner „" + this.host.goodnotesFolder() + "“ speichern." });
    ol.createEl("li", { text: "Ordnerstruktur bleibt erhalten. Jede PDF bekommt eine Begleitnotiz für Text, Links und Tags; neu exportierte Versionen werden erkannt." });
    const b = box.createEl("button", { cls: "mod-cta", text: "GoodNotes-Export importieren" });
    b.addEventListener("click", () => void this.host.importGoodNotes());
  }

  private grid(host: HTMLElement, items: TAbstractFile[]): void {
    const grid = host.createDiv({ cls: "cr-lib-grid" });
    const sort = this.host.sortMode();
    const sorted = [...items].sort((a, b) => {
      const fa = a instanceof TFolder ? 0 : 1;
      const fb = b instanceof TFolder ? 0 : 1;
      if (fa !== fb) return fa - fb;
      if (sort === "date" && a instanceof TFile && b instanceof TFile) return b.stat.mtime - a.stat.mtime;
      return a.name.localeCompare(b.name, "de", { numeric: true });
    });
    for (const item of sorted) this.card(grid, item);
  }

  private card(grid: HTMLElement, item: TAbstractFile): void {
    const card = grid.createDiv({ cls: "cr-card", attr: { tabindex: "0" } });
    const cover = card.createDiv({ cls: "cr-card-cover" });
    const meta = card.createDiv({ cls: "cr-card-meta" });
    const titleRow = meta.createDiv({ cls: "cr-card-titlerow" });
    const title = titleRow.createDiv({ cls: "cr-card-title" });
    const more = titleRow.createEl("button", { cls: "clickable-icon cr-card-more", attr: { "aria-label": "Optionen" } });
    setIcon(more, "chevron-down");
    const sub = meta.createDiv({ cls: "cr-card-sub" });
    if (this.host.favorites().includes(item.path)) setIcon(titleRow.createSpan({ cls: "cr-card-star" }), "star");

    if (item instanceof TFolder) {
      card.addClass("is-folder");
      const shape = cover.createDiv({ cls: "cr-folder" });
      setIcon(shape.createDiv({ cls: "cr-folder-icon" }), item.path === this.host.goodnotesFolder() ? "folder-sync" : "folder");
      title.setText(item.name);
      const n = item.children.filter((c) => (c instanceof TFolder ? this.isListedFolder(c) : this.isListed(c as TFile))).length;
      sub.setText(n === 1 ? "1 Element" : `${n} Elemente`);
    } else if (item instanceof TFile) {
      title.setText(item.basename.replace(/\.excalidraw$/, ""));
      sub.setText(window.moment(item.stat.mtime).format("D. MMM YYYY"));
      this.fillCover(cover, item, sub);
    }

    const open = () => this.openItem(item);
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cr-card-more")) return;
      open();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.itemMenu(e, item);
    });
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.itemMenu(e, item);
    });
  }

  private fillCover(cover: HTMLElement, file: TFile, sub: HTMLElement): void {
    const ext = file.extension.toLowerCase();
    const thumb = (url: string, cls = "cr-card-thumb") => {
      cover.querySelector(".cr-card-thumb")?.remove();
      cover.querySelector(".cr-card-pdfph")?.remove();
      const img = cover.createEl("img", { cls, attr: { src: url, alt: "" } });
      img.draggable = false;
    };

    if (ext === NOTEBOOK_EXTENSION) {
      cover.addClass("is-notebook");
      const book = cover.createDiv({ cls: "cr-cover-notebook" });
      book.createDiv({ cls: "cr-cover-label", text: file.basename });
      void this.app.vault.cachedRead(file).then((data) => {
        try {
          const nb = JSON.parse(data) as { cover?: string; pages?: unknown[] };
          if (nb.cover) book.style.setProperty("--cover", nb.cover);
          const n = Array.isArray(nb.pages) ? nb.pages.length : 1;
          sub.setText(`${window.moment(file.stat.mtime).format("D. MMM YYYY")} · ${n} ${n === 1 ? "Seite" : "Seiten"}`);
        } catch {
          // keep defaults
        }
      });
      const cached = cachedThumbnail(file);
      const put = (url: string) => {
        book.querySelector(".cr-cover-page")?.remove();
        book.createEl("img", { cls: "cr-cover-page", attr: { src: url, alt: "" } });
      };
      if (cached) put(cached);
      else requestThumbnail(this.app, file, put);
    } else if (ext === "pdf") {
      cover.addClass("is-pdf");
      cover.createDiv({ cls: "cr-card-badge", text: this.inGoodNotes(file) ? "GoodNotes" : "PDF" });
      // Placeholder page until the first-page preview has been rendered.
      const ph = cover.createDiv({ cls: "cr-card-note cr-card-pdfph" });
      setIcon(ph.createDiv({ cls: "cr-card-icon" }), "file-text");
      const cached = cachedThumbnail(file);
      if (cached) thumb(cached);
      else requestThumbnail(this.app, file, (u) => thumb(u));
    } else if (IMAGE_EXTENSIONS.includes(ext)) {
      thumb(this.app.vault.getResourcePath(file));
      cover.addClass("is-image");
    } else if (file.path.endsWith(".excalidraw.md") || ext === "excalidraw") {
      cover.addClass("is-drawing");
      const png = this.app.vault.getFileByPath(file.path.replace(/\.md$/, "") + ".png") ?? this.app.vault.getFileByPath(file.path.replace(/\.excalidraw(\.md)?$/, ".png"));
      if (png) thumb(this.app.vault.getResourcePath(png));
      else setIcon(cover.createDiv({ cls: "cr-card-icon" }), "pencil-ruler");
      cover.createDiv({ cls: "cr-card-badge", text: "Zeichnung" });
    } else if (ext === "md") {
      cover.addClass("is-note");
      const paper = cover.createDiv({ cls: "cr-card-note" });
      paper.createDiv({ cls: "cr-card-note-title", text: file.basename });
      const body = paper.createDiv({ cls: "cr-card-note-body" });
      void notePreview(this.app, file).then((t) => body.setText(t));
    } else if (ext === "canvas") {
      setIcon(cover.createDiv({ cls: "cr-card-icon" }), "layout-dashboard");
      cover.createDiv({ cls: "cr-card-badge", text: "Canvas" });
    } else {
      setIcon(cover.createDiv({ cls: "cr-card-icon" }), "file");
    }
  }

  private inGoodNotes(file: TAbstractFile): boolean {
    const gn = this.host.goodnotesFolder();
    return file.path.startsWith(gn + "/");
  }

  private isListedFolder(f: TFolder): boolean {
    // Helper folders: GoodNotes import archive and page images exported for the Claude app.
    return !f.name.startsWith(".") && !f.name.startsWith("_Import-Archiv") && !f.name.endsWith(" – Seiten");
  }

  /** Files shown in the library: notebooks, notes, PDFs, images, drawings (no helper files). */
  private isListed(f: TFile): boolean {
    const ext = f.extension.toLowerCase();
    if (f.path.split("/").some((p) => p.startsWith("."))) return false;
    if (ext === "md") {
      if (f.basename.endsWith(" (Text)")) return false;
      if (this.host.isCompanionNote(f)) return false;
      return true;
    }
    if (ext === "png" && /\.excalidraw(\.(dark|light))?$/.test(f.basename)) return false;
    return [NOTEBOOK_EXTENSION, "pdf", "canvas", "excalidraw", ...IMAGE_EXTENSIONS].includes(ext);
  }

  // ---------- actions ----------

  private openItem(item: TAbstractFile): void {
    if (item instanceof TFolder) {
      this.showFolder(item.path);
      return;
    }
    if (item instanceof TFile) void this.leaf.openFile(item);
  }

  private currentFolderForNew(): string {
    if (this.tab === "docs" || this.tab === "goodnotes") return this.folder;
    return this.host.libraryRoot();
  }

  private newMenu(e: MouseEvent): void {
    const folder = this.currentFolderForNew();
    const menu = new Menu();
    menu.addItem((i) =>
      i.setTitle("Notizbuch (Handschrift)").setIcon("notebook-pen").onClick(async () => {
        const f = await this.host.createNotebook(folder);
        if (f) await this.leaf.openFile(f);
      }),
    );
    menu.addItem((i) =>
      i.setTitle("Ordner").setIcon("folder-plus").onClick(async () => {
        const name = await promptText(this.app, { title: "Neuer Ordner", placeholder: "Name", cta: "Erstellen" });
        if (!name?.trim()) return;
        const path = normalizePath(folder ? `${folder}/${name.trim()}` : name.trim());
        if (this.app.vault.getAbstractFileByPath(path)) {
          new Notice("Diesen Ordner gibt es schon.");
          return;
        }
        await ensureFolder(this.app, path);
      }),
    );
    menu.addItem((i) =>
      i.setTitle("Notiz (Text)").setIcon("file-text").onClick(async () => {
        const name = await promptText(this.app, { title: "Neue Notiz", placeholder: "Titel", cta: "Erstellen" });
        if (name === null) return;
        const path = availablePath(this.app, folder, name || "Unbenannt", "md");
        const f = await this.app.vault.create(path, "");
        await this.leaf.openFile(f);
      }),
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i.setTitle("PDF zum Beschreiben (vom Gerät)").setIcon("upload").onClick(async () => {
        const f = await this.host.newPdfNotebook(folder, "device");
        if (f) await this.leaf.openFile(f);
      }),
    );
    menu.addItem((i) =>
      i.setTitle("PDF zum Beschreiben (aus dem Vault)").setIcon("file-text").onClick(async () => {
        const f = await this.host.newPdfNotebook(folder, "vault");
        if (f) await this.leaf.openFile(f);
      }),
    );
    menu.addItem((i) => i.setTitle("GoodNotes-Export importieren").setIcon("folder-sync").onClick(() => void this.host.importGoodNotes()));
    menu.showAtMouseEvent(e);
  }

  private itemMenu(e: MouseEvent, item: TAbstractFile): void {
    const menu = new Menu();
    const isFav = this.host.favorites().includes(item.path);
    menu.addItem((i) => i.setTitle("Öffnen").setIcon("book-open").onClick(() => this.openItem(item)));
    if (item instanceof TFile) {
      menu.addItem((i) => i.setTitle("In neuem Tab öffnen").setIcon("plus-square").onClick(() => void this.app.workspace.getLeaf("tab").openFile(item)));
      const ext = item.extension.toLowerCase();
      if (ext === "pdf") {
        menu.addItem((i) =>
          i.setTitle("Zum Beschreiben öffnen").setIcon("pen").onClick(async () => {
            const nb = await this.host.pdfToNotebook(item);
            if (nb) await this.leaf.openFile(nb);
          }),
        );
        const companion = this.host.companionNote(item);
        if (companion) menu.addItem((i) => i.setTitle("Begleitnotiz öffnen").setIcon("file-text").onClick(() => void this.leaf.openFile(companion)));
      }
      if (ext === "pdf" || ext === NOTEBOOK_EXTENSION || IMAGE_EXTENSIONS.includes(ext) || item.path.endsWith(".excalidraw.md")) {
        menu.addItem((i) => i.setTitle("Mit Claude in Text umwandeln").setIcon("scan-text").onClick(() => void this.host.transcribe(item)));
      }
    }
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(isFav ? "Aus Favoriten entfernen" : "Zu Favoriten").setIcon("star").onClick(() => void this.host.toggleFavorite(item.path).then(() => this.render())));
    menu.addItem((i) => i.setTitle("Umbenennen").setIcon("pencil").onClick(() => void this.rename(item)));
    menu.addItem((i) => i.setTitle("Verschieben …").setIcon("folder-input").onClick(() => void this.move(item)));
    menu.addItem((i) =>
      i
        .setTitle("Löschen")
        .setIcon("trash-2")
        .setWarning(true)
        .onClick(async () => {
          const what = item instanceof TFolder ? `den Ordner „${item.name}“ mit allem Inhalt` : `„${item.name}“`;
          if (await confirmDialog(this.app, "Wirklich löschen?", `Möchtest du ${what} in den Papierkorb verschieben?`)) {
            await this.app.fileManager.trashFile(item);
          }
        }),
    );
    menu.showAtMouseEvent(e);
  }

  private async rename(item: TAbstractFile): Promise<void> {
    const isFile = item instanceof TFile;
    const current = isFile ? (item as TFile).basename : item.name;
    const name = await promptText(this.app, { title: "Umbenennen", value: current, cta: "Umbenennen" });
    if (!name?.trim() || name.trim() === current) return;
    const parent = item.parent && item.parent.path !== "/" ? `${item.parent.path}/` : "";
    const path = normalizePath(`${parent}${name.trim()}${isFile ? `.${(item as TFile).extension}` : ""}`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice("Dieser Name ist schon vergeben.");
      return;
    }
    await this.app.fileManager.renameFile(item, path);
  }

  private async move(item: TAbstractFile): Promise<void> {
    const folders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder && !f.path.split("/").some((p) => p.startsWith(".")));
    const target = await pickFromList(this.app, folders, "Zielordner wählen …");
    if (!target) return;
    const path = normalizePath(target.path && target.path !== "/" ? `${target.path}/${item.name}` : item.name);
    if (path === item.path) return;
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice("Im Zielordner gibt es schon eine Datei mit diesem Namen.");
      return;
    }
    await this.app.fileManager.renameFile(item, path);
  }
}

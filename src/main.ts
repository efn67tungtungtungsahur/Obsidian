import { MarkdownView, Notice, Platform, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { buildPrompt, openInClaude, PasteAnswerModal, TRANSCRIBE_PROMPT } from "./appBridge";
import { isVisualFile, listManualAttachments } from "./attachments";
import { ClaudeChatView, VIEW_TYPE_CLAUDE } from "./chatView";
import { describeError } from "./claude";
import { GoodNotesConnector, describeStats, importGoodNotesFile, insertUnderHeading } from "./goodnotes";
import { LibraryHost, LibraryView, VIEW_TYPE_LIBRARY } from "./library/libraryView";
import { chooseNewNotebook } from "./library/newNotebookModal";
import { NOTEBOOK_EXTENSION, Notebook, newNotebook, parseNotebook, serializeNotebook } from "./notebook/model";
import { notebookFromPdf } from "./notebook/pdf";
import { NotebookClaudeAction, NotebookHost, NotebookView, VIEW_TYPE_NOTEBOOK, defaultPenOnly } from "./notebook/view";
import { exportPagePngs, pageHasContent, pageImageBase64, splitByPage, syncTranscriptNote, transcribePageApi } from "./notebookClaude";
import { ClaudeResearchSettingTab, ClaudeResearchSettings, DEFAULT_SETTINGS } from "./settings";
import { transcribeFile } from "./transcribe";
import { availablePath, ensureFolder, pickDeviceFile, pickFromList, promptText, vaultPdfs } from "./ui";

type PasteTarget = { label: string; insert: (text: string) => Promise<void> };

export default class ClaudeResearchPlugin extends Plugin implements NotebookHost, LibraryHost {
  settings: ClaudeResearchSettings = { ...DEFAULT_SETTINGS };
  /** The last focused Markdown editor; the chat sidebar takes focus, so it is tracked here. */
  lastMarkdownView: MarkdownView | null = null;
  /** Last question handed to the Claude app; becomes the title when the answer is saved. */
  lastAppQuestion = "";
  /** Where "Claude-Antwort einfügen" should put the answer when it belongs to a notebook or PDF. */
  private pasteTarget: PasteTarget | null = null;
  private lastFile: TFile | null = null;
  goodnotes!: GoodNotesConnector;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.goodnotes = new GoodNotesConnector(this.app, () => this.settings);

    this.registerView(VIEW_TYPE_CLAUDE, (leaf) => new ClaudeChatView(leaf, this));
    this.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.registerView(VIEW_TYPE_NOTEBOOK, (leaf) => new NotebookView(leaf, this));
    this.registerExtensions([NOTEBOOK_EXTENSION], VIEW_TYPE_NOTEBOOK);
    this.addSettingTab(new ClaudeResearchSettingTab(this.app, this));

    this.addRibbonIcon("library", "Bibliothek öffnen", () => void this.openLibrary());
    this.addRibbonIcon("sparkles", "Claude öffnen", () => void this.openChat());

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) this.lastMarkdownView = leaf.view;
        const file = this.app.workspace.getActiveFile();
        if (file) this.lastFile = file;
      }),
    );

    this.registerCommands();
    this.registerMenus();

    this.app.workspace.onLayoutReady(() => void this.onLayoutReady());
  }

  private async onLayoutReady(): Promise<void> {
    // Registered here so the initial vault load does not count as "created".
    this.registerEvent(this.app.vault.on("create", (f) => void this.goodnotes.onCreate(f)));
    this.registerEvent(this.app.vault.on("modify", (f) => void this.goodnotes.onModify(f)));
    void this.goodnotes.scan();

    const { workspace } = this.app;
    if (this.settings.tidyUi) {
      (workspace.leftSplit as unknown as { collapse?: () => void })?.collapse?.();
      (workspace.rightSplit as unknown as { collapse?: () => void })?.collapse?.();
    }
    if (this.settings.openLibraryOnStart) {
      const existing = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0];
      if (existing) await workspace.revealLeaf(existing);
      else await this.openLibrary();
    }
  }

  private registerCommands(): void {
    this.addCommand({ id: "open-library", name: "Bibliothek öffnen", callback: () => void this.openLibrary() });
    this.addCommand({
      id: "new-notebook",
      name: "Neues Notizbuch",
      callback: async () => {
        const f = await this.createNotebook(this.libraryRoot());
        if (f) await this.app.workspace.getLeaf(false).openFile(f);
      },
    });
    this.addCommand({ id: "import-goodnotes", name: "GoodNotes-Export importieren", callback: () => void this.importGoodNotes() });
    this.addCommand({ id: "open-chat", name: "Claude öffnen", callback: () => void this.openChat() });
    this.addCommand({
      id: "ask-about-note",
      name: "Frage zur aktuellen Notiz stellen",
      callback: async () => (await this.openChat())?.focusInput({ includeNote: true }),
    });
    this.addCommand({
      id: "research-selection",
      name: "Markierten Text recherchieren",
      editorCheckCallback: (checking, editor) => {
        const selection = editor.getSelection().trim();
        if (!selection) return false;
        if (!checking) void this.researchSelection(selection);
        return true;
      },
    });
    this.addCommand({
      id: "transcribe-handwriting",
      name: "Handschrift der aktuellen Notiz transkribieren",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.transcribe(file);
        return true;
      },
    });
    this.addCommand({ id: "paste-answer", name: "Claude-Antwort einfügen", callback: () => this.openPasteModal() });
  }

  private registerMenus(): void {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection().trim();
        if (!selection) return;
        menu.addItem((item) =>
          item
            .setTitle("Mit Claude recherchieren")
            .setIcon("search")
            .onClick(() => void this.researchSelection(selection)),
        );
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension.toLowerCase() === "pdf") {
          menu.addItem((item) =>
            item
              .setTitle("Zum Beschreiben öffnen")
              .setIcon("pen")
              .onClick(async () => {
                const nb = await this.pdfToNotebook(file);
                if (nb) await this.app.workspace.getLeaf(false).openFile(nb);
              }),
          );
        }
        if (isVisualFile(this.app, file) || file.extension === NOTEBOOK_EXTENSION) {
          menu.addItem((item) =>
            item
              .setTitle("Mit Claude in Text umwandeln")
              .setIcon("scan-text")
              .onClick(() => void this.transcribe(file)),
          );
        }
      }),
    );
  }

  async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) as Partial<ClaudeResearchSettings> | null) ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...data, favorites: [...(data.favorites ?? [])] };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** SecretStorage exists from Obsidian 1.11.4; guard anyway so the plugin still loads without it. */
  hasSecretStorage(): boolean {
    return typeof (this.app as { secretStorage?: { getSecret?: unknown } }).secretStorage?.getSecret === "function";
  }

  getApiKey(): string | null {
    if (this.hasSecretStorage() && this.settings.apiKeySecret) {
      try {
        const key = this.app.secretStorage.getSecret(this.settings.apiKeySecret);
        if (key) return key;
      } catch {
        // fall through to the plain setting
      }
    }
    return this.settings.apiKeyPlain || null;
  }

  /** The file the user was last working on (the chat sidebar itself is not a file). */
  lastActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile() ?? this.lastFile;
  }

  // ---------- views ----------

  async openChat(): Promise<ClaudeChatView | null> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      if (!right) {
        new Notice("Seitenleiste konnte nicht geöffnet werden.");
        return null;
      }
      await right.setViewState({ type: VIEW_TYPE_CLAUDE, active: true });
      leaf = right;
    }
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof ClaudeChatView ? leaf.view : null;
  }

  openAssistant(): Promise<void> {
    return this.openChat().then(() => undefined);
  }

  /** Opens the library: in `leaf` (back button of a notebook), in the existing library tab, or a new tab. */
  async openLibrary(folder?: string, leaf?: WorkspaceLeaf): Promise<void> {
    const { workspace } = this.app;
    const state = folder !== undefined ? { folder } : {};
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true, state });
      return;
    }
    const existing = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      if (folder !== undefined && existing.view instanceof LibraryView) existing.view.showFolder(folder);
      return;
    }
    await workspace.getLeaf(true).setViewState({ type: VIEW_TYPE_LIBRARY, active: true, state });
  }

  /** Re-renders open chat panels, e.g. after switching between app and API mode. */
  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)) {
      if (leaf.view instanceof ClaudeChatView) leaf.view.render();
    }
  }

  // ---------- NotebookHost ----------

  penOnly(): boolean {
    return this.settings.penOnly ?? defaultPenOnly();
  }

  async setPenOnly(value: boolean): Promise<void> {
    this.settings.penOnly = value;
    await this.saveSettings();
  }

  async syncTranscriptNote(file: TFile, nb: Notebook): Promise<void> {
    await syncTranscriptNote(this.app, file, nb);
  }

  async notebookClaude(view: NotebookView, action: NotebookClaudeAction): Promise<void> {
    const file = view.file;
    if (!file) return;
    const nb = view.nb;
    const index = view.currentPageIndex();
    const page = nb.pages[index];
    try {
      if (action === "ask-page") {
        const question = await promptText(this.app, {
          title: `Frage zu Seite ${index + 1}`,
          multiline: true,
          placeholder: "z. B. „Erkläre mir die Formel unten“ oder „Mach daraus Karteikarten“",
          cta: "Fragen",
        });
        if (!question?.trim()) return;
        if (this.settings.mode === "api") {
          const data = await pageImageBase64(this.app, page, nb);
          const chat = await this.openChat();
          await chat?.askWithBlocks(
            `${question.trim()}\n\n(Bezieht sich auf Seite ${index + 1} meines handschriftlichen Notizbuchs „${file.basename}“, Bild anbei.)`,
            [{ type: "image", source: { type: "base64", media_type: "image/png", data } }],
            `Mit Seite ${index + 1} aus „${file.basename}“`,
          );
        } else {
          const [png] = await exportPagePngs(this.app, file, nb, [index]);
          this.lastAppQuestion = question.trim();
          this.pasteTarget = null;
          await openInClaude(this.app, buildPrompt({ question, web: false, attachments: [png], extraInstructions: this.settings.extraInstructions }), [png]);
        }
        return;
      }

      const indexes = action === "transcribe-page" ? [index] : nb.pages.map((p, i) => (pageHasContent(p) ? i : -1)).filter((i) => i >= 0);
      if (!indexes.length) {
        new Notice("Auf den Seiten steht noch nichts.");
        return;
      }

      if (this.settings.mode === "api") {
        const note = new Notice("Claude liest deine Handschrift …", 0);
        try {
          for (let n = 0; n < indexes.length; n++) {
            note.setMessage(`Claude liest deine Handschrift … Seite ${indexes[n] + 1} (${n + 1}/${indexes.length})`);
            const p = nb.pages[indexes[n]];
            await view.setTranscript(p.id, await transcribePageApi(this.app, this.settings, this.getApiKey(), nb, p));
          }
        } finally {
          note.hide();
        }
        this.transcriptDone(file);
        return;
      }

      // Without API: export the pages as images and hand them to the Claude app.
      const capped = indexes.slice(0, 20);
      const pngs = await exportPagePngs(this.app, file, nb, capped);
      const ids = capped.map((i) => nb.pages[i].id);
      const multi = capped.length > 1;
      const prompt = multi
        ? `${TRANSCRIBE_PROMPT}\n\nEs sind ${capped.length} Seiten (${capped.map((i) => i + 1).join(", ")}). Beginne jede Seite mit einer Zeile „## Seite N“ (N = Seitennummer wie angegeben).`
        : TRANSCRIBE_PROMPT;
      this.lastAppQuestion = `Transkription ${file.basename}`;
      this.pasteTarget = {
        label: multi ? "Als Text ins Notizbuch" : `Als Text zu Seite ${capped[0] + 1}`,
        insert: async (text) => {
          if (!multi) {
            await view.setTranscript(ids[0], text);
          } else {
            const parts = splitByPage(text, nb.pages.length);
            if (parts.size === 1 && parts.has(0) && !/^#{1,3}\s*Seite/im.test(text)) await view.setTranscript(ids[0], text);
            else for (const [i, t] of parts) await view.setTranscript(nb.pages[i].id, t);
          }
          this.transcriptDone(file);
        },
      };
      await openInClaude(this.app, prompt, pngs);
    } catch (err) {
      new Notice(`Claude: ${describeError(err)}`, 10000);
    }
  }

  private transcriptDone(file: TFile): void {
    const text = this.app.vault.getFileByPath(normalizePath(`${file.parent && file.parent.path !== "/" ? file.parent.path + "/" : ""}${file.basename} (Text).md`));
    new Notice(`Fertig – der Text steht in „${file.basename} (Text)“ und ist jetzt durchsuchbar.`, 8000);
    if (text) void this.app.workspace.getLeaf(Platform.isMobile ? "tab" : "split").openFile(text);
  }

  // ---------- LibraryHost ----------

  libraryRoot(): string {
    return normalizePath(this.settings.libraryRoot || "/") === "/" ? "" : normalizePath(this.settings.libraryRoot);
  }

  goodnotesFolder(): string {
    return this.goodnotes.root();
  }

  favorites(): string[] {
    return this.settings.favorites;
  }

  async toggleFavorite(path: string): Promise<void> {
    const favs = this.settings.favorites;
    const i = favs.indexOf(path);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(path);
    await this.saveSettings();
  }

  sortMode(): "date" | "name" {
    return this.settings.librarySort;
  }

  async setSortMode(mode: "date" | "name"): Promise<void> {
    this.settings.librarySort = mode;
    await this.saveSettings();
  }

  companionNote(pdf: TFile): TFile | null {
    return this.goodnotes.companionNote(pdf);
  }

  isCompanionNote(file: TFile): boolean {
    return this.goodnotes.isCompanionNote(file);
  }

  async createNotebook(folder: string): Promise<TFile | null> {
    const choice = await chooseNewNotebook(this.app);
    if (!choice) return null;
    if (folder) await ensureFolder(this.app, folder);
    const nb = newNotebook({ template: choice.template, paper: choice.paper, cover: choice.cover });
    return this.app.vault.create(availablePath(this.app, folder, choice.name, NOTEBOOK_EXTENSION), serializeNotebook(nb));
  }

  async pdfToNotebook(pdf: TFile): Promise<TFile | null> {
    const folder = pdf.parent && pdf.parent.path !== "/" ? pdf.parent.path : "";
    const sibling = this.app.vault.getFileByPath(normalizePath(`${folder ? folder + "/" : ""}${pdf.basename}.${NOTEBOOK_EXTENSION}`));
    if (sibling) return sibling;
    try {
      const nb = await notebookFromPdf(this.app, pdf.path);
      return await this.app.vault.create(availablePath(this.app, folder, pdf.basename, NOTEBOOK_EXTENSION), serializeNotebook(nb));
    } catch (err) {
      new Notice(`PDF konnte nicht geöffnet werden: ${describeError(err)}`);
      return null;
    }
  }

  async newPdfNotebook(folder: string, source: "vault" | "device"): Promise<TFile | null> {
    let pdf: TFile | null = null;
    if (source === "vault") {
      pdf = await pickFromList(this.app, vaultPdfs(this.app), "PDF auswählen …");
    } else {
      const picked = await pickDeviceFile("application/pdf");
      if (!picked) return null;
      if (folder) await ensureFolder(this.app, folder);
      const base = picked.name.replace(/\.pdf$/i, "");
      pdf = await this.app.vault.createBinary(availablePath(this.app, folder, base, "pdf"), await picked.arrayBuffer());
    }
    return pdf ? this.pdfToNotebook(pdf) : null;
  }

  async importGoodNotes(): Promise<void> {
    const picked = await pickDeviceFile(".zip,.pdf,application/zip,application/pdf");
    if (!picked) return;
    const note = new Notice(`„${picked.name}“ wird importiert …`, 0);
    try {
      const root = this.goodnotesFolder();
      const stats = await importGoodNotesFile(this.app, picked, root);
      note.hide();
      new Notice(`GoodNotes importiert: ${describeStats(stats)}.`, 8000);
      await this.openLibrary(root);
    } catch (err) {
      note.hide();
      new Notice(`Import fehlgeschlagen: ${describeError(err)}`, 10000);
    }
  }

  /** Handwriting → text for any file: notebook, GoodNotes PDF, PDF, image, drawing or note. */
  async transcribe(file: TFile): Promise<void> {
    if (file.extension === NOTEBOOK_EXTENSION) {
      await this.transcribeNotebookFile(file);
      return;
    }
    const companion = file.extension.toLowerCase() === "pdf" ? this.goodnotes.companionNote(file) : null;
    if (this.settings.mode === "api") {
      // For a GoodNotes PDF the text goes into its companion note (which embeds the PDF).
      await transcribeFile(this.app, this.settings, this.getApiKey(), companion ?? file);
      return;
    }
    const { paths, hints } = await listManualAttachments(this.app, file);
    if (!paths.length) {
      const why = hints.length ? ` ${hints.join("; ")}` : "";
      new Notice(`Keine Bilder oder PDFs zum Anhängen in „${file.basename}“ gefunden.${why}`, 12000);
      return;
    }
    this.lastAppQuestion = `Transkription ${file.basename}`;
    this.pasteTarget = companion
      ? {
          label: `In „${companion.basename}“ (Begleitnotiz)`,
          insert: async (text) => {
            await this.app.vault.process(companion, (data) => insertUnderHeading(data, "## Transkription", text));
            await this.app.fileManager.processFrontMatter(companion, (fm: Record<string, unknown>) => {
              delete fm["transkription-veraltet"];
            });
          },
        }
      : null;
    await openInClaude(this.app, TRANSCRIBE_PROMPT, paths, hints);
  }

  /** Transcribes a notebook that may not be open: opens it so pages render with their assets. */
  private async transcribeNotebookFile(file: TFile): Promise<void> {
    let view = this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTEBOOK).map((l) => l.view).find((v): v is NotebookView => v instanceof NotebookView && v.file?.path === file.path);
    if (!view) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      view = leaf.view instanceof NotebookView ? leaf.view : undefined;
    }
    if (!view) {
      // Fallback without a view: work on the parsed file directly.
      const nb = parseNotebook(await this.app.vault.read(file));
      new Notice(`Notizbuch „${file.basename}“ hat ${nb.pages.length} Seiten – bitte öffnen und über das Claude-Symbol umwandeln.`);
      return;
    }
    await this.notebookClaude(view, "transcribe-all");
  }

  // ---------- research & paste ----------

  private async researchSelection(selection: string): Promise<void> {
    const question = `Recherchiere gründlich zu folgendem Text aus meiner Notiz. Erkläre die Kernaussagen, prüfe Fakten und ergänze wichtige Hintergründe mit Quellen:\n\n> ${selection.replace(/\n/g, "\n> ")}`;
    if (this.settings.mode === "app") {
      // Build the prompt synchronously so the clipboard write still counts as part of the tap.
      this.lastAppQuestion = `Recherche: ${selection.slice(0, 50)}`;
      this.pasteTarget = null;
      await openInClaude(this.app, buildPrompt({ question, web: true, extraInstructions: this.settings.extraInstructions }));
      return;
    }
    const view = await this.openChat();
    await view?.ask(question, { includeNote: false });
  }

  openPasteModal(): void {
    const target = this.pasteTarget;
    new PasteAnswerModal(
      this.app,
      this.settings,
      { view: this.lastMarkdownView, file: this.lastActiveFile() },
      this.lastAppQuestion,
      target
        ? {
            label: target.label,
            insert: async (text) => {
              await target.insert(text);
              this.pasteTarget = null;
            },
          }
        : null,
    ).open();
  }
}

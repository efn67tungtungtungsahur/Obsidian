import { MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { buildPrompt, openInClaude, PasteAnswerModal, TRANSCRIBE_PROMPT } from "./appBridge";
import { isVisualFile, listManualAttachments } from "./attachments";
import { ClaudeChatView, VIEW_TYPE_CLAUDE } from "./chatView";
import { ClaudeResearchSettingTab, ClaudeResearchSettings, DEFAULT_SETTINGS } from "./settings";
import { transcribeFile } from "./transcribe";

export default class ClaudeResearchPlugin extends Plugin {
  settings: ClaudeResearchSettings = { ...DEFAULT_SETTINGS };
  /** The last focused Markdown editor; the chat sidebar takes focus, so it is tracked here. */
  lastMarkdownView: MarkdownView | null = null;
  /** Last question handed to the Claude app; becomes the title when the answer is saved. */
  lastAppQuestion = "";
  private lastFile: TFile | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_CLAUDE, (leaf) => new ClaudeChatView(leaf, this));
    this.addSettingTab(new ClaudeResearchSettingTab(this.app, this));
    this.addRibbonIcon("bot", "Claude-Recherche öffnen", () => void this.openChat());

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) this.lastMarkdownView = leaf.view;
        const file = this.app.workspace.getActiveFile();
        if (file) this.lastFile = file;
      }),
    );

    this.addCommand({
      id: "open-chat",
      name: "Chat öffnen",
      callback: () => void this.openChat(),
    });

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

    this.addCommand({
      id: "paste-answer",
      name: "Claude-Antwort einfügen",
      callback: () => this.openPasteModal(),
    });

    // Right-click on selected text in a note.
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

    // Right-click on an image, PDF, Excalidraw or Ink file in the file explorer.
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || !isVisualFile(this.app, file)) return;
        menu.addItem((item) =>
          item
            .setTitle("Handschrift mit Claude transkribieren")
            .setIcon("pen-tool")
            .onClick(() => void this.transcribe(file)),
        );
      }),
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ClaudeResearchSettings> | null) };
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

  private async researchSelection(selection: string): Promise<void> {
    const question = `Recherchiere gründlich zu folgendem Text aus meiner Notiz. Erkläre die Kernaussagen, prüfe Fakten und ergänze wichtige Hintergründe mit Quellen:\n\n> ${selection.replace(/\n/g, "\n> ")}`;
    if (this.settings.mode === "app") {
      // Build the prompt synchronously so the clipboard write still counts as part of the tap.
      this.lastAppQuestion = `Recherche: ${selection.slice(0, 50)}`;
      await openInClaude(this.app, buildPrompt({ question, web: true, extraInstructions: this.settings.extraInstructions }));
      return;
    }
    const view = await this.openChat();
    await view?.ask(question, { includeNote: false });
  }

  /** API mode: transcribe directly. App mode: hand the files to the Claude app. */
  private async transcribe(file: TFile): Promise<void> {
    if (this.settings.mode === "api") {
      await transcribeFile(this.app, this.settings, this.getApiKey(), file);
      return;
    }
    const { paths, hints } = await listManualAttachments(this.app, file);
    if (!paths.length) {
      const why = hints.length ? ` ${hints.join("; ")}` : "";
      new Notice(`Keine Bilder oder PDFs zum Anhängen in „${file.basename}“ gefunden.${why}`, 12000);
      return;
    }
    this.lastAppQuestion = `Transkription ${file.basename}`;
    await openInClaude(this.app, TRANSCRIBE_PROMPT, paths, hints);
  }

  openPasteModal(): void {
    new PasteAnswerModal(this.app, this.settings, { view: this.lastMarkdownView, file: this.lastActiveFile() }, this.lastAppQuestion).open();
  }

  /** Re-renders open chat panels, e.g. after switching between app and API mode. */
  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE)) {
      if (leaf.view instanceof ClaudeChatView) leaf.view.render();
    }
  }
}

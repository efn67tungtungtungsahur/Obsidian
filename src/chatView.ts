import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Component, ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import { collectAttachments } from "./attachments";
import { Conversation, describeError } from "./claude";
import type ClaudeResearchPlugin from "./main";

export const VIEW_TYPE_CLAUDE = "claude-research-chat";

interface TranscriptEntry {
  role: "user" | "assistant";
  markdown: string;
}

export class ClaudeChatView extends ItemView {
  private conversation: Conversation | null = null;
  private transcript: TranscriptEntry[] = [];
  private chatComponent = new Component();
  private busy = false;

  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private webToggle!: HTMLInputElement;
  private noteToggle!: HTMLInputElement;

  constructor(leaf: WorkspaceLeaf, private plugin: ClaudeResearchPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CLAUDE;
  }

  getDisplayText(): string {
    return "Claude";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("claude-research");

    const header = root.createDiv({ cls: "claude-header" });
    header.createSpan({ cls: "claude-title", text: "Claude-Recherche" });
    const headerButtons = header.createDiv({ cls: "claude-header-buttons" });
    this.iconButton(headerButtons, "save", "Chat als Notiz speichern", () => this.saveAsNote());
    this.iconButton(headerButtons, "plus", "Neuer Chat", () => this.newChat());

    this.messagesEl = root.createDiv({ cls: "claude-messages" });

    const options = root.createDiv({ cls: "claude-options" });
    this.webToggle = this.checkbox(options, "Web-Suche", this.plugin.settings.webSearch);
    this.noteToggle = this.checkbox(options, "Aktuelle Notiz mitschicken", this.plugin.settings.includeNoteByDefault);

    const inputRow = root.createDiv({ cls: "claude-input-row" });
    this.inputEl = inputRow.createEl("textarea", {
      cls: "claude-input",
      attr: { placeholder: "Frag Claude … (Enter = senden, Shift+Enter = neue Zeile)", rows: "3" },
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.submit();
      }
    });
    this.sendBtn = inputRow.createEl("button", { cls: "mod-cta claude-send", text: "Senden" });
    this.sendBtn.addEventListener("click", () => void this.submit());
    this.stopBtn = inputRow.createEl("button", { cls: "claude-stop", text: "Stopp" });
    this.stopBtn.addEventListener("click", () => this.conversation?.abort());
    this.stopBtn.hide();

    this.addChild(this.chatComponent);
    this.showWelcome();
  }

  async onClose(): Promise<void> {
    this.conversation?.abort();
  }

  /** Sends a question programmatically (used by the editor commands). */
  async ask(question: string, opts: { includeNote?: boolean } = {}): Promise<void> {
    if (opts.includeNote !== undefined) this.noteToggle.checked = opts.includeNote;
    this.inputEl.value = question;
    await this.submit();
  }

  focusInput(opts: { includeNote?: boolean } = {}): void {
    if (opts.includeNote !== undefined) this.noteToggle.checked = opts.includeNote;
    this.inputEl.focus();
  }

  private newChat(): void {
    this.conversation?.abort();
    this.conversation = null;
    this.transcript = [];
    this.removeChild(this.chatComponent);
    this.chatComponent = this.addChild(new Component());
    this.messagesEl.empty();
    this.webToggle.disabled = false;
    this.showWelcome();
  }

  private showWelcome(): void {
    const el = this.messagesEl.createDiv({ cls: "claude-welcome" });
    el.createEl("p", { text: "Stell eine Frage – Claude sucht bei Bedarf im Web und in deinen Notizen und nennt die Quellen." });
    const ul = el.createEl("ul");
    ul.createEl("li", { text: "„Aktuelle Notiz mitschicken“ hängt Text und Handschrift (Bilder, Excalidraw, Ink, PDFs) der offenen Notiz an." });
    ul.createEl("li", { text: "Text in einer Notiz markieren → Rechtsklick → „Mit Claude recherchieren“." });
    ul.createEl("li", { text: "Befehl „Handschrift transkribieren“ macht handschriftliche Notizen durchsuchbar." });
  }

  private async submit(): Promise<void> {
    const question = this.inputEl.value.trim();
    if (!question || this.busy) return;

    if (!this.conversation) {
      this.conversation = new Conversation(this.app, this.plugin.settings, () => this.plugin.getApiKey(), { web: this.webToggle.checked });
      this.messagesEl.querySelector(".claude-welcome")?.remove();
    }
    // The tool set is fixed per chat (keeps the prompt cache valid); toggling applies to a new chat.
    this.webToggle.disabled = true;
    this.webToggle.checked = this.conversation.webEnabled;

    this.setBusy(true);
    this.inputEl.value = "";

    let content: BetaContentBlockParam[];
    let contextLabel: string;
    try {
      ({ content, contextLabel } = await this.buildUserContent(question));
    } catch (err) {
      this.addUserMessage(question, "");
      this.messagesEl.createDiv({ cls: "claude-msg claude-msg-error", text: `Notiz konnte nicht gelesen werden: ${describeError(err)}` });
      if (this.conversation.isEmpty) this.webToggle.disabled = false;
      this.setBusy(false);
      return;
    }
    this.addUserMessage(question, contextLabel);
    this.transcript.push({ role: "user", markdown: question + (contextLabel ? `\n\n*${contextLabel}*` : "") });

    const msgEl = this.messagesEl.createDiv({ cls: "claude-msg claude-msg-assistant" });
    const statusEl = msgEl.createDiv({ cls: "claude-status" });
    const liveEl = msgEl.createDiv({ cls: "claude-live" });
    const thinking = statusEl.createDiv({ cls: "claude-status-line claude-pulse", text: "Claude denkt nach …" });
    let live = "";

    try {
      const result = await this.conversation.send(content, {
        onText: (delta) => {
          live += delta;
          liveEl.setText(live);
          this.scrollToBottom();
        },
        onStatus: (status) => {
          statusEl.createDiv({ cls: "claude-status-line", text: status });
          this.scrollToBottom();
        },
      });
      thinking.remove();
      liveEl.remove();

      let markdown = result.markdown;
      if (result.outcome === "refused") markdown += "\n\n> [!warning] Claude hat diese Anfrage abgelehnt. Formuliere sie bitte anders.";
      if (result.outcome === "aborted") markdown += "\n\n*(Abgebrochen – diese Frage wurde nicht in den Verlauf übernommen.)*";
      if (result.outcome === "truncated") markdown += "\n\n*(Antwort wurde abgeschnitten.)*";

      await this.renderAssistant(msgEl, markdown);
      if (result.outcome === "done" || result.outcome === "truncated") {
        this.transcript.push({ role: "assistant", markdown });
      } else {
        this.transcript.pop();
      }
    } catch (err) {
      thinking.remove();
      liveEl.remove();
      this.transcript.pop();
      msgEl.addClass("claude-msg-error");
      msgEl.createDiv({ text: describeError(err) });
      if (this.conversation.isEmpty) this.webToggle.disabled = false;
    } finally {
      this.setBusy(false);
      this.scrollToBottom();
    }
  }

  /** User content: optional note context (text + handwriting/images), then the question. */
  private async buildUserContent(question: string): Promise<{ content: BetaContentBlockParam[]; contextLabel: string }> {
    const file = this.noteToggle.checked ? this.plugin.lastActiveFile() : null;
    if (!file) return { content: [{ type: "text", text: question }], contextLabel: "" };

    const attachments = await collectAttachments(this.app, file);
    const blocks: BetaContentBlockParam[] = [...attachments.blocks];
    let context = "";
    if (file.extension === "md") {
      const text = await this.app.vault.cachedRead(file);
      context = `<aktuelle_notiz pfad="${file.path}">\n${text}\n</aktuelle_notiz>\n\n`;
    }
    if (attachments.labels.length) context += `(Angehängt aus der Notiz: ${attachments.labels.join(", ")})\n\n`;
    blocks.push({ type: "text", text: context + question });

    let label = `Mit Notiz „${file.basename}“`;
    if (attachments.labels.length) label += ` und ${attachments.labels.length} Bild(ern)/PDF(s)`;
    if (attachments.skipped.length) label += ` – übersprungen: ${attachments.skipped.join("; ")}`;
    return { content: blocks, contextLabel: label };
  }

  private addUserMessage(text: string, contextLabel: string): void {
    const el = this.messagesEl.createDiv({ cls: "claude-msg claude-msg-user" });
    el.createDiv({ text });
    if (contextLabel) el.createDiv({ cls: "claude-context-label", text: contextLabel });
    this.scrollToBottom();
  }

  private async renderAssistant(msgEl: HTMLElement, markdown: string): Promise<void> {
    const body = msgEl.createDiv({ cls: "claude-body markdown-rendered" });
    const sourcePath = this.plugin.lastActiveFile()?.path ?? "";
    await MarkdownRenderer.render(this.app, markdown, body, sourcePath, this.chatComponent);

    const actions = msgEl.createDiv({ cls: "claude-actions" });
    this.iconButton(actions, "file-input", "In Notiz einfügen (an der Cursorposition)", () => this.insertIntoNote(markdown));
    this.iconButton(actions, "copy", "Kopieren", async () => {
      await navigator.clipboard.writeText(markdown);
      new Notice("Kopiert");
    });
  }

  private insertIntoNote(markdown: string): void {
    const view = this.plugin.lastMarkdownView;
    if (!view || !view.file) {
      new Notice("Öffne zuerst eine Notiz, in die eingefügt werden soll.");
      return;
    }
    view.editor.replaceSelection("\n" + markdown + "\n");
    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    new Notice(`In „${view.file.basename}“ eingefügt`);
  }

  private async saveAsNote(): Promise<void> {
    if (!this.transcript.length) {
      new Notice("Der Chat ist noch leer.");
      return;
    }
    const first = this.transcript[0].markdown.split("\n")[0];
    const title = first.replace(/[\\/:*?"<>|#^[\]]/g, "").slice(0, 60).trim() || "Recherche";
    const stamp = window.moment().format("YYYY-MM-DD HHmm");
    const folder = normalizePath(this.plugin.settings.saveFolder);
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);

    const body = [
      "---",
      "tags: [claude, recherche]",
      `erstellt: ${window.moment().format("YYYY-MM-DDTHH:mm")}`,
      `modell: ${this.plugin.settings.model}`,
      "---",
      "",
      ...this.transcript.map((e) => (e.role === "user" ? `## Frage\n\n${e.markdown}\n` : `### Antwort\n\n${e.markdown}\n`)),
    ].join("\n");

    const path = normalizePath(`${folder}/${stamp} ${title}.md`);
    const file = this.app.vault.getFileByPath(path) ?? (await this.app.vault.create(path, body));
    if (file instanceof TFile) await this.app.workspace.getLeaf("tab").openFile(file);
    new Notice(`Gespeichert: ${path}`);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendBtn.toggle(!busy);
    this.stopBtn.toggle(busy);
    this.inputEl.disabled = busy;
    if (!busy) this.inputEl.focus();
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLElement {
    const btn = parent.createEl("button", { cls: "clickable-icon claude-icon-btn", attr: { "aria-label": label } });
    setIcon(btn, icon);
    btn.addEventListener("click", onClick);
    return btn;
  }

  private checkbox(parent: HTMLElement, label: string, checked: boolean): HTMLInputElement {
    const wrap = parent.createEl("label", { cls: "claude-option" });
    const input = wrap.createEl("input", { type: "checkbox" });
    input.checked = checked;
    wrap.appendText(" " + label);
    return input;
  }
}

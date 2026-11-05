import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Component, ItemView, MarkdownRenderer, Notice, Platform, TFile, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import { openInClaude, preparePrompt } from "./appBridge";
import { collectAttachments } from "./attachments";
import { Conversation, describeError } from "./claude";
import type { AgentContext, AppliedChange, PendingChange } from "./agentTools";
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
  private relatedToggle: HTMLInputElement | null = null;
  /** Assistant message currently being written (approval cards go there). */
  private currentMsgEl: HTMLElement | null = null;
  private pendingApprovals = new Set<(ok: boolean) => void>();
  /** Extra content (e.g. a notebook page image) for the next question. */
  private extraBlocks: { blocks: BetaContentBlockParam[]; label: string } | null = null;

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
    this.render();
  }

  /** Builds the panel for the current mode; called again when the mode is changed in settings. */
  render(): void {
    this.conversation?.abort();
    this.conversation = null;
    this.transcript = [];
    this.busy = false;
    const root = this.contentEl;
    root.empty();
    root.addClass("claude-research");
    if (this.plugin.settings.mode === "app") {
      this.renderAppMode(root);
      return;
    }

    const header = root.createDiv({ cls: "claude-header" });
    const titleEl = header.createDiv({ cls: "claude-title" });
    titleEl.createSpan({ text: "Claude" });
    if (this.plugin.settings.agentEdits) titleEl.createSpan({ cls: "claude-chip", text: "arbeitet in deinen Notizen" });
    const headerButtons = header.createDiv({ cls: "claude-header-buttons" });
    this.iconButton(headerButtons, "save", "Chat als Notiz speichern", () => this.saveAsNote());
    this.iconButton(headerButtons, "plus", "Neuer Chat", () => this.newChat());

    this.messagesEl = root.createDiv({ cls: "claude-messages" });

    const options = root.createDiv({ cls: "claude-options" });
    this.webToggle = this.checkbox(options, "Web-Suche", this.plugin.settings.webSearch);
    this.noteToggle = this.checkbox(options, "Aktuelle Notiz mitschicken", this.plugin.settings.includeNoteByDefault);

    const inputRow = root.createDiv({ cls: "claude-input-row" });
    // Touch keyboards have no Shift+Enter, so on tablets/phones Enter makes a new line and
    // the button sends. With a hardware keyboard (e.g. Book Cover Keyboard) Ctrl+Enter sends.
    const placeholder = Platform.isMobile
      ? "Frag Claude … (tippen oder mit dem Stift schreiben, dann „Senden“)"
      : "Frag Claude … (Enter = senden, Shift+Enter = neue Zeile)";
    this.inputEl = inputRow.createEl("textarea", { cls: "claude-input", attr: { placeholder, rows: "3" } });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      const send = Platform.isMobile ? e.ctrlKey || e.metaKey : !e.shiftKey;
      if (send) {
        e.preventDefault();
        void this.submit();
      }
    });
    this.sendBtn = inputRow.createEl("button", { cls: "mod-cta claude-send", text: "Senden" });
    this.sendBtn.addEventListener("click", () => void this.submit());
    this.stopBtn = inputRow.createEl("button", { cls: "claude-stop", text: "Stopp" });
    this.stopBtn.addEventListener("click", () => {
      this.resolveApprovals(false);
      this.conversation?.abort();
    });
    this.stopBtn.hide();

    this.removeChild(this.chatComponent);
    this.chatComponent = this.addChild(new Component());
    this.showWelcome();
  }

  /** Without API key: prepare the question here, answer in the Claude app, paste it back. */
  private renderAppMode(root: HTMLElement): void {
    const header = root.createDiv({ cls: "claude-header" });
    header.createSpan({ cls: "claude-title", text: "Claude (ohne API)" });

    const body = root.createDiv({ cls: "claude-messages" });
    const steps = body.createEl("ol", { cls: "claude-welcome" });
    steps.createEl("li", { text: "Frage unten eingeben (tippen oder mit dem S Pen schreiben) und „In Claude öffnen“ tippen." });
    steps.createEl("li", { text: "Die Frage ist kopiert und Claude öffnet sich. Ins Eingabefeld lange tippen → „Einfügen“ → senden. Für Recherche in Claude die Websuche einschalten." });
    steps.createEl("li", { text: "Unter Claudes Antwort auf „Kopieren“ tippen, zurück zu Obsidian und „Antwort einfügen“." });
    body.createEl("p", {
      cls: "claude-welcome",
      text: "Läuft über dein eigenes Claude-Konto (kostenlos oder Abo) – kein API-Schlüssel, keine Extrakosten.",
    });

    const options = root.createDiv({ cls: "claude-options" });
    this.noteToggle = this.checkbox(options, "Aktuelle Notiz mitschicken", this.plugin.settings.includeNoteByDefault);
    this.webToggle = this.checkbox(options, "Web-Recherche mit Quellen", this.plugin.settings.webSearch);
    this.relatedToggle = this.checkbox(options, "Passende Notizen mitschicken", false);

    const inputRow = root.createDiv({ cls: "claude-input-row claude-input-col" });
    this.inputEl = inputRow.createEl("textarea", {
      cls: "claude-input",
      attr: { placeholder: "Deine Frage an Claude … (tippen oder mit dem Stift schreiben)", rows: "4" },
    });
    const buttons = inputRow.createDiv({ cls: "claude-button-row" });
    this.sendBtn = buttons.createEl("button", { cls: "mod-cta", text: "In Claude öffnen" });
    this.sendBtn.addEventListener("click", () => void this.sendToApp());
    const pasteBtn = buttons.createEl("button", { text: "Antwort einfügen" });
    pasteBtn.addEventListener("click", () => this.openPasteModal());
  }

  private async sendToApp(): Promise<void> {
    const question = this.inputEl.value.trim();
    if (!question) {
      new Notice("Bitte zuerst eine Frage eingeben.");
      return;
    }
    try {
      const { prompt, attachments, hints } = await preparePrompt(this.app, this.plugin.settings, question, {
        file: this.plugin.lastActiveFile(),
        includeNote: this.noteToggle.checked,
        web: this.webToggle.checked,
        related: this.relatedToggle?.checked ?? false,
      });
      this.plugin.lastAppQuestion = question;
      await openInClaude(this.app, prompt, attachments, hints);
    } catch (err) {
      new Notice(`Konnte die Frage nicht vorbereiten: ${describeError(err)}`);
    }
  }

  private openPasteModal(): void {
    this.plugin.openPasteModal();
  }

  async onClose(): Promise<void> {
    this.conversation?.abort();
  }

  /** Sends a question programmatically (used by the editor commands). */
  async ask(question: string, opts: { includeNote?: boolean } = {}): Promise<void> {
    if (opts.includeNote !== undefined) this.noteToggle.checked = opts.includeNote;
    this.inputEl.value = question;
    if (this.plugin.settings.mode === "app") await this.sendToApp();
    else await this.submit();
  }

  /** Asks a question with extra content blocks (API mode), e.g. the image of a notebook page. */
  async askWithBlocks(question: string, blocks: BetaContentBlockParam[], label: string): Promise<void> {
    this.extraBlocks = { blocks, label };
    this.noteToggle.checked = false;
    this.inputEl.value = question;
    await this.submit();
  }

  focusInput(opts: { includeNote?: boolean } = {}): void {
    if (opts.includeNote !== undefined) this.noteToggle.checked = opts.includeNote;
    this.inputEl.focus();
  }

  private newChat(): void {
    this.resolveApprovals(false);
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
    if (this.plugin.settings.agentEdits) {
      el.createEl("p", { text: "Claude sieht, was du offen hast, und arbeitet direkt in deinen Notizen – du bestätigst jede Änderung. Zum Beispiel:" });
      const ex = el.createDiv({ cls: "claude-examples" });
      for (const q of [
        "Fasse diese Notiz zusammen und schreib die Zusammenfassung oben hinein.",
        "Mach aus Seite 1 meines Notizbuchs eine saubere Notiz mit Überschriften.",
        "Erstelle 10 Karteikarten zu dieser Mitschrift als neue Notiz.",
        "Recherchiere den aktuellen Stand und ergänze einen Abschnitt mit Quellen.",
      ]) {
        const b = ex.createEl("button", { cls: "claude-example", text: q });
        b.addEventListener("click", () => {
          this.inputEl.value = q;
          this.inputEl.focus();
        });
      }
      return;
    }
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
      const agent: AgentContext | null = this.plugin.settings.agentEdits
        ? {
            onStatus: () => undefined,
            approve: (change) => this.requestApproval(change),
            onApplied: (change) => this.showApplied(change),
            activeFile: () => this.plugin.lastActiveFile(),
            selection: () => this.plugin.lastMarkdownView?.editor.getSelection() ?? "",
          }
        : null;
      this.conversation = new Conversation(this.app, this.plugin.settings, () => this.plugin.getApiKey(), { web: this.webToggle.checked, agent });
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

    this.currentMsgEl = msgEl;
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
      this.currentMsgEl = null;
      this.resolveApprovals(false);
      this.setBusy(false);
      this.scrollToBottom();
    }
  }

  /** Inline "Erlauben / Ablehnen" card for a change Claude wants to make. */
  private requestApproval(change: PendingChange): Promise<boolean> {
    if (this.plugin.settings.autoApprove) return Promise.resolve(true);
    const host = this.currentMsgEl ?? this.messagesEl;
    const card = host.createDiv({ cls: "claude-approval" });
    card.createDiv({ cls: "claude-approval-title", text: change.summary });
    if (change.before) {
      card.createDiv({ cls: "claude-approval-label", text: "Bisher" });
      card.createEl("pre", { cls: "claude-diff claude-diff-old", text: change.before });
    }
    if (change.after) {
      card.createDiv({ cls: "claude-approval-label", text: change.kind === "edit" ? "Neu" : "Inhalt" });
      card.createEl("pre", { cls: "claude-diff claude-diff-new", text: change.after });
    }
    const row = card.createDiv({ cls: "claude-approval-buttons" });
    const no = row.createEl("button", { text: "Ablehnen" });
    const yes = row.createEl("button", { cls: "mod-cta", text: "Erlauben" });
    this.scrollToBottom();
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        if (!this.pendingApprovals.delete(finish)) return;
        row.remove();
        card.addClass(ok ? "is-approved" : "is-declined");
        card.createDiv({ cls: "claude-approval-result", text: ok ? "Erlaubt" : "Abgelehnt" });
        resolve(ok);
      };
      this.pendingApprovals.add(finish);
      yes.addEventListener("click", () => finish(true));
      no.addEventListener("click", () => finish(false));
    });
  }

  private resolveApprovals(ok: boolean): void {
    for (const finish of [...this.pendingApprovals]) finish(ok);
  }

  /** "Geändert: …  [Öffnen] [Rückgängig]" after a change was applied. */
  private showApplied(change: AppliedChange): void {
    const host = this.currentMsgEl ?? this.messagesEl;
    const card = host.createDiv({ cls: "claude-applied" });
    setIcon(card.createSpan({ cls: "claude-applied-icon" }), "check");
    card.createSpan({ cls: "claude-applied-text", text: change.summary });
    const open = card.createEl("button", { text: "Öffnen" });
    open.addEventListener("click", () => {
      const f = this.app.vault.getFileByPath(change.path);
      if (f) void this.app.workspace.getLeaf(false).openFile(f);
    });
    const undo = card.createEl("button", { text: "Rückgängig" });
    undo.addEventListener("click", async () => {
      try {
        await change.undo();
        card.addClass("is-undone");
        undo.remove();
        open.remove();
        card.createSpan({ cls: "claude-applied-undone", text: "– rückgängig gemacht" });
      } catch (err) {
        new Notice(`Rückgängig nicht möglich: ${describeError(err)}`);
      }
    });
    this.scrollToBottom();
  }

  /** User content: optional note context (text + handwriting/images), then the question. */
  private async buildUserContent(question: string): Promise<{ content: BetaContentBlockParam[]; contextLabel: string }> {
    const extra = this.extraBlocks;
    this.extraBlocks = null;
    if (extra) return { content: [...extra.blocks, { type: "text", text: question }], contextLabel: extra.label };
    const file = this.noteToggle.checked ? this.plugin.lastActiveFile() : null;
    if (!file) {
      // The agent always gets a hint what is open, so "this note" works without a tool call.
      const open = this.plugin.settings.agentEdits ? this.plugin.lastActiveFile() : null;
      const hint = open ? `<kontext>Geöffnet: ${open.path}</kontext>\n\n` : "";
      return { content: [{ type: "text", text: hint + question }], contextLabel: "" };
    }

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
      try {
        await navigator.clipboard.writeText(markdown);
        new Notice("Kopiert");
      } catch {
        new Notice("Kopieren nicht erlaubt – nutze „In Notiz einfügen“.");
      }
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

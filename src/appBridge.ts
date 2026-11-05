import { App, MarkdownView, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import { isVisualFile, listManualAttachments } from "./attachments";
import type { ClaudeResearchSettings } from "./settings";
import { searchVault } from "./vaultTools";

/**
 * Working without an API key: the plugin prepares the prompt (question, note, related notes,
 * format instructions), copies it and opens Claude (app or claude.ai). Claude runs on the
 * user's own Claude account; the answer comes back via "Antwort einfügen".
 */

const CLAUDE_URL = "https://claude.ai/new";

export interface PromptOptions {
  question: string;
  /** Note whose text is included. */
  note?: { file: TFile; text: string } | null;
  /** Ask Claude to research on the web and cite sources. */
  web: boolean;
  /** Excerpts from related notes (output of the local vault search). */
  related?: string | null;
  /** Files the user is asked to attach in Claude (handwriting, images, PDFs). */
  attachments?: string[];
  extraInstructions?: string;
}

export function buildPrompt(o: PromptOptions): string {
  const parts: string[] = [];
  parts.push("Ich arbeite mit Obsidian (Markdown-Notizen).");
  if (o.web) {
    parts.push(
      "Recherchiere dafür im Web, prüfe die Fakten und belege wichtige Aussagen mit Quellen. Liste am Ende unter „## Quellen“ alle Quellen als Markdown-Links [Titel](URL) auf.",
    );
  }
  parts.push(
    "Formatiere die Antwort als Markdown für Obsidian: Überschriften (##), Listen, Tabellen, Formeln als LaTeX ($…$). Beginne direkt mit dem Inhalt, ohne Einleitung.",
  );
  if (o.extraInstructions?.trim()) parts.push(`Hinweise zu mir: ${o.extraInstructions.trim()}`);
  if (o.attachments?.length) {
    parts.push(
      `Ich hänge ${o.attachments.length === 1 ? "eine Datei" : `${o.attachments.length} Dateien`} aus meiner Notiz an (z. B. handschriftliche Notizen): ${o.attachments
        .map((p) => p.split("/").pop())
        .join(", ")}. Lies sie sorgfältig und beziehe sie ein; Unleserliches markierst du als [unleserlich].`,
    );
  }
  if (o.note) {
    parts.push(`Meine aktuelle Notiz „${o.note.file.basename}“:\n<notiz>\n${o.note.text.trim()}\n</notiz>`);
  }
  if (o.related) {
    parts.push(`Möglicherweise passende Ausschnitte aus meinen anderen Notizen:\n<ausschnitte>\n${o.related}\n</ausschnitte>`);
  }
  parts.push(`Meine Frage:\n${o.question.trim()}`);
  return parts.join("\n\n");
}

export const TRANSCRIBE_PROMPT =
  "Transkribiere die handschriftlichen Notizen in den angehängten Bildern/PDF-Seiten in sauberes Markdown für Obsidian. " +
  "Übernimm die Struktur: Überschriften als ##-Überschriften, Aufzählungen als Listen, Pfeile als „→“, Tabellen als Markdown-Tabellen, " +
  "Formeln als LaTeX ($…$). Beschreibe Skizzen kurz als „*[Skizze: …]*“. Markiere Unleserliches als [unleserlich]. " +
  "Gib nur die Transkription aus, ohne Einleitung.";

/** Builds the prompt for `question`, gathering note text, related notes and attachments as asked. */
export async function preparePrompt(
  app: App,
  settings: ClaudeResearchSettings,
  question: string,
  opts: { file: TFile | null; includeNote: boolean; web: boolean; related: boolean },
): Promise<{ prompt: string; attachments: string[]; hints: string[] }> {
  let note: PromptOptions["note"] = null;
  let attachments: string[] = [];
  let hints: string[] = [];
  if (opts.includeNote && opts.file) {
    if (opts.file.extension === "md") note = { file: opts.file, text: await app.vault.cachedRead(opts.file) };
    const manual = await listManualAttachments(app, opts.file);
    attachments = manual.paths;
    hints = manual.hints;
  }
  let related: string | null = null;
  if (opts.related) {
    const found = await searchVault(app, question, 5);
    if (!found.startsWith("No ")) related = found;
  }
  const prompt = buildPrompt({ question, note, web: opts.web, related, attachments, extraInstructions: settings.extraInstructions });
  return { prompt, attachments, hints };
}

/** Copies the prompt and opens Claude. Shows the prompt in a dialog if copying is not allowed. */
export async function openInClaude(app: App, prompt: string, attachments: string[] = [], hints: string[] = []): Promise<void> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch {
    copied = false;
  }

  if (!copied) {
    new CopyPromptModal(app, prompt, attachments, hints).open();
    return;
  }
  const extra = attachments.length ? `\n\nIn Claude anhängen (Büroklammer/+): ${attachments.join(", ")}` : "";
  const hint = hints.length ? `\n\nHinweis: ${hints.join("; ")}` : "";
  new Notice(`Frage ist kopiert. In Claude ins Eingabefeld lange tippen → „Einfügen“ → senden.${extra}${hint}`, 15000);
  window.open(CLAUDE_URL);
}

/** Fallback when the clipboard is blocked: shows the prompt to copy by hand. */
class CopyPromptModal extends Modal {
  constructor(app: App, private prompt: string, private attachments: string[], private hints: string[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle("Frage für Claude");
    contentEl.createEl("p", { text: "Kopieren war nicht erlaubt. Markiere den Text (lange tippen → Alles auswählen → Kopieren) und öffne dann Claude." });
    const ta = contentEl.createEl("textarea", { cls: "claude-bridge-textarea" });
    ta.value = this.prompt;
    ta.rows = 12;
    ta.readOnly = true;
    if (this.attachments.length) contentEl.createEl("p", { text: `In Claude anhängen: ${this.attachments.join(", ")}` });
    if (this.hints.length) contentEl.createEl("p", { text: `Hinweis: ${this.hints.join("; ")}` });
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Claude öffnen")
        .setCta()
        .onClick(() => {
          window.open(CLAUDE_URL);
          this.close();
        }),
    );
    ta.focus();
    ta.select();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Takes Claude's answer back into the vault: pasted (or read from the clipboard) and inserted
 * at the cursor of the last note, or saved as a new research note.
 */
export class PasteAnswerModal extends Modal {
  private textarea!: HTMLTextAreaElement;

  constructor(
    app: App,
    private settings: ClaudeResearchSettings,
    private target: { view: MarkdownView | null; file: TFile | null },
    private question: string,
  ) {
    super(app);
    // Only plain Markdown notes can take the answer (never a PDF, image or drawing file).
    const writable = (f: TFile | null | undefined) => !!f && f.extension === "md" && !isVisualFile(app, f);
    this.target = {
      view: writable(target.view?.file) ? target.view : null,
      file: writable(target.file) ? target.file : null,
    };
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    this.setTitle("Claude-Antwort übernehmen");
    contentEl.createEl("p", {
      text: "In Claude unter der Antwort auf „Kopieren“ tippen, dann hier einfügen (lange tippen → Einfügen).",
    });
    this.textarea = contentEl.createEl("textarea", { cls: "claude-bridge-textarea", attr: { placeholder: "Antwort hier einfügen …" } });
    this.textarea.rows = 12;
    try {
      const clip = await navigator.clipboard.readText();
      // Only prefill if it is not our own prompt that is still in the clipboard.
      if (clip && !clip.startsWith("Ich arbeite mit Obsidian")) this.textarea.value = clip;
    } catch {
      // Reading the clipboard is often blocked on mobile; pasting by hand works.
    }

    const s = new Setting(contentEl);
    const targetName = this.target.view?.file?.basename ?? this.target.file?.basename;
    if (targetName) {
      s.addButton((b) =>
        b
          .setButtonText(`In „${targetName}“ einfügen`)
          .setCta()
          .onClick(() => void this.insertIntoNote()),
      );
    }
    s.addButton((b) => b.setButtonText("Als neue Notiz speichern").onClick(() => void this.saveAsNote()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private answer(): string | null {
    const text = this.textarea.value.trim();
    if (!text) {
      new Notice("Bitte zuerst die Antwort einfügen.");
      return null;
    }
    return text;
  }

  private async insertIntoNote(): Promise<void> {
    const text = this.answer();
    if (!text) return;
    const view = this.target.view;
    if (view?.file) {
      view.editor.replaceSelection("\n" + text + "\n");
      this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    } else if (this.target.file) {
      await this.app.vault.process(this.target.file, (data) => data.replace(/\s*$/, "") + "\n\n" + text + "\n");
    }
    new Notice("Antwort eingefügt");
    this.close();
  }

  private async saveAsNote(): Promise<void> {
    const text = this.answer();
    if (!text) return;
    const heading = /^#{1,3}\s+(.+)$/m.exec(text)?.[1];
    const title = (this.question || heading || "Recherche").replace(/[\\/:*?"<>|#^[\]\n]/g, " ").slice(0, 60).trim() || "Recherche";
    const folder = normalizePath(this.settings.saveFolder);
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const stamp = window.moment().format("YYYY-MM-DD HHmm");
    const frontmatter = ["---", "tags: [claude, recherche]", `erstellt: ${window.moment().format("YYYY-MM-DDTHH:mm")}`, "---", ""];
    const body = [...frontmatter, ...(this.question ? [`## Frage`, "", this.question, "", "## Antwort", ""] : []), text, ""].join("\n");
    const path = normalizePath(`${folder}/${stamp} ${title}.md`);
    const file = this.app.vault.getFileByPath(path) ?? (await this.app.vault.create(path, body));
    await this.app.workspace.getLeaf("tab").openFile(file);
    new Notice(`Gespeichert: ${path}`);
    this.close();
  }
}

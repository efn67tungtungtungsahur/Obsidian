import type { BetaTool, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { App, TFile, TFolder, arrayBufferToBase64, normalizePath } from "obsidian";
import { NOTEBOOK_EXTENSION, parseNotebook } from "./notebook/model";
import { canvasToBlob, renderPageImage } from "./notebook/render";
import { ensureFolder } from "./ui";

/**
 * Tools that let Claude work inside the vault like the Claude add-in works inside a PowerPoint
 * deck: look at what is open, create and edit notes, organise files and look at handwritten
 * notebook pages. Every change goes through `approve` first and can be undone.
 */

export interface PendingChange {
  kind: "create" | "edit" | "append" | "move";
  path: string;
  /** Short description for the approval card. */
  summary: string;
  /** Text shown as "before" / "after" in the preview. */
  before?: string;
  after?: string;
}

export interface AppliedChange extends PendingChange {
  /** Restores the previous state. */
  undo: () => Promise<void>;
}

export interface AgentContext {
  onStatus: (s: string) => void;
  approve: (change: PendingChange) => Promise<boolean>;
  onApplied: (change: AppliedChange) => void;
  activeFile: () => TFile | null;
  selection: () => string;
}

const strictObject = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object" as const,
  properties,
  required,
});

export const AGENT_TOOLS: BetaTool[] = [
  {
    name: "get_active_note",
    description:
      "Returns what the user currently has open in Obsidian: the file path, its full Markdown content (for notes) or a page overview (for handwriting notebooks), and the text currently selected in the editor. Call this first when the user refers to 'this note', 'here', 'my notes on this page' etc.",
    input_schema: strictObject({}, []),
    eager_input_streaming: true,
  },
  {
    name: "list_folder",
    description: "Lists the folders and files in a vault folder (use '' for the vault root). Use it to find where things belong before creating or moving notes.",
    input_schema: strictObject({ path: { type: "string", description: "Folder path, '' for the root." } }, []),
    eager_input_streaming: true,
  },
  {
    name: "create_note",
    description:
      "Creates a new Markdown note. The user must approve it. Use clear titles, put it into a fitting folder, and link related notes with [[Note name]]. Fails if the path already exists.",
    input_schema: strictObject(
      {
        path: { type: "string", description: "Vault path ending in .md, e.g. 'Uni/Biologie/Zellatmung.md'." },
        content: { type: "string", description: "Full Markdown content." },
      },
      ["path", "content"],
    ),
    eager_input_streaming: true,
  },
  {
    name: "edit_note",
    description:
      "Replaces one exact passage in an existing note (like a find-and-replace of a unique snippet). old_text must appear exactly once in the note; include enough surrounding text to make it unique. The user must approve the change. Read the note first.",
    input_schema: strictObject(
      {
        path: { type: "string" },
        old_text: { type: "string", description: "Exact existing text to replace (must be unique in the note)." },
        new_text: { type: "string", description: "Replacement text." },
      },
      ["path", "old_text", "new_text"],
    ),
    eager_input_streaming: true,
  },
  {
    name: "append_to_note",
    description: "Appends Markdown to the end of an existing note (e.g. a summary, flashcards, a research section). The user must approve it.",
    input_schema: strictObject({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
    eager_input_streaming: true,
  },
  {
    name: "move_note",
    description: "Moves or renames a note, notebook or file; links to it are updated automatically. The user must approve it.",
    input_schema: strictObject({ path: { type: "string" }, new_path: { type: "string" } }, ["path", "new_path"]),
    eager_input_streaming: true,
  },
  {
    name: "view_notebook_page",
    description:
      "Shows one page of a handwriting notebook (.notizbuch) as an image, plus its existing transcript if any. Use it to read handwriting, sketches and formulas.",
    input_schema: strictObject(
      { path: { type: "string", description: "Path of the .notizbuch file." }, page: { type: "integer", description: "1-based page number." } },
      ["path", "page"],
    ),
    eager_input_streaming: true,
  },
];

const AGENT_TOOL_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));

export function isAgentTool(name: string): boolean {
  return AGENT_TOOL_NAMES.has(name);
}

type ToolOutput = Omit<BetaToolResultBlockParam, "type" | "tool_use_id">;

const err = (content: string): ToolOutput => ({ content, is_error: true });
const str = (v: unknown): v is string => typeof v === "string";

function preview(text: string, max = 1200): string {
  return text.length > max ? text.slice(0, max) + "\n…" : text;
}

export async function runAgentTool(app: App, name: string, rawInput: unknown, ctx: AgentContext): Promise<ToolOutput> {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "get_active_note":
        return await getActive(app, ctx);
      case "list_folder":
        return listFolder(app, str(input.path) ? input.path : "");
      case "create_note": {
        if (!str(input.path) || !str(input.content)) return err("Invalid input: path and content must be strings.");
        let path = normalizePath(input.path.trim());
        if (!path.endsWith(".md")) path += ".md";
        if (app.vault.getAbstractFileByPath(path)) return err(`${path} already exists. Use edit_note or append_to_note, or choose another path.`);
        const content = input.content;
        if (!(await ctx.approve({ kind: "create", path, summary: `Neue Notiz „${path}“ anlegen`, after: preview(content) }))) return declined();
        const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        if (parent) await ensureFolder(app, parent);
        const file = await app.vault.create(path, content);
        ctx.onApplied({ kind: "create", path, summary: `Angelegt: ${path}`, undo: () => app.fileManager.trashFile(file) });
        return { content: `Created ${path}.` };
      }
      case "edit_note": {
        if (!str(input.path) || !str(input.old_text) || !str(input.new_text)) return err("Invalid input: path, old_text and new_text must be strings.");
        const file = resolveNote(app, input.path);
        if (!file) return err(`Note not found: ${input.path}`);
        const oldText = input.old_text;
        const newText = input.new_text;
        if (!oldText) return err("old_text must not be empty. Use append_to_note to add text.");
        const content = await app.vault.read(file);
        const count = content.split(oldText).length - 1;
        if (count === 0) return err("old_text was not found in the note. Read the note again (get_active_note or read_note) and copy the passage exactly.");
        if (count > 1) return err(`old_text occurs ${count} times. Include more surrounding text so it is unique.`);
        if (!(await ctx.approve({ kind: "edit", path: file.path, summary: `„${file.basename}“ ändern`, before: preview(oldText), after: preview(newText) }))) return declined();
        let previous = "";
        await app.vault.process(file, (data) => {
          previous = data;
          return data.replace(oldText, () => newText);
        });
        ctx.onApplied({ kind: "edit", path: file.path, summary: `Geändert: ${file.basename}`, undo: () => app.vault.modify(file, previous) });
        return { content: `Edited ${file.path}.` };
      }
      case "append_to_note": {
        if (!str(input.path) || !str(input.content)) return err("Invalid input: path and content must be strings.");
        const file = resolveNote(app, input.path);
        if (!file) return err(`Note not found: ${input.path}`);
        const addition = input.content;
        if (!(await ctx.approve({ kind: "append", path: file.path, summary: `Text an „${file.basename}“ anhängen`, after: preview(addition) }))) return declined();
        let previous = "";
        await app.vault.process(file, (data) => {
          previous = data;
          return data.replace(/\s*$/, "") + "\n\n" + addition.trim() + "\n";
        });
        ctx.onApplied({ kind: "append", path: file.path, summary: `Ergänzt: ${file.basename}`, undo: () => app.vault.modify(file, previous) });
        return { content: `Appended to ${file.path}.` };
      }
      case "move_note": {
        if (!str(input.path) || !str(input.new_path)) return err("Invalid input: path and new_path must be strings.");
        const file = app.vault.getAbstractFileByPath(normalizePath(input.path)) ?? resolveNote(app, input.path);
        if (!file) return err(`Not found: ${input.path}`);
        const target = normalizePath(input.new_path.trim());
        if (app.vault.getAbstractFileByPath(target)) return err(`${target} already exists.`);
        const from = file.path;
        if (!(await ctx.approve({ kind: "move", path: from, summary: `„${from}“ verschieben nach „${target}“` }))) return declined();
        const parent = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
        if (parent) await ensureFolder(app, parent);
        await app.fileManager.renameFile(file, target);
        ctx.onApplied({ kind: "move", path: target, summary: `Verschoben: ${from} → ${target}`, undo: () => app.fileManager.renameFile(file, from) });
        return { content: `Moved ${from} to ${target}.` };
      }
      case "view_notebook_page": {
        if (!str(input.path) || typeof input.page !== "number") return err("Invalid input: path (string) and page (integer) are required.");
        const file = app.vault.getFileByPath(normalizePath(input.path));
        if (!file || file.extension !== NOTEBOOK_EXTENSION) return err(`Not a notebook: ${input.path}`);
        const nb = parseNotebook(await app.vault.read(file));
        const index = Math.floor(input.page) - 1;
        const page = nb.pages[index];
        if (!page) return err(`The notebook has ${nb.pages.length} pages.`);
        ctx.onStatus(`Sieht sich Seite ${index + 1} von „${file.basename}“ an`);
        const canvas = await renderPageImage(app, page, nb.paper, 1400);
        const blob = await canvasToBlob(canvas, "image/png");
        const data = arrayBufferToBase64(await blob.arrayBuffer());
        return {
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data } },
            { type: "text", text: `Page ${index + 1} of ${nb.pages.length}.${page.transcript ? `\nExisting transcript:\n${page.transcript}` : ""}` },
          ],
        };
      }
    }
    return err(`Unknown tool: ${name}`);
  } catch (e) {
    return err(`Tool failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function declined(): ToolOutput {
  return { content: "The user declined this change. Do not retry it unchanged; ask what they would like instead.", is_error: true };
}

function resolveNote(app: App, path: string): TFile | null {
  const norm = normalizePath(path.trim());
  const direct = app.vault.getFileByPath(norm) ?? app.vault.getFileByPath(norm + ".md");
  if (direct && direct.extension === "md") return direct;
  const linked = app.metadataCache.getFirstLinkpathDest(norm.replace(/\.md$/i, ""), "");
  return linked && linked.extension === "md" ? linked : null;
}

async function getActive(app: App, ctx: AgentContext): Promise<ToolOutput> {
  const file = ctx.activeFile();
  if (!file) return { content: "No file is open." };
  if (file.extension === "md") {
    const text = await app.vault.read(file);
    const sel = ctx.selection();
    return { content: `Path: ${file.path}\n${sel ? `Selected text:\n<selection>\n${sel}\n</selection>\n` : ""}\n<note>\n${text}\n</note>` };
  }
  if (file.extension === NOTEBOOK_EXTENSION) {
    const nb = parseNotebook(await app.vault.read(file));
    const lines = nb.pages.map((p, i) => `- Page ${i + 1}: ${p.elements.length} elements${p.bg ? " (PDF background)" : ""}${p.transcript ? ", transcript: " + p.transcript.slice(0, 160).replace(/\n/g, " ") : ""}`);
    return { content: `Handwriting notebook: ${file.path}\n${nb.pages.length} pages:\n${lines.join("\n")}\nUse view_notebook_page to look at a page.` };
  }
  return { content: `Open file: ${file.path} (type ${file.extension}, not text).` };
}

function listFolder(app: App, path: string): ToolOutput {
  const folder = path.trim() ? app.vault.getFolderByPath(normalizePath(path.trim())) : app.vault.getRoot();
  if (!(folder instanceof TFolder)) return err(`Folder not found: ${path}`);
  const lines = folder.children
    .filter((c) => !c.name.startsWith("."))
    .sort((a, b) => Number(b instanceof TFolder) - Number(a instanceof TFolder) || a.name.localeCompare(b.name))
    .map((c) => (c instanceof TFolder ? `[folder] ${c.path}/` : `${c.path}`));
  return { content: lines.length ? lines.join("\n") : "(empty folder)" };
}

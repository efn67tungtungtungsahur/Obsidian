import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { App, TFile } from "obsidian";

/** Characters returned per read_note call; longer notes are paged with `offset`. */
const READ_CHUNK = 40000;
const SNIPPET_RADIUS = 160;

/**
 * Read-only tools that let Claude look things up in the user's vault.
 * They run locally through Obsidian's API and cannot leave the vault or modify files.
 */
export const VAULT_TOOLS: BetaTool[] = [
  {
    name: "search_vault",
    description:
      "Search the user's Obsidian notes by keywords (matches file names and note contents). " +
      "Returns the best-matching notes with their path and a text snippet. Use it whenever the " +
      "question might relate to the user's own notes, lecture notes, or earlier research. " +
      "Use a few distinctive keywords rather than a full sentence; try synonyms if nothing is found.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords separated by spaces, e.g. 'Photosynthese Chlorophyll'." },
        limit: { type: "integer", description: "Maximum number of results (1-20, default 8)." },
      },
      required: ["query"],
    },
    eager_input_streaming: true,
  },
  {
    name: "read_note",
    description:
      "Read the full Markdown content of one note from the user's vault, by its path as returned by " +
      "search_vault (or by note name). Long notes are returned in chunks; call again with the given " +
      "offset to continue reading.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault path such as 'Uni/Biologie/Zelle.md', or a note name." },
        offset: { type: "integer", description: "Character offset to continue reading from (default 0)." },
      },
      required: ["path"],
    },
    eager_input_streaming: true,
  },
];

export function isVaultTool(name: string): boolean {
  return name === "search_vault" || name === "read_note";
}

interface ToolOutput {
  content: string;
  is_error?: boolean;
}

/**
 * Runs a vault tool. Inputs come from the model (and, with eager input streaming, from a
 * tolerant parser), so they are validated here before use.
 */
export async function runVaultTool(app: App, name: string, rawInput: unknown, onStatus: (s: string) => void): Promise<ToolOutput> {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Record<string, unknown>;
  try {
    if (name === "search_vault") {
      if (typeof input.query !== "string" || !input.query.trim()) {
        return { content: "Invalid input: 'query' must be a non-empty string.", is_error: true };
      }
      const limit = clampInt(input.limit, 1, 20, 8);
      onStatus(`Durchsucht Notizen: „${input.query}“`);
      return { content: await searchVault(app, input.query, limit) };
    }
    if (name === "read_note") {
      if (typeof input.path !== "string" || !input.path.trim()) {
        return { content: "Invalid input: 'path' must be a non-empty string.", is_error: true };
      }
      const offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
      return await readNote(app, input.path.trim(), offset, onStatus);
    }
    return { content: `Unknown tool: ${name}`, is_error: true };
  } catch (err) {
    return { content: `Tool failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function tokenize(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[\s,;:!?"'„“()[\]{}]+/)
    .filter((w) => w.length >= 2);
  return [...new Set(words)];
}

function countOccurrences(haystack: string, needle: string, cap: number): number {
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1 && count < cap) {
    count++;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}

/** Keyword search: every query word that occurs counts, title hits weigh more. */
async function searchVault(app: App, query: string, limit: number): Promise<string> {
  const words = tokenize(query);
  if (!words.length) return "No usable keywords in the query.";

  const hits: { file: TFile; score: number; snippet: string }[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const content = await app.vault.cachedRead(file);
    const lowerContent = content.toLowerCase();
    const lowerPath = file.path.toLowerCase();

    let score = 0;
    let matchedWords = 0;
    let firstPos = -1;
    for (const w of words) {
      const inTitle = lowerPath.includes(w);
      const inBody = countOccurrences(lowerContent, w, 20);
      if (inTitle || inBody) matchedWords++;
      score += (inTitle ? 10 : 0) + inBody;
      if (inBody) {
        const pos = lowerContent.indexOf(w);
        if (firstPos === -1 || pos < firstPos) firstPos = pos;
      }
    }
    if (!matchedWords) continue;
    // Notes that contain more of the distinct query words rank clearly higher.
    score += matchedWords * matchedWords * 5;
    hits.push({ file, score, snippet: makeSnippet(content, firstPos) });
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, limit);
  if (!top.length) return `No notes found for: ${words.join(", ")}`;

  return top
    .map((h, i) => {
      const tags = app.metadataCache.getFileCache(h.file)?.frontmatter?.tags;
      const tagLine = tags ? `\n   tags: ${Array.isArray(tags) ? tags.join(", ") : String(tags)}` : "";
      return `${i + 1}. ${h.file.path} (modified ${new Date(h.file.stat.mtime).toISOString().slice(0, 10)})${tagLine}\n   …${h.snippet}…`;
    })
    .join("\n\n");
}

function makeSnippet(content: string, pos: number): string {
  if (pos < 0) return content.slice(0, SNIPPET_RADIUS * 2).replace(/\s+/g, " ").trim();
  const start = Math.max(0, pos - SNIPPET_RADIUS);
  return content.slice(start, pos + SNIPPET_RADIUS).replace(/\s+/g, " ").trim();
}

async function readNote(app: App, path: string, offset: number, onStatus: (s: string) => void): Promise<ToolOutput> {
  let file: TFile | null = app.vault.getFileByPath(path);
  if (!file) file = app.metadataCache.getFirstLinkpathDest(path.replace(/\.md$/i, ""), "");
  if (!file) return { content: `Note not found: ${path}. Use search_vault to find the exact path.`, is_error: true };
  if (file.extension !== "md") {
    return { content: `${file.path} is not a Markdown note (type: ${file.extension}); it cannot be read as text.`, is_error: true };
  }

  onStatus(`Liest Notiz: ${file.basename}`);
  const content = await app.vault.cachedRead(file);
  const chunk = content.slice(offset, offset + READ_CHUNK);
  const end = offset + chunk.length;
  const header = `Path: ${file.path}\nCharacters ${offset}-${end} of ${content.length}\n\n`;
  const more = end < content.length ? `\n\n[Note continues - call read_note with offset=${end} to read on.]` : "";
  return { content: header + chunk + more };
}

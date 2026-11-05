import assert from "node:assert/strict";
import { Conversation, renderAnswer, describeError } from "../src/claude";
import { collectAttachments } from "../src/attachments";
import { DEFAULT_SETTINGS } from "../src/settings";
import { TFile } from "obsidian";

// ---------- fake vault ----------
const files = [
  new TFile("Uni/Biologie/Photosynthese.md", "# Photosynthese\nChlorophyll absorbiert Licht. Lichtreaktion und Calvin-Zyklus."),
  new TFile("Rezepte/Kuchen.md", "Mehl, Zucker, Eier."),
];
const app = {
  vault: {
    getName: () => "TestVault",
    getMarkdownFiles: () => files,
    cachedRead: async (f: TFile) => f.content,
    getFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
  },
  metadataCache: {
    getFileCache: () => ({ frontmatter: { tags: ["bio"] } }),
    getFirstLinkpathDest: (p: string) => files.find((f) => f.basename === p) ?? null,
  },
} as any;

// ---------- SSE helpers ----------
type Block = Record<string, any>;
function sse(content: Block[], stop_reason: string): string {
  const ev: any[] = [];
  ev.push({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  content.forEach((b, index) => {
    if (b.type === "text") {
      ev.push({ type: "content_block_start", index, content_block: { type: "text", text: "", citations: null } });
      ev.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } });
      for (const c of b.citations ?? []) ev.push({ type: "content_block_delta", index, delta: { type: "citations_delta", citation: c } });
    } else if (b.type === "tool_use" || b.type === "server_tool_use") {
      ev.push({ type: "content_block_start", index, content_block: { ...b, input: {} } });
      ev.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    } else {
      ev.push({ type: "content_block_start", index, content_block: b });
    }
    ev.push({ type: "content_block_stop", index });
  });
  ev.push({ type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } });
  ev.push({ type: "message_stop" });
  return ev.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

const requests: { headers: Headers; body: any; url?: string }[] = [];
let script: string[] = [];
(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
  // Snapshot the body: the SDK passes the live messages array, which the conversation mutates later.
  requests.push({ headers: new Headers(init.headers as HeadersInit), body: JSON.parse(init.body as string) });
  const payload = script.shift();
  if (!payload) throw new Error("no scripted response left");
  return new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
};

const cb = (log: string[]) => ({ onText: () => {}, onStatus: (s: string) => log.push(s) });

async function main() {
  // 1) renderAnswer: citations -> numbered links + source list
  const md = renderAnswer([
    { type: "text", text: "Chlorophyll absorbiert rotes und blaues Licht.", citations: [
      { type: "web_search_result_location", url: "https://de.wikipedia.org/wiki/Chlorophyll", title: "Chlorophyll – Wikipedia", cited_text: "x", encrypted_index: "e" },
    ] },
    { type: "text", text: " Mehr dazu [hier].", citations: null },
  ] as any);
  assert.match(md, /Licht\. \(\[1\]\(https:\/\/de\.wikipedia\.org\/wiki\/Chlorophyll\)\)/);
  assert.match(md, /\*\*Quellen\*\*\n1\. \[Chlorophyll – Wikipedia\]\(https:\/\/de\.wikipedia\.org\/wiki\/Chlorophyll\)/);
  console.log("ok renderAnswer");

  // 2) Tool loop: search_vault -> read_note -> web search + pause_turn -> final answer
  const conv = new Conversation(app, { ...DEFAULT_SETTINGS }, () => "sk-test", { web: true });
  script = [
    sse([{ type: "tool_use", id: "tu_1", name: "search_vault", input: { query: "Photosynthese Chlorophyll" } }], "tool_use"),
    sse([{ type: "tool_use", id: "tu_2", name: "read_note", input: { path: "Uni/Biologie/Photosynthese.md" } }], "tool_use"),
    sse([{ type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "Chlorophyll Absorption" } }], "pause_turn"),
    sse([{ type: "text", text: "Laut deiner Notiz und dem Web: Licht.", citations: [
      { type: "web_search_result_location", url: "https://example.org/a b(c)", title: "Quelle [A]", cited_text: "x", encrypted_index: "e" },
    ] }], "end_turn"),
  ];
  const log: string[] = [];
  const res = await conv.send([{ type: "text", text: "Was weiß ich über Photosynthese?" }], cb(log));
  assert.equal(res.outcome, "done");
  assert.equal(requests.length, 4);

  const first = requests[0];
  assert.equal(first.body.model, "claude-opus-5-5");
  assert.deepEqual(first.body.thinking, { type: "adaptive" });
  assert.deepEqual(first.body.output_config, { effort: "high" });
  assert.equal(first.body.fallbacks, "default");
  assert.deepEqual(first.body.cache_control, { type: "ephemeral" });
  assert.equal(first.body.stream, true);
  assert.match(first.headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
  assert.equal(first.headers.get("anthropic-dangerous-direct-browser-access"), "true");
  assert.deepEqual(first.body.tools.map((t: any) => t.name), ["web_search", "web_fetch", "search_vault", "read_note"]);
  assert.equal(first.body.tools[0].type, "web_search_20260209");
  assert.equal(first.body.tools[0].max_uses, 5);
  assert.ok(!("betas" in first.body), "betas must go in the header, not the body");

  // tool_result for search_vault went back with the matching id and found the note
  const second = requests[1].body.messages;
  const tr = second[second.length - 1].content[0];
  assert.equal(tr.type, "tool_result");
  assert.equal(tr.tool_use_id, "tu_1");
  assert.match(tr.content, /1\. Uni\/Biologie\/Photosynthese\.md/);
  assert.ok(!tr.content.includes("Kuchen"), "unrelated note must not match");

  const third = requests[2].body.messages;
  assert.match(third[third.length - 1].content[0].content, /Calvin-Zyklus/);

  // pause_turn: the 4th request ends with the paused assistant turn, no extra user message
  const fourth = requests[3].body.messages;
  assert.equal(fourth[fourth.length - 1].role, "assistant");
  assert.equal(fourth[fourth.length - 1].content[0].type, "server_tool_use");

  assert.deepEqual(log, ["Durchsucht Notizen: „Photosynthese Chlorophyll“", "Liest Notiz: Photosynthese", "Web-Suche: „Chlorophyll Absorption“"]);
  assert.match(res.markdown, /\(\[1\]\(https:\/\/example\.org\/a%20b%28c%29\)\)/);
  assert.match(res.markdown, /1\. \[Quelle \\\[A\\\]\]/);
  // user, (assistant, user)x2, assistant(paused), assistant(final)
  assert.equal(conv.messages.length, 7);
  console.log("ok tool loop + pause_turn + request shape");

  // 3) Refusal rolls the whole turn back
  script = [sse([], "refusal")];
  const before = conv.messages.length;
  const refused = await conv.send([{ type: "text", text: "..." }], cb([]));
  assert.equal(refused.outcome, "refused");
  assert.equal(conv.messages.length, before);
  console.log("ok refusal rollback");

  // 4) Haiku: no fallbacks/beta header, basic web tool versions
  requests.length = 0;
  const haiku = new Conversation(app, { ...DEFAULT_SETTINGS, model: "claude-haiku-5-5" }, () => "sk-test", { web: true });
  script = [sse([{ type: "text", text: "Hi" }], "end_turn")];
  await haiku.send([{ type: "text", text: "Hallo" }], cb([]));
  assert.ok(!("fallbacks" in requests[0].body));
  assert.equal(requests[0].headers.get("anthropic-beta"), null);
  assert.equal(requests[0].body.tools[0].type, "web_search_20250305");
  console.log("ok haiku request shape");

  // 5) Invalid tool input is reported as an error result, not executed
  requests.length = 0;
  const conv2 = new Conversation(app, { ...DEFAULT_SETTINGS, webSearch: false }, () => "sk-test", { web: false });
  script = [
    sse([{ type: "tool_use", id: "tu_x", name: "search_vault", input: { query: 42 } }], "tool_use"),
    sse([{ type: "text", text: "ok" }], "end_turn"),
  ];
  await conv2.send([{ type: "text", text: "x" }], cb([]));
  const errResult = requests[1].body.messages.at(-1).content[0];
  assert.equal(errResult.is_error, true);
  assert.deepEqual(requests[0].body.tools.map((t: any) => t.name), ["search_vault", "read_note"]);
  console.log("ok input validation");

  // 6) Missing key -> clear error, history untouched
  const noKey = new Conversation(app, { ...DEFAULT_SETTINGS }, () => null, { web: true });
  await assert.rejects(noKey.send([{ type: "text", text: "x" }], cb([])), /API-Schlüssel/);
  assert.equal(noKey.messages.length, 0);
  console.log("ok missing key");

  // 7) Handwriting collection: image, PDF, Excalidraw (auto-exported PNG), Ink block
  const ink = new TFile("Ink/Writing/notiz.writing", JSON.stringify({ previewUri: "data:image/png;base64," + Buffer.from("PNGDATA").toString("base64") }));
  const vfiles = [
    new TFile("Mitschrift.md", "Text\n```handwritten-ink\n{\"versionAtEmbed\": \"0.3\", \"filepath\": \"Ink/Writing/notiz.writing\"}\n```\n"),
    new TFile("Bilder/tafel.jpg", "JPEGDATA"),
    new TFile("GoodNotes/Vorlesung 3.pdf", "%PDF-1.7"),
    new TFile("Zeichnungen/Skizze.excalidraw.md", "excalidraw"),
    new TFile("Zeichnungen/Skizze.excalidraw.png", "EXPNG"),
    new TFile("Zeichnungen/Ohne Export.excalidraw.md", "excalidraw"),
    ink,
  ];
  const byPath = (p: string) => vfiles.find((f) => f.path === p) ?? null;
  const vapp = {
    vault: {
      getFileByPath: byPath,
      cachedRead: async (f: TFile) => f.content,
      read: async (f: TFile) => f.content,
      readBinary: async (f: TFile) => new TextEncoder().encode(f.content).buffer,
    },
    metadataCache: {
      getFileCache: (f: TFile) =>
        f.path === "Mitschrift.md"
          ? { embeds: [{ link: "tafel.jpg" }, { link: "Vorlesung 3.pdf#page=2" }, { link: "Skizze.excalidraw|400" }, { link: "Ohne Export.excalidraw" }] }
          : {},
      getFirstLinkpathDest: (link: string) => vfiles.find((f) => f.name === link || f.basename === link || f.name === link + ".md") ?? null,
    },
  } as any;
  const got = await collectAttachments(vapp, vfiles[0]);
  assert.deepEqual(got.labels, ["tafel.jpg", "Vorlesung 3.pdf", "Skizze.excalidraw.md", "notiz.writing"]);
  assert.equal(got.skipped.length, 1);
  assert.match(got.skipped[0], /Ohne Export.*Auto-export PNG/);
  assert.deepEqual(got.blocks.map((b: any) => b.type + ":" + (b.source.media_type)), ["image:image/jpeg", "document:application/pdf", "image:image/png", "image:image/png"]);
  assert.equal(Buffer.from((got.blocks[2] as any).source.data, "base64").toString(), "EXPNG");
  assert.equal(Buffer.from((got.blocks[3] as any).source.data, "base64").toString(), "PNGDATA");
  // A drawing opened directly is collected itself
  const direct = await collectAttachments(vapp, vfiles[3]);
  assert.deepEqual(direct.labels, ["Skizze.excalidraw.md"]);
  console.log("ok handwriting collection");

  // 8) Mobile: the web view blocks fetch (TypeError) -> automatic switch to requestUrl
  requests.length = 0;
  let requestUrlCalls = 0;
  let nextStatus = 200;
  (globalThis as any).__requestUrl = async (p: any) => {
    requestUrlCalls++;
    requests.push({ headers: new Headers(p.headers), body: JSON.parse(p.body), url: p.url });
    if (nextStatus !== 200) {
      const err = JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
      return { status: nextStatus, headers: { "content-type": "application/json" }, arrayBuffer: new TextEncoder().encode(err).buffer };
    }
    return { status: 200, headers: { "content-type": "text/event-stream" }, arrayBuffer: new TextEncoder().encode(script.shift()!).buffer };
  };
  let fetchCalls = 0;
  (globalThis as any).fetch = async () => {
    fetchCalls++;
    throw new TypeError("Failed to fetch");
  };
  const mobile = new Conversation(app, { ...DEFAULT_SETTINGS, connectionMode: "auto" }, () => "sk-tab", { web: false });
  script = [sse([{ type: "text", text: "Hallo vom Tablet" }], "end_turn"), sse([{ type: "text", text: "Zweite Antwort" }], "end_turn")];
  const m1 = await mobile.send([{ type: "text", text: "Hallo" }], cb([]));
  assert.equal(m1.markdown, "Hallo vom Tablet");
  assert.equal(fetchCalls, 1);
  assert.equal(requestUrlCalls, 1);
  assert.equal(requests[0].headers.get("authorization"), "Bearer sk-tab");
  assert.equal(requests[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(requests[0].body.stream, true);
  const m2 = await mobile.send([{ type: "text", text: "Nochmal" }], cb([]));
  assert.equal(m2.markdown, "Zweite Antwort");
  assert.equal(fetchCalls, 1, "after the first failure fetch is not tried again");
  assert.equal(requestUrlCalls, 2);
  // API errors keep their typed SDK error in compat mode
  nextStatus = 401;
  const before8 = mobile.messages.length;
  const authErr = await mobile.send([{ type: "text", text: "x" }], cb([])).catch((e) => e);
  assert.match(describeError(authErr), /API-Schlüssel ist ungültig/);
  assert.equal(mobile.messages.length, before8);
  console.log("ok mobile compat fallback");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

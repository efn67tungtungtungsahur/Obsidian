import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type ClaudeResearchPlugin from "./main";
import type { ConnectionMode } from "./http";

export type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type TranscriptionStyle = "clean" | "verbatim";
/** "app": no API key, the Claude app answers; "api": Claude runs inside Obsidian via the API. */
export type ClaudeMode = "app" | "api";

export interface ClaudeResearchSettings {
  mode: ClaudeMode;
  /** ID of the API key inside Obsidian's SecretStorage (the key itself is not stored in data.json). */
  apiKeySecret: string;
  /** Only used where Obsidian offers no SecretStorage; stored in the plugin's data.json. */
  apiKeyPlain: string;
  connectionMode: ConnectionMode;
  model: ModelId;
  effort: Effort;
  webSearch: boolean;
  maxWebSearches: number;
  vaultTools: boolean;
  includeNoteByDefault: boolean;
  saveFolder: string;
  transcriptionStyle: TranscriptionStyle;
  extraInstructions: string;
}

export const DEFAULT_SETTINGS: ClaudeResearchSettings = {
  mode: "app",
  apiKeySecret: "anthropic-api-key",
  apiKeyPlain: "",
  connectionMode: "auto",
  model: "claude-opus-5-5",
  effort: "high",
  webSearch: true,
  maxWebSearches: 5,
  vaultTools: true,
  includeNoteByDefault: false,
  saveFolder: "Claude-Recherche",
  transcriptionStyle: "clean",
  extraInstructions: "",
};

const MODEL_LABELS: Record<ModelId, string> = {
  "claude-opus-5-5": "Claude Opus 5.5 – beste Qualität (Standard)",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 – schneller, günstiger",
  "claude-haiku-5-5": "Claude Haiku 5.5 – am schnellsten, am günstigsten",
};

const EFFORT_LABELS: Record<Effort, string> = {
  low: "Niedrig – schnelle, kurze Antworten",
  medium: "Mittel",
  high: "Hoch – gründlich (empfohlen für Recherche)",
  xhigh: "Sehr hoch",
  max: "Maximal – am gründlichsten, am teuersten",
};

export class ClaudeResearchSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ClaudeResearchPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl).setName("Verbindung zu Claude").setHeading();

    new Setting(containerEl)
      .setName("Modus")
      .setDesc(
        s.mode === "app"
          ? "Ohne API: Das Plugin bereitet deine Frage samt Notiz vor, kopiert sie und öffnet die Claude-App bzw. claude.ai. Dort antwortet Claude mit deinem eigenen Konto (kostenlos oder Abo). Die Antwort übernimmst du mit „Antwort einfügen“."
          : "Mit API: Claude arbeitet direkt in Obsidian (Chat, Web-Suche, Notizsuche, Transkription). Braucht einen API-Schlüssel und wird pro Nutzung abgerechnet – unabhängig von einem Claude-Abo.",
      )
      .addDropdown((dd) =>
        dd
          .addOption("app", "Ohne API – über die Claude-App (empfohlen)")
          .addOption("api", "Mit API-Schlüssel – direkt in Obsidian")
          .setValue(s.mode)
          .onChange(async (value) => {
            s.mode = value as ClaudeMode;
            await save();
            this.plugin.refreshViews();
            this.display();
          }),
      );

    if (s.mode === "api") {
      new Setting(containerEl).setName("Zugang").setHeading();

      const keySetting = new Setting(containerEl).setName("Anthropic-API-Schlüssel");
      if (this.plugin.hasSecretStorage()) {
        keySetting
          .setDesc(
            "Erstelle einen Schlüssel unter console.anthropic.com → API Keys (geht auch im Browser des Tablets). Er wird im Schlüsselspeicher von Obsidian abgelegt, nicht in den Plugin-Daten deines Vaults.",
          )
          .addComponent((el) =>
            new SecretComponent(this.app, el).setValue(s.apiKeySecret).onChange(async (value) => {
              s.apiKeySecret = value ?? "";
              await save();
            }),
          );
      } else {
        keySetting
          .setDesc(
            "Erstelle einen Schlüssel unter console.anthropic.com → API Keys. Diese Obsidian-Version hat keinen Schlüsselspeicher, daher liegt der Schlüssel in den Plugin-Daten (data.json) deines Vaults – teile den Vault-Ordner nicht mit anderen.",
          )
          .addText((text) => {
            text.inputEl.type = "password";
            text
              .setPlaceholder("sk-ant-…")
              .setValue(s.apiKeyPlain)
              .onChange(async (value) => {
                s.apiKeyPlain = value.trim();
                await save();
              });
          });
      }

      new Setting(containerEl)
        .setName("Verbindung")
        .setDesc(
          "„Automatisch“ zeigt Antworten live Wort für Wort und wechselt selbst in den kompatiblen Modus, falls das Tablet/Handy die Verbindung blockiert. Kommt im Chat „Keine Verbindung“, obwohl Internet da ist: „Kompatibel“ wählen.",
        )
        .addDropdown((dd) =>
          dd
            .addOption("auto", "Automatisch (empfohlen)")
            .addOption("stream", "Live-Streaming")
            .addOption("compat", "Kompatibel – Antwort erscheint am Stück")
            .setValue(s.connectionMode)
            .onChange(async (value) => {
              s.connectionMode = value as ConnectionMode;
              await save();
            }),
        );

      new Setting(containerEl).setName("Modell").setHeading();

      new Setting(containerEl)
        .setName("Modell")
        .setDesc("Welches Claude-Modell antwortet.")
        .addDropdown((dd) => {
          for (const [id, label] of Object.entries(MODEL_LABELS)) dd.addOption(id, label);
          dd.setValue(s.model).onChange(async (value) => {
            s.model = value as ModelId;
            await save();
          });
        });

      new Setting(containerEl)
        .setName("Gründlichkeit (Effort)")
        .setDesc("Wie viel Claude nachdenkt. Mehr Gründlichkeit dauert länger und kostet mehr Tokens.")
        .addDropdown((dd) => {
          for (const [id, label] of Object.entries(EFFORT_LABELS)) dd.addOption(id, label);
          dd.setValue(s.effort).onChange(async (value) => {
            s.effort = value as Effort;
            await save();
          });
        });
    }

    new Setting(containerEl).setName("Recherche").setHeading();

    new Setting(containerEl)
      .setName(s.mode === "app" ? "Web-Recherche standardmäßig anhaken" : "Web-Suche")
      .setDesc(
        s.mode === "app"
          ? "Bittet Claude, im Web zu recherchieren und Quellen anzugeben. In der Claude-App muss dafür die Websuche eingeschaltet sein."
          : "Claude darf im Internet suchen und Webseiten lesen. Antworten enthalten dann Quellenangaben.",
      )
      .addToggle((t) =>
        t.setValue(s.webSearch).onChange(async (value) => {
          s.webSearch = value;
          await save();
        }),
      );

    if (s.mode === "api") {
      new Setting(containerEl)
        .setName("Maximale Web-Suchen pro Frage")
        .setDesc("Begrenzt die Kosten. Web-Suchen werden zusätzlich zu den Tokens abgerechnet.")
        .addSlider((sl) =>
          sl
            .setLimits(1, 20, 1)
            .setValue(s.maxWebSearches)
            .setDynamicTooltip()
            .onChange(async (value) => {
              s.maxWebSearches = value;
              await save();
            }),
        );

      new Setting(containerEl)
        .setName("In Notizen suchen")
        .setDesc("Claude darf deine Notizen durchsuchen und lesen (nur lesen, nie ändern).")
        .addToggle((t) =>
          t.setValue(s.vaultTools).onChange(async (value) => {
            s.vaultTools = value;
            await save();
          }),
        );
    }

    new Setting(containerEl)
      .setName("Aktuelle Notiz standardmäßig mitschicken")
      .setDesc("Text und eingebettete Bilder/Handschrift der offenen Notiz werden der Frage angehängt.")
      .addToggle((t) =>
        t.setValue(s.includeNoteByDefault).onChange(async (value) => {
          s.includeNoteByDefault = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName("Ordner für gespeicherte Recherchen")
      .addText((text) =>
        text
          .setPlaceholder("Claude-Recherche")
          .setValue(s.saveFolder)
          .onChange(async (value) => {
            s.saveFolder = value.trim() || DEFAULT_SETTINGS.saveFolder;
            await save();
          }),
      );

    if (s.mode === "api") {
      new Setting(containerEl).setName("Handschrift").setHeading();

      new Setting(containerEl)
        .setName("Transkriptionsstil")
        .addDropdown((dd) =>
          dd
            .addOption("clean", "Aufgeräumt – Markdown mit Überschriften, Listen, LaTeX")
            .addOption("verbatim", "Wortgetreu – Zeile für Zeile wie geschrieben")
            .setValue(s.transcriptionStyle)
            .onChange(async (value) => {
              s.transcriptionStyle = value as TranscriptionStyle;
              await save();
            }),
        );
    }

    new Setting(containerEl).setName("Persönliche Anweisungen").setHeading();

    new Setting(containerEl)
      .setName("Zusätzliche Anweisungen an Claude")
      .setDesc("Zum Beispiel: „Ich studiere Medizin im 3. Semester. Erkläre Fachbegriffe kurz.“ Gilt ab dem nächsten neuen Chat.")
      .addTextArea((ta) => {
        ta.inputEl.rows = 4;
        ta.setValue(s.extraInstructions).onChange(async (value) => {
          s.extraInstructions = value;
          await save();
        });
      });
  }
}

import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type ClaudeResearchPlugin from "./main";

export type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type TranscriptionStyle = "clean" | "verbatim";

export interface ClaudeResearchSettings {
  /** ID of the API key inside Obsidian's SecretStorage (the key itself is not stored in data.json). */
  apiKeySecret: string;
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
  apiKeySecret: "anthropic-api-key",
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

    new Setting(containerEl).setName("Zugang").setHeading();

    new Setting(containerEl)
      .setName("Anthropic-API-Schlüssel")
      .setDesc(
        "Erstelle einen Schlüssel unter console.anthropic.com → API Keys. Er wird im Schlüsselspeicher von Obsidian abgelegt, nicht in den Plugin-Daten deines Vaults.",
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el).setValue(s.apiKeySecret).onChange(async (value) => {
          s.apiKeySecret = value ?? "";
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

    new Setting(containerEl).setName("Recherche").setHeading();

    new Setting(containerEl)
      .setName("Web-Suche")
      .setDesc("Claude darf im Internet suchen und Webseiten lesen. Antworten enthalten dann Quellenangaben.")
      .addToggle((t) =>
        t.setValue(s.webSearch).onChange(async (value) => {
          s.webSearch = value;
          await save();
        }),
      );

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

# Claude Research für Obsidian

Ein Obsidian-Plugin, das **Claude in Obsidian** bringt. Es hat zwei Modi:

- **Ohne API (Standard):** Das Plugin bereitet deine Frage samt Notiz, passenden Notizen und Recherche-Auftrag vor und öffnet die Claude-App bzw. claude.ai. Claude antwortet mit **deinem eigenen Claude-Konto** (kostenlos oder Abo), ohne API-Schlüssel und ohne Extrakosten. Die Antwort übernimmst du mit einem Tipp in die Notiz.
- **Mit API-Schlüssel (optional):** Alles läuft direkt in Obsidian, wie unten beschrieben. Das wird pro Nutzung abgerechnet.

Funktionen (im API-Modus vollständig in Obsidian, ohne API über die Claude-App):

- **Chat in der Seitenleiste.** Fragen stellen, ohne Obsidian zu verlassen.
- **Web-Recherche mit Quellen.** Claude sucht im Internet, liest Webseiten und belegt Aussagen mit nummerierten Links und einer Quellenliste.
- **Suche in deinen Notizen.** Claude durchsucht und liest deinen Vault (nur lesend) und verweist mit `[[Links]]` auf passende Notizen.
- **Handschrift lesen.** Handschriftliche Notizen aus Excalidraw, Ink, Fotos, Scans oder GoodNotes-PDFs werden transkribiert und dadurch durchsuchbar. Du kannst auch Fragen zu ihnen stellen.
- **Ergebnisse übernehmen.** Antworten fügst du per Klick in die Notiz ein, ganze Recherchen speicherst du als eigene Notiz.

> **Samsung Galaxy Tab S9?** Die Einrichtung von der Installation bis zur ersten
> handschriftlichen Notiz steht in [docs/tab-s9.md](docs/tab-s9.md).
>
> Neu bei Obsidian oder du suchst den GoodNotes-Ersatz? Lies zuerst
> [docs/handschrift.md](docs/handschrift.md). Andere Wege, Claude mit Obsidian zu verbinden
> (Claude-App, MCP, Claude Code), stehen in [docs/alternativen.md](docs/alternativen.md).

---

## Was ist Obsidian?

[Obsidian](https://obsidian.md) ist eine Notiz-App für Windows, macOS, Linux, iPad/iPhone und Android. Ein paar Grundideen:

- **Deine Notizen sind normale Dateien.** Jede Notiz ist eine Markdown-Textdatei (`.md`) in einem Ordner auf deinem Gerät. Dieser Ordner heißt **Vault** (Tresor). Es gibt keine Cloud-Pflicht und keinen Anbieter-Lock-in.
- **Verlinken statt Ordnerchaos.** Mit `[[Notizname]]` verknüpfst du Notizen. Die „Graph-Ansicht“ zeigt dir, wie dein Wissen zusammenhängt.
- **Erweiterbar durch Plugins.** Tausende Community-Plugins ergänzen Funktionen, zum Beispiel Zeichnen, Handschrift, Kalender, Karteikarten oder eben KI.
- **Kosten:** Obsidian selbst ist kostenlos. Optional zahlst du für *Obsidian Sync* (Synchronisation zwischen Geräten) und *Publish*. Zum Synchronisieren gehen auch iCloud, OneDrive, Syncthing oder Git.

Wie in GoodNotes handschriftlich in Obsidian schreiben? Das geht mit Plugins, siehe [docs/handschrift.md](docs/handschrift.md).

---

## Installation

### Voraussetzungen

1. **Obsidian 1.11.4 oder neuer** (Desktop oder Mobil, auch Android-Tablets wie das Galaxy Tab S9, siehe [docs/tab-s9.md](docs/tab-s9.md)).
2. **Ohne API (Standard):** ein Claude-Konto und die Claude-App bzw. claude.ai im Browser. Sonst nichts.
3. **Nur für den API-Modus:** ein Anthropic-API-Schlüssel von [console.anthropic.com](https://console.anthropic.com) → *API Keys*. Dort lädst du auch Guthaben auf.
   **Wichtig:** Ein Claude-Pro- oder Max-Abo enthält **keine** API-Nutzung. Die API wird getrennt nach Verbrauch abgerechnet. Mehr dazu unter [Kosten](#kosten).

### Variante A: über BRAT (am einfachsten, auch auf dem iPad)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installiert Plugins direkt aus GitHub-Repositories.

1. In Obsidian: *Einstellungen → Community-Plugins → Eingeschränkten Modus ausschalten → Durchsuchen*. Dort nach **BRAT** suchen, installieren und aktivieren.
2. *Einstellungen → BRAT → Add Beta plugin* und dieses Repository eintragen:
   `efn67tungtungtungsahur/Obsidian`
3. Unter *Community-Plugins* das Plugin **Claude Research** aktivieren.

> BRAT installiert aus den GitHub-Releases. Die erstellt der Workflow `.github/workflows/release.yml`
> automatisch: Sobald in `manifest.json` eine Version steht, für die es noch kein Release gibt,
> wird gebaut, getestet und veröffentlicht. Für ein Update genügt es, die Version in `manifest.json`
> (und `versions.json`) zu erhöhen und zu pushen. Das geht auch im GitHub-Web-Editor auf dem Tablet.

### Variante B: manuell

1. Bauen (siehe [Entwicklung](#entwicklung)) oder `main.js`, `manifest.json` und `styles.css` aus einem Release herunterladen.
2. Im Vault den Ordner `.obsidian/plugins/claude-research/` anlegen und die drei Dateien hineinkopieren.
3. Obsidian neu laden und unter *Community-Plugins* **Claude Research** aktivieren.

### API-Schlüssel eintragen (nur API-Modus)

*Einstellungen → Claude Research → Modus: „Mit API-Schlüssel“*, dann *Anthropic-API-Schlüssel*: einen neuen Eintrag anlegen und den Schlüssel einfügen.
Der Schlüssel liegt im **Schlüsselspeicher von Obsidian** (SecretStorage). Er steht nicht in den Plugin-Daten, die mit deinem Vault synchronisiert werden.

---

## Bedienung

| Was | Wie |
|---|---|
| Chat öffnen | Roboter-Symbol in der linken Leiste oder Befehlspalette (`Strg/Cmd + P`) → „Claude Research: Chat öffnen“ |
| Recherche zu markiertem Text | Text markieren → Rechtsklick → **Mit Claude recherchieren**. Auf Tablet/Handy über die Werkzeugleiste oder die Befehlspalette, siehe [docs/tab-s9.md](docs/tab-s9.md) |
| Frage zur offenen Notiz | Befehl „Frage zur aktuellen Notiz stellen“ oder im Chat **Aktuelle Notiz mitschicken** anhaken |
| Handschrift transkribieren | Befehl „Handschrift der aktuellen Notiz transkribieren“ oder Rechtsklick auf Bild/PDF/Zeichnung im Dateibaum |
| Antwort übernehmen | Unter der Antwort: **In Notiz einfügen** (an der Cursorposition) oder **Kopieren** |
| Recherche aufbewahren | Diskettensymbol im Chat → neue Notiz im Ordner `Claude-Recherche/` (mit Frontmatter-Tags `claude`, `recherche`) |
| Neuer Chat | Plus-Symbol. Der Schalter *Web-Suche* gilt pro Chat. |
| Abbrechen | **Stopp** während Claude arbeitet |

Im Chat siehst du live, was Claude gerade tut, zum Beispiel *„Web-Suche: …“*, *„Durchsucht Notizen: …“* oder *„Liest Notiz: …“*.

### Beispiele

- *„Fasse den aktuellen Forschungsstand zu Mikroplastik im Trinkwasser zusammen, mit Quellen.“*
- *„Was habe ich in meinen Notizen schon über den Calvin-Zyklus geschrieben? Ergänze, was fehlt.“*
- Mit *Aktuelle Notiz mitschicken* und einer handschriftlichen Mitschrift: *„Erstelle aus meiner Mitschrift 10 Karteikarten-Fragen.“*
- *„Prüfe die Jahreszahlen in meiner Notiz auf Richtigkeit.“*

---

## Einstellungen

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Modell | Claude Opus 5.5 | Beste Qualität. *Sonnet 5.5* ist günstiger und schneller, *Haiku 5.5* am günstigsten. |
| Gründlichkeit (Effort) | Hoch | Wie viel Claude nachdenkt. „Niedrig“ ist für einfache Fragen schneller und billiger. |
| Web-Suche | an | Claude darf im Web suchen und Seiten lesen. |
| Max. Web-Suchen pro Frage | 5 | Kostenbremse für Web-Suchen. |
| In Notizen suchen | an | Claude darf deinen Vault durchsuchen und lesen. Ändern kann es nichts. |
| Aktuelle Notiz mitschicken | aus | Startwert für das Häkchen im Chat. |
| Transkriptionsstil | Aufgeräumt | *Aufgeräumt*: Markdown mit Überschriften, Listen und LaTeX. *Wortgetreu*: Zeile für Zeile. |
| Persönliche Anweisungen | leer | Zum Beispiel Studienfach, Niveau oder gewünschter Stil. |
| Verbindung | Automatisch | Live-Antworten. Schaltet auf Tablet/Handy selbst in den kompatiblen Modus, falls die Verbindung blockiert wird. |

---

## Kosten

**Ohne API:** keine Kosten durch das Plugin. Es gelten die Limits deines Claude-Kontos (kostenlos oder Abo).

**Mit API:**
Die API rechnet nach **Tokens** ab (grob 1 Token ≈ ¾ Wort). Web-Suchen kosten zusätzlich pro Suche. Aktuelle Preise stehen auf [anthropic.com/pricing](https://www.anthropic.com/pricing).

Grobe Richtwerte:

- Einfache Frage ohne Recherche: meist **unter 1 Cent bis wenige Cent**
- Recherche mit mehreren Web-Suchen (viel gelesener Text): etwa **5 bis 30 Cent** mit Opus 5.5, mit Sonnet 5.5 rund die Hälfte
- Transkription einer handschriftlichen Seite: etwa **1 bis 3 Cent**

So sparst du:

- Für Alltagsfragen *Sonnet 5.5* oder *Effort: Niedrig/Mittel* wählen.
- *Max. Web-Suchen* niedrig halten.
- Für neue Themen einen **neuen Chat** starten, denn lange Chats schicken den ganzen Verlauf jedes Mal mit. Wiederholte Teile werden günstiger aus dem Cache gelesen.
- In der Anthropic-Konsole ein **Ausgabenlimit** setzen.

---

## Datenschutz & Sicherheit

- Anfragen gehen **direkt von deinem Gerät an `api.anthropic.com`**. Es gibt keinen Zwischenserver.
- An Claude geht nur, was du schickst: deine Frage, die aktuelle Notiz (wenn angehakt) und Notizen, die Claude über die Vault-Suche liest. Wenn du das nicht willst, schalte *In Notizen suchen* aus.
- Die Vault-Werkzeuge sind **nur lesend**. Claude kann keine Dateien ändern oder löschen. Text fügst nur du per Klick ein.
- Webseiten und Notizen können Text enthalten, der wie eine Anweisung aussieht (Prompt Injection). Claude ist angewiesen, solche Inhalte als Material zu behandeln. Prüfe wichtige Ergebnisse trotzdem selbst, besonders die Quellen.

---

## Entwicklung

```bash
npm install
npm test        # Offline-Tests (gemockte API, kein Schlüssel nötig)
npm run build   # Typprüfung + main.js bauen
npm run dev     # Watch-Modus
```

Zum Testen den Repository-Ordner in `<Vault>/.obsidian/plugins/claude-research/` verlinken oder dorthin kopieren und in Obsidian *Befehlspalette → „Reload app without saving“* ausführen.

### Aufbau

| Datei | Inhalt |
|---|---|
| `src/main.ts` | Plugin-Einstieg: Befehle, Kontextmenüs, Seitenleiste |
| `src/chatView.ts` | Chat-Oberfläche |
| `src/claude.ts` | Anbindung an die Claude-API: Streaming, Werkzeug-Schleife, Quellenangaben, Fehlertexte |
| `src/vaultTools.ts` | Werkzeuge `search_vault` und `read_note` (nur lesend) |
| `src/attachments.ts` | Sammelt Bilder, PDFs, Excalidraw- und Ink-Zeichnungen einer Notiz für Claude |
| `src/transcribe.ts` | Handschrift → Text, als Callout in die Notiz bzw. in eine Begleitnotiz |
| `src/settings.ts` | Einstellungen |
| `test/` | Offline-Tests mit gemockter API und gemocktem Vault |

Technische Eckdaten: offizielles `@anthropic-ai/sdk`, Streaming, adaptives Denken mit einstellbarem `effort`, Web-Suche und Web-Fetch als Server-Werkzeuge, Prompt-Caching und `fallbacks: "default"`. Bei Opus und Sonnet wird eine Anfrage, die von den Sicherheitsfiltern abgelehnt wird, serverseitig automatisch mit einem Ersatzmodell wiederholt.

## Lizenz

MIT

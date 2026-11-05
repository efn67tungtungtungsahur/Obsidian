# Obsidian wie GoodNotes nutzen: handschriftlich schreiben

**Kurz gesagt:** Obsidian ist eine Text-App. Handschrift kann es nicht von sich aus, Plugins rüsten sie nach. Mit einem iPad und Apple Pencil (oder einem Android-Tablet mit Stift) kommst du damit gut an GoodNotes heran. Ein paar Unterschiede bleiben (siehe [Ehrlicher Vergleich](#ehrlicher-vergleich-mit-goodnotes)).
Der große Vorteil: Mit dem Plugin **Claude Research** wird deine Handschrift **durchsuchbar, verlinkbar und recherchierbar**.

---

## Die Optionen im Überblick

| Weg | Gut für | Wie es sich anfühlt |
|---|---|---|
| **1. Excalidraw-Plugin** | Mitschriften, Skizzen, Mindmaps, Diagramme | Unendliche Leinwand, Stift-Modus mit Handballen-Erkennung |
| **2. Ink-Plugin** | Handschrift *mitten im Text* einer Notiz | Schreibzeilen direkt zwischen getipptem Text, sehr „Notizbuch-artig“ |
| **3. Scribble (iPad)** | Handschrift sofort in getippten Text umwandeln | Mit dem Pencil in jedes Textfeld schreiben, iPadOS wandelt es um |
| **4. GoodNotes behalten + PDF-Export** | Wer GoodNotes weiter nutzen will | In GoodNotes schreiben, PDF in den Vault exportieren, Claude transkribiert |
| **5. Foto / Scan von Papier** | Echte Papier-Notizen, Tafelbilder | Foto in die Notiz ziehen, Claude transkribiert |

Alle fünf Wege funktionieren mit dem Befehl **„Handschrift der aktuellen Notiz transkribieren“** und mit dem Häkchen **„Aktuelle Notiz mitschicken“** im Claude-Chat.

---

## 1. Excalidraw: die vielseitigste Lösung

1. *Einstellungen → Community-Plugins → Durchsuchen* → **Excalidraw** (von Zsolt Viczián) installieren und aktivieren.
2. Neue Zeichnung anlegen: über das Excalidraw-Symbol in der linken Leiste, über die Befehlspalette (Befehle beginnen mit „Excalidraw: Create new drawing …“) oder per Rechtsklick auf einen Ordner.
3. Auf dem iPad den **Stift-Modus** einschalten (Stift-Symbol in der Werkzeugleiste). Dann zeichnet nur der Pencil, und die Finger scrollen und zoomen. Das ist wie in GoodNotes.
4. Zeichnungen bettest du in normale Notizen ein: `![[Meine Skizze.excalidraw]]`.

**Wichtig für Claude:** Schalte in den Excalidraw-Einstellungen unter *Export* die Option **„Auto-export PNG“** ein. Dann legt Excalidraw neben jeder Zeichnung automatisch ein PNG ab, und das Plugin schickt dieses Bild an Claude.
Ohne Auto-Export versucht das Plugin, die Zeichnung über die Excalidraw-Schnittstelle selbst als Bild zu erzeugen. Das klappt meistens, aber nicht immer zuverlässig.

Tipps:
- Für Vorlesungs-Mitschriften lohnt sich eine eigene Zeichnung pro Sitzung, eingebettet in eine Notiz mit Datum und Thema.
- Excalidraw kann auch PDFs als Hintergrund laden. So kannst du in Folien hineinschreiben wie in GoodNotes.

## 2. Ink: Handschrift direkt im Text

1. Community-Plugins → **Ink** (von Dale de Silva) installieren.
2. In einer Notiz über die Befehlspalette einen neuen Handschrift-Abschnitt einfügen (die Befehle beginnen mit „Ink:“).
3. Mit dem Stift schreiben. Der Schreibbereich wächst mit, und davor und danach tippst du normal weiter.

Ink speichert die Handschrift als `.writing`-Datei mit einer eingebauten Vorschau. Das Plugin erkennt die Ink-Blöcke in einer Notiz und schickt diese Vorschau an Claude.
Hat eine Datei noch keine Vorschau, öffne sie einmal kurz in Ink und bearbeite sie.

## 3. Scribble auf dem iPad: Handschrift → Text, ohne Plugin

Unter iPadOS kannst du mit dem Apple Pencil **in jedes Textfeld handschriftlich schreiben**. Die Schrift wird sofort in getippten Text umgewandelt, Deutsch wird unterstützt (*Einstellungen → Apple Pencil → Handschrift*).
Das funktioniert im Obsidian-Editor und auch im **Eingabefeld des Claude-Chats**. Du kannst Claude also handschriftlich Fragen stellen.

## 4. GoodNotes weiter nutzen und mit Obsidian verbinden

Wenn du an GoodNotes hängst, musst du nicht umsteigen:

1. In GoodNotes: Notizbuch oder Seite → *Teilen → Exportieren → PDF*.
2. Die PDF in den Vault-Ordner speichern, zum Beispiel `GoodNotes/` (in der Dateien-App, wenn der Vault in iCloud liegt).
3. In einer Obsidian-Notiz einbetten: `![[Vorlesung 3.pdf]]`.
4. Befehl **„Handschrift transkribieren“**. Claude liest die PDF-Seiten und schreibt den Text als Callout unter die Notiz.

PDFs bis 24 MB werden direkt verarbeitet. Größere teilst du vorher auf.

## 5. Papier, Tafel, Whiteboard

Mach ein Foto und füge es in die Notiz ein. Auf dem Handy geht das über die Anhang-Schaltfläche von Obsidian, je nach Gerät direkt mit der Kamera. Dann „Handschrift transkribieren“ oder eine Frage im Chat stellen.

---

## Was der Befehl „Handschrift transkribieren“ genau macht

- **In einer normalen Notiz** sammelt er alle eingebetteten Bilder, PDFs, Excalidraw-Zeichnungen und Ink-Blöcke. Claude transkribiert sie, und das Ergebnis landet als Callout am Ende der Notiz:

  ```markdown
  > [!note]+ Transkription (Claude, 2026-11-05 14:30)
  > Quelle: tafel.jpg, Skizze.excalidraw.md
  >
  > # Photosynthese
  > - Lichtreaktion → ATP + NADPH
  > - $6CO_2 + 6H_2O \rightarrow C_6H_{12}O_6 + 6O_2$
  ```

- **Bei einem Bild, einer PDF oder Zeichnung selbst** (geöffnet oder per Rechtsklick im Dateibaum) entsteht eine Begleitnotiz `‹Name› – Transkription.md` mit eingebettetem Original und Transkription.
- Die Transkription ist normaler Text. Deine Handschrift taucht danach in der **Obsidian-Suche** auf, du kannst sie **verlinken** und Claude findet sie bei Recherchen über `search_vault`.
- Unleserliches markiert Claude als `[unleserlich]`, Skizzen beschreibt es kurz als `[Skizze: …]`, Formeln schreibt es als LaTeX.

---

## Ehrlicher Vergleich mit GoodNotes

| | GoodNotes | Obsidian + Plugins |
|---|---|---|
| Schreibgefühl, Latenz | sehr ausgereift | gut, aber je nach Plugin etwas weniger flüssig |
| Papiervorlagen (liniert, kariert) | viele eingebaut | Excalidraw: Raster/Hintergründe möglich, weniger komfortabel |
| PDF annotieren | hervorragend | Excalidraw kann PDFs einbinden, ist aber umständlicher |
| Handschrift-Suche (OCR) | eingebaut | über Claude-Transkription, dann vollwertiger Text |
| Verlinken, Wissensnetz | kaum | **die Stärke von Obsidian** |
| Dateiformat | proprietär | offene Markdown- und PNG-/JSON-Dateien |
| KI-Recherche in den Notizen | – | **mit diesem Plugin** |

**Empfehlung:** Wenn das Schreiben auf Papier-Vorlagen und das PDF-Annotieren für dich zentral ist, behalte GoodNotes für das Schreiben (Weg 4) und nutze Obsidian als „zweites Gehirn“ zum Verknüpfen und Recherchieren. Für freie Mitschriften und Skizzen funktioniert **Excalidraw + Stift-Modus** gut als vollständiger Ersatz.

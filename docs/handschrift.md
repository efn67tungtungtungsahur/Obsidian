# Obsidian wie GoodNotes nutzen: handschriftlich schreiben

**Kurz gesagt:** Obsidian ist eine Text-App. Handschrift kann es nicht von sich aus, Plugins rüsten sie nach. Mit einem Tablet mit Stift, also einem **Samsung Galaxy Tab mit S Pen** oder einem iPad mit Apple Pencil, kommst du damit gut an GoodNotes heran.

> **Galaxy Tab S9?** Die Schritt-für-Schritt-Einrichtung für das Tab S9 steht in [tab-s9.md](tab-s9.md). Ein paar Unterschiede bleiben (siehe [Ehrlicher Vergleich](#ehrlicher-vergleich-mit-goodnotes)).
Der große Vorteil: Mit dem Plugin **Claude Research** wird deine Handschrift **durchsuchbar, verlinkbar und recherchierbar**.

---

## Die Optionen im Überblick

| Weg | Gut für | Wie es sich anfühlt |
|---|---|---|
| **1. Excalidraw-Plugin** | Mitschriften, Skizzen, Mindmaps, Diagramme | Unendliche Leinwand, Stift-Modus mit Handballen-Erkennung |
| **2. Ink-Plugin** | Handschrift *mitten im Text* einer Notiz | Schreibzeilen direkt zwischen getipptem Text, sehr „Notizbuch-artig“ |
| **3. S Pen zu Text (Samsung) / Scribble (iPad)** | Handschrift sofort in getippten Text umwandeln | Mit dem Stift in jedes Textfeld schreiben, das System wandelt es um |
| **4. GoodNotes oder Samsung Notes behalten + PDF-Export** | Wer seine Schreib-App weiter nutzen will | Dort schreiben, PDF in den Vault exportieren, Claude transkribiert |
| **5. Foto / Scan von Papier** | Echte Papier-Notizen, Tafelbilder | Foto in die Notiz ziehen, Claude transkribiert |

Alle fünf Wege funktionieren mit dem Befehl **„Handschrift der aktuellen Notiz transkribieren“** und mit dem Häkchen **„Aktuelle Notiz mitschicken“** im Claude-Chat.

---

## 1. Excalidraw: die vielseitigste Lösung

1. *Einstellungen → Community-Plugins → Durchsuchen* → **Excalidraw** (von Zsolt Viczián) installieren und aktivieren.
2. Neue Zeichnung anlegen: über das Excalidraw-Symbol in der linken Leiste, über die Befehlspalette (Befehle beginnen mit „Excalidraw: Create new drawing …“) oder per Rechtsklick auf einen Ordner.
3. Den **Stift-Modus** einschalten (Stift-Symbol in der Werkzeugleiste). Dann zeichnet nur der Stift (S Pen oder Apple Pencil), und die Finger scrollen und zoomen. Das ist wie in GoodNotes.
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

> Ink ist vor allem für das iPad entwickelt und noch jung. Auf Android-Tablets wie dem Galaxy Tab ist **Excalidraw** die erprobtere Wahl. Probier Ink ruhig aus, verlass dich aber nicht darauf.

## 3. Handschrift → Text im Textfeld, ohne Plugin

- **Samsung Galaxy Tab („S Pen zu Text“):** Halte den S Pen über ein Textfeld und tippe auf das Handschrift-Symbol. Die Tastatur wird dann durch eine Schreibfläche ersetzt, und deine Schrift wird zu getipptem Text. Die Funktion ist ab Werk aktiv und lässt sich in den S-Pen-Einstellungen ein- und ausschalten.
- **iPad (Scribble):** Mit dem Apple Pencil direkt in jedes Textfeld schreiben (*Einstellungen → Apple Pencil → Handschrift*).

Beides funktioniert im Obsidian-Editor und auch im **Eingabefeld des Claude-Chats**. Du kannst Claude also handschriftlich Fragen stellen.

## 4. GoodNotes oder Samsung Notes weiter nutzen und mit Obsidian verbinden

Wenn du an deiner Schreib-App hängst, musst du nicht umsteigen:

1. Die Seite oder das Notizbuch als **PDF exportieren**. In GoodNotes geht das über *Teilen → Exportieren → PDF*, in Samsung Notes über das Menü der Notiz (als Datei speichern bzw. teilen → PDF).
2. Die PDF in den Vault-Ordner speichern, zum Beispiel in den Unterordner `Handschrift/`. Auf Android liegt der Vault meist unter `Dokumente/<Vault-Name>`, auf dem iPad in der Dateien-App.
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

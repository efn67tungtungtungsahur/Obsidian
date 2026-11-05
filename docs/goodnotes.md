# GoodNotes mit Obsidian verbinden

GoodNotes speichert Notizbücher in einem eigenen Format, auf das andere Apps nicht zugreifen können. **Exportieren** kann GoodNotes aber jederzeit: einzelne Notizbücher als **PDF** und ganze Ordner als **ZIP-Datei voller PDFs**, mit erhaltener Ordnerstruktur. Darauf baut die Verbindung auf.

Das Plugin legt dafür im Vault einen Ordner **`GoodNotes/`** an (Name einstellbar). In der Bibliothek hat er einen eigenen Reiter **„GoodNotes“**.

---

## So holst du deine GoodNotes-Notizen rüber

### Ganzer Ordner auf einmal (empfohlen)
1. In GoodNotes einen **Ordner** auswählen → **Teilen / Exportieren** → Format **PDF**. GoodNotes erstellt eine ZIP-Datei mit allen Notizbüchern.
2. In Obsidian: **Bibliothek → „+ Neu“ → „GoodNotes-Export importieren“** und die ZIP-Datei wählen. Sie liegt meist unter *Downloads*.
3. Fertig. Alle PDFs liegen jetzt in `GoodNotes/…`, **mit denselben Unterordnern** wie in GoodNotes.

### Einzelnes Notizbuch
Genauso, nur ein Notizbuch als PDF exportieren und importieren. Oder die PDF beim Teilen direkt im Vault-Ordner `Dokumente/<Vault>/GoodNotes/` speichern.

### Noch bequemer: ZIP direkt in den Ordner legen
Speicherst du eine ZIP-Datei direkt in `GoodNotes/`, packt das Plugin sie automatisch aus und legt die ZIP danach in `GoodNotes/_Import-Archiv/` ab.
Falls Obsidian die ZIP nicht bemerkt: In *Einstellungen → Dateien & Links* die Option **„Alle Dateiendungen erkennen“** einschalten.

---

## Was das Plugin daraus macht

- **Begleitnotiz pro PDF:** Neben `Vorlesung 3.pdf` entsteht `Vorlesung 3.md` mit der eingebetteten PDF und den Abschnitten **„Notizen“** und **„Transkription“**. Dort kannst du verlinken (`[[…]]`), Tags setzen und eigene Gedanken festhalten. In der Bibliothek ist die Begleitnotiz ausgeblendet und über **„⋯ → Begleitnotiz öffnen“** erreichbar.
- **Neu exportiert?** Importierst du dasselbe Notizbuch später noch einmal, wird die PDF **aktualisiert**. Unveränderte PDFs werden übersprungen. Die Begleitnotiz bekommt dann im Kopfbereich `transkription-veraltet: true`, damit du weißt, dass sich etwas geändert hat. Deine eigenen Notizen darin bleiben erhalten.
- **In Text umwandeln:** Bei einer PDF **„⋯ → Mit Claude in Text umwandeln“**. Der Text landet im Abschnitt „Transkription“ der Begleitnotiz. Ab dann findet die Obsidian-Suche deine GoodNotes-Handschrift.
- **Weiterschreiben:** **„⋯ → Zum Beschreiben öffnen“** macht aus der PDF ein Notizbuch, in dem du direkt auf den GoodNotes-Seiten weiterschreibst.

---

## Automatisch synchron halten (für Fortgeschrittene)

GoodNotes kann laut seiner Hilfe per **Auto-Backup** automatisch PDF-Kopien in einen Cloud-Speicher legen, etwa Google Drive, Dropbox oder OneDrive. Ob das auch in der Android-Version von GoodNotes geht, habe ich nicht prüfen können.

Wenn ja: Mit einer Android-App wie **FolderSync** lässt sich dieser Cloud-Ordner automatisch in `Dokumente/<Vault>/GoodNotes/` spiegeln. Das Plugin erkennt neue und geänderte PDFs dann von selbst und hält die Begleitnotizen aktuell.

> Wichtig: Nicht denselben Vault-Ordner zusätzlich mit Obsidian Sync **und** FolderSync synchronisieren. Das gibt Konflikte.

---

## Grenzen

- Die Verbindung geht in **eine Richtung**: GoodNotes → Obsidian. Was du in Obsidian auf eine PDF schreibst, kommt nicht automatisch zurück zu GoodNotes. Dafür das Notizbuch als PDF exportieren und in GoodNotes importieren.
- GoodNotes-Funktionen wie Lesezeichen, Gliederung oder bearbeitbare Handschrift gehen beim PDF-Export verloren. Das liegt am Export von GoodNotes, nicht am Plugin.

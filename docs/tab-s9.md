# Einrichtung auf dem Samsung Galaxy Tab S9 (mit S Pen)

Obsidian gibt es offiziell für Android, also auch für das Galaxy Tab S9, S9+ und S9 Ultra.
Diese Anleitung führt dich von der Installation bis zur handschriftlichen Notiz, die Claude lesen kann.

**Du brauchst keinen PC.** Jeder Schritt geht direkt auf dem Tablet: Installation, API-Schlüssel, Plugins, Schreiben mit dem S Pen, Recherche und Transkription.

---

## Schritt 1: Obsidian installieren

**Empfohlen: Google Play Store**

1. Auf dem Tablet diesen Link öffnen: **[Obsidian im Google Play Store](https://play.google.com/store/apps/details?id=md.obsidian)**.
   Oder den Play Store öffnen und nach **„Obsidian“** suchen.
2. Den Eintrag prüfen. Der Anbieter heißt *Dynalist Inc.*, so heißt die Firma hinter Obsidian.
3. **Installieren** tippen.

**Alternative: APK-Datei**

Auf der offiziellen Download-Seite [obsidian.md/download](https://obsidian.md/download) gibt es Obsidian auch als APK-Datei. Das ist nur nötig, wenn du den Play Store nicht nutzen willst.
Lade die APK **nur von obsidian.md** herunter, nicht von Drittseiten. Beim Öffnen fragt Android, ob der Browser „unbekannte Apps installieren“ darf. Das musst du einmalig erlauben.

> Das Tab S9 ist mit Android 13 erschienen und hat seitdem Updates bekommen. Obsidian läuft auch auf deutlich älteren Android-Versionen, das Tablet ist also auf jeden Fall kompatibel.

---

## Schritt 2: Den ersten Vault anlegen

Beim ersten Start fragt Obsidian, wo der Vault (dein Notiz-Ordner) liegen soll:

| Option | Bedeutung | Empfehlung |
|---|---|---|
| **Gerätespeicher** (device storage) | Ordner liegt z. B. unter `Dokumente/<Vault-Name>` und ist für andere Apps sichtbar | **Ja, nimm diese Option.** Nur so kannst du PDFs aus Samsung Notes oder GoodNotes hineinspeichern und den Vault mit anderen Geräten synchronisieren. |
| **App-Speicher** (app storage) | privat in Obsidian | Nur, wenn du nie Dateien von außen hinzufügen willst. **Achtung:** Beim Deinstallieren von Obsidian wird der Vault mitgelöscht. |

1. **„Neuen Vault erstellen“** tippen, einen Namen vergeben (z. B. `Notizen`) und *Gerätespeicher* wählen.
2. Wenn Obsidian nach der **Speicherberechtigung** fragt, erlauben. Ohne diese Berechtigung kann Obsidian keine Dateien im Gerätespeicher lesen oder schreiben.

---

## Schritt 3: Community-Plugins freischalten

1. In Obsidian die linke Seitenleiste öffnen (vom linken Rand wischen) und auf das **Zahnrad** (Einstellungen) tippen.
2. **Community-Plugins** → **„Eingeschränkten Modus ausschalten“** → bestätigen.
3. **Durchsuchen** antippen. Hier findest du alle Plugins.

Installiere jetzt (in der Suche den Namen eintippen; die Links zeigen die Plugin-Seiten im offiziellen [Plugin-Verzeichnis](https://community.obsidian.md/plugins)):

1. **[Excalidraw](https://community.obsidian.md/plugins/obsidian-excalidraw-plugin)**: zum handschriftlichen Schreiben und Zeichnen mit dem S Pen. Danach in den Excalidraw-Einstellungen unter *Export* **„Auto-export PNG“** einschalten, damit Claude deine Zeichnungen lesen kann.
2. **[BRAT](https://community.obsidian.md/plugins/obsidian42-brat)**: damit installierst du das Plugin *Claude Research* aus GitHub.

Nach der Installation jedes Plugin mit dem Schalter **aktivieren**.

---

## Schritt 4: Claude-App installieren (kein API-Schlüssel nötig)

1. Die **[Claude-App im Google Play Store](https://play.google.com/store/apps/details?id=com.anthropic.claude)** installieren (Anbieter: *Anthropic*).
2. Mit deinem Claude-Konto anmelden. Das geht kostenlos, ein Abo (Pro/Max) bringt mehr Nutzung.
3. Für Recherchen in der App die **Websuche** einschalten. Sie ist über das Werkzeug-Menü im Eingabefeld zu finden.

> Das Plugin startet im Modus **„Ohne API“**: Es bereitet deine Frage in Obsidian vor, die Antwort schreibt Claude in der Claude-App, und du übernimmst sie mit einem Tipp.
> Wer später alles direkt in Obsidian haben will, kann unter *Einstellungen → Claude Research → Modus* auf **„Mit API-Schlüssel“** umstellen. Das kostet extra, siehe README.

## Schritt 5: Claude Research installieren

1. In Obsidian: *Einstellungen → BRAT → Add Beta plugin*.
2. Eintragen: `efn67tungtungtungsahur/Obsidian` → **Add Plugin**. Das Repository ist öffentlich, ein GitHub-Konto brauchst du nicht.
3. *Einstellungen → Community-Plugins* → **Claude Research** aktivieren. Fertig, ein Schlüssel ist nicht nötig.

## Schritt 6: Bedienleiste einrichten (empfohlen)

Auf dem Tablet gibt es keinen Rechtsklick. Leg dir die wichtigsten Befehle deshalb in die **Werkzeugleiste über der Tastatur**:

1. *Einstellungen → Mobil* (Mobile) → Werkzeugleiste bzw. Toolbar-Optionen verwalten.
2. Diese Befehle hinzufügen:
   - **Claude Research: Chat öffnen**
   - **Claude Research: Markierten Text recherchieren**
   - **Claude Research: Handschrift der aktuellen Notiz transkribieren**
   - **Claude Research: Claude-Antwort einfügen**

Alle Befehle findest du außerdem in der **Befehlspalette**: in einer Notiz von oben nach unten wischen und „Claude“ eintippen.

**So funktioniert eine Recherche ohne API:**
1. Den Claude-Bereich in der **rechten Seitenleiste** öffnen: über den Befehl „Chat öffnen“ oder indem du vom rechten Rand wischst.
2. Die Frage eintippen oder mit dem S Pen schreiben. Bei Bedarf ankreuzen:
   - **Aktuelle Notiz mitschicken**: Der Text der offenen Notiz wird mitgegeben.
   - **Web-Recherche mit Quellen**: Claude wird gebeten, im Web zu suchen und Links anzugeben.
   - **Passende Notizen mitschicken**: Das Plugin sucht in deinem Vault nach passenden Stellen und gibt sie mit.
3. **„In Claude öffnen“** tippen. Die Frage ist jetzt kopiert, und Claude öffnet sich (App oder claude.ai).
4. In Claude ins Eingabefeld **lange tippen → „Einfügen“** → senden.
   Hat die Notiz Bilder, PDFs oder Zeichnungen, zeigt das Plugin an, welche Dateien du anhängen sollst. In Claude dann **+ → Dateien → `Dokumente/<Vault>/…`** wählen.
5. Unter Claudes Antwort auf **„Kopieren“** tippen und zurück zu Obsidian wechseln.
6. **„Antwort einfügen“** tippen. Die Antwort landet an der Cursorposition der Notiz, oder du speicherst sie **als neue Notiz** im Ordner `Claude-Recherche/`.

Text markieren und dann **„Markierten Text recherchieren“** aus der Werkzeugleiste tippen: Das macht Schritt 1 bis 3 in einem Rutsch.

---

## Schritt 7: Mit dem S Pen schreiben

**Handschriftliche Notiz in Excalidraw**

1. Neue Zeichnung anlegen: Excalidraw-Symbol in der Seitenleiste oder Befehlspalette (in einer Notiz von oben nach unten wischen) → „Excalidraw: Create new drawing …“.
2. Den **Stift-Modus** einschalten (Stift-Symbol in der Werkzeugleiste). Dann zeichnet nur der S Pen, und mit den Fingern verschiebst und zoomst du.
3. Losschreiben. Die Zeichnung bettest du mit `![[Name.excalidraw]]` in eine normale Notiz ein.

**Handschrift direkt in Text umwandeln („S Pen zu Text“)**

Halte den S Pen über ein Textfeld, also den Obsidian-Editor oder das Eingabefeld des Claude-Chats, und tippe auf das Handschrift-Symbol. Die Tastatur wird durch eine Schreibfläche ersetzt, und was du schreibst, wird zu getipptem Text.
Die Funktion ist ab Werk eingeschaltet. Falls nicht, findest du sie in den Einstellungen des Tablets bei den S-Pen-Optionen.

**Handschrift in Text umwandeln**

- **Ganz ohne Claude:** Samsung kann das selbst. Entweder direkt mit „S Pen zu Text“ in die Notiz schreiben, oder in Samsung Notes die Handschrift markieren und in Text umwandeln.
- **Mit Claude** (versteht auch Formeln, Skizzen und unordentliche Schrift): Befehl **„Handschrift der aktuellen Notiz transkribieren“**. Das Plugin kopiert den Transkriptions-Auftrag, öffnet Claude und sagt dir, welche Bilder oder PDFs du anhängen sollst. Danach die Antwort kopieren und mit **„Claude-Antwort einfügen“** in die Notiz übernehmen. Ab dann ist die Handschrift durchsuchbar.

---

## Samsung Notes oder GoodNotes weiter nutzen?

Geht auch. Exportiere die Seite als **PDF** und speichere sie in den Vault-Ordner (`Dokumente/<Vault-Name>/…`). Dann bettest du sie in eine Notiz ein (`![[Datei.pdf]]`) und transkribierst sie. Details stehen in [handschrift.md](handschrift.md), Abschnitt 4.

---

## Notizen mit anderen Geräten synchronisieren (optional)

Das brauchst du nur, wenn du die Notizen auch auf Handy oder PC haben willst:

- **Obsidian Sync** (empfohlen): der offizielle, kostenpflichtige Dienst. Am einfachsten, Ende-zu-Ende-verschlüsselt, mit Versionsverlauf. Achtung: Im Tarif *Standard* werden nur Dateien bis **5 MB** synchronisiert (1 GB insgesamt). Große PDFs aus Samsung Notes oder GoodNotes brauchen den Tarif *Plus* (200 MB pro Datei, 10 GB insgesamt).
- **Syncthing**: kostenlos, Gerät-zu-Gerät ohne Cloud. Auf Android die App **Syncthing-Fork** nutzen (aus F-Droid oder GitHub), denn die ursprüngliche Syncthing-App wird nicht mehr gepflegt. Den Vault-Ordner auf allen Geräten freigeben und in Obsidian mit „Ordner als Vault öffnen“ öffnen.
- Google Drive, OneDrive und Dropbox synchronisiert Obsidian auf Android nicht direkt. Das geht nur über Zusatz-Apps wie *FolderSync*.
- **Nie zwei Sync-Dienste gleichzeitig** auf denselben Vault-Ordner ansetzen, zum Beispiel Obsidian Sync und Syncthing. Das erzeugt Konflikte und doppelte Dateien.
- Den API-Schlüssel von Claude Research trägst du auf jedem Gerät einmal ein. Er liegt im Schlüsselspeicher des Geräts, nicht im Vault.

---

## Häufige Probleme

| Problem | Lösung |
|---|---|
| „Community-Plugins“ zeigt nichts an | Eingeschränkten Modus ausschalten (Schritt 3), Internetverbindung prüfen |
| BRAT findet das Plugin nicht | Repository-Namen prüfen: `efn67tungtungtungsahur/Obsidian`. Es muss mindestens ein Release existieren (siehe Releases-Seite des Repositorys). |
| PDF aus Samsung Notes taucht in Obsidian nicht auf | Der Vault liegt im *App-Speicher*. Neuen Vault im *Gerätespeicher* anlegen und die Dateien umziehen. |
| Nach „In Claude öffnen“ ist das Eingabefeld in Claude leer | Das ist normal: Lange ins Feld tippen → **Einfügen**. Die Frage liegt in der Zwischenablage. |
| Es erscheint ein Fenster mit dem ganzen Fragetext | Das Tablet hat das automatische Kopieren blockiert. Text lange antippen → *Alles auswählen* → *Kopieren* → „Claude öffnen“. |
| Claude findet keine Quellen | In der Claude-App die **Websuche** einschalten. |
| (nur API-Modus) Chat meldet „Keine Verbindung zu api.anthropic.com“, obwohl Internet da ist | *Einstellungen → Claude Research → Verbindung* auf **Kompatibel** stellen. Antworten erscheinen dann am Stück statt Wort für Wort. |
| (nur API-Modus) „Der API-Schlüssel ist ungültig“ | Schlüssel neu kopieren, ohne Leerzeichen am Anfang oder Ende. Prüfen, ob in der Anthropic-Konsole Guthaben vorhanden ist. |
| Claude sagt bei Excalidraw „kein PNG“ | In den Excalidraw-Einstellungen **„Auto-export PNG“** einschalten und die Zeichnung einmal neu speichern |
| Finger malen statt zu scrollen | In Excalidraw den Stift-Modus einschalten |

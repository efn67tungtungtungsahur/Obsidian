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

## Schritt 4: API-Schlüssel holen (im Browser des Tablets)

1. Im Browser (Samsung Internet oder Chrome) [console.anthropic.com](https://console.anthropic.com) öffnen und ein Konto anlegen bzw. anmelden.
2. Unter *Billing* Guthaben aufladen. Ein Claude-Pro-Abo zählt hier **nicht**, die API wird separat abgerechnet.
3. Unter *API Keys* → **Create Key** einen Schlüssel erstellen und **kopieren**. Er wird nur einmal angezeigt.
4. Empfehlung: Unter *Limits* ein monatliches Ausgabenlimit setzen, zum Beispiel 10 $.

## Schritt 5: Claude Research installieren

1. In Obsidian: *Einstellungen → BRAT → Add Beta plugin*.
2. Eintragen: `efn67tungtungtungsahur/Obsidian` → **Add Plugin**. Das Repository ist öffentlich, ein GitHub-Konto brauchst du nicht.
3. *Einstellungen → Community-Plugins* → **Claude Research** aktivieren.
4. *Einstellungen → Claude Research → Anthropic-API-Schlüssel* → den kopierten Schlüssel einfügen (lange auf das Feld tippen → *Einfügen*).

## Schritt 6: Bedienleiste einrichten (empfohlen)

Auf dem Tablet gibt es keinen Rechtsklick. Leg dir die wichtigsten Befehle deshalb in die **Werkzeugleiste über der Tastatur**:

1. *Einstellungen → Mobil* (Mobile) → Werkzeugleiste bzw. Toolbar-Optionen verwalten.
2. Diese Befehle hinzufügen:
   - **Claude Research: Chat öffnen**
   - **Claude Research: Markierten Text recherchieren**
   - **Claude Research: Handschrift der aktuellen Notiz transkribieren**

Alle Befehle findest du außerdem in der **Befehlspalette**: in einer Notiz von oben nach unten wischen und „Claude“ eintippen.

**So bedienst du den Chat auf dem Tablet:**
- Der Chat öffnet sich in der **rechten Seitenleiste**. Du öffnest sie mit dem Befehl oben oder indem du vom rechten Rand wischst.
- **Enter** macht im Eingabefeld eine neue Zeile. Abgeschickt wird mit dem Knopf **Senden**. Mit Tastatur-Cover geht auch **Strg + Enter**.
- Mit „S Pen zu Text“ kannst du die Frage auch **mit dem Stift schreiben** (siehe unten).
- **In Notiz einfügen** setzt die Antwort an der Cursorposition der zuletzt geöffneten Notiz ein.

---

## Schritt 7: Mit dem S Pen schreiben

**Handschriftliche Notiz in Excalidraw**

1. Neue Zeichnung anlegen: Excalidraw-Symbol in der Seitenleiste oder Befehlspalette (in einer Notiz von oben nach unten wischen) → „Excalidraw: Create new drawing …“.
2. Den **Stift-Modus** einschalten (Stift-Symbol in der Werkzeugleiste). Dann zeichnet nur der S Pen, und mit den Fingern verschiebst und zoomst du.
3. Losschreiben. Die Zeichnung bettest du mit `![[Name.excalidraw]]` in eine normale Notiz ein.

**Handschrift direkt in Text umwandeln („S Pen zu Text“)**

Halte den S Pen über ein Textfeld, also den Obsidian-Editor oder das Eingabefeld des Claude-Chats, und tippe auf das Handschrift-Symbol. Die Tastatur wird durch eine Schreibfläche ersetzt, und was du schreibst, wird zu getipptem Text.
Die Funktion ist ab Werk eingeschaltet. Falls nicht, findest du sie in den Einstellungen des Tablets bei den S-Pen-Optionen.

**Handschrift von Claude lesen lassen**

- Befehl **„Handschrift der aktuellen Notiz transkribieren“**: Der Text landet unter der Notiz und ist ab dann durchsuchbar.
- Oder im Claude-Chat **„Aktuelle Notiz mitschicken“** anhaken und eine Frage zur Mitschrift stellen.

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
| Chat meldet „Keine Verbindung zu api.anthropic.com“, obwohl Internet da ist | *Einstellungen → Claude Research → Verbindung* auf **Kompatibel** stellen. Antworten erscheinen dann am Stück statt Wort für Wort. |
| „Der API-Schlüssel ist ungültig“ | Schlüssel neu kopieren, ohne Leerzeichen am Anfang oder Ende. Prüfen, ob in der Anthropic-Konsole Guthaben vorhanden ist. |
| Claude sagt bei Excalidraw „kein PNG“ | In den Excalidraw-Einstellungen **„Auto-export PNG“** einschalten und die Zeichnung einmal neu speichern |
| Finger malen statt zu scrollen | In Excalidraw den Stift-Modus einschalten |

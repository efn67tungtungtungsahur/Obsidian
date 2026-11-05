# Einrichtung auf dem Samsung Galaxy Tab S9 (mit S Pen)

Obsidian gibt es offiziell für Android, also auch für das Galaxy Tab S9, S9+ und S9 Ultra.
Diese Anleitung führt dich von der Installation bis zur handschriftlichen Notiz, die Claude lesen kann.

---

## Schritt 1: Obsidian installieren

**Empfohlen: Google Play Store**

1. Den **Google Play Store** öffnen.
2. Nach **„Obsidian“** suchen. Der Anbieter heißt *Dynalist Inc.*, so heißt die Firma hinter Obsidian.
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

Installiere jetzt:

1. **Excalidraw**: zum handschriftlichen Schreiben und Zeichnen mit dem S Pen. Danach in den Excalidraw-Einstellungen unter *Export* **„Auto-export PNG“** einschalten, damit Claude deine Zeichnungen lesen kann.
2. **BRAT**: damit installierst du das Plugin *Claude Research* aus GitHub.

Nach der Installation jedes Plugin mit dem Schalter **aktivieren**.

---

## Schritt 4: Claude Research installieren

1. *Einstellungen → BRAT → Add Beta plugin*.
2. Eintragen: `efn67tungtungtungsahur/obsidian` → **Add Plugin**.
3. *Einstellungen → Community-Plugins* → **Claude Research** aktivieren.
4. *Einstellungen → Claude Research → Anthropic-API-Schlüssel* → Schlüssel einfügen (erstellen unter [console.anthropic.com](https://console.anthropic.com)).

> BRAT findet das Plugin erst, wenn im Repository ein **Release** existiert, siehe README → „Variante A“.

---

## Schritt 5: Mit dem S Pen schreiben

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

- **Obsidian Sync**: der offizielle, kostenpflichtige Dienst. Am einfachsten, Ende-zu-Ende-verschlüsselt.
- **Syncthing**: kostenlos, Gerät-zu-Gerät ohne Cloud. Auf Android die App **Syncthing-Fork** nutzen (aus F-Droid oder GitHub), denn die ursprüngliche Syncthing-App wird nicht mehr gepflegt. Den Vault-Ordner auf allen Geräten freigeben und in Obsidian mit „Ordner als Vault öffnen“ öffnen.
- Google Drive, OneDrive und Dropbox synchronisiert Obsidian auf Android nicht direkt. Das geht nur über Zusatz-Apps wie *FolderSync*.

---

## Häufige Probleme

| Problem | Lösung |
|---|---|
| „Community-Plugins“ zeigt nichts an | Eingeschränkten Modus ausschalten (Schritt 3), Internetverbindung prüfen |
| BRAT findet das Plugin nicht | Im Repository muss erst ein Release existieren (README, „Variante A“) |
| PDF aus Samsung Notes taucht in Obsidian nicht auf | Der Vault liegt im *App-Speicher*. Neuen Vault im *Gerätespeicher* anlegen und die Dateien umziehen. |
| Claude sagt bei Excalidraw „kein PNG“ | In den Excalidraw-Einstellungen **„Auto-export PNG“** einschalten und die Zeichnung einmal neu speichern |
| Finger malen statt zu scrollen | In Excalidraw den Stift-Modus einschalten |

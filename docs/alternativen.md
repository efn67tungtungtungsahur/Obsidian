# Andere Wege, Claude mit Obsidian zu verbinden

Das Plugin in diesem Repository ist der Weg **„Claude in Obsidian“**: Du arbeitest in Obsidian, Claude ist in der Seitenleiste dabei. Abgerechnet wird über die API.
Es gibt auch den umgekehrten Weg, **„Obsidian in Claude“**. Dabei liest und schreibt die Claude-App deine Notizen.

| Weg | Wo du arbeitest | Abrechnung | Kann Notizen ändern? | Aufwand |
|---|---|---|---|---|
| **Dieses Plugin** | in Obsidian (auch iPad) | API, nach Verbrauch | nein, nur Einfügen per Klick | gering |
| **Claude-App + MCP** | in der Claude-Desktop-App | dein Claude-Abo | ja, wenn erlaubt | mittel |
| **Claude Code im Vault** | im Terminal / in der Claude-App | Claude-Abo oder API | ja | mittel |

---

## Claude-Desktop-App + MCP

Das **Model Context Protocol (MCP)** ist ein offener Standard, mit dem die Claude-App auf externe Daten zugreift. Der Vault ist nur ein Ordner mit Markdown-Dateien, deshalb gibt es zwei einfache Varianten:

1. **Dateisystem-Zugriff:** In der Claude-Desktop-App einen Dateisystem-Connector bzw. MCP-Server einrichten und den Vault-Ordner freigeben. Claude kann dann Notizen suchen, lesen und auf Wunsch neue anlegen.
2. **Über Obsidian selbst:** Das Community-Plugin *Local REST API* stellt den Vault lokal als Schnittstelle bereit. Es gibt Community-MCP-Server, die darauf aufsetzen und Obsidian-Funktionen wie Suche, Tags und Frontmatter an Claude weitergeben.

**Vorteile:** keine API-Kosten (nutzt dein Abo), Claude kann Notizen direkt anlegen und umbauen, und du nutzt die volle Recherche-Oberfläche der Claude-App.
**Nachteile:** Du arbeitest außerhalb von Obsidian, es läuft nur am Desktop, und Community-MCP-Server solltest du vor der Installation prüfen.

## Claude Code im Vault-Ordner

[Claude Code](https://code.claude.com) ist eigentlich ein Programmier-Werkzeug. Es eignet sich aber gut für größere Arbeiten an vielen Notizen auf einmal, zum Beispiel:

- „Ordne alle Notizen im Ordner `Inbox/` nach Thema und füge passende Tags hinzu.“
- „Erstelle für jede Vorlesungsnotiz eine Zusammenfassung und verlinke sie in einer Übersicht.“

Dazu im Terminal in den Vault-Ordner wechseln und `claude` starten.
Tipp: Lege den Vault vorher in Git an. Dann kannst du jede Änderung prüfen und zurücknehmen.

## Was nehme ich?

- **Recherchieren und Handschrift auswerten, während du schreibst** (auch auf dem iPad): **dieses Plugin**.
- **Lange Gespräche über deine Notizen mit deinem Claude-Abo**: **Claude-App + MCP**.
- **Viele Notizen auf einmal umbauen**: **Claude Code**.

Die Wege schließen sich nicht aus. Alle arbeiten auf denselben Markdown-Dateien.

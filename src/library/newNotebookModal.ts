import { App, Modal, Setting } from "obsidian";
import { COVER_COLORS, PAPER_LABELS, PaperColor, TEMPLATE_LABELS, Template } from "../notebook/model";

export interface NewNotebookChoice {
  name: string;
  template: Template;
  paper: PaperColor;
  cover: string;
}

/** "Neues Notizbuch" dialog: title, cover colour, paper template and colour. */
export function chooseNewNotebook(app: App): Promise<NewNotebookChoice | null> {
  return new Promise((resolve) => {
    const choice: NewNotebookChoice = { name: "", template: "lined", paper: "white", cover: COVER_COLORS[0] };
    let done = false;
    const modal = new (class extends Modal {
      onOpen(): void {
        this.setTitle("Neues Notizbuch");
        this.modalEl.addClass("cr-newnb");
        const c = this.contentEl;

        const preview = c.createDiv({ cls: "cr-newnb-preview" });
        const cover = preview.createDiv({ cls: "cr-cover-notebook" });
        const coverTitle = cover.createDiv({ cls: "cr-cover-label", text: "Ohne Titel" });
        const paperEl = preview.createDiv({ cls: "cr-newnb-paper" });
        const refresh = () => {
          cover.style.setProperty("--cover", choice.cover);
          coverTitle.setText(choice.name.trim() || "Ohne Titel");
          paperEl.className = `cr-newnb-paper cr-tpl-${choice.template} cr-paper-${choice.paper}`;
        };

        new Setting(c).setName("Titel").addText((t) => {
          t.setPlaceholder("z. B. Biologie – Vorlesung").onChange((v) => {
            choice.name = v;
            refresh();
          });
          window.setTimeout(() => t.inputEl.focus(), 50);
        });

        const coverRow = new Setting(c).setName("Umschlag").controlEl.createDiv({ cls: "cr-nb-chips" });
        for (const color of COVER_COLORS) {
          const b = coverRow.createEl("button", { cls: "cr-nb-swatch", attr: { "aria-label": color } });
          b.style.setProperty("--swatch", color);
          b.addEventListener("click", () => {
            choice.cover = color;
            coverRow.querySelectorAll(".cr-nb-swatch").forEach((el) => el.removeClass("is-active"));
            b.addClass("is-active");
            refresh();
          });
          if (color === choice.cover) b.addClass("is-active");
        }

        const tplRow = new Setting(c).setName("Papier").controlEl.createDiv({ cls: "cr-newnb-templates" });
        for (const t of Object.keys(TEMPLATE_LABELS) as Template[]) {
          const b = tplRow.createEl("button", { cls: "cr-newnb-tpl" });
          b.createDiv({ cls: `cr-newnb-tplprev cr-tpl-${t}` });
          b.createSpan({ text: TEMPLATE_LABELS[t] });
          b.toggleClass("is-active", t === choice.template);
          b.addEventListener("click", () => {
            choice.template = t;
            tplRow.querySelectorAll(".cr-newnb-tpl").forEach((el) => el.removeClass("is-active"));
            b.addClass("is-active");
            refresh();
          });
        }

        new Setting(c).setName("Papierfarbe").addDropdown((d) => {
          for (const p of Object.keys(PAPER_LABELS) as PaperColor[]) d.addOption(p, PAPER_LABELS[p]);
          d.setValue(choice.paper).onChange((v) => {
            choice.paper = v as PaperColor;
            refresh();
          });
        });

        new Setting(c)
          .addButton((b) => b.setButtonText("Abbrechen").onClick(() => this.close()))
          .addButton((b) =>
            b
              .setButtonText("Erstellen")
              .setCta()
              .onClick(() => {
                done = true;
                resolve({ ...choice, name: choice.name.trim() || "Ohne Titel" });
                this.close();
              }),
          );
        refresh();
      }
      onClose(): void {
        this.contentEl.empty();
        if (!done) resolve(null);
      }
    })(app);
    modal.open();
  });
}

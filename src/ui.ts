import { App, FuzzySuggestModal, Modal, Setting, TFile, TFolder, normalizePath } from "obsidian";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

/** Single text field dialog (e.g. text box, rename). Resolves null when cancelled. */
export function promptText(app: App, opts: { title: string; value?: string; placeholder?: string; multiline?: boolean; cta?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new (class extends Modal {
      private done = false;
      onOpen(): void {
        this.setTitle(opts.title);
        const input = opts.multiline
          ? this.contentEl.createEl("textarea", { cls: "cr-prompt-input", attr: { rows: "5", placeholder: opts.placeholder ?? "" } })
          : this.contentEl.createEl("input", { cls: "cr-prompt-input", type: "text", attr: { placeholder: opts.placeholder ?? "" } });
        input.value = opts.value ?? "";
        const submit = () => {
          this.done = true;
          resolve(input.value);
          this.close();
        };
        if (!opts.multiline) {
          input.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === "Enter") {
              e.preventDefault();
              submit();
            }
          });
        }
        new Setting(this.contentEl)
          .addButton((b) => b.setButtonText("Abbrechen").onClick(() => this.close()))
          .addButton((b) => b.setButtonText(opts.cta ?? "OK").setCta().onClick(submit));
        window.setTimeout(() => {
          input.focus();
          if (!opts.multiline) (input as HTMLInputElement).select();
        }, 50);
      }
      onClose(): void {
        this.contentEl.empty();
        if (!this.done) resolve(null);
      }
    })(app);
    modal.open();
  });
}

export function confirmDialog(app: App, title: string, text: string, cta = "Löschen"): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new (class extends Modal {
      private answered = false;
      onOpen(): void {
        this.setTitle(title);
        this.contentEl.createEl("p", { text });
        new Setting(this.contentEl)
          .addButton((b) => b.setButtonText("Abbrechen").onClick(() => this.close()))
          .addButton((b) =>
            b
              .setButtonText(cta)
              .setWarning()
              .onClick(() => {
                this.answered = true;
                resolve(true);
                this.close();
              }),
          );
      }
      onClose(): void {
        this.contentEl.empty();
        if (!this.answered) resolve(false);
      }
    })(app);
    modal.open();
  });
}

/** Fuzzy picker over a list of vault files or folders. */
export function pickFromList<T extends TFile | TFolder>(app: App, items: T[], placeholder: string): Promise<T | null> {
  return new Promise((resolve) => {
    let chosen = false;
    const modal = new (class extends FuzzySuggestModal<T> {
      getItems(): T[] {
        return items;
      }
      getItemText(item: T): string {
        return item.path || "/";
      }
      onChooseItem(item: T): void {
        chosen = true;
        resolve(item);
      }
      onClose(): void {
        super.onClose();
        // onChooseItem runs after onClose; wait a tick before reporting a cancel.
        window.setTimeout(() => {
          if (!chosen) resolve(null);
        }, 0);
      }
    })(app);
    modal.setPlaceholder(placeholder);
    modal.open();
  });
}

export function vaultImages(app: App): TFile[] {
  return app.vault.getFiles().filter((f) => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()));
}

export function vaultPdfs(app: App): TFile[] {
  return app.vault.getFiles().filter((f) => f.extension.toLowerCase() === "pdf");
}

/** Opens the system file picker (camera/gallery/files on Android). */
export function pickDeviceFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    // Some web views never fire "change" on cancel; the promise then simply stays pending.
    input.click();
  });
}

/** Stores a file picked on the device as an attachment next to `sourcePath`. */
export async function saveDeviceFile(app: App, file: File, sourcePath: string): Promise<TFile> {
  const name = file.name || `Datei-${Date.now()}`;
  const path = await app.fileManager.getAvailablePathForAttachment(name, sourcePath);
  return app.vault.createBinary(normalizePath(path), await file.arrayBuffer());
}

/** A free file name like "Name.ext", "Name 2.ext" … in `folder`. */
export function availablePath(app: App, folder: string, base: string, ext: string): string {
  const clean = base.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "Ohne Titel";
  const prefix = folder && folder !== "/" ? `${folder}/` : "";
  let path = normalizePath(`${prefix}${clean}.${ext}`);
  for (let i = 2; app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${prefix}${clean} ${i}.${ext}`);
  return path;
}

export async function ensureFolder(app: App, path: string): Promise<void> {
  const norm = normalizePath(path);
  if (!norm || norm === "/" || app.vault.getAbstractFileByPath(norm)) return;
  const parent = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
  if (parent) await ensureFolder(app, parent);
  await app.vault.createFolder(norm);
}

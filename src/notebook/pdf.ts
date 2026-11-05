import type { App } from "obsidian";
import { A4_HEIGHT, Notebook, Page, PAGE_WIDTH, newId, newNotebook } from "./model";
import { canvasToBlob, pdfPageRatios, renderPageImage } from "./render";

/** Pages that show the pages of a vault PDF as background, ready to be written on. */
export async function pagesFromPdf(app: App, pdfPath: string): Promise<Page[]> {
  const ratios = await pdfPageRatios(app, pdfPath);
  return ratios.map((r, i) => ({
    id: newId(),
    template: "blank",
    h: Math.round(PAGE_WIDTH * (Number.isFinite(r) && r > 0.1 ? r : A4_HEIGHT / PAGE_WIDTH)),
    bg: { pdf: pdfPath, page: i + 1 },
    elements: [],
  }));
}

export async function notebookFromPdf(app: App, pdfPath: string): Promise<Notebook> {
  const nb = newNotebook({ template: "blank" });
  nb.pages = await pagesFromPdf(app, pdfPath);
  return nb;
}

export interface PdfImagePage {
  jpeg: Uint8Array;
  /** Image size in pixels. */
  pxWidth: number;
  pxHeight: number;
  /** Page size in PDF points. */
  ptWidth: number;
  ptHeight: number;
}

/**
 * Minimal PDF 1.4 writer: one full-page JPEG per page (DCTDecode, so the JPEG bytes are
 * embedded as they are). No dependencies, works on mobile.
 */
export function buildImagePdf(pages: PdfImagePage[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (d: string | Uint8Array) => {
    const bytes = typeof d === "string" ? enc.encode(d) : d;
    chunks.push(bytes);
    length += bytes.length;
  };
  const begin = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };
  const end = () => push("\nendobj\n");

  push("%PDF-1.4\n%âãÏÓ\n");
  const pageObj = (i: number) => 3 + i * 3;
  begin(1);
  push("<< /Type /Catalog /Pages 2 0 R >>");
  end();
  begin(2);
  push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  end();

  pages.forEach((p, i) => {
    const pageN = pageObj(i);
    const imgN = pageN + 1;
    const contentN = pageN + 2;
    const w = p.ptWidth.toFixed(2);
    const h = p.ptHeight.toFixed(2);
    begin(pageN);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contentN} 0 R >>`);
    end();
    begin(imgN);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${p.pxWidth} /Height ${p.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    push(p.jpeg);
    push("\nendstream");
    end();
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    begin(contentN);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`);
    end();
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** Renders every page (150 dpi on A4) and builds a PDF. */
export async function exportNotebookPdf(app: App, nb: Notebook, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const pixelWidth = 1240;
  const pages: PdfImagePage[] = [];
  for (let i = 0; i < nb.pages.length; i++) {
    const page = nb.pages[i];
    const canvas = await renderPageImage(app, page, nb.paper, pixelWidth);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    pages.push({
      jpeg: new Uint8Array(await blob.arrayBuffer()),
      pxWidth: canvas.width,
      pxHeight: canvas.height,
      ptWidth: 595.28,
      ptHeight: 595.28 * (page.h / PAGE_WIDTH),
    });
    onProgress?.(i + 1, nb.pages.length);
  }
  return buildImagePdf(pages);
}

// ============================================================
// PDF export — converts a generated .docx Blob into a .pdf Blob,
// 100% in the browser (no server):
//   docx Blob → docx-preview renders pages into a hidden offscreen
//   container → html2canvas-pro captures each rendered page → jsPDF
//   places every capture as A4 portrait page image(s).
//
// PAGE SLICING: docx-preview's `breakPages` only sections at explicit
// page breaks — a continuous document (no page breaks) renders as ONE
// giant `section.docx` (e.g. 770 × 11,000 px). Fitting that onto one A4
// page would shrink the text to ~2pt (unreadable). So after capturing
// each section canvas, any canvas taller than ONE A4 page at its own
// width is sliced vertically into ceil(h / pageSliceH) chunks
// (pageSliceH = w × 297/210, i.e. the A4 aspect ratio) and each slice
// becomes its own jsPDF A4 page — natural aspect, centered, no
// distortion. The last (shorter) slice leaves the page remainder white.
//
// MEMORY GUARD: the total page count is estimated from the rendered
// layout BEFORE any rasterization — above 300 pages the conversion
// aborts with a clear message instead of freezing/crashing the tab.
// Raster scale: 2 up to 100 pages, 1.5 for 101–300 pages.
//
// All three libraries are loaded with dynamic `await import()` so the
// main bundle stays lean and the static export keeps working
// (docx-preview needs DOM — browser-only).
//
// NOTE (best-effort fidelity): the PDF is a rendered snapshot of the
// DOCX. Legacy Bijoy fonts (SutonnyMJ etc.) are embedded only if they
// are installed on the viewer's device — otherwise the browser falls
// back to a substitute font. Exact print output still depends on the
// DOCX path; treat PDF as a convenient best-effort format.
// ============================================================

/** Download format chosen in the "Download as" toggle (DOCX default). */
export type DownloadFormat = "docx" | "pdf";

/** Upper bound of PDF pages produced per file — beyond this the export
 * aborts instead of exhausting browser memory (rasterization is the
 * expensive step: every page is a full-canvas bitmap). */
export const PDF_MAX_PAGES = 300;

/**
 * Errors that are already user-facing English (surfaced by the toast).
 * The outer wrapper must NOT re-wrap these in "PDF conversion failed".
 */
class PdfExportError extends Error {}

/** ".docx" (case-insensitive) → same name with ".pdf"; anything else
 * keeps its name and just gets ".pdf" appended ("X" → "X.pdf"). */
export function pdfFileNameOf(docxName: string): string {
  if (/\.docx$/i.test(docxName)) return docxName.replace(/\.docx$/i, ".pdf");
  return `${docxName}.pdf`;
}

/** A4 aspect ratio (height/width) — 297mm / 210mm. */
const A4_RATIO = 297 / 210;

/** How many A4 pages a canvas of w×h splits into (1 when it already
 * fits the A4 aspect at its own width). */
function sliceCountOf(w: number, h: number): number {
  const pageSliceH = Math.round(w * A4_RATIO);
  return h <= pageSliceH ? 1 : Math.ceil(h / pageSliceH);
}

/**
 * Render a .docx Blob to a single .pdf Blob.
 * - One jsPDF page per rendered DOCX page (docx-preview `section.docx`);
 *   a section taller than one A4 page at its width is sliced vertically
 *   into several A4 pages (continuous documents paginate correctly).
 * - Each capture is added as an A4-portrait image with the natural
 *   aspect ratio (fills the page, no distortion; short last slice of a
 *   sliced section leaves the page remainder white).
 * - If no pages render, falls back to capturing the whole wrapper.
 *
 * @param docx     the .docx Blob to convert
 * @param baseName file name used only in error messages
 * @throws Error with a clear English message when rendering/capture fails
 *   or the document would exceed the 300-page limit
 */
export async function docxBlobToPdfBlob(docx: Blob, baseName: string): Promise<Blob> {
  // Dynamic imports — browser-only, keeps the main bundle lean
  const [{ renderAsync }, { default: html2canvas }, { jsPDF }] = await Promise.all([
    import("docx-preview"),
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // Hidden offscreen container — created per call, removed after capture.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "900px"; // wider than A4 @96dpi (~794px) so a page never overflows horizontally
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  try {
    // Render the DOCX into the offscreen host (docx-preview unzips and
    // styles everything itself; useBase64URL keeps images capture-safe).
    await renderAsync(docx, host, undefined, {
      inWrapper: true,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      experimental: false,
    });

    // Let webfonts finish loading and give layout a moment to settle
    // before rasterizing, otherwise text can capture with fallback metrics.
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // fonts API hiccup — proceed, worst case slightly different metrics
      }
    }
    await new Promise((r) => setTimeout(r, 150));

    // One element per page; fall back to the whole wrapper if the
    // document produced zero page sections (e.g. empty/odd body).
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".docx-wrapper > section.docx"));
    const targets: HTMLElement[] = pages.length
      ? pages
      : (() => {
          const wrapper = host.querySelector<HTMLElement>(".docx-wrapper");
          if (wrapper) return [wrapper];
          return host.childElementCount > 0
            ? [host.firstElementChild as HTMLElement]
            : [];
        })();
    if (targets.length === 0) {
      throw new PdfExportError(`the document "${baseName}" rendered to zero pages`);
    }

    // Upfront page-count estimate from the laid-out section sizes.
    // Scale-independent (both axes grow by `scale`, so a section's slice
    // count does not change) — used to pick the raster scale AND to
    // enforce the memory guard BEFORE any heavy canvas work.
    const estPages = targets.reduce(
      (a, t) => a + sliceCountOf(Math.max(1, t.offsetWidth), Math.max(1, t.offsetHeight)),
      0
    );
    if (estPages > PDF_MAX_PAGES) {
      throw new PdfExportError(
        `"${baseName}" rendered ${estPages} pages — in-browser PDF export supports up to ${PDF_MAX_PAGES} pages. Download as DOCX instead.`
      );
    }
    const scale = estPages > 100 ? 1.5 : 2;

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    let pdfPages = 0;
    let isFirstPage = true;

    for (let i = 0; i < targets.length; i++) {
      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(targets[i], {
          scale,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
      } catch (e) {
        throw new PdfExportError(
          `could not rasterize page ${pdfPages + 1} of "${baseName}" for PDF: ${e instanceof Error ? e.message : String(e)}`
        );
      }

      // Slice a taller-than-A4 canvas into one page per A4-height chunk
      // (continuous documents have no explicit page breaks → one huge
      // section; without slicing it would shrink onto a single page).
      const sliceCount = sliceCountOf(canvas.width, canvas.height);
      const pageSliceH = Math.round(canvas.width * A4_RATIO);
      pdfPages += sliceCount;
      if (pdfPages > PDF_MAX_PAGES) {
        throw new PdfExportError(
          `"${baseName}" rendered ${pdfPages}+ pages — in-browser PDF export supports up to ${PDF_MAX_PAGES} pages. Download as DOCX instead.`
        );
      }

      for (let s = 0; s < sliceCount; s++) {
        const sliceY = s * pageSliceH;
        // Last slice may be shorter — its height is what remains.
        const sliceH = Math.min(pageSliceH, canvas.height - sliceY);
        let dataUrl: string;
        if (sliceCount === 1) {
          // Normal case — the whole canvas is one A4-proportioned page.
          dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        } else {
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = sliceH;
          const ctx = slice.getContext("2d");
          if (!ctx) {
            throw new PdfExportError(
              `could not create a canvas slice while converting "${baseName}" to PDF`
            );
          }
          // White fill keeps the JPEG opaque (transparent → black otherwise)
          // and gives an overflowing last slice its white remainder.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, sliceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          dataUrl = slice.toDataURL("image/jpeg", 0.95);
        }

        // Fit into A4 keeping the slice's own aspect ratio (a full slice
        // is A4-proportioned and fills the page exactly; a shorter last
        // slice is width-fitted and centered — remainder stays white).
        const ratio = Math.min(pageW / canvas.width, pageH / sliceH);
        const w = canvas.width * ratio;
        const h = sliceH * ratio;
        if (!isFirstPage) pdf.addPage();
        isFirstPage = false;
        pdf.addImage(dataUrl, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      }
    }

    return pdf.output("blob");
  } catch (e) {
    if (e instanceof PdfExportError) throw e; // already user-facing English
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`PDF conversion failed for "${baseName}" — ${detail}`);
  } finally {
    host.remove();
  }
}

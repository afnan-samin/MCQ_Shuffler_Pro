// ============================================================
// PDF export — converts a generated .docx Blob into a .pdf Blob,
// 100% in the browser (no server):
//   docx Blob → docx-preview renders pages into a hidden offscreen
//   container → html2canvas-pro captures each rendered page at scale 2
//   → jsPDF places every capture as a full A4 page image.
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

/** ".docx" suffix → ".pdf" ("X.docx" → "X.pdf", everything else unchanged). */
export function pdfFileNameOf(docxName: string): string {
  return docxName.replace(/\.docx$/i, ".pdf");
}

/**
 * Render a .docx Blob to a single .pdf Blob.
 * - One jsPDF page per rendered DOCX page (docx-preview `section.docx`).
 * - Each page is captured at scale 2 and added as an A4-portrait image
 *   that fills the page with the correct aspect ratio (no distortion).
 * - If no pages render, falls back to capturing the whole wrapper.
 *
 * @param docx     the .docx Blob to convert
 * @param baseName file name used only in error messages
 * @throws Error with a clear English message when rendering/capture fails
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
      throw new Error(`the document "${baseName}" rendered to zero pages`);
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < targets.length; i++) {
      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(targets[i], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
      } catch (e) {
        throw new Error(
          `could not rasterize page ${i + 1} of "${baseName}" for PDF: ${e instanceof Error ? e.message : String(e)}`
        );
      }
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      // Fit into A4 keeping the aspect ratio (a rendered DOCX page is
      // already A4-proportioned, so this usually fills the page exactly).
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      if (i > 0) pdf.addPage();
      pdf.addImage(dataUrl, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
    }

    return pdf.output("blob");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`PDF conversion failed for "${baseName}" — ${detail}`);
  } finally {
    host.remove();
  }
}

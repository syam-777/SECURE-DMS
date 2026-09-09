const MAX_OCR_PAGES_DEFAULT = 20;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const OCR_LANGUAGE = process.env.OCR_LANGUAGE || "eng";

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampOcrPages(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * OCR an image buffer (JPG or PNG) using Tesseract.js.
 *
 * @param {Buffer} buffer
 * @param {string} [language]
 * @returns {Promise<{ text: string, confidence: number, isOcr: boolean, extractionMethod: string }>}
 */
async function ocrImageBuffer(buffer, language) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("ocrImageBuffer requires a Buffer");
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error("Image exceeds maximum OCR size of 10 MB");
  }

  const lang = language || OCR_LANGUAGE;
  const { createWorker } = require("tesseract.js");
  const worker = await createWorker(lang);

  try {
    const { data } = await worker.recognize(buffer);
    return {
      text: normalizeWhitespace(data.text || ""),
      confidence: data.confidence != null ? data.confidence : 0,
      isOcr: true,
      extractionMethod: "image_ocr",
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR a PDF buffer by rasterizing pages with pdf-to-img, then running
 * Tesseract.js on each rendered page image.
 *
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {number} [opts.maxPages]
 * @param {string} [opts.language]
 * @returns {Promise<{ text: string, confidence: number, isOcr: boolean, extractionMethod: string }>}
 */
async function ocrPdfBuffer(buffer, opts) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("ocrPdfBuffer requires a Buffer");
  }

  const maxPages = clampOcrPages(
    opts && opts.maxPages != null ? opts.maxPages : MAX_OCR_PAGES_DEFAULT
  );
  const lang = (opts && opts.language) || OCR_LANGUAGE;

  let pdfDoc = null;
  const { createWorker } = require("tesseract.js");
  const worker = await createWorker(lang);

  try {
    const pdfToImg = (await import("pdf-to-img")).default;
    pdfDoc = await pdfToImg(buffer, { imageType: "jpg", scale: 2 });

    const totalPages = pdfDoc.length;
    const pagesToProcess = Math.min(totalPages, maxPages);
    const pageTexts = [];
    let totalConfidence = 0;

    for (let i = 0; i < pagesToProcess; i++) {
      const pageBuffer = Buffer.from(pdfDoc[i]);
      const { data } = await worker.recognize(pageBuffer);
      const pageText = normalizeWhitespace(data.text || "");
      if (pageText.length > 0) {
        pageTexts.push(pageText);
      }
      if (data.confidence != null) {
        totalConfidence += data.confidence;
      }
    }

    const avgConfidence =
      pagesToProcess > 0 ? totalConfidence / pagesToProcess : 0;

    return {
      text: normalizeWhitespace(pageTexts.join("\n\n")),
      confidence: Math.round(avgConfidence * 100) / 100,
      isOcr: true,
      extractionMethod: "ocr",
    };
  } finally {
    await worker.terminate();
    if (pdfDoc && typeof pdfDoc.destroy === "function") {
      try { pdfDoc.destroy(); } catch (_) { /* ignore */ }
    }
  }
}

module.exports = {
  OCR_LANGUAGE,
  MAX_OCR_PAGES_DEFAULT,
  MAX_IMAGE_SIZE,
  normalizeWhitespace,
  clampOcrPages,
  ocrImageBuffer,
  ocrPdfBuffer,
};

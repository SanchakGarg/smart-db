import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { QrBatch } from "@smart-db/contracts";

export type QrLabelSize = "small" | "large";

const A4_W = 595.28;
const A4_H = 841.89;
const MM = 2.834645669;
const MARGIN = 8 * MM;

const LAYOUTS: Record<QrLabelSize, { cols: number; rows: number; labelH: number; cellPad: number; topPad: number }> = {
  small: { cols: 8, rows: 15, labelH: 7 * MM, cellPad: 1, topPad: 3 },
  large: { cols: 6, rows: 15, labelH: 7 * MM, cellPad: 2, topPad: 4 },
};

export async function buildQrBatchLabelsPdf(batch: QrBatch, size: QrLabelSize = "large"): Promise<Uint8Array> {
  const layout = LAYOUTS[size];
  const { cols, rows, labelH, cellPad, topPad } = layout;
  const perPage = cols * rows;

  const usableW = A4_W - 2 * MARGIN;
  const usableH = A4_H - 2 * MARGIN;
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const codes = codesForBatch(batch).slice(0, perPage);

  const images = await Promise.all(codes.map((code) => embedQrImage(pdf, code)));

  const page = pdf.addPage([A4_W, A4_H]);
  const fontSize = Math.min(7, labelH * 0.55);

  for (let i = 0; i < codes.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = MARGIN + col * cellW;
    const y = A4_H - MARGIN - (row + 1) * cellH;

    page.drawRectangle({ x, y, width: cellW, height: cellH, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });

    const code = codes[i]!;
    const qrAreaH = cellH - labelH - topPad;
    const qrSize = Math.min(cellW - 2 * cellPad, qrAreaH - 2 * cellPad);
    const qrX = x + (cellW - qrSize) / 2;
    const qrY = y + labelH + (qrAreaH - qrSize) / 2;

    page.drawImage(images[i]!, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    const codeWidth = bold.widthOfTextAtSize(code, fontSize);
    page.drawText(code, {
      x: x + (cellW - codeWidth) / 2,
      y: y + (labelH - fontSize) / 2,
      size: fontSize,
      font: bold,
      color: rgb(0, 0, 0),
    });
  }

  const meta = `${batch.id}  |  ${batch.prefix}-${batch.startNumber} to ${batch.prefix}-${batch.endNumber}  |  ${codes.length} labels  |  ${size}`;
  page.drawText(meta, { x: MARGIN, y: MARGIN / 2 - 2, size: 5.5, font, color: rgb(0.55, 0.57, 0.6) });

  return pdf.save();
}

export const qrBatchLabelInternals = {
  codesForBatch,
  labelsPerPage: (size: QrLabelSize) => LAYOUTS[size].cols * LAYOUTS[size].rows,
};

function codesForBatch(batch: QrBatch): string[] {
  const codes: string[] = [];
  for (let n = batch.startNumber; n <= batch.endNumber; n++) {
    codes.push(`${batch.prefix}-${n}`);
  }
  return codes;
}

async function embedQrImage(pdf: PDFDocument, code: string) {
  const buffer = await (QRCode as unknown as { toBuffer: (text: string, opts: Record<string, unknown>) => Promise<Buffer> }).toBuffer(code, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return pdf.embedPng(buffer);
}

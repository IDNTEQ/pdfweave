import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pdf2img } from '@pdfweave/converter';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage } from '@pdfweave/pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const artifactRoot = path.join(__dirname, '..', 'test-artifacts', 'n-up');

export interface SourcePageSpec {
  width: number;
  height: number;
  label?: string;
  rotation?: 0 | 90 | 180 | 270;
  blank?: boolean;
}

export const createSourcePdf = async (specs: SourcePageSpec[]): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  for (const [index, spec] of specs.entries()) {
    const page = document.addPage([spec.width, spec.height]);
    if (spec.rotation) page.setRotation(degrees(spec.rotation));
    if (spec.blank) continue;

    const label = spec.label ?? `PAGE ${index + 1}`;
    const accent = [rgb(0.08, 0.28, 0.38), rgb(0.72, 0.18, 0.2), rgb(0.08, 0.48, 0.3)][index % 3];
    page.drawRectangle({ x: 0, y: 0, width: spec.width, height: spec.height, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 0, y: spec.height - 18, width: spec.width, height: 18, color: accent });
    page.drawText(label, {
      x: 8,
      y: spec.height - 14,
      size: 9,
      color: rgb(1, 1, 1),
      font: bold,
    });
    page.drawText(`source ${index + 1}`, {
      x: 8,
      y: 8,
      size: 7,
      color: rgb(0.12, 0.16, 0.2),
      font,
    });
    page.drawLine({
      start: { x: 7, y: 7 },
      end: { x: spec.width - 7, y: spec.height - 25 },
      thickness: 1,
      color: accent,
    });
    page.drawCircle({ x: spec.width - 12, y: 12, size: 6, color: accent });
  }
  return document.save();
};

export const addLinkAnnotation = (page: PDFPage): void => {
  const annotation = page.doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [0, 0, 20, 20],
    Border: [0, 0, 0],
  });
  page.node.addAnnot(page.doc.context.register(annotation));
};

export const pdfToImages = async (pdf: ArrayBuffer | Uint8Array): Promise<Buffer[]> => {
  const images = await pdf2img(pdf, { imageType: 'png', scale: 1.25 });
  return images.map((image) => Buffer.from(new Uint8Array(image)));
};

export const writeArtifacts = (
  scenario: string,
  pdf: Uint8Array,
  images: Buffer[],
  manifest: Record<string, unknown>,
): void => {
  const outputDirectory = path.join(artifactRoot, scenario);
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, `${scenario}.pdf`), pdf);
  for (const [index, image] of images.entries()) {
    writeFileSync(
      path.join(outputDirectory, `${scenario}-sheet-${String(index + 1).padStart(2, '0')}.png`),
      image,
    );
  }
  const artifactManifest = {
    ...manifest,
    output: {
      pdfBytes: pdf.byteLength,
      pdfSha256: createHash('sha256').update(pdf).digest('hex'),
      sheetPngBytes: images.map((image) => image.byteLength),
    },
    environment: { node: process.version, platform: platform() },
  };
  writeFileSync(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(artifactManifest, null, 2)}\n`,
  );
};

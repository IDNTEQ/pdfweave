import generate from '../src/generate.js';
import { other } from './assets/templates/index.js';
import { getInputFromTemplate } from '@pdfweave/common';
import { text, image, signature, svg, line, rectangle, ellipse, barcodes } from '@pdfweave/schemas';
import { getFont, getImageSnapshotOptions, pdfToImages } from './utils.js';

// Default 5s. Shared GitHub Actions runners are 2-3× slower than local
// dev hardware; the previous 2.5s threshold flaked at ~2.6s on the
// barcodes snapshot. Override with PERFORMANCE_THRESHOLD env var if a
// regression is suspected.
const PERFORMANCE_THRESHOLD = parseFloat(process.env.PERFORMANCE_THRESHOLD || '5');

describe('generate integration test(other)', () => {
  describe.each([other])('%s', (templateData) => {
    const entries = Object.entries(templateData);
    for (let l = 0; l < entries.length; l += 1) {
      const [key, template] = entries[l];

      // eslint-disable-next-line no-loop-func
      test(`snapshot ${key}`, async () => {
        const inputs = getInputFromTemplate(template);

        const font = getFont();
        font['NotoSerifJP-Regular'].fallback = false;
        font.NotoSerifJP.fallback = false;
        font.NotoSansJP.fallback = false;

        const hrstart = process.hrtime();

        const pdf = await generate({
          inputs,
          template,
          plugins: {
            text,
            image,
            svg,
            line,
            rectangle,
            ellipse,
            signature,
            ...barcodes,
          },
          options: { font },
        });

        const hrend = process.hrtime(hrstart);
        const execSeconds = hrend[0] + hrend[1] / 1000000000;
        if (process.env.CI) {
          expect(execSeconds).toBeLessThan(PERFORMANCE_THRESHOLD);
        } else if (execSeconds >= PERFORMANCE_THRESHOLD) {
          console.warn(
            `Warning: Execution time for ${key} is ${execSeconds} seconds, which is above the threshold of ${PERFORMANCE_THRESHOLD} seconds.`,
          );
        }

        const images = await pdfToImages(pdf);
        for (let i = 0; i < images.length; i++) {
          await expect(images[i]).toMatchImage(getImageSnapshotOptions(`${key}-${i + 1}`));
        }
      });
    }
  });
});

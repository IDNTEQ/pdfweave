import { describe, expect, it } from 'vitest';
import { extractPreviewUrl } from './previewUrl';

describe('extractPreviewUrl', () => {
  it('preserves the configured Vite base path', () => {
    expect(extractPreviewUrl('Local: http://127.0.0.1:4173/pdfweave/')).toBe(
      'http://127.0.0.1:4173/pdfweave',
    );
  });

  it('supports a root preview URL', () => {
    expect(extractPreviewUrl('Local: http://localhost:4173/')).toBe('http://localhost:4173');
  });

  it('ignores unrelated localhost URLs before the Vite Local line', () => {
    const output = [
      'Documentation: http://localhost:3000/help',
      '  Local:   http://127.0.0.1:4174/pdfweave/',
    ].join('\n');

    expect(extractPreviewUrl(output)).toBe('http://127.0.0.1:4174/pdfweave');
  });
});

const previewUrlPattern = /\bLocal:\s*(https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^\s]*)?)/;

export function extractPreviewUrl(output: string): string | undefined {
  return output.match(previewUrlPattern)?.[1].replace(/\/$/, '');
}

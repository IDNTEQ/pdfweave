const PREFIX = '[@pdfweave/imposition]';

export class ImpositionError extends Error {
  constructor(message: string) {
    super(`${PREFIX} ${message}`);
    this.name = 'ImpositionError';
  }
}

export const invalidOption = (path: string, message: string): ImpositionError =>
  new ImpositionError(`Invalid ${path}: ${message}`);

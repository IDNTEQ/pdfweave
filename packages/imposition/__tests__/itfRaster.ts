import { PNG } from 'pngjs';

const ITF_PATTERNS = new Map([
  ['nnwwn', '0'],
  ['wnnnw', '1'],
  ['nwnnw', '2'],
  ['wwnnn', '3'],
  ['nnwnw', '4'],
  ['wnwnn', '5'],
  ['nwwnn', '6'],
  ['nnnww', '7'],
  ['wnnwn', '8'],
  ['nwnwn', '9'],
]);

interface RasterRun {
  dark: boolean;
  width: number;
}

export interface ItfRasterResult {
  value: string;
  quietZoneMillimeters: { left: number; right: number };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted.at(middle - 1) ?? 0) + (sorted.at(middle) ?? 0)) / 2
    : (sorted.at(middle) ?? 0);
};

const readRuns = (image: PNG): RasterRun[] => {
  const scanY = Math.floor(image.height / 2);
  const runs: RasterRun[] = [];
  let runStart = 0;
  let currentDark = false;

  for (let x = 0; x < image.width; x += 1) {
    const pixelOffset = (scanY * image.width + x) * 4;
    const [red = 255, green = 255, blue = 255] = image.data.subarray(pixelOffset, pixelOffset + 3);
    const dark = (red + green + blue) / 3 < 128;
    if (x === 0) {
      currentDark = dark;
    } else if (dark !== currentDark) {
      runs.push({ dark: currentDark, width: x - runStart });
      currentDark = dark;
      runStart = x;
    }
  }
  runs.push({ dark: currentDark, width: image.width - runStart });
  return runs;
};

const getClusterBoundary = (runs: RasterRun[]): number => {
  const widths = [...new Set(runs.map(({ width }) => width))].sort((left, right) => left - right);
  let boundary = 0;
  let largestGap = 0;
  for (let index = 1; index < widths.length; index += 1) {
    const lower = widths.at(index - 1) ?? 0;
    const upper = widths.at(index) ?? 0;
    const gap = upper - lower;
    if (gap > largestGap) {
      largestGap = gap;
      boundary = (lower + upper) / 2;
    }
  }
  if (largestGap < 2) throw new Error('ITF raster has no distinct narrow and wide clusters');
  return boundary;
};

const decodePayload = (runs: RasterRun[], boundary: number): string => {
  const classify = ({ width }: RasterRun): 'n' | 'w' => (width < boundary ? 'n' : 'w');
  const startPattern = runs
    .slice(0, 4)
    .map((run) => classify(run))
    .join('');
  const stopPattern = runs
    .slice(-3)
    .map((run) => classify(run))
    .join('');
  if (startPattern !== 'nnnn' || stopPattern !== 'wnn') {
    throw new Error(`Invalid ITF guards: start=${startPattern}, stop=${stopPattern}`);
  }

  let value = '';
  const payloadRuns = runs.slice(4, -3);
  for (let offset = 0; offset < payloadRuns.length; offset += 10) {
    const pairRuns = payloadRuns.slice(offset, offset + 10);
    const bars = pairRuns
      .filter((_, index) => index % 2 === 0)
      .map((run) => classify(run))
      .join('');
    const spaces = pairRuns
      .filter((_, index) => index % 2 === 1)
      .map((run) => classify(run))
      .join('');
    const firstDigit = ITF_PATTERNS.get(bars);
    const secondDigit = ITF_PATTERNS.get(spaces);
    if (firstDigit === undefined || secondDigit === undefined) {
      throw new Error(`Invalid ITF digit pair at run ${String(offset + 4)}: ${bars}/${spaces}`);
    }
    value += `${firstDigit}${secondDigit}`;
  }
  return value;
};

export const decodeItfRaster = (image: PNG, dpi: number): ItfRasterResult => {
  const runs = readRuns(image);
  const leadingQuietZone = runs.at(0);
  const trailingQuietZone = runs.at(-1);
  if (!leadingQuietZone || !trailingQuietZone || leadingQuietZone.dark || trailingQuietZone.dark) {
    throw new Error('ITF raster must begin and end with a light quiet zone');
  }

  const symbolRuns = runs.slice(1, -1);
  if (symbolRuns.length !== 227) {
    throw new Error(`Expected 227 ITF runs for 44 digits, received ${String(symbolRuns.length)}`);
  }
  if (symbolRuns.some((run, index) => run.dark !== (index % 2 === 0))) {
    throw new Error('ITF raster does not alternate between bars and spaces');
  }

  const boundary = getClusterBoundary(symbolRuns);
  const narrowWidths = symbolRuns.map(({ width }) => width).filter((width) => width < boundary);
  const wideWidths = symbolRuns.map(({ width }) => width).filter((width) => width >= boundary);
  const wideToNarrowRatio = median(wideWidths) / median(narrowWidths);
  if (wideToNarrowRatio < 2 || wideToNarrowRatio > 3.5) {
    throw new Error(`Unexpected ITF wide/narrow ratio: ${wideToNarrowRatio.toFixed(2)}`);
  }

  const pixelsPerMillimeter = dpi / 25.4;
  const quietZoneMillimeters = {
    left: leadingQuietZone.width / pixelsPerMillimeter,
    right: trailingQuietZone.width / pixelsPerMillimeter,
  };
  if (quietZoneMillimeters.left < 5 || quietZoneMillimeters.right < 5) {
    throw new Error(
      `ITF quiet zone is below 5 mm: ${quietZoneMillimeters.left.toFixed(2)}/${quietZoneMillimeters.right.toFixed(2)}`,
    );
  }

  return { value: decodePayload(symbolRuns, boundary), quietZoneMillimeters };
};

export const cropMillimeterRegion = (
  pngBytes: ArrayBuffer,
  pageWidthMillimeters: number,
  region: { x: number; y: number; width: number; height: number },
): PNG => {
  const source = PNG.sync.read(Buffer.from(new Uint8Array(pngBytes)));
  const pixelsPerMillimeter = source.width / pageWidthMillimeters;
  const target = new PNG({
    width: Math.round(region.width * pixelsPerMillimeter),
    height: Math.round(region.height * pixelsPerMillimeter),
  });
  PNG.bitblt(
    source,
    target,
    Math.round(region.x * pixelsPerMillimeter),
    Math.round(region.y * pixelsPerMillimeter),
    target.width,
    target.height,
    0,
    0,
  );
  return target;
};

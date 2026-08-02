import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const getNpmDistTag = (version) => {
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`Invalid release version: ${version}`);
  return match[1] ? 'next' : 'latest';
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(getNpmDistTag(process.argv[2] ?? ''));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

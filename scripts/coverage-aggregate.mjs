#!/usr/bin/env node
// scripts/coverage-aggregate.mjs
//
// Reads each packages/<pkg>/coverage/coverage-summary.json (produced by
// vitest's v8 coverage provider) and writes:
//   - coverage/aggregate-summary.json
//   - coverage/aggregate.md
//
// Packages that did not produce a coverage-summary.json get a "MISSING" row
// in the markdown report and are recorded as null in the JSON output.
//
// This script intentionally has no third-party deps: it only uses Node's
// stdlib so it can run before/after `npm install` without bootstrap issues.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const packagesDir = join(repoRoot, 'packages');
const outDir = join(repoRoot, 'coverage');

/**
 * Pull the four standard metrics off an istanbul-style summary entry.
 * Returns an object of `{ pct, covered, total }` per metric, plus the raw entry.
 */
function pickMetrics(entry) {
  if (!entry) return null;
  const result = {};
  for (const key of ['lines', 'branches', 'functions', 'statements']) {
    const m = entry[key];
    if (!m) {
      result[key] = { pct: 0, covered: 0, total: 0 };
    } else {
      result[key] = {
        pct: typeof m.pct === 'number' ? m.pct : 0,
        covered: m.covered ?? 0,
        total: m.total ?? 0,
      };
    }
  }
  return result;
}

/** Find the per-package coverage summary, or null if it doesn't exist. */
function readPackageSummary(pkgName) {
  const summaryPath = join(packagesDir, pkgName, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(summaryPath, 'utf8'));
    return pickMetrics(raw.total);
  } catch (err) {
    console.warn(`[coverage-aggregate] Failed to parse ${summaryPath}: ${err.message}`);
    return null;
  }
}

/** Format a number as `XX.XX%` or `n/a` for missing data. */
function fmtPct(metric) {
  if (!metric || typeof metric.pct !== 'number') return 'n/a';
  return `${metric.pct.toFixed(2)}%`;
}

/** Render the markdown report. */
function renderMarkdown(perPackage, total) {
  const lines = [];
  lines.push('# Coverage Aggregate');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push('| Package | Lines | Branches | Functions | Statements |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [name, m] of Object.entries(perPackage)) {
    if (!m) {
      lines.push(`| \`${name}\` | MISSING | MISSING | MISSING | MISSING |`);
      continue;
    }
    lines.push(
      `| \`${name}\` | ${fmtPct(m.lines)} | ${fmtPct(m.branches)} | ${fmtPct(m.functions)} | ${fmtPct(m.statements)} |`,
    );
  }
  lines.push(
    `| **TOTAL** | **${fmtPct(total.lines)}** | **${fmtPct(total.branches)}** | **${fmtPct(total.functions)}** | **${fmtPct(total.statements)}** |`,
  );
  lines.push('');
  return lines.join('\n');
}

/** Sum up the four metrics across all packages that produced numbers. */
function aggregateTotals(perPackage) {
  const totals = {
    lines: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    statements: { covered: 0, total: 0 },
  };
  for (const m of Object.values(perPackage)) {
    if (!m) continue;
    for (const key of Object.keys(totals)) {
      totals[key].covered += m[key].covered;
      totals[key].total += m[key].total;
    }
  }
  const out = {};
  for (const [key, v] of Object.entries(totals)) {
    const pct = v.total === 0 ? 0 : (v.covered / v.total) * 100;
    out[key] = { pct: Number(pct.toFixed(2)), covered: v.covered, total: v.total };
  }
  return out;
}

function main() {
  if (!existsSync(packagesDir)) {
    console.error(`[coverage-aggregate] packages directory not found: ${packagesDir}`);
    process.exit(1);
  }
  const pkgs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const perPackage = {};
  for (const name of pkgs) {
    perPackage[name] = readPackageSummary(name);
  }

  const total = aggregateTotals(perPackage);
  const json = { generatedAt: new Date().toISOString(), packages: perPackage, total };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'aggregate-summary.json'), `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(join(outDir, 'aggregate.md'), renderMarkdown(perPackage, total));

  // Console-friendly summary so CI logs are useful.
  console.log('');
  console.log('Coverage aggregate (across packages):');
  for (const [name, m] of Object.entries(perPackage)) {
    if (!m) {
      console.log(`  ${name.padEnd(14)}  MISSING`);
      continue;
    }
    console.log(
      `  ${name.padEnd(14)}  L ${fmtPct(m.lines).padStart(7)}  B ${fmtPct(m.branches).padStart(7)}  F ${fmtPct(m.functions).padStart(7)}  S ${fmtPct(m.statements).padStart(7)}`,
    );
  }
  console.log(
    `  ${'TOTAL'.padEnd(14)}  L ${fmtPct(total.lines).padStart(7)}  B ${fmtPct(total.branches).padStart(7)}  F ${fmtPct(total.functions).padStart(7)}  S ${fmtPct(total.statements).padStart(7)}`,
  );
}

main();

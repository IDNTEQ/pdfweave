#!/usr/bin/env node
// scripts/crap.mjs
//
// CRAP (Change Risk Anti-Patterns) analysis.
//
// CRAP(f) = complexity(f)^2 * (1 - coverage(f))^3 + complexity(f)
//
// Approach
// --------
// Complexity:  walk each .ts/.tsx file with the TypeScript compiler API and
//              compute cyclomatic complexity per function (decision points
//              + 1: `if`/`else if`, `case`, `&&`, `||`, `??`, ternary,
//              `for`, `while`, `do`, `catch`).
// Coverage:    read packages/<pkg>/coverage/coverage-final.json (vitest's v8
//              provider emits istanbul-format files with per-function
//              execution counts in `f` and per-statement counts in `s`).
//              Function coverage = covered_statements_in_function /
//              total_statements_in_function. Falls back to f-count > 0 for
//              functions whose statements aren't ranged in the report.
//
// Outputs
// -------
//   coverage/crap-report.json — full sorted list
//   coverage/crap-report.md   — top 20 + counts over thresholds
//
// Allowlist
// ---------
// .crap-allowlist.json contains entries of shape:
//   [{ "file": "<repo-relative path>", "function": "<name>",
//      "reason": "<why>", "until": "YYYY-MM-DD" }]
// `file` may be a substring suffix-match; `function` exact match. The
// process exits non-zero if any non-allowlisted function exceeds CRAP > 30.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const packagesDir = join(repoRoot, 'packages');
const outDir = join(repoRoot, 'coverage');
const allowlistPath = join(repoRoot, '.crap-allowlist.json');

const CRAP_FAIL_THRESHOLD = 30;
const CRAP_HIGH_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Cyclomatic complexity via TypeScript AST
// ---------------------------------------------------------------------------

/**
 * Returns true if `node` is a function-like declaration whose body we treat
 * as a top-level scope for complexity counting. Includes arrow functions and
 * methods.
 */
function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

/**
 * Best-effort name for a function-like node. Walks up the parent chain so an
 * anonymous arrow assigned to `const foo = () => ...` becomes "foo".
 */
function describeFunction(node) {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText();
  }
  if (ts.isConstructorDeclaration(node)) {
    const cls = node.parent;
    return cls && ts.isClassDeclaration(cls) && cls.name ? `${cls.name.text}.constructor` : 'constructor';
  }
  const parent = node.parent;
  if (parent) {
    if (ts.isVariableDeclaration(parent) && parent.name) return parent.name.getText();
    if (ts.isPropertyAssignment(parent) && parent.name) return parent.name.getText();
    if (ts.isPropertyDeclaration(parent) && parent.name) return parent.name.getText();
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return parent.left.getText();
    }
    if (ts.isExportAssignment(parent)) return 'default';
  }
  return '<anonymous>';
}

/**
 * Counts decision points inside `fnNode`'s body, *not* descending into nested
 * function bodies (those get their own entry). Cyclomatic complexity is the
 * count + 1.
 */
function cyclomaticComplexity(fnNode) {
  let count = 1;
  const body = fnNode.body;
  if (!body) return count;

  const visit = (node) => {
    // Don't double-count complexity inside nested functions.
    if (node !== fnNode && isFunctionLike(node)) return;

    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
        count += 1;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const op = node.operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          count += 1;
        }
        break;
      }
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(body, visit);
  return count;
}

/**
 * Walks `sourceFile` and returns per-function metadata:
 *   { name, line, column, startPos, endPos, complexity }
 */
function collectFunctionsFromSource(sourceFile) {
  const functions = [];
  const visit = (node) => {
    if (isFunctionLike(node)) {
      const lc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      functions.push({
        name: describeFunction(node),
        line: lc.line + 1,
        column: lc.character + 1,
        startPos: node.getStart(sourceFile),
        endPos: node.getEnd(),
        complexity: cyclomaticComplexity(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return functions;
}

// ---------------------------------------------------------------------------
// Coverage from istanbul-format coverage-final.json
// ---------------------------------------------------------------------------

/**
 * Convert {line, column} to absolute character offset using a precomputed
 * line-start table. v8's istanbul output uses 1-indexed lines and 0-indexed
 * columns.
 */
function locToOffset(loc, lineStarts, sourceLength) {
  if (!loc || typeof loc.line !== 'number') return null;
  const line = loc.line - 1;
  if (line < 0 || line >= lineStarts.length) return null;
  const col = typeof loc.column === 'number' ? loc.column : 0;
  const off = lineStarts[line] + col;
  return Math.min(off, sourceLength);
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * For a single source file, compute the per-function coverage ratio.
 *
 * For each function found by AST traversal:
 *   - find any istanbul fnMap entry whose decl/loc start position falls
 *     inside the function body — use its execution count to short-circuit
 *     to 0% if never executed.
 *   - compute the fraction of statementMap entries inside the function
 *     body whose execution count `s` > 0. This gives a smoother coverage
 *     number than fn-only execution.
 */
function coverageForFunctions(functions, fileCoverage, sourceText) {
  if (!fileCoverage) {
    return functions.map((fn) => ({ ...fn, coverage: 0, hasCoverage: false }));
  }
  const lineStarts = buildLineStarts(sourceText);
  const len = sourceText.length;
  const stmts = Object.entries(fileCoverage.statementMap || {}).map(([id, loc]) => ({
    id,
    start: locToOffset(loc.start, lineStarts, len),
    end: locToOffset(loc.end, lineStarts, len),
    count: fileCoverage.s?.[id] ?? 0,
  }));
  const fns = Object.entries(fileCoverage.fnMap || {}).map(([id, entry]) => ({
    id,
    start: locToOffset(entry.decl?.start ?? entry.loc?.start, lineStarts, len),
    end: locToOffset(entry.decl?.end ?? entry.loc?.end, lineStarts, len),
    count: fileCoverage.f?.[id] ?? 0,
  }));

  return functions.map((fn) => {
    const inside = stmts.filter(
      (s) => s.start !== null && s.start >= fn.startPos && s.start < fn.endPos,
    );
    let covRatio = 0;
    let resolved = false;
    if (inside.length > 0) {
      const covered = inside.filter((s) => s.count > 0).length;
      covRatio = covered / inside.length;
      resolved = true;
    } else {
      // No statementMap entries land inside; fall back to istanbul fn count.
      const matching = fns.find(
        (f) => f.start !== null && f.start >= fn.startPos && f.start <= fn.endPos,
      );
      if (matching) {
        covRatio = matching.count > 0 ? 1 : 0;
        resolved = true;
      }
    }
    return { ...fn, coverage: covRatio, hasCoverage: resolved };
  });
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function readJsonOrNull(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.warn(`[crap] Failed to parse ${path}: ${err.message}`);
    return null;
  }
}

function loadAllowlist() {
  const data = readJsonOrNull(allowlistPath);
  if (!Array.isArray(data)) return [];
  const today = new Date().toISOString().slice(0, 10);
  return data.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (typeof entry.file !== 'string' || typeof entry.function !== 'string') return false;
    if (entry.until && typeof entry.until === 'string' && entry.until < today) {
      console.warn(
        `[crap] Allowlist entry expired (${entry.until} < ${today}): ${entry.file}::${entry.function}`,
      );
      return false;
    }
    return true;
  });
}

function isAllowlisted(allowlist, file, fnName) {
  return allowlist.some((entry) => {
    const fileMatch = file.endsWith(entry.file) || file.includes(entry.file);
    const fnMatch = entry.function === '*' || entry.function === fnName;
    return fileMatch && fnMatch;
  });
}

function listSourceFiles(srcDir) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (dirent.name === '__tests__' || dirent.name === '__mocks__' || dirent.name === 'node_modules') continue;
        walk(full);
      } else if (
        (dirent.name.endsWith('.ts') || dirent.name.endsWith('.tsx')) &&
        !dirent.name.endsWith('.d.ts') &&
        !dirent.name.endsWith('.test.ts') &&
        !dirent.name.endsWith('.test.tsx') &&
        !dirent.name.endsWith('.spec.ts') &&
        !dirent.name.endsWith('.spec.tsx') &&
        dirent.name !== 'index.ts'
      ) {
        out.push(full);
      }
    }
  };
  walk(srcDir);
  return out;
}

function crapScore(complexity, coverage) {
  const inv = 1 - coverage;
  return complexity * complexity * inv * inv * inv + complexity;
}

function analyzePackage(pkgName) {
  const pkgRoot = join(packagesDir, pkgName);
  const srcDir = join(pkgRoot, 'src');
  const coverageFinal = readJsonOrNull(join(pkgRoot, 'coverage', 'coverage-final.json'));
  const sources = listSourceFiles(srcDir);
  const results = [];
  for (const filePath of sources) {
    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const functions = collectFunctionsFromSource(sourceFile);
    if (functions.length === 0) continue;
    const fileCoverage = coverageFinal?.[filePath] ?? null;
    const enriched = coverageForFunctions(functions, fileCoverage, text);
    for (const fn of enriched) {
      const crap = crapScore(fn.complexity, fn.coverage);
      results.push({
        package: pkgName,
        file: relative(repoRoot, filePath),
        function: fn.name,
        line: fn.line,
        complexity: fn.complexity,
        coverage: Number(fn.coverage.toFixed(4)),
        hasCoverage: fn.hasCoverage,
        crap: Number(crap.toFixed(2)),
      });
    }
  }
  return results;
}

function renderMarkdown(all, overFail, overHigh, allowlistedHits) {
  const top = all.slice(0, 20);
  const lines = [];
  lines.push('# CRAP Report');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(
    `Total functions analyzed: **${all.length}**  •  CRAP > ${CRAP_FAIL_THRESHOLD}: **${overFail}** (allowlisted: **${allowlistedHits}**)  •  CRAP > ${CRAP_HIGH_THRESHOLD}: **${overHigh}**`,
  );
  lines.push('');
  lines.push('## Top 20 worst CRAP scores');
  lines.push('');
  lines.push('| # | File | Function | Line | Complexity | Coverage | CRAP |');
  lines.push('| ---: | --- | --- | ---: | ---: | ---: | ---: |');
  top.forEach((row, i) => {
    lines.push(
      `| ${i + 1} | \`${row.file}\` | \`${row.function}\` | ${row.line} | ${row.complexity} | ${(row.coverage * 100).toFixed(1)}% | ${row.crap} |`,
    );
  });
  lines.push('');
  lines.push('Formula: `CRAP = complexity^2 * (1 - coverage)^3 + complexity`.');
  lines.push('Allowlist entries live in `.crap-allowlist.json` with a sunset date.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const pkgs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const allowlist = loadAllowlist();
  let all = [];
  for (const pkg of pkgs) {
    all = all.concat(analyzePackage(pkg));
  }
  all.sort((a, b) => b.crap - a.crap);

  const overFail = all.filter((r) => r.crap > CRAP_FAIL_THRESHOLD).length;
  const overHigh = all.filter((r) => r.crap > CRAP_HIGH_THRESHOLD).length;
  const offenders = all
    .filter((r) => r.crap > CRAP_FAIL_THRESHOLD)
    .map((r) => ({ ...r, allowlisted: isAllowlisted(allowlist, r.file, r.function) }));
  const allowlistedHits = offenders.filter((o) => o.allowlisted).length;
  const blockingOffenders = offenders.filter((o) => !o.allowlisted);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'crap-report.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        thresholds: { fail: CRAP_FAIL_THRESHOLD, high: CRAP_HIGH_THRESHOLD },
        totals: { analyzed: all.length, overFail, overHigh, allowlistedHits },
        offenders,
        all,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(outDir, 'crap-report.md'),
    renderMarkdown(all, overFail, overHigh, allowlistedHits),
  );

  console.log('');
  console.log(`CRAP analysis: ${all.length} functions analyzed.`);
  console.log(
    `  CRAP > ${CRAP_FAIL_THRESHOLD}: ${overFail} (allowlisted: ${allowlistedHits}, blocking: ${blockingOffenders.length})`,
  );
  console.log(`  CRAP > ${CRAP_HIGH_THRESHOLD}: ${overHigh}`);
  console.log('');
  console.log('Top 5 worst:');
  for (const r of all.slice(0, 5)) {
    console.log(
      `  ${r.crap.toString().padStart(7)}  ${r.file}::${r.function} (cx=${r.complexity}, cov=${(r.coverage * 100).toFixed(1)}%)`,
    );
  }

  if (blockingOffenders.length > 0) {
    console.error('');
    console.error(
      `[crap] FAIL: ${blockingOffenders.length} function(s) exceed CRAP > ${CRAP_FAIL_THRESHOLD} and are not allowlisted.`,
    );
    for (const r of blockingOffenders.slice(0, 10)) {
      console.error(
        `  CRAP=${r.crap}  ${r.file}::${r.function} (cx=${r.complexity}, cov=${(r.coverage * 100).toFixed(1)}%)`,
      );
    }
    if (blockingOffenders.length > 10) {
      console.error(`  ... and ${blockingOffenders.length - 10} more (see coverage/crap-report.json)`);
    }
    process.exit(1);
  }
}

main();

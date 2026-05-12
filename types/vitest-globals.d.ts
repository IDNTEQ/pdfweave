import '@testing-library/jest-dom/vitest';
import 'vitest-image-snapshot';
import type {
  afterAll as vitestAfterAll,
  afterEach as vitestAfterEach,
  assert as vitestAssert,
  assertType as vitestAssertType,
  beforeAll as vitestBeforeAll,
  beforeEach as vitestBeforeEach,
  chai as vitestChai,
  describe as vitestDescribe,
  expect as vitestExpect,
  expectTypeOf as vitestExpectTypeOf,
  it as vitestIt,
  onTestFailed as vitestOnTestFailed,
  onTestFinished as vitestOnTestFinished,
  suite as vitestSuite,
  test as vitestTest,
  vi as vitestVi,
  vitest as vitestRunner,
} from 'vitest';

declare global {
  // ESLint's runtime globals need matching types for strict type-aware test rules.
  const afterAll: typeof vitestAfterAll;
  const afterEach: typeof vitestAfterEach;
  const assert: typeof vitestAssert;
  const assertType: typeof vitestAssertType;
  const beforeAll: typeof vitestBeforeAll;
  const beforeEach: typeof vitestBeforeEach;
  const chai: typeof vitestChai;
  const describe: typeof vitestDescribe;
  const expect: typeof vitestExpect;
  const expectTypeOf: typeof vitestExpectTypeOf;
  const it: typeof vitestIt;
  const onTestFailed: typeof vitestOnTestFailed;
  const onTestFinished: typeof vitestOnTestFinished;
  const suite: typeof vitestSuite;
  const test: typeof vitestTest;
  const vi: typeof vitestVi;
  const vitest: typeof vitestRunner;
}

export {};

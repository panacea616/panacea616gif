import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetCandidates, findBestFit, scoreSettings } from '../src/target-fit.mjs';

test('target candidates are dense, sorted by quality, and include useful intermediate settings', () => {
  const base = { width: 960, fps: 24, colors: 256 };
  const candidates = buildTargetCandidates(base);
  assert.ok(candidates.length > 500, `expected a denser settings grid, got ${candidates.length}`);
  assert.deepEqual(candidates[0], base);
  assert.ok(candidates.some((c) => c.width === 640 && c.fps === 12 && c.colors === 256), 'include a useful 640px/12FPS/high-palette combination');
  assert.ok(candidates.some((c) => c.width === 640 && c.fps === 15 && c.colors === 192), 'include intermediate width/FPS/colour combinations');
  for (let index = 1; index < candidates.length; index++) {
    assert.ok(scoreSettings(candidates[index - 1], base) >= scoreSettings(candidates[index], base), `candidate ${index - 1} is not quality-ordered`);
  }
  for (const candidate of candidates) {
    assert.ok(candidate.width <= base.width && candidate.width >= 320 && candidate.width % 2 === 0);
    assert.ok(candidate.fps <= base.fps && candidate.fps >= 6);
    assert.ok(candidate.colors <= base.colors && candidate.colors >= 64);
  }
});

test('findBestFit chooses the highest-ranked candidate for monotonic encoded sizes', async () => {
  const base = { width: 800, fps: 15, colors: 256 };
  const candidates = buildTargetCandidates(base);
  const targetBytes = 500;
  let conversionCount = 0;
  const result = await findBestFit({
    base,
    targetBytes,
    convert: async (settings) => {
      conversionCount += 1;
      return { size: Math.round(scoreSettings(settings, base) * 1000) };
    },
  });
  const expected = candidates.find((candidate) => Math.round(scoreSettings(candidate, base) * 1000) <= targetBytes);
  assert.deepEqual(result.settings, expected);
  assert.equal(result.metLimit, true);
  assert.ok(result.blob.size <= targetBytes);
  assert.equal(conversionCount, result.attempts);
  assert.ok(result.attempts < candidates.length, 'search should avoid encoding every candidate');
  assert.ok(result.attempts <= Math.ceil(Math.log2(candidates.length)) + 15, `search took ${result.attempts} attempts`);
});

test('findBestFit handles non-monotonic sizes by checking nearby candidates past an oversized result', async () => {
  const base = { width: 960, fps: 24, colors: 256 };
  const candidates = buildTargetCandidates(base);
  const boundary = Math.floor(candidates.length / 2);
  const higherQualityButNonMonotonicIndex = boundary - 5;
  const targetBytes = 1000;
  const result = await findBestFit({
    base,
    targetBytes,
    convert: async (_settings, index) => ({
      size: index === higherQualityButNonMonotonicIndex ? 700 : index < boundary ? 1200 : 600,
    }),
  });
  assert.deepEqual(result.settings, candidates[higherQualityButNonMonotonicIndex]);
  assert.equal(result.blob.size, 700);
  assert.equal(result.metLimit, true);
});

test('findBestFit returns the top-quality candidate after one encode if it already fits', async () => {
  const base = { width: 960, fps: 24, colors: 256 };
  let conversionCount = 0;
  const result = await findBestFit({
    base,
    targetBytes: 10_000_000,
    convert: async () => { conversionCount += 1; return { size: 100_000 }; },
  });
  assert.deepEqual(result.settings, buildTargetCandidates(base)[0]);
  assert.equal(result.metLimit, true);
  assert.equal(result.attempts, 1);
  assert.equal(conversionCount, 1);
});

test('no-fit case returns the smallest measured candidate and preserves actual measured size', async () => {
  const base = { width: 800, fps: 15, colors: 256 };
  const candidates = buildTargetCandidates(base);
  const result = await findBestFit({
    base,
    targetBytes: 1,
    convert: async (settings) => ({ size: Math.round(scoreSettings(settings, base) * 1000) + 100 }),
  });
  assert.deepEqual(result.settings, candidates.at(-1));
  assert.equal(result.metLimit, false);
  assert.ok(result.blob.size > result.targetBytes);
});

test('fixed-width mode never changes the requested width', async () => {
  const base = { width: 960, fps: 24, colors: 256 };
  const fixedWidth = 437;
  const candidates = buildTargetCandidates(base, { fixedWidth });
  assert.ok(candidates.length > 50);
  assert.ok(candidates.every((candidate) => candidate.width === fixedWidth));
  assert.ok(candidates.some((candidate) => candidate.fps < 24));
  assert.ok(candidates.some((candidate) => candidate.colors < 256));
  const result = await findBestFit({
    base, fixedWidth, targetBytes: 500,
    convert: async (settings) => ({ size: settings.fps * settings.colors / 4 }),
  });
  assert.equal(result.settings.width, fixedWidth);
  assert.equal(result.metLimit, true);
  assert.ok(result.blob.size <= 500);
});

test('fixed width is retained if the target is impossible', async () => {
  const base = { width: 960, fps: 24, colors: 256 };
  const fixedWidth = 640;
  const result = await findBestFit({
    base, fixedWidth, targetBytes: 1,
    convert: async (settings) => ({ size: settings.width + settings.fps * 10 + settings.colors }),
  });
  assert.equal(result.settings.width, fixedWidth);
  assert.equal(result.metLimit, false);
});

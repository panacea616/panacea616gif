/**
 * Quality-first target-size search for panacea.gif.
 *
 * The candidate ladder is denser than the original coarse presets so that
 * useful combinations such as 640px / 12 FPS / 256 colours are not skipped.
 * GIF byte size is content-dependent and not perfectly monotonic with a
 * settings score, so we use binary search only as a fast boundary estimate,
 * then inspect a bounded window of higher-quality candidates without stopping
 * at the first oversized sample.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function evenWidth(value, maxWidth) {
  const rounded = Math.floor(Number(value) / 2) * 2;
  return clamp(rounded, Math.min(320, maxWidth), maxWidth);
}

export function scoreSettings(settings, base) {
  const widthFactor = settings.width / base.width;
  const fpsFactor = settings.fps / base.fps;
  const colorFactor = settings.colors / base.colors;
  // Width is particularly important visually; FPS and palette add detail.
  return widthFactor ** 2 * fpsFactor * Math.sqrt(colorFactor);
}

export function buildTargetCandidates(base, options = {}) {
  const requestedFixedWidth = Number(options.fixedWidth);
  const hasFixedWidth = Number.isFinite(requestedFixedWidth) && requestedFixedWidth > 0;
  const fixedWidth = hasFixedWidth ? clamp(Math.round(requestedFixedWidth), 120, 1920) : null;
  const baseSettings = {
    width: fixedWidth ?? Math.max(320, Math.floor(Number(base.width) / 2) * 2),
    fps: clamp(Math.floor(Number(base.fps) || 6), 6, 60),
    colors: clamp(Number(base.colors) || 64, 64, 256),
  };

  // Intermediate sizes/settings are important: the previous sparse ladder
  // could jump from an under-used file to a much larger candidate.
  const widthRatios = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 2 / 3, 0.6, 0.5, 0.4, 1 / 3];
  const widths = hasFixedWidth
    ? [fixedWidth]
    : [...new Set(widthRatios.map((ratio) => evenWidth(baseSettings.width * ratio, baseSettings.width)))]
        .sort((a, b) => b - a);
  const fpsValues = [...new Set([baseSettings.fps, 22, 20, 18, 16, 15, 14, 12, 10, 8, 6]
    .map((fps) => clamp(Math.floor(fps), 6, baseSettings.fps)))].sort((a, b) => b - a);
  const colorValues = [...new Set([baseSettings.colors, 224, 192, 160, 128, 96, 64]
    .map((colors) => clamp(colors, 64, baseSettings.colors)))].sort((a, b) => b - a);

  const candidates = [];
  const seen = new Set();
  for (const width of widths) {
    for (const fps of fpsValues) {
      for (const colors of colorValues) {
        const candidate = { width, fps, colors };
        const key = `${width}:${fps}:${colors}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ ...candidate, qualityScore: scoreSettings(candidate, baseSettings) });
      }
    }
  }

  candidates.sort((a, b) =>
    (b.qualityScore - a.qualityScore)
    || (b.width - a.width)
    || (b.fps - a.fps)
    || (b.colors - a.colors));
  return candidates.map(({ qualityScore, ...settings }) => settings);
}

export async function findBestFit({ base, fixedWidth = null, targetBytes, convert, onAttempt }) {
  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    throw new RangeError('Лимит размера должен быть больше нуля.');
  }
  if (typeof convert !== 'function') {
    throw new TypeError('Для подбора размера нужна функция конвертации.');
  }

  const candidates = buildTargetCandidates(base, { fixedWidth });
  if (!candidates.length) throw new Error('Не удалось подготовить варианты настроек.');

  // Only cache metadata for measured settings; keep blobs for the current best
  // fit and the smallest fallback to avoid retaining hundreds of GIFs in RAM.
  const measured = new Map();
  let smallest = null;
  let bestFit = null;
  let attempts = 0;

  const measure = async (index) => {
    const cached = measured.get(index);
    if (cached) return cached;

    const settings = candidates[index];
    attempts += 1;
    onAttempt?.({ settings, index, total: candidates.length, attempt: attempts });
    const blob = await convert(settings, index);
    if (!blob || !Number.isFinite(blob.size)) {
      throw new Error('Не удалось определить размер одного из вариантов GIF.');
    }

    const entry = { index, settings, size: blob.size, metLimit: blob.size <= targetBytes };
    measured.set(index, entry);
    if (!smallest || blob.size < smallest.size) smallest = { ...entry, blob };
    if (entry.metLimit && (!bestFit || index < bestFit.index)) bestFit = { ...entry, blob };
    return entry;
  };

  // If maximum quality fits, stop immediately.
  const top = await measure(0);
  if (top.metLimit) {
    return { blob: bestFit.blob, settings: bestFit.settings, metLimit: true, attempts, targetBytes };
  }

  // Use binary search to estimate the quality/size boundary. This is a speed
  // heuristic only: GIF sizes can be non-monotonic, so it is followed by a
  // refinement sweep around the boundary.
  let left = 1;
  let right = candidates.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const result = await measure(mid);
    if (result.metLimit) right = mid - 1;
    else left = mid + 1;
  }

  if (!bestFit && !measured.has(candidates.length - 1)) {
    await measure(candidates.length - 1);
  }

  if (bestFit) {
    // Test a window of higher-ranked candidates even if an individual one is
    // over budget; another nearby combination may fit due to GIF compression.
    // Unlike the old search, never stop at the first oversized candidate.
    const boundaryIndex = bestFit.index;
    const refinementWindow = 12;
    const probeStart = Math.max(0, boundaryIndex - refinementWindow);
    for (let probe = probeStart; probe < boundaryIndex; probe += 1) {
      await measure(probe);
    }
    return { blob: bestFit.blob, settings: bestFit.settings, metLimit: true, attempts, targetBytes };
  }

  // If no checked variant fits, ensure the lowest-quality setting is actually
  // measured and return the smallest observed file with a clear no-fit result.
  if (!measured.has(candidates.length - 1)) await measure(candidates.length - 1);
  if (!smallest) throw new Error('Не удалось создать ни одного варианта GIF.');
  return { blob: smallest.blob, settings: smallest.settings, metLimit: smallest.size <= targetBytes, attempts, targetBytes };
}

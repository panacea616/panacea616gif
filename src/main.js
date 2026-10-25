import { FFmpeg, fetchFile } from './ffmpeg-adapter.js';
import { findBestFit } from './target-fit.mjs';

const $ = (selector) => document.querySelector(selector);
const app = $('#app');

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="panacea.gif, главная">
        <span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5 28 10.25v11.5L16 28.5 4 21.75v-11.5L16 3.5Z"/><path d="M13 10.5 22 16l-9 5.5v-11Z"/></svg></span>
        <span class="brand-word">panacea<span>.gif</span></span>
      </a>
    </header>

    <main>
      <section class="intro">
        <h1>Поймай момент.<br><span>Зацикли его.</span></h1>
        <p class="intro-copy">Превращай видео в GIF с точным контролем фрагмента, качества и итогового размера.</p>
      </section>

      <section class="workspace" aria-label="Конвертер видео в GIF">
        <div class="workspace-main">
          <div class="section-heading"><div><span class="step-number">01</span><h2>Исходное видео</h2></div><span class="small-muted" id="file-meta">MP4, WebM, MOV и другие</span></div>
          <div id="dropzone" class="dropzone">
            <input id="file-input" type="file" accept="video/*,.mp4,.webm,.mov,.m4v,.avi,.mkv" hidden />
            <div class="upload-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6.5" y="8" width="35" height="32" rx="7"/><path d="m20 17 12 7-12 7V17Z"/><path d="M16 3.5h16"/></svg></div>
            <p class="drop-title">Перетащи видео сюда</p>
            <p class="drop-subtitle">или выбери файл на устройстве</p>
            <button class="button button-secondary" id="choose-file" type="button">Выбрать видео <span>↗</span></button>
            <p class="drop-footnote">Обработка происходит локально в браузере</p>
          </div>

          <div id="editor" class="editor hidden">
            <div class="video-frame"><video id="source-video" controls playsinline preload="metadata"></video><div class="video-frame-tag">ORIGINAL</div></div>
            <div class="file-line"><div class="file-symbol">VID</div><div class="file-names"><strong id="source-name">video.mp4</strong><span id="source-details">—</span></div><button id="change-file" class="text-button" type="button">Заменить</button></div>
            <div class="trim-section">
              <div class="trim-heading"><label for="start-number">Фрагмент</label><span class="duration-chip" id="clip-duration">0.0 сек</span></div>
              <div class="trim-timeline-wrap">
                <div class="range-stack" id="range-stack" aria-label="Выбор временного фрагмента">
                  <div class="trim-rail"></div>
                  <div class="trim-range-fill" id="trim-range-fill"></div>
                  <input id="start-range" aria-label="Начало фрагмента" type="range" min="0" max="10" step="0.1" value="0"/>
                  <input id="end-range" aria-label="Конец фрагмента" type="range" min="0" max="10" step="0.1" value="5"/>
                </div>
                <div class="trim-scale"><span id="trim-start-time">00:00.0</span><span id="trim-end-time">00:05.0</span></div>
              </div>
              <div class="time-fields"><label>Начало <div class="time-input-wrap"><input id="start-number" type="number" min="0" step="0.1" value="0"/><span>с</span></div></label><label>Конец <div class="time-input-wrap"><input id="end-number" type="number" min="0.1" step="0.1" value="5"/><span>с</span></div></label><button id="preview-clip" type="button" class="button button-quiet">▶ Предпросмотр фрагмента</button></div>
              <p class="hint">Для быстрого и качественного результата начни с короткого фрагмента — примерно 2–8 секунд.</p>
            </div>
          </div>

          <div id="output-panel" class="output-panel hidden">
            <div class="section-heading output-heading"><div><span class="step-number">03</span><h2>Результат</h2></div><span class="success-label"><span></span> GIF готов</span></div>
            <div class="result-grid"><div class="gif-preview"><img id="gif-preview" alt="Предпросмотр созданной GIF-анимации"/><span class="preview-badge">LOOP PREVIEW</span></div><div class="result-info"><span class="result-kicker">ТВОЯ АНИМАЦИЯ</span><div class="result-name" id="result-name">panacea.gif</div><div class="result-size" id="result-size">—</div><div id="result-note" class="result-note">Готово к скачиванию</div><a class="button button-primary download-button" id="download-gif" download="panacea.gif" href="#">Скачать GIF <span>↓</span></a></div></div>
          </div>
        </div>

        <aside class="settings-panel">
          <div class="section-heading"><div><span class="step-number">02</span><h2>Настройки GIF</h2></div></div>
          <div id="manual-quality-controls" class="manual-quality-controls">
          <p class="field-label">Профиль качества</p>
          <div class="quality-options" role="radiogroup" aria-label="Профиль качества">
            <button type="button" class="quality-card" data-quality="compact" aria-pressed="false"><span class="quality-icon compact-icon">◒</span><span><strong>Компактный</strong><small>Меньше размер</small></span><span class="radio-indicator"></span></button>
            <button type="button" class="quality-card selected" data-quality="balanced" aria-pressed="true"><span class="quality-icon balanced-icon">◑</span><span><strong>Баланс</strong><small>Размер + качество</small></span><span class="radio-indicator"></span></button>
            <button type="button" class="quality-card" data-quality="high" aria-pressed="false"><span class="quality-icon high-icon">●</span><span><strong>Высокое</strong><small>Больше деталей</small></span><span class="radio-indicator"></span></button>
          </div>

          <div class="settings-divider"></div>
          <div class="setting-row"><div><label for="width-select" class="field-label">Ширина GIF</label><p class="field-help">Высота подстроится автоматически</p></div><div class="select-wrap"><select id="width-select"><option value="360">360 px</option><option value="480">480 px</option><option value="640" selected>640 px</option><option value="800">800 px</option><option value="960">960 px</option></select><span>⌄</span></div></div>
          <div class="setting-row"><div><label for="fps-select" class="field-label">Частота кадров</label><p class="field-help">Плавность анимации</p></div><div class="select-wrap"><select id="fps-select"><option value="6">6 FPS</option><option value="8">8 FPS</option><option value="10">10 FPS</option><option value="12" selected>12 FPS</option><option value="15">15 FPS</option><option value="20">20 FPS</option><option value="24">24 FPS</option></select><span>⌄</span></div></div>
          <div class="setting-row"><div><label for="colors-select" class="field-label">Цветовая палитра</label><p class="field-help">GIF поддерживает до 256 цветов</p></div><div class="select-wrap"><select id="colors-select"><option value="64">64 цвета</option><option value="128">128 цветов</option><option value="192" selected>192 цвета</option><option value="256">256 цветов</option></select><span>⌄</span></div></div>

          <div class="color-note"><span class="color-note-icon">✳</span><div><strong>Бережно к цветам</strong><p>Подбираем палитру по выбранному видео, чтобы сохранить больше оттенков и плавность переходов.</p></div></div>
          </div>

          <div class="settings-divider"></div>
          <div class="target-header"><div><p class="field-label">Уложиться в размер</p><p class="field-help">Подберём настройки под заданный лимит</p></div><label class="switch"><input id="target-toggle" type="checkbox"/><span class="switch-track"></span></label></div>
          <div id="target-controls" class="target-controls disabled">
            <label for="target-size" class="field-label">Максимальный размер</label>
            <div class="target-input-wrap"><input id="target-size" type="number" min="0.2" max="100" step="0.5" value="5" disabled/><span>МБ</span></div>
            <p class="field-help">Будем искать качество в пределах лимита. Точный результат зависит от содержимого видео.</p>
            <div class="target-width-lock-row">
              <label class="target-lock-option" for="target-width-lock">
                <input id="target-width-lock" type="checkbox" disabled/>
                <span class="target-lock-copy"><strong>Зафиксировать ширину</strong><small>Не менять разрешение при подборе</small></span>
              </label>
              <div class="target-width-entry"><input id="target-width-input" type="number" min="120" max="1920" step="1" value="640" aria-label="Фиксированная ширина GIF в пикселях" disabled/><span>px</span></div>
            </div>
            <p class="field-help target-width-help" id="target-width-help">Включи фиксацию, если ширина должна остаться определённой. Тогда приложение будет подбирать FPS и количество цветов.</p>
          </div>

          <div class="estimate-card" id="estimate-card">
            <div id="estimate-standard">
              <div class="estimate-top"><span class="estimate-label">РАЗМЕР GIF</span><span class="estimate-tag">ОЦЕНКА</span></div>
              <div class="estimate-value" id="estimate-value">Пока неизвестен</div>
              <p id="estimate-description">Выбери видео и нажми «Оценить размер».</p>
              <button id="estimate-button" class="button button-secondary estimate-button" type="button" disabled>Оценить размер</button>
            </div>
            <div id="estimate-target-summary" class="target-estimate-summary hidden" aria-live="polite">
              <div class="estimate-top"><span class="estimate-label">РЕЖИМ АВТОПОДБОРА</span><span class="estimate-tag">АВТО</span></div>
              <div class="estimate-value" id="target-summary-value">до 5 МБ</div>
              <p id="target-summary-description">При конвертации подберём максимально качественный вариант, который укладывается в лимит. Предварительная оценка не нужна.</p>
            </div>
          </div>
          <button id="convert-button" class="button button-primary convert-button" type="button" disabled><span id="convert-button-label">Создать GIF</span><span class="button-arrow">↗</span></button>
          <p class="processing-note"><span>◈</span> Первый запуск загрузит движок обработки (~31 МБ). После этого он останется в памяти вкладки.</p>
        </aside>
      </section>

      <section id="progress-panel" class="progress-panel hidden" aria-live="polite"><div class="progress-header"><div><span class="step-number">↻</span><strong id="progress-title">Подготовка конвертера</strong></div><span id="progress-status">Это может занять время на больших файлах</span></div><div class="progress-track"><div id="progress-bar" class="progress-bar"></div></div><p id="progress-message">Загрузка движка…</p><button id="cancel-button" class="text-button" type="button">Скрыть статус</button></section>

      <section class="feature-strip"><div><span class="feature-icon">⌘</span><div><strong>Локальная обработка</strong><p>Видео не отправляется на сервер</p></div></div><div><span class="feature-icon">◈</span><div><strong>Палитра под видео</strong><p>Улучшенная передача цветов в GIF</p></div></div><div><span class="feature-icon">↘</span><div><strong>Контроль размера</strong><p>Настройки под нужный результат</p></div></div></section>
      <footer><span>panacea<span class="footer-accent">.gif</span></span><span>Сделано для тех, кто ценит каждый кадр.</span></footer>
    </main>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </div>
`;

const ffmpeg = new FFmpeg();
let engineReady = false;
let engineLoading = null;
let lastProgressPercent = -1;
ffmpeg.on('progress', ({ progress }) => {
  if (!isBusy || !Number.isFinite(progress)) return;
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  if (percent === lastProgressPercent) return;
  lastProgressPercent = percent;
  const bar = $('#progress-bar');
  bar.classList.remove('indeterminate');
  bar.style.width = `${Math.max(4, percent)}%`;
  $('#progress-status').textContent = `${percent}%`;
});
let sourceFile = null;
let sourceObjectUrl = null;
let gifObjectUrl = null;
let inputName = 'input.mp4';
let videoDuration = 0;
let isBusy = false;
let selectedQuality = 'balanced';
let estimateResult = null;
let lastGifBlob = null;
let lastGifSettings = null;
let targetWidthSelectionTouched = false;
let toastTimer;

const presets = {
  compact: { width: 480, fps: 8, colors: 128 },
  balanced: { width: 640, fps: 12, colors: 192 },
  high: { width: 800, fps: 15, colors: 256 },
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}
function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const min = Math.floor(s / 60);
  return `${min}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
}
function updateTrimTimeline(start = selectedStart(), end = selectedEnd()) {
  const duration = Math.max(videoDuration, 0.1);
  const track = $('#range-stack');
  const fill = $('#trim-range-fill');
  const usableWidth = Math.max(0, track.clientWidth - 18);
  const startRatio = Math.max(0, Math.min(1, start / duration));
  const endRatio = Math.max(startRatio, Math.min(1, end / duration));
  fill.style.left = `${9 + usableWidth * startRatio}px`;
  fill.style.width = `${usableWidth * (endRatio - startRatio)}px`;
  $('#trim-start-time').textContent = formatTime(start);
  $('#trim-end-time').textContent = formatTime(end);
}
function selectedStart() { return Number($('#start-number').value) || 0; }
function selectedEnd() { return Number($('#end-number').value) || 0; }
function clipDuration() { return Math.max(0, selectedEnd() - selectedStart()); }
function currentSettings() {
  return {
    width: Number($('#width-select').value),
    fps: Number($('#fps-select').value),
    colors: Number($('#colors-select').value),
  };
}
function targetSizeMB() {
  return Math.max(0.2, Number($('#target-size').value) || 5);
}
function formatTargetSize() {
  return `${targetSizeMB().toLocaleString('ru-RU', { maximumFractionDigits: 2 })} МБ`;
}
function syncTargetModeUI() {
  const enabled = $('#target-toggle').checked;
  const fixedWidth = $('#target-width-lock').checked;
  const widthInput = $('#target-width-input');
  $('#manual-quality-controls').classList.toggle('hidden', enabled);
  $('#estimate-standard').classList.toggle('hidden', enabled);
  $('#estimate-target-summary').classList.toggle('hidden', !enabled);
  $('#target-controls').classList.toggle('disabled', !enabled);
  $('#target-size').disabled = !enabled || isBusy;
  $('#target-width-lock').disabled = !enabled || isBusy;
  widthInput.disabled = !enabled || !fixedWidth || isBusy;
  $('#target-summary-value').textContent = `до ${formatTargetSize()}`;
  $('#target-summary-description').textContent = fixedWidth
    ? `Сохраним ширину ${Math.round(Number(widthInput.value) || 640)} px и подберём FPS и цветовую палитру под лимит.`
    : 'При конвертации подберём разрешение, FPS и цветовую палитру под заданный лимит. Предварительная оценка не нужна.';
  $('#target-width-help').textContent = fixedWidth
    ? `Ширина зафиксирована: ${Math.round(Number(widthInput.value) || 640)} px. Если лимит окажется слишком строгим, приложение будет снижать FPS и количество цветов, но не ширину.`
    : 'Включи фиксацию, если ширина должна остаться определённой. Тогда приложение будет подбирать FPS и количество цветов.';
  $('#convert-button-label').textContent = enabled ? `Подобрать GIF до ${formatTargetSize()}` : 'Создать GIF';
}

function showToast(message, kind = '') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast visible ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3800);
}
function setBusy(value) {
  isBusy = value;
  $('#convert-button').disabled = value || !sourceFile;
  $('#estimate-button').disabled = value || !sourceFile;
  $('#choose-file').disabled = value;
  $('#change-file').disabled = value;
  app.querySelectorAll('.quality-card, .settings-panel select, #target-toggle, #target-size, #target-width-lock, #target-width-input, #start-number, #end-number, #start-range, #end-range').forEach(el => {
    const targetEnabled = $('#target-toggle').checked;
    el.disabled = value
      || (el.id === 'target-size' && !targetEnabled)
      || (el.id === 'target-width-lock' && !targetEnabled)
      || (el.id === 'target-width-input' && (!targetEnabled || !$('#target-width-lock').checked));
  });
  $('#convert-button').classList.toggle('working', value);
}
function setProgress(title, message, percent = null) {
  $('#progress-panel').classList.remove('hidden');
  $('#progress-title').textContent = title;
  $('#progress-message').textContent = message;
  $('#progress-status').textContent = percent == null ? 'Обработка в браузере' : `${Math.round(percent)}%`;
  $('#progress-bar').classList.toggle('indeterminate', percent == null);
  if (percent != null) $('#progress-bar').style.width = `${Math.max(4, Math.min(100, percent))}%`;
}
function endProgress() {
  $('#progress-panel').classList.add('hidden');
  $('#progress-bar').classList.remove('indeterminate');
  $('#progress-bar').style.width = '0%';
}
function extFromFile(file) {
  const match = file.name.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : 'mp4';
}
function renderClipState() {
  const start = selectedStart();
  const end = selectedEnd();
  $('#clip-duration').textContent = `${Math.max(0, end - start).toFixed(1)} сек`;
  $('#start-range').value = String(start);
  $('#end-range').value = String(end);
  $('#start-number').value = String(start);
  $('#end-number').value = String(end);
  updateTrimTimeline(start, end);
  if (sourceFile) {
    $('#estimate-value').textContent = 'Пока неизвестен';
    $('#estimate-description').textContent = 'Нажми «Оценить размер», чтобы получить примерную оценку.';
    estimateResult = null;
  }
  $('#source-video').removeAttribute('data-preview-end');
}
function resetResult() {
  $('#output-panel').classList.add('hidden');
  $('#result-note').textContent = 'Готово к скачиванию';
  $('#estimate-value').textContent = 'Пока неизвестен';
  $('#estimate-description').textContent = 'Выбери видео и нажми «Оценить размер».'.replace('Выбери', 'Выбери');
  estimateResult = null;
  lastGifBlob = null;
  lastGifSettings = null;
  if (gifObjectUrl) URL.revokeObjectURL(gifObjectUrl);
  gifObjectUrl = null;
}
function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|avi|mkv|mpeg|mpg)$/i.test(file.name)) {
    showToast('Похоже, это не видеофайл. Выбери видео и попробуй ещё раз.', 'error');
    return;
  }
  sourceFile = file;
  if (file.size > 60 * 1024 * 1024) {
    showToast('Файл больше 60 МБ: браузеру потребуется много памяти. Для первого теста лучше взять небольшой MP4.', 'error');
  }
  inputName = `input.${extFromFile(file)}`;
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceObjectUrl = URL.createObjectURL(file);
  resetResult();
  $('#source-video').src = sourceObjectUrl;
  $('#source-name').textContent = file.name;
  $('#source-details').textContent = `${formatBytes(file.size)} · подготовка длительности…`;
  $('#file-meta').textContent = formatBytes(file.size);
  $('#dropzone').classList.add('hidden');
  $('#editor').classList.remove('hidden');
  $('#estimate-button').disabled = false;
  $('#convert-button').disabled = false;
  $('#source-video').onloadedmetadata = () => {
    videoDuration = Number.isFinite($('#source-video').duration) ? $('#source-video').duration : 0;
    if (!videoDuration) {
      showToast('Не удалось определить длительность видео. Попробуй MP4 или WebM.', 'error');
      return;
    }
    const end = Math.min(5, videoDuration);
    ['start-range', 'end-range'].forEach(id => { $( '#' + id ).max = String(videoDuration); });
    $('#start-number').max = String(videoDuration);
    $('#end-number').max = String(videoDuration);
    $('#start-number').value = '0';
    $('#end-number').value = end.toFixed(1);
    $('#start-range').value = '0';
    $('#end-range').value = String(end);
    $('#source-details').textContent = `${formatBytes(file.size)} · ${videoDuration.toFixed(1)} сек`;
    renderClipState();
    if (videoDuration > 30) showToast('Длинное видео может обрабатываться медленно. Для теста выбери короткий фрагмент.', '');
  };
  $('#source-video').onerror = () => showToast('Браузер не смог показать предпросмотр этого формата. Попробуй MP4 или WebM.', 'error');
  $('#estimate-button').disabled = false;
  $('#convert-button').disabled = false;
  showToast('Видео добавлено. Выбери фрагмент и настройки.');
}

async function ensureEngine() {
  if (engineReady) return;
  if (engineLoading) return engineLoading;
  engineLoading = (async () => {
    setProgress('Загрузка движка обработки', 'Загружаем FFmpeg.wasm с CDN. Если первый источник недоступен, попробуем второй.', null);
    ffmpeg.on('log', ({ message }) => {
      // Do not place FFmpeg logs directly into HTML; they are shown in the console for debugging.
      console.debug('[FFmpeg]', message);
    });
    await ffmpeg.load();
    engineReady = true;
    lastProgressPercent = -1;
    setProgress('Движок готов', 'FFmpeg загружен. Видео обрабатывается локально в этой вкладке.', 100);
  })();
  try {
    await engineLoading;
  } catch (error) {
    engineLoading = null;
    throw new Error(`Не удалось загрузить FFmpeg. Проверь подключение к интернету и обнови страницу. ${error?.message || ''}`);
  }
}

async function writeSourceToFs() {
  try { await ffmpeg.deleteFile(inputName); } catch {}
  await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));
}
function makeFilter(settings) {
  return `[0:v]fps=${settings.fps},scale=${settings.width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${settings.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`;
}
async function createGif(settings, start, duration, outputName) {
  try { await ffmpeg.deleteFile(outputName); } catch {}
  try {
    const args = [
      '-y', '-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', inputName,
      '-filter_complex', makeFilter(settings),
      '-loop', '0', outputName,
    ];
    await ffmpeg.exec(args);
    const outputData = await ffmpeg.readFile(outputName);
    const bytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData);
    if (!bytes.length) throw new Error('FFmpeg создал пустой GIF-файл.');
    return new Blob([bytes], { type: 'image/gif' });
  } finally {
    // Remove temporary outputs even when FFmpeg or readFile fails, limiting FS memory growth.
    try { await ffmpeg.deleteFile(outputName); } catch {}
  }
}
async function handleConvert() {
  if (!sourceFile || isBusy) return;
  const start = selectedStart();
  const end = selectedEnd();
  const duration = end - start;
  if (!(duration >= 0.25)) {
    showToast('Выбери фрагмент длительностью не меньше 0,25 секунды.', 'error');
    return;
  }
  if (duration > 30 && !confirm('Фрагмент длиннее 30 секунд. Создание GIF может занять много времени и памяти. Продолжить?')) return;

  setBusy(true);
  lastProgressPercent = -1;
  resetResult();
  let chosenBlob = null;
  let chosenSettings = currentSettings();
  const targetMode = $('#target-toggle').checked;
  const targetBytes = targetSizeMB() * 1024 * 1024;
  try {
    await ensureEngine();
    await writeSourceToFs();
    let targetFit = null;
    if (targetMode) {
      // Target-size mode is autonomous. If the user locks a width, candidates
      // may adjust FPS and palette, but must never change the requested width.
      const lockWidth = $('#target-width-lock').checked;
      const fixedWidth = lockWidth ? Math.max(120, Math.min(1920, Math.round(Number($('#target-width-input').value) || 640))) : null;
      const targetBase = { width: fixedWidth ?? 960, fps: 24, colors: 256 };
      targetFit = await findBestFit({
        base: targetBase,
        fixedWidth,
        targetBytes,
        convert: (candidate, index) => createGif(candidate, start, duration, `candidate-${index}.gif`),
        onAttempt: ({ settings, attempt, total }) => {
          // The fast search probes candidates out of order, so progress must
          // follow the number of real encodes rather than candidate rank.
          const expectedChecks = Math.ceil(Math.log2(total)) + 14;
          const percent = Math.min(94, Math.round((attempt / expectedChecks) * 94));
          setProgress(
            'Подбор качества под размер GIF',
            `Проба ${attempt}: ${settings.width}px · ${settings.fps} FPS · ${settings.colors} цветов`,
            percent,
          );
        },
      });
      chosenBlob = targetFit.blob;
      chosenSettings = targetFit.settings;
      if (!targetFit.metLimit) {
        $('#result-note').textContent = `Не удалось уложиться в ${formatBytes(targetBytes)}. Показан самый маленький из проверенных вариантов.`;
      }
    } else {
      setProgress('Создание GIF', 'Конвертируем видео с палитрой, подобранной под выбранный фрагмент…', null);
      chosenBlob = await createGif(chosenSettings, start, duration, 'result.gif');
    }
    if (!chosenBlob) throw new Error('FFmpeg не вернул GIF-файл. Попробуй другой фрагмент или формат видео.');
    lastGifBlob = chosenBlob;
    lastGifSettings = chosenSettings;
    gifObjectUrl = URL.createObjectURL(chosenBlob);
    $('#gif-preview').src = gifObjectUrl;
    $('#result-name').textContent = `${sourceFile.name.replace(/\.[^.]+$/, '') || 'panacea'}.gif`;
    $('#result-size').textContent = formatBytes(chosenBlob.size);
    $('#download-gif').href = gifObjectUrl;
    $('#download-gif').download = `${(sourceFile.name.replace(/\.[^.]+$/, '') || 'panacea').replace(/[^a-z0-9а-яё_-]+/gi, '-').slice(0, 48)}.gif`;
    if (targetMode && targetFit?.metLimit) {
      $('#result-note').textContent = `В лимите ${formatBytes(targetBytes)} · ${chosenSettings.width}px · ${chosenSettings.fps} FPS · ${chosenSettings.colors} цветов`;
    } else if (!targetMode) {
      $('#result-note').textContent = `${chosenSettings.width}px · ${chosenSettings.fps} FPS · ${chosenSettings.colors} цветов`;
    }
    $('#output-panel').classList.remove('hidden');
    $('#estimate-value').textContent = formatBytes(chosenBlob.size);
    $('#estimate-description').textContent = 'Фактический размер готового GIF.';
    // The exact size is now known. If the user clicks Estimate immediately
    // afterwards without changing the source, clip or settings, reuse this
    // actual result instead of estimating the original (pre-fit) settings.
    estimateResult = { bytes: chosenBlob.size, settings: chosenSettings, exact: true };
    setProgress('GIF готов', `Готовый файл: ${formatBytes(chosenBlob.size)}.`, 100);
    showToast(targetMode && chosenBlob.size > targetBytes ? 'GIF создан, но превысил заданный лимит.' : 'GIF успешно создан!', targetMode && chosenBlob.size > targetBytes ? 'error' : 'success');
    $('#output-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Во время конвертации произошла ошибка.', 'error');
    setProgress('Не удалось создать GIF', error?.message || 'Попробуй другой файл или более короткий фрагмент.', 0);
  } finally {
    setBusy(false);
  }
}

async function handleEstimate() {
  if (!sourceFile || isBusy || $('#target-toggle').checked) return;

  // A just-created GIF is a better estimate than a one-second extrapolation.
  // In target-size mode the controls still represent the requested quality
  // ceiling, while the exported GIF may use lower parameters to meet the limit.
  // Reuse the measured output when nothing has invalidated that result.
  if (lastGifBlob && estimateResult?.exact) {
    $('#estimate-value').textContent = formatBytes(lastGifBlob.size);
    $('#estimate-description').textContent = 'Точный размер уже созданной GIF для текущего видео, фрагмента и настроек.';
    showToast(`Фактический размер уже известен: ${formatBytes(lastGifBlob.size)}.`, 'success');
    return;
  }

  const duration = clipDuration();
  if (!(duration >= 0.25)) {
    showToast('Выбери фрагмент длительностью не меньше 0,25 секунды.', 'error');
    return;
  }
  setBusy(true);
  lastProgressPercent = -1;
  try {
    setProgress('Подготовка оценки', 'Сначала загружаем движок обработки. При необходимости попробуем второй CDN.', null);
    await ensureEngine();
    setProgress('Подготовка видео', `Готовим файл ${formatBytes(sourceFile.size)} для оценки. Не закрывай вкладку.`, null);
    await writeSourceToFs();
    const settings = currentSettings();
    const sampleDuration = Math.min(duration, 1.0);
    setProgress('Оценка размера', `Кодируем тестовый фрагмент ${sampleDuration.toFixed(1)} сек. Это пробная конвертация, размер будет приблизительным.`, null);
    const sample = await createGif(settings, selectedStart(), sampleDuration, 'estimate.gif');
    const estimatedBytes = sample.size * (duration / sampleDuration);
    estimateResult = { bytes: estimatedBytes, settings };
    $('#estimate-value').textContent = `≈ ${formatBytes(estimatedBytes)}`;
    $('#estimate-description').textContent = $('#target-toggle').checked
      ? `Оценка выбранных настроек по фрагменту ${sampleDuration.toFixed(1)} сек. При создании GIF параметры могут быть автоматически снижены для соблюдения лимита.`
      : `Оценка по фрагменту ${sampleDuration.toFixed(1)} сек. Реальный размер зависит от движения и смены сцен.`;
    setProgress('Оценка завершена', `Предполагаемый размер — ${formatBytes(estimatedBytes)}.`, 100);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Не удалось оценить размер.', 'error');
    setProgress('Ошибка оценки', error?.message || 'Попробуй другой файл.', 0);
  } finally {
    setBusy(false);
  }
}

$('#choose-file').addEventListener('click', () => $('#file-input').click());
$('#change-file').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', e => { loadFile(e.target.files?.[0]); e.target.value = ''; });
const dropzone = $('#dropzone');
dropzone.addEventListener('click', e => { if (!e.target.closest('button')) $('#file-input').click(); });
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag-over'); loadFile(e.dataTransfer.files?.[0]); });

$('#start-range').addEventListener('pointerdown', () => { $('#start-range').style.zIndex = '4'; $('#end-range').style.zIndex = '3'; });
$('#end-range').addEventListener('pointerdown', () => { $('#end-range').style.zIndex = '4'; $('#start-range').style.zIndex = '3'; });
$('#start-range').addEventListener('input', e => {
  let value = Number(e.target.value);
  if (value >= selectedEnd() - 0.2) value = Math.max(0, selectedEnd() - 0.2);
  $('#start-number').value = value.toFixed(1);
  renderClipState();
});
$('#end-range').addEventListener('input', e => {
  let value = Number(e.target.value);
  if (value <= selectedStart() + 0.2) value = Math.min(videoDuration, selectedStart() + 0.2);
  $('#end-number').value = value.toFixed(1);
  renderClipState();
});
$('#start-number').addEventListener('change', e => {
  let value = Math.max(0, Math.min(videoDuration, Number(e.target.value) || 0));
  if (value >= selectedEnd() - 0.2) value = Math.max(0, selectedEnd() - 0.2);
  $('#start-number').value = value.toFixed(1); renderClipState();
});
$('#end-number').addEventListener('change', e => {
  let value = Math.max(0, Math.min(videoDuration, Number(e.target.value) || 0));
  if (value <= selectedStart() + 0.2) value = Math.min(videoDuration, selectedStart() + 0.2);
  $('#end-number').value = value.toFixed(1); renderClipState();
});
$('#preview-clip').addEventListener('click', () => {
  const video = $('#source-video');
  video.currentTime = selectedStart();
  video.play().catch(() => {});
  video.dataset.previewEnd = String(selectedEnd());
});
$('#source-video').addEventListener('timeupdate', () => {
  const video = $('#source-video');
  if (video.dataset.previewEnd && video.currentTime >= Number(video.dataset.previewEnd)) {
    video.pause();
    delete video.dataset.previewEnd;
  }
});

app.querySelectorAll('.quality-card').forEach(card => card.addEventListener('click', () => {
  selectedQuality = card.dataset.quality;
  app.querySelectorAll('.quality-card').forEach(c => {
    const selected = c === card;
    c.classList.toggle('selected', selected);
    c.setAttribute('aria-pressed', String(selected));
  });
  const preset = presets[selectedQuality];
  $('#width-select').value = String(preset.width);
  $('#fps-select').value = String(preset.fps);
  $('#colors-select').value = String(preset.colors);
  resetResult();
}));
['width-select', 'fps-select', 'colors-select'].forEach(id => $('#' + id).addEventListener('change', resetResult));
$('#target-toggle').addEventListener('change', () => {
  if ($('#target-toggle').checked && !targetWidthSelectionTouched) {
    $('#target-width-input').value = $('#width-select').value;
  }
  resetResult();
  syncTargetModeUI();
});
$('#target-size').addEventListener('input', syncTargetModeUI);
$('#target-size').addEventListener('change', () => {
  resetResult();
  syncTargetModeUI();
});
$('#target-width-lock').addEventListener('change', () => {
  resetResult();
  syncTargetModeUI();
});
$('#target-width-input').addEventListener('input', () => {
  targetWidthSelectionTouched = true;
  syncTargetModeUI();
});
$('#target-width-input').addEventListener('change', () => {
  const input = $('#target-width-input');
  const width = Math.max(120, Math.min(1920, Math.round(Number(input.value) || 640)));
  input.value = String(width);
  targetWidthSelectionTouched = true;
  resetResult();
  syncTargetModeUI();
});
$('#estimate-button').addEventListener('click', handleEstimate);
$('#convert-button').addEventListener('click', handleConvert);
$('#cancel-button').addEventListener('click', () => $('#progress-panel').classList.add('hidden'));
syncTargetModeUI();
window.addEventListener('resize', () => updateTrimTimeline());
window.addEventListener('beforeunload', () => {
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  if (gifObjectUrl) URL.revokeObjectURL(gifObjectUrl);
});

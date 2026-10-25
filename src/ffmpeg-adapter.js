// Compatibility adapter for FFmpeg.wasm 0.11.x without npm/Vite.
// Try jsDelivr first and unpkg as a fallback for the core files.
const CORE_URLS = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
  'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
];

export class FFmpeg {
  constructor() {
    this.engine = null;
    this.handlers = new Map();
    this.loading = null;
  }

  on(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(callback);
    if (this.engine) this.bindHandler(type, callback);
  }

  emit(type, data) {
    for (const callback of this.handlers.get(type) || []) {
      try { callback(data); } catch (error) { console.error(error); }
    }
  }

  bindHandler(type, callback) {
    if (!this.engine) return;
    if (type === 'log') this.engine.setLogger(({ message }) => callback({ message }));
    if (type === 'progress') this.engine.setProgress(({ ratio, time }) => callback({ progress: ratio, time }));
  }

  async load() {
    if (this.engine?.isLoaded?.()) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (window.crossOriginIsolated !== true || typeof SharedArrayBuffer === 'undefined') {
        throw new Error('Браузер не включил SharedArrayBuffer. Останови старый сервер (Ctrl+C), запусти node server.js из новой версии и открой именно http://localhost:5173.');
      }
      const factory = window.FFmpeg?.createFFmpeg;
      if (typeof factory !== 'function') {
        throw new Error('Библиотека FFmpeg не загрузилась с CDN. Проверь интернет и обнови страницу.');
      }
      const errors = [];
      for (const corePath of CORE_URLS) {
        const engine = factory({ log: true, corePath });
        engine.setLogger(({ message }) => this.emit('log', { message }));
        engine.setProgress(({ ratio, time }) => this.emit('progress', { progress: ratio, time }));
        let timeoutId;
        try {
          await Promise.race([
            engine.load(),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('CDN не ответил за 30 секунд. Попробуем второй источник.')), 30000);
            }),
          ]);
          this.engine = engine;
          return;
        } catch (error) {
          errors.push(`${corePath.includes('jsdelivr') ? 'jsDelivr' : 'unpkg'}: ${error?.message || error}`);
          try { engine.exit(); } catch {}
        } finally {
          clearTimeout(timeoutId);
        }
      }
      throw new Error(`Не удалось запустить движок обработки. ${errors.join(' | ')}`);
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async writeFile(name, data) {
    if (!this.engine) throw new Error('FFmpeg ещё не загружен.');
    this.engine.FS('writeFile', name, data);
  }

  async exec(args) {
    if (!this.engine) throw new Error('FFmpeg ещё не загружен.');
    await this.engine.run(...args);
  }

  async readFile(name) {
    if (!this.engine) throw new Error('FFmpeg ещё не загружен.');
    return this.engine.FS('readFile', name);
  }

  async deleteFile(name) {
    if (!this.engine) return;
    try { this.engine.FS('unlink', name); } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes('no such file')) throw error;
    }
  }
}

export async function fetchFile(file) {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (file instanceof Blob) return new Uint8Array(await file.arrayBuffer());
  if (typeof file === 'string') {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Не удалось получить файл: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new TypeError('Неподдерживаемый тип файла.');
}

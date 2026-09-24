/**
 * main.js
 * 
 * Punto de entrada de la aplicación.
 * Interfaz mínima para seleccionar un archivo de audio, procesarlo
 * y verificar el funcionamiento de OPFS + Web Audio API.
 */

import {
  isOPFSSupported,
  saveFile,
  listFiles,
  deleteFile,
  clearDir,
  getStorageEstimate
} from './lib/opfsManager.js';

import {
  isAcceptedAudio,
  processAudioFile,
  formatBytes,
  formatDuration
} from './lib/audioUtils.js';

// ----- Referencias al DOM -----
const app = document.getElementById('app');

// ----- Estado de la aplicación -----
const state = {
  lastProcessed: null  // { filename, samples, sampleRate, duration, ... }
};

// ----- Render inicial -----
function renderApp() {
  const opfsOk = isOPFSSupported();

  app.innerHTML = `
    <main style="font-family: system-ui, sans-serif; padding: 2rem; color: #eee; background: #1a1a2e; min-height: 100vh; max-width: 900px; margin: 0 auto;">
      <h1 style="margin-bottom: 0.5rem;">Drum MIDI PWA</h1>
      <p style="color: #9aa;">Extrae batería y bajo de tus canciones y genera MIDI.</p>

      <section style="margin-top: 2rem; padding: 1.5rem; background: #24243e; border-radius: 8px;">
        <h2 style="margin-top: 0;">1. Selecciona un archivo de audio</h2>
        <p style="color: #9aa; font-size: 0.9rem;">Formatos admitidos: MP3, WAV, OGG, FLAC, M4A</p>
        <input type="file" id="fileInput" accept="audio/*" style="margin-top: 0.5rem; color: #eee;" />
        <div id="fileInfo" style="margin-top: 1rem;"></div>
      </section>

      <section style="margin-top: 1.5rem; padding: 1.5rem; background: #24243e; border-radius: 8px;">
        <h2 style="margin-top: 0;">2. Almacenamiento local (OPFS)</h2>
        <p style="color: #9aa; font-size: 0.9rem;">
          Estado: ${opfsOk ? '✅ Soportado' : '❌ No soportado'}
        </p>
        <div id="storageInfo" style="margin-top: 0.5rem; font-size: 0.9rem; color: #9aa;"></div>
        <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button id="saveBtn" style="padding: 0.5rem 1rem; background: #4a4ae0; color: #fff; border: none; border-radius: 4px; cursor: pointer;" disabled>Guardar en OPFS</button>
          <button id="listBtn" style="padding: 0.5rem 1rem; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Listar archivos</button>
          <button id="clearBtn" style="padding: 0.5rem 1rem; background: #8b2c2c; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Borrar todo</button>
        </div>
        <div id="opfsList" style="margin-top: 1rem; font-family: monospace; font-size: 0.85rem;"></div>
      </section>
    </main>
  `;

  attachEventListeners();
  refreshStorageInfo();
}

// ----- Eventos -----
function attachEventListeners() {
  const fileInput = document.getElementById('fileInput');
  const saveBtn = document.getElementById('saveBtn');
  const listBtn = document.getElementById('listBtn');
  const clearBtn = document.getElementById('clearBtn');

  fileInput.addEventListener('change', handleFileSelected);
  saveBtn.addEventListener('click', handleSaveToOPFS);
  listBtn.addEventListener('click', handleListFiles);
  clearBtn.addEventListener('click', handleClearOPFS);
}

// ----- Handlers -----

async function handleFileSelected(event) {
  const file = event.target.files?.[0];
  const info = document.getElementById('fileInfo');
  const saveBtn = document.getElementById('saveBtn');

  if (!file) {
    info.innerHTML = '';
    saveBtn.disabled = true;
    return;
  }

  if (!isAcceptedAudio(file)) {
    info.innerHTML = `<p style="color: #ff6b6b;">❌ Formato no aceptado: ${file.type || 'desconocido'}</p>`;
    saveBtn.disabled = true;
    return;
  }

  info.innerHTML = `<p>⏳ Procesando <strong>${file.name}</strong>...</p>`;

  try {
    const result = await processAudioFile(file);

    state.lastProcessed = {
      filename: file.name,
      file,
      samples: result.samples,
      sampleRate: result.sampleRate,
      duration: result.duration,
      originalSampleRate: result.originalSampleRate,
      originalChannels: result.originalChannels,
      fileSize: file.size
    };

    info.innerHTML = `
      <p style="color: #6bffb0;">✅ Archivo procesado correctamente</p>
      <ul style="list-style: none; padding-left: 0; line-height: 1.6;">
        <li><strong>Nombre:</strong> ${file.name}</li>
        <li><strong>Tamaño:</strong> ${formatBytes(file.size)}</li>
        <li><strong>Duración:</strong> ${formatDuration(result.duration)}</li>
        <li><strong>Canales originales:</strong> ${result.originalChannels}</li>
        <li><strong>Sample rate original:</strong> ${result.originalSampleRate} Hz</li>
        <li><strong>Sample rate final:</strong> ${result.sampleRate} Hz (mono)</li>
        <li><strong>Muestras totales:</strong> ${result.samples.length.toLocaleString()}</li>
      </ul>
    `;

    saveBtn.disabled = false;
  } catch (err) {
    console.error(err);
    info.innerHTML = `<p style="color: #ff6b6b;">❌ Error procesando el archivo: ${err.message}</p>`;
    saveBtn.disabled = true;
  }
}

async function handleSaveToOPFS() {
  const info = document.getElementById('fileInfo');
  if (!state.lastProcessed) return;

  try {
    const { filename, file } = state.lastProcessed;
    const result = await saveFile(file, filename);

    info.insertAdjacentHTML('beforeend',
      `<p style="color: #6bffb0;">💾 Guardado en OPFS: <code>${result.path}</code> (${formatBytes(result.size)})</p>`
    );

    refreshStorageInfo();
    handleListFiles();
  } catch (err) {
    console.error(err);
    info.insertAdjacentHTML('beforeend',
      `<p style="color: #ff6b6b;">❌ Error guardando en OPFS: ${err.message}</p>`
    );
  }
}

async function handleListFiles() {
  const list = document.getElementById('opfsList');
  list.innerHTML = '<p>⏳ Consultando...</p>';

  try {
    const files = await listFiles();
    if (files.length === 0) {
      list.innerHTML = '<p style="color: #9aa;">(No hay archivos guardados)</p>';
      return;
    }

    const rows = files.map(f =>
      `<li>
        <strong>${f.name}</strong> — ${formatBytes(f.size)}
        — ${new Date(f.lastModified).toLocaleString()}
        <button data-delete="${f.name}" style="margin-left: 0.5rem; background: #8b2c2c; color: #fff; border: none; border-radius: 3px; cursor: pointer; padding: 2px 6px; font-size: 0.75rem;">Borrar</button>
      </li>`
    ).join('');

    list.innerHTML = `<ul style="padding-left: 1rem;">${rows}</ul>`;

    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await deleteFile(btn.dataset.delete);
        handleListFiles();
        refreshStorageInfo();
      });
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
  }
}

async function handleClearOPFS() {
  const list = document.getElementById('opfsList');
  list.innerHTML = '<p>⏳ Borrando...</p>';

  try {
    await clearDir();
    list.innerHTML = '<p style="color: #6bffb0;">✅ Todo borrado.</p>';
    refreshStorageInfo();
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
  }
}

async function refreshStorageInfo() {
  const info = document.getElementById('storageInfo');
  if (!isOPFSSupported()) {
    info.textContent = '';
    return;
  }

  try {
    const { quota, usage, available } = await getStorageEstimate();
    info.innerHTML = `
      Usado: ${formatBytes(usage)} / Disponible: ${formatBytes(quota)} 
      (libre: ${formatBytes(available)})
    `;
  } catch (err) {
    info.textContent = '';
  }
}

// ----- Arranque -----
renderApp();
console.log('Drum MIDI PWA iniciada');
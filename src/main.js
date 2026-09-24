/**
 * main.js
 * 
 * Punto de entrada de la aplicación.
 * 
 * Flujo:
 *   1. Subir audio (MP3/WAV/FLAC) de batería o bajo ya separados.
 *   2. Seleccionar instrumento (Batería / Bajo).
 *   3. Detectar BPM automáticamente con pleco-xa (editable por el usuario).
 *   4. Transcribir a MIDI con Basic Pitch.
 *   5. Descargar el .mid listo para Logic Pro.
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

import {
  transcribeWithBasicPitch,
  quantizeNotes
} from './lib/transcriptionUtils.js';

import {
  generateMidiFile,
  downloadBlob,
  buildMidiFilename
} from './lib/midiWriter.js';

import {
  detectBpm,
  roundBpm,
  loadLastBpm,
  saveLastBpm
} from './lib/tempoUtils.js';

// ----- Referencias al DOM -----
const app = document.getElementById('app');

// ----- Estado de la aplicación -----
const state = {
  audioBuffer: null,
  samples: null,
  sampleRate: 44100,
  fileInfo: null,
  instrumentType: 'bass',
  notes: null,
  bpm: null,
  bpmDetected: null,
  midiBlob: null
};

// ----- Render inicial -----
function renderApp() {
  const opfsOk = isOPFSSupported();

  app.innerHTML = `
    <main style="font-family: system-ui, sans-serif; padding: 2rem; color: #eee; background: #1a1a2e; min-height: 100vh; max-width: 900px; margin: 0 auto;">
      <h1 style="margin-bottom: 0.5rem;">Drum MIDI PWA</h1>
      <p style="color: #9aa;">Sube una pista de batería o bajo ya separada y obtén su MIDI listo para Logic Pro.</p>

      <section style="margin-top: 2rem; padding: 1.5rem; background: #24243e; border-radius: 8px;">
        <h2 style="margin-top: 0;">1. Archivo de audio</h2>
        <p style="color: #9aa; font-size: 0.9rem;">Formatos admitidos: MP3, WAV, OGG, FLAC, M4A. Recomendado: WAV.</p>
        <input type="file" id="fileInput" accept="audio/*" style="margin-top: 0.5rem; color: #eee;" />
        <div id="fileInfo" style="margin-top: 1rem;"></div>
      </section>

      <section style="margin-top: 1.5rem; padding: 1.5rem; background: #24243e; border-radius: 8px;">
        <h2 style="margin-top: 0;">2. Instrumento y tempo</h2>
        <div style="display: flex; gap: 2rem; margin-top: 0.5rem; flex-wrap: wrap; align-items: flex-start;">
          <div>
            <span style="color: #9aa; font-size: 0.9rem;">Instrumento:</span><br/>
            <label style="cursor: pointer; margin-right: 1rem;">
              <input type="radio" name="instrument" value="bass" ${state.instrumentType === 'bass' ? 'checked' : ''} />
              Bajo
            </label>
            <label style="cursor: pointer;">
              <input type="radio" name="instrument" value="drums" ${state.instrumentType === 'drums' ? 'checked' : ''} />
              Batería
            </label>
          </div>
          <div>
            <span style="color: #9aa; font-size: 0.9rem;">BPM (editable):</span><br/>
            <div style="display: flex; gap: 0.4rem; align-items: center; margin-top: 0.25rem; flex-wrap: wrap;">
              <input type="number" id="bpmInput" step="0.01" min="20" max="400" value="120"
                style="width: 100px; padding: 0.4rem; background: #1a1a2e; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 1rem;" />
              <button id="halfBtn" title="Dividir BPM por 2" style="padding: 0.4rem 0.6rem; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">÷ 2</button>
              <button id="doubleBtn" title="Multiplicar BPM por 2" style="padding: 0.4rem 0.6rem; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">× 2</button>
              <button id="roundBtn" title="Redondear al entero más cercano" style="padding: 0.4rem 0.6rem; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Redondear</button>
              <button id="minus1Btn" title="Restar 1 BPM" style="padding: 0.4rem 0.6rem; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">− 1</button>
              <button id="minus01Btn" title="Restar 0.1 BPM" style="padding: 0.4rem 0.6rem; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">− 0.1</button>
              <button id="plus01Btn" title="Sumar 0.1 BPM" style="padding: 0.4rem 0.6rem; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">+ 0.1</button>
              <button id="plus1Btn" title="Sumar 1 BPM" style="padding: 0.4rem 0.6rem; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">+ 1</button>
            </div>
            <span id="bpmHint" style="color: #9aa; font-size: 0.8rem; display: block; margin-top: 0.35rem; line-height: 1.4;"></span>
          </div>
        </div>
      </section>

      <section style="margin-top: 1.5rem; padding: 1.5rem; background: #24243e; border-radius: 8px;">
        <h2 style="margin-top: 0;">3. Transcripción a MIDI</h2>
        <button id="transcribeBtn" style="padding: 0.75rem 1.5rem; background: #4a4ae0; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;" disabled>Transcribir a MIDI</button>
        <div id="progressContainer" style="margin-top: 1rem; display: none;">
          <div style="background: #1a1a2e; height: 12px; border-radius: 6px; overflow: hidden;">
            <div id="progressBar" style="background: #4a4ae0; height: 100%; width: 0%; transition: width 0.2s;"></div>
          </div>
          <p id="progressText" style="color: #9aa; font-size: 0.9rem; margin-top: 0.5rem;"></p>
        </div>
        <div id="transcriptionResult" style="margin-top: 1rem;"></div>
      </section>

      <section style="margin-top: 1.5rem; padding: 1.5rem; background: #24243e; border-radius: 8px;">
        <h2 style="margin-top: 0;">4. Almacenamiento local (OPFS)</h2>
        <p style="color: #9aa; font-size: 0.9rem;">
          Estado: ${opfsOk ? '✅ Soportado' : '❌ No soportado'}
        </p>
        <div id="storageInfo" style="margin-top: 0.5rem; font-size: 0.9rem; color: #9aa;"></div>
        <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button id="saveBtn" style="padding: 0.5rem 1rem; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer;" disabled>Guardar audio en OPFS</button>
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
  document.getElementById('fileInput').addEventListener('change', handleFileSelected);
  document.getElementById('transcribeBtn').addEventListener('click', handleTranscribe);
  document.getElementById('saveBtn').addEventListener('click', handleSaveToOPFS);
  document.getElementById('listBtn').addEventListener('click', handleListFiles);
  document.getElementById('clearBtn').addEventListener('click', handleClearOPFS);

  document.getElementById('bpmInput').addEventListener('change', handleBpmChange);
  document.getElementById('halfBtn').addEventListener('click', () => adjustBpm(0.5));
  document.getElementById('doubleBtn').addEventListener('click', () => adjustBpm(2));
  document.getElementById('roundBtn').addEventListener('click', handleRoundBpm);
  document.getElementById('minus1Btn').addEventListener('click', () => adjustBpm(-1, 'add'));
  document.getElementById('minus01Btn').addEventListener('click', () => adjustBpm(-0.1, 'add'));
  document.getElementById('plus01Btn').addEventListener('click', () => adjustBpm(0.1, 'add'));
  document.getElementById('plus1Btn').addEventListener('click', () => adjustBpm(1, 'add'));

  document.querySelectorAll('input[name="instrument"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.instrumentType = e.target.value;
    });
  });
}

// ----- Handlers de BPM -----

function handleBpmChange(e) {
  const value = parseFloat(e.target.value);
  if (!isNaN(value) && value > 0) {
    state.bpm = value;
    saveLastBpm(value);
  }
}

function adjustBpm(arg, mode = 'multiply') {
  const input = document.getElementById('bpmInput');
  const value = parseFloat(input.value);
  if (isNaN(value)) return;

  let newValue;
  if (mode === 'add') {
    newValue = Math.round((value + arg) * 100) / 100;
  } else {
    newValue = Math.round(value * arg * 100) / 100;
  }

  newValue = Math.max(20, Math.min(400, newValue));

  input.value = newValue;
  state.bpm = newValue;
  saveLastBpm(newValue);
}

function handleRoundBpm() {
  const input = document.getElementById('bpmInput');
  const value = parseFloat(input.value);
  if (isNaN(value)) return;
  const rounded = roundBpm(value);
  input.value = rounded;
  state.bpm = rounded;
  saveLastBpm(rounded);
}

// ----- Handlers principales -----

async function handleFileSelected(event) {
  const file = event.target.files?.[0];
  const info = document.getElementById('fileInfo');
  const transcribeBtn = document.getElementById('transcribeBtn');
  const saveBtn = document.getElementById('saveBtn');
  const bpmInput = document.getElementById('bpmInput');
  const bpmHint = document.getElementById('bpmHint');

  // Reset
  state.audioBuffer = null;
  state.samples = null;
  state.fileInfo = null;
  state.notes = null;
  state.midiBlob = null;
  state.bpm = null;
  state.bpmDetected = null;
  bpmHint.textContent = '';
  document.getElementById('transcriptionResult').innerHTML = '';

  if (!file) {
    info.innerHTML = '';
    transcribeBtn.disabled = true;
    saveBtn.disabled = true;
    return;
  }

  if (!isAcceptedAudio(file)) {
    info.innerHTML = `<p style="color: #ff6b6b;">❌ Formato no aceptado: ${file.type || 'desconocido'}</p>`;
    transcribeBtn.disabled = true;
    saveBtn.disabled = true;
    return;
  }

  info.innerHTML = `<p>⏳ Procesando <strong>${file.name}</strong>...</p>`;

  try {
    const result = await processAudioFile(file);

    state.samples = result.samples;
    state.sampleRate = result.sampleRate;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = audioCtx.createBuffer(1, result.samples.length, result.sampleRate);
    audioBuffer.copyToChannel(result.samples, 0);
    await audioCtx.close();

    state.audioBuffer = audioBuffer;
    state.fileInfo = {
      filename: file.name,
      fileSize: file.size,
      duration: result.duration,
      originalSampleRate: result.originalSampleRate,
      originalChannels: result.originalChannels
    };

    // Detectar BPM
    info.innerHTML = `<p>⏳ Detectando BPM...</p>`;
    const { bpm, reliable } = detectBpm(result.samples, result.sampleRate);
    state.bpmDetected = bpm;
    state.bpm = bpm;

    bpmInput.value = bpm.toFixed(2);

    // Sugerencias según fiabilidad y rango
    const lastBpm = loadLastBpm();
    if (!reliable) {
      bpmHint.innerHTML = `⚠️ Detección poco fiable en esta pista. Si tienes el BPM de la batería, úsalo.`;
    } else if (bpm > 150) {
      bpmHint.innerHTML = `⚠️ Parece alto. Prueba <strong>÷ 2</strong> → ${(bpm / 2).toFixed(2)} BPM.`;
    } else if (bpm < 70) {
      bpmHint.innerHTML = `⚠️ Parece bajo. Prueba <strong>× 2</strong> → ${(bpm * 2).toFixed(2)} BPM.`;
    } else {
      bpmHint.textContent = '✅ Dentro del rango típico.';
    }

    // Sugerir el último BPM guardado si difiere del detectado
    if (lastBpm && Math.abs(lastBpm - bpm) > 5) {
      bpmHint.innerHTML += `<br/>💡 Último BPM usado: <strong>${lastBpm}</strong>.`;
    }

    info.innerHTML = `
      <p style="color: #6bffb0;">✅ Archivo procesado correctamente</p>
      <ul style="list-style: none; padding-left: 0; line-height: 1.6;">
        <li><strong>Nombre:</strong> ${file.name}</li>
        <li><strong>Tamaño:</strong> ${formatBytes(file.size)}</li>
        <li><strong>Duración:</strong> ${formatDuration(result.duration)}</li>
        <li><strong>Canales originales:</strong> ${result.originalChannels}</li>
        <li><strong>Sample rate original:</strong> ${result.originalSampleRate} Hz</li>
        <li><strong>BPM detectado:</strong> ${bpm.toFixed(2)}</li>
      </ul>
    `;

    transcribeBtn.disabled = false;
    saveBtn.disabled = false;
  } catch (err) {
    console.error(err);
    info.innerHTML = `<p style="color: #ff6b6b;">❌ Error procesando el archivo: ${err.message}</p>`;
    transcribeBtn.disabled = true;
    saveBtn.disabled = true;
  }
}

async function handleTranscribe() {
  if (!state.audioBuffer) return;

  const btn = document.getElementById('transcribeBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const result = document.getElementById('transcriptionResult');
  const bpmInput = document.getElementById('bpmInput');

  // Leer el BPM actual del input (por si el usuario lo ha editado)
  const bpm = parseFloat(bpmInput.value);
  if (isNaN(bpm) || bpm <= 0) {
    alert('Introduce un BPM válido antes de transcribir.');
    return;
  }
  state.bpm = bpm;
  saveLastBpm(bpm);

  btn.disabled = true;
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = 'Cargando modelo...';
  result.innerHTML = '';

  try {
    progressText.textContent = 'Transcribiendo audio...';
    const notes = await transcribeWithBasicPitch(state.audioBuffer, (p) => {
      progressBar.style.width = `${Math.round(p * 100)}%`;
      progressText.textContent = `Transcribiendo audio... ${Math.round(p * 100)}%`;
    });

    if (!notes || notes.length === 0) {
      throw new Error('No se han detectado notas en el audio.');
    }

    state.notes = notes;

    progressText.textContent = 'Cuantizando notas...';
    const quantized = quantizeNotes(notes, bpm, 16);
    state.notes = quantized;

    progressText.textContent = 'Generando archivo MIDI...';
    const midiBlob = generateMidiFile(
      quantized,
      bpm,
      state.instrumentType,
      { quantize: false }
    );
    state.midiBlob = midiBlob;

    progressBar.style.width = '100%';
    progressText.textContent = '✅ Transcripción completada';

    const midiFilename = buildMidiFilename(
      state.fileInfo.filename,
      state.instrumentType
    );

    result.innerHTML = `
      <p style="color: #6bffb0;">✅ ${quantized.length} notas detectadas</p>
      <p style="color: #9aa; font-size: 0.9rem;">
        Instrumento: <strong>${state.instrumentType === 'drums' ? 'Batería' : 'Bajo'}</strong>
        · BPM usado: <strong>${bpm.toFixed(2)}</strong>
        · Archivo: <code>${midiFilename}</code>
      </p>
      <button id="downloadBtn" style="margin-top: 0.75rem; padding: 0.75rem 1.5rem; background: #2c8b4a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">
        ⬇️ Descargar MIDI
      </button>
    `;

    document.getElementById('downloadBtn').addEventListener('click', () => {
      downloadBlob(state.midiBlob, midiFilename);
    });
  } catch (err) {
    console.error(err);
    progressBar.style.width = '0%';
    progressText.textContent = '';
    result.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
}

async function handleSaveToOPFS() {
  if (!state.fileInfo) return;
  const info = document.getElementById('fileInfo');

  try {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const result = await saveFile(file, state.fileInfo.filename);

    info.insertAdjacentHTML('beforeend',
      `<p style="color: #6bffb0;">💾 Guardado en OPFS: <code>${result.path}</code></p>`
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
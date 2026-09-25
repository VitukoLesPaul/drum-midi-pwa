/**
 * drumTranscriber.js
 *
 * Transcripción de batería a notas MIDI usando análisis por bandas de
 * frecuencia (Plan A del PASO 3.7).
 *
 * Idea general:
 *   1. Trocear el audio en frames cortos con solape.
 *   2. Calcular el espectro de magnitud de cada frame con la FFT.
 *   3. Sumar la energía en bandas características de cada tambor.
 *   4. Detectar onsets (picos de energía) en cada banda.
 *   5. Clasificar cada onset según las bandas activas simultáneamente.
 *
 * El array de notas devuelto tiene el MISMO formato que el de Basic Pitch,
 * para que el resto del pipeline (cuantización, generación de MIDI) no
 * necesite cambiar:
 *
 *   { startTimeSeconds, durationSeconds, pitchMidi, amplitude, drumType }
 *
 * Este módulo es autónomo y NO sustituye a Basic Pitch: solo se usa cuando
 * el usuario elige "Batería". El bajo sigue usando Basic Pitch sin cambios.
 */

import { magnitudeSpectrum, hannWindow, bandEnergy } from './fft.js';

// ---------------------------------------------------------------------------
// Parámetros por defecto (todos ajustables vía `options`)
// ---------------------------------------------------------------------------

export const DEFAULT_DRUM_OPTIONS = {
  // Análisis espectral
  frameSize: 2048,          // potencia de 2. ~46 ms a 44.1 kHz.
  hopSize: 512,             // ~11.6 ms a 44.1 kHz. Buen balance tiempo/frec.

  // Detección de onsets
  minIntervalMs: 40,        // separación mínima entre onsets en la misma banda
  onsetThresholdMult: 1.8,  // umbral = media_local + mult * desviación_local
  onsetWindowSec: 1.0,      // ventana para el umbral adaptativo (segundos)
  ampPercentile: 0.9,       // percentil de energía para normalizar amplitudes

  // Duración mínima de una nota MIDI (evita notas de duración 0)
  minNoteDurationSec: 0.04,

  // Discriminación hi-hat cerrado vs abierto
  hatOpenMinDurationSec: 0.14,

  // Discriminación caja vs crash
  // Si la energía del cuerpo de la caja (200-500 Hz) en el frame del onset
  // supera este factor por la media de esa banda, se considera caja.
  snareBodyFactorVsMean: 1.6,

  // Bandas de frecuencia (Hz) para cada elemento
  bands: {
    kick:       [40,    100],
    snareBody:  [200,   500],
    snareWire:  [1500,  6000],
    hiHat:      [6000,  12000]
  },

  // Pitches General MIDI (canal 10) para cada sonido
  gmPitches: {
    kick:      36,  // C1
    snare:     38,  // D1
    closedHat: 42,  // F#1
    openHat:   46,  // A#1
    crash:     49   // C#2
  }
};

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Devuelve el percentil `p` (0-1) de un array de números.
 * No modifica el array de entrada.
 */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

/**
 * Detecta onsets (picos locales) en una señal de energía por frame.
 *
 * @param {number[]} energy - Energía por frame.
 * @param {number} sampleRate
 * @param {number} hopSize
 * @param {object} options
 * @returns {Array<{ frameIndex: number, timeSeconds: number, energy: number }>}
 */
function detectOnsetsInBand(energy, sampleRate, hopSize, options) {
  const {
    minIntervalMs,
    onsetThresholdMult,
    onsetWindowSec
  } = options;

  const hopTimeSec = hopSize / sampleRate;
  const minFramesBetween = Math.max(1, Math.round((minIntervalMs / 1000) / hopTimeSec));
  const halfWindow = Math.max(8, Math.round((onsetWindowSec / 2) / hopTimeSec));

  const onsets = [];
  let lastOnsetFrame = -Infinity;

  for (let i = 1; i < energy.length - 1; i++) {
    // Debe ser un máximo local estricto
    if (energy[i] <= energy[i - 1] || energy[i] <= energy[i + 1]) continue;

    // Umbral adaptativo: media + mult * desviación en ventana local
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(energy.length, i + halfWindow);
    let sum = 0;
    let sumSq = 0;
    const n = hi - lo;
    for (let k = lo; k < hi; k++) {
      sum += energy[k];
      sumSq += energy[k] * energy[k];
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    const std = Math.sqrt(variance);
    const threshold = mean + onsetThresholdMult * std;

    if (energy[i] < threshold) continue;

    // Separación mínima entre onsets
    if (i - lastOnsetFrame < minFramesBetween) continue;

    onsets.push({
      frameIndex: i,
      timeSeconds: (i * hopSize) / sampleRate,
      energy: energy[i]
    });
    lastOnsetFrame = i;
  }

  return onsets;
}

/**
 * Estima la duración de un onset: número de frames consecutivos a partir del
 * onset en los que la energía se mantiene por encima de un umbral relativo
 * al pico del onset.
 *
 * @returns {number} Duración en segundos.
 */
function estimateDurationSeconds(energy, onsetFrameIndex, sampleRate, hopSize, options) {
  const peak = energy[onsetFrameIndex];
  if (peak <= 0) return options.minNoteDurationSec;

  const decayFactor = 0.15; // por debajo de esto consideramos que ya "no suena"
  let end = onsetFrameIndex;
  while (end + 1 < energy.length && energy[end + 1] > peak * decayFactor) {
    end++;
  }

  const durSec = ((end - onsetFrameIndex) * hopSize) / sampleRate;
  return Math.max(options.minNoteDurationSec, durSec);
}

/**
 * Normaliza una energía de onset a un valor de amplitud 0-1, usando el
 * percentil global de la banda como referencia.
 */
function normalizeAmplitude(onsetEnergy, allEnergies, options) {
  const ref = percentile(allEnergies, options.ampPercentile);
  if (ref <= 0) return 0.7;
  const amp = onsetEnergy / ref;
  return Math.max(0.05, Math.min(1, amp));
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Transcribe un audio de batería a notas MIDI (en pitches General MIDI).
 *
 * @param {Float32Array} samples - Muestras mono.
 * @param {number} sampleRate - Frecuencia de muestreo (Hz).
 * @param {object} [options] - Opciones (ver DEFAULT_DRUM_OPTIONS).
 * @param {(progress: number) => void} [onProgress] - Callback de progreso 0-1.
 * @returns {Promise<Array<{
 *   startTimeSeconds: number,
 *   durationSeconds: number,
 *   pitchMidi: number,
 *   amplitude: number,
 *   drumType: string
 * }>>}
 */
export async function transcribeDrums(samples, sampleRate, options = {}, onProgress) {
  const opts = {
    ...DEFAULT_DRUM_OPTIONS,
    ...options,
    bands: { ...DEFAULT_DRUM_OPTIONS.bands, ...(options.bands || {}) },
    gmPitches: { ...DEFAULT_DRUM_OPTIONS.gmPitches, ...(options.gmPitches || {}) }
  };

  const { frameSize, hopSize, bands, gmPitches } = opts;

  if (!samples || samples.length < frameSize) {
    return [];
  }

  const numFrames = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const window = hannWindow(frameSize);

  // -------- 1. Espectro de magnitud por frame --------
  // Reutilizamos arrays para no generar basura en el heap.
  const frameBuffer = new Float32Array(frameSize);
  const magFrames = new Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    for (let j = 0; j < frameSize; j++) {
      frameBuffer[j] = samples[start + j] * window[j];
    }
    // magnitudeSpectrum copia internamente, así que podemos reutilizar frameBuffer
    magFrames[i] = magnitudeSpectrum(frameBuffer);

    if (onProgress && (i & 63) === 0) {
      onProgress(0.8 * (i / numFrames)); // 0-0.8 para la parte pesada
    }
  }

  if (onProgress) onProgress(0.8);

  // -------- 2. Energía por banda y por frame --------
  const kickEnergy = new Array(numFrames);
  const snareBodyEnergy = new Array(numFrames);
  const snareWireEnergy = new Array(numFrames);
  const hiHatEnergy = new Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const m = magFrames[i];
    kickEnergy[i]      = bandEnergy(m, sampleRate, frameSize, bands.kick[0],      bands.kick[1]);
    snareBodyEnergy[i] = bandEnergy(m, sampleRate, frameSize, bands.snareBody[0], bands.snareBody[1]);
    snareWireEnergy[i] = bandEnergy(m, sampleRate, frameSize, bands.snareWire[0], bands.snareWire[1]);
    hiHatEnergy[i]     = bandEnergy(m, sampleRate, frameSize, bands.hiHat[0],     bands.hiHat[1]);
  }

  // Nos libramos del espectro completo: ya no lo necesitamos.
  magFrames.length = 0;

  if (onProgress) onProgress(0.9);

  // -------- 3. Detección de onsets por banda --------
  const kickOnsets      = detectOnsetsInBand(kickEnergy,      sampleRate, hopSize, opts);
  const snareWireOnsets = detectOnsetsInBand(snareWireEnergy, sampleRate, hopSize, opts);
  const hiHatOnsets     = detectOnsetsInBand(hiHatEnergy,     sampleRate, hopSize, opts);

  // Media de la banda snareBody, para discriminar caja vs crash
  const snareBodyMean = snareBodyEnergy.reduce((a, b) => a + b, 0) / numFrames;
  const snareBodyThreshold = snareBodyMean * opts.snareBodyFactorVsMean;

  // -------- 4. Emisión de notas --------
  const notes = [];

  // 4a. Bombo
  for (const o of kickOnsets) {
    notes.push({
      startTimeSeconds: o.timeSeconds,
      durationSeconds: estimateDurationSeconds(kickEnergy, o.frameIndex, sampleRate, hopSize, opts),
      pitchMidi: gmPitches.kick,
      amplitude: normalizeAmplitude(o.energy, kickEnergy, opts),
      drumType: 'kick'
    });
  }

  // 4b. Caja o crash (onsets en la banda del bordonero)
  for (const o of snareWireOnsets) {
    const bodyAtFrame = snareBodyEnergy[o.frameIndex];
    const isSnare = bodyAtFrame > snareBodyThreshold;

    if (isSnare) {
      notes.push({
        startTimeSeconds: o.timeSeconds,
        durationSeconds: estimateDurationSeconds(snareWireEnergy, o.frameIndex, sampleRate, hopSize, opts),
        pitchMidi: gmPitches.snare,
        amplitude: normalizeAmplitude(o.energy, snareWireEnergy, opts),
        drumType: 'snare'
      });
    } else {
      notes.push({
        startTimeSeconds: o.timeSeconds,
        durationSeconds: estimateDurationSeconds(snareWireEnergy, o.frameIndex, sampleRate, hopSize, opts),
        pitchMidi: gmPitches.crash,
        amplitude: normalizeAmplitude(o.energy, snareWireEnergy, opts),
        drumType: 'crash'
      });
    }
  }

  // 4c. Hi-hat (cerrado o abierto según duración)
  for (const o of hiHatOnsets) {
    const dur = estimateDurationSeconds(hiHatEnergy, o.frameIndex, sampleRate, hopSize, opts);
    const isOpen = dur >= opts.hatOpenMinDurationSec;

    notes.push({
      startTimeSeconds: o.timeSeconds,
      durationSeconds: dur,
      pitchMidi: isOpen ? gmPitches.openHat : gmPitches.closedHat,
      amplitude: normalizeAmplitude(o.energy, hiHatEnergy, opts),
      drumType: isOpen ? 'openHat' : 'closedHat'
    });
  }

  // -------- 5. Ordenar por tiempo --------
  notes.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  if (onProgress) onProgress(1);

  return notes;
}

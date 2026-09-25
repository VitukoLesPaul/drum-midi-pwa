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
 *   4. Detectar onsets (picos de energía) en cada banda con supresión de
 *      re-disparos en la cola del sonido.
 *   5. Clasificar cada onset según las bandas activas simultáneamente,
 *      con reglas de exclusión (hat vs snare, snare vs crash, etc.).
 *
 * El array de notas devuelto tiene el MISMO formato que el de Basic Pitch,
 * para que el resto del pipeline (cuantización, generación de MIDI) no
 * necesite cambiar:
 *
 *   { startTimeSeconds, durationSeconds, pitchMidi, amplitude, drumType }
 *
 * Este módulo es autónomo y NO sustituye a Basic Pitch: solo se usa cuando
 * el usuario elige "Batería". El bajo sigue usando Basic Pitch sin cambios.
 *
 * Cambios del PASO 3.7.5 respecto a la v1:
 *   - umbral de onset más bajo (1.4 en vez de 1.8) → detecta más golpes.
 *   - minIntervalMs más alto (80 en vez de 40) → menos re-disparos.
 *   - supresión de re-disparos en cola dentro de la propia banda.
 *   - discriminación hat vs snare (si hay snare en el mismo instante, no hat).
 *   - caja por defecto en caso de duda (antes se prefería crash).
 *   - banda específica de crash (3-7 kHz) con duración mínima larga.
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
  minIntervalMs: 80,        // separación mínima entre onsets en la misma banda
  onsetThresholdMult: 1.4,  // umbral = media_local + mult * desviación_local
  onsetWindowSec: 1.0,      // ventana para el umbral adaptativo (segundos)
  ampPercentile: 0.9,       // percentil de energía para normalizar amplitudes

  // Supresión de re-disparos en la cola de un sonido:
  // tras detectar un onset, saltamos frames mientras la energía siga por
  // encima de este ratio * energía_del_onset. Evita que un hi-hat abierto
  // genere 2-3 notas por su cola.
  decaySuppressionRatio: 0.30,

  // Duración mínima de una nota MIDI (evita notas de duración 0)
  minNoteDurationSec: 0.04,

  // Discriminación hi-hat cerrado vs abierto
  hatOpenMinDurationSec: 0.18,

  // Ventana para considerar dos onsets "simultáneos" en bandas distintas
  // (p. ej. snare y hat en el mismo golpe). En segundos.
  simultaneousWindowSec: 0.03,

  // Umbral relativo para decidir que una banda está "activa" en un onset:
  // la energía de la banda debe superar este ratio respecto a la media
  // de esa banda en toda la pista.
  bandActiveRatio: 2.5,

  // Discriminación caja vs crash: si la energía de cuerpo de caja (200-500 Hz)
  // del frame del onset supera esta media por este factor, se considera caja.
  // Si no, y la duración es larga, se considera crash.
  snareBodyFactorVsMean: 1.2,

  // Duración mínima (segundos) para considerar un onset de snareWire como
  // crash. Los crashes tienen cola muy larga; las cajas no.
  crashMinDurationSec: 0.20,

  // Bandas de frecuencia (Hz) para cada elemento
  bands: {
    kick:       [40,    100],
    snareBody:  [200,   500],
    snareWire:  [1500,  6000],
    hiHat:      [6000,  12000],
    crash:      [3000,  7000]
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
 * Media aritmética de un array de números.
 */
function mean(values) {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

/**
 * Detecta onsets (picos locales) en una señal de energía por frame.
 *
 * Incluye supresión de re-disparos en la cola: después de detectar un onset,
 * avanza el índice mientras la energía siga por encima de
 * `decaySuppressionRatio * peak`. Así un solo golpe (especialmente hi-hat
 * abierto o crash) genera un único onset aunque su cola tenga ondulaciones.
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
    onsetWindowSec,
    decaySuppressionRatio
  } = options;

  const hopTimeSec = hopSize / sampleRate;
  const minFramesBetween = Math.max(1, Math.round((minIntervalMs / 1000) / hopTimeSec));
  const halfWindow = Math.max(8, Math.round((onsetWindowSec / 2) / hopTimeSec));

  const onsets = [];
  let lastOnsetFrame = -Infinity;
  let suppressUntilFrame = -1;

  for (let i = 1; i < energy.length - 1; i++) {
    // Si estamos en zona de supresión por cola, saltamos
    if (i <= suppressUntilFrame) continue;

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
    const m = sum / n;
    const variance = Math.max(0, sumSq / n - m * m);
    const std = Math.sqrt(variance);
    const threshold = m + onsetThresholdMult * std;

    if (energy[i] < threshold) continue;

    // Separación mínima entre onsets (redundante con suppressUntilFrame, pero
    // por si el ratio de supresión es muy bajo).
    if (i - lastOnsetFrame < minFramesBetween) continue;

    onsets.push({
      frameIndex: i,
      timeSeconds: (i * hopSize) / sampleRate,
      energy: energy[i]
    });
    lastOnsetFrame = i;

    // Activar supresión: avanzar mientras la energía esté por encima del ratio
    const suppressionFloor = energy[i] * decaySuppressionRatio;
    let k = i + 1;
    while (k < energy.length && energy[k] > suppressionFloor) {
      k++;
    }
    suppressUntilFrame = k - 1;
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

/**
 * Comprueba si dos onsets son "simultáneos" (dentro de la ventana indicada).
 */
function onsetsAreSimultaneous(a, b, windowSec) {
  return Math.abs(a.timeSeconds - b.timeSeconds) <= windowSec;
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
  const frameBuffer = new Float32Array(frameSize);
  const magFrames = new Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    for (let j = 0; j < frameSize; j++) {
      frameBuffer[j] = samples[start + j] * window[j];
    }
    magFrames[i] = magnitudeSpectrum(frameBuffer);

    if (onProgress && (i & 63) === 0) {
      onProgress(0.8 * (i / numFrames));
    }
  }

  if (onProgress) onProgress(0.8);

  // -------- 2. Energía por banda y por frame --------
  const kickEnergy      = new Array(numFrames);
  const snareBodyEnergy = new Array(numFrames);
  const snareWireEnergy = new Array(numFrames);
  const hiHatEnergy     = new Array(numFrames);
  const crashEnergy     = new Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const m = magFrames[i];
    kickEnergy[i]      = bandEnergy(m, sampleRate, frameSize, bands.kick[0],      bands.kick[1]);
    snareBodyEnergy[i] = bandEnergy(m, sampleRate, frameSize, bands.snareBody[0], bands.snareBody[1]);
    snareWireEnergy[i] = bandEnergy(m, sampleRate, frameSize, bands.snareWire[0], bands.snareWire[1]);
    hiHatEnergy[i]     = bandEnergy(m, sampleRate, frameSize, bands.hiHat[0],     bands.hiHat[1]);
    crashEnergy[i]     = bandEnergy(m, sampleRate, frameSize, bands.crash[0],     bands.crash[1]);
  }

  magFrames.length = 0;

  if (onProgress) onProgress(0.9);

  // -------- 3. Detección de onsets por banda --------
  const kickOnsets      = detectOnsetsInBand(kickEnergy,      sampleRate, hopSize, opts);
  const snareWireOnsets = detectOnsetsInBand(snareWireEnergy, sampleRate, hopSize, opts);
  const hiHatOnsets     = detectOnsetsInBand(hiHatEnergy,     sampleRate, hopSize, opts);
  const crashOnsets     = detectOnsetsInBand(crashEnergy,     sampleRate, hopSize, opts);

  // Medias globales para decisiones de "banda activa" y de caja vs crash
  const snareBodyMean = mean(snareBodyEnergy);
  const snareWireMean = mean(snareWireEnergy);
  const hiHatMean     = mean(hiHatEnergy);
  const crashMean     = mean(crashEnergy);

  const snareBodyThreshold = snareBodyMean * opts.snareBodyFactorVsMean;
  const hiHatActiveThreshold = hiHatMean * opts.bandActiveRatio;
  const crashActiveThreshold = crashMean * opts.bandActiveRatio;

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
  // Regla de decisión:
  //   - Si la energía del cuerpo de caja (200-500 Hz) supera el umbral, es CAJA.
  //   - Si no la supera:
  //       * Si la duración es larga (>= crashMinDurationSec) Y hay energía
  //         en la banda de crash (3-7 kHz) por encima de la media, es CRASH.
  //       * Si no, es CAJA igualmente (caja por defecto en caso de duda).
  for (const o of snareWireOnsets) {
    const bodyAtFrame = snareBodyEnergy[o.frameIndex];
    const crashAtFrame = crashEnergy[o.frameIndex];
    const isSnareBody = bodyAtFrame > snareBodyThreshold;
    const dur = estimateDurationSeconds(snareWireEnergy, o.frameIndex, sampleRate, hopSize, opts);
    const crashBandActive = crashAtFrame > crashActiveThreshold;
    const isLong = dur >= opts.crashMinDurationSec;

    const isCrash = !isSnareBody && crashBandActive && isLong;

    if (isCrash) {
      notes.push({
        startTimeSeconds: o.timeSeconds,
        durationSeconds: dur,
        pitchMidi: gmPitches.crash,
        amplitude: normalizeAmplitude(o.energy, snareWireEnergy, opts),
        drumType: 'crash'
      });
    } else {
      notes.push({
        startTimeSeconds: o.timeSeconds,
        durationSeconds: dur,
        pitchMidi: gmPitches.snare,
        amplitude: normalizeAmplitude(o.energy, snareWireEnergy, opts),
        drumType: 'snare'
      });
    }
  }

  // 4c. Hi-hat (cerrado o abierto según duración)
  // Regla de exclusión: si hay un onset de snare en el mismo instante
  // (± simultaneousWindowSec), NO emitimos hi-hat: probablemente sea el
  // ruido del bordonero de la caja colándose en la banda de agudos.
  for (const o of hiHatOnsets) {
    // ¿Hay un snare simultáneo?
    let snareSimultaneous = false;
    for (const s of snareWireOnsets) {
      if (onsetsAreSimultaneous(o, s, opts.simultaneousWindowSec)) {
        snareSimultaneous = true;
        break;
      }
    }

    // ¿La banda de hi-hat está realmente activa en este frame?
    const hiHatActive = hiHatEnergy[o.frameIndex] > hiHatActiveThreshold;

    if (snareSimultaneous || !hiHatActive) {
      continue;
    }

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

  // 4d. Crash detectados por su propia banda (además de los que detecte
  // el bordonero). Solo se emiten si:
  //   - No hay un kick ni un snare ya emitido en ± simultaneousWindowSec.
  //   - La duración es larga.
  for (const o of crashOnsets) {
    let conflict = false;
    for (const k of kickOnsets) {
      if (onsetsAreSimultaneous(o, k, opts.simultaneousWindowSec)) { conflict = true; break; }
    }
    if (!conflict) {
      for (const s of snareWireOnsets) {
        if (onsetsAreSimultaneous(o, s, opts.simultaneousWindowSec)) { conflict = true; break; }
      }
    }
    if (conflict) continue;

    const dur = estimateDurationSeconds(crashEnergy, o.frameIndex, sampleRate, hopSize, opts);
    if (dur < opts.crashMinDurationSec) continue;

    notes.push({
      startTimeSeconds: o.timeSeconds,
      durationSeconds: dur,
      pitchMidi: gmPitches.crash,
      amplitude: normalizeAmplitude(o.energy, crashEnergy, opts),
      drumType: 'crash'
    });
  }

  // -------- 5. Eliminar duplicados casi simultáneos del mismo tipo --------
  const deduped = [];
  notes.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  for (const n of notes) {
    let isDup = false;
    for (let i = deduped.length - 1; i >= 0; i--) {
      const prev = deduped[i];
      if (n.startTimeSeconds - prev.startTimeSeconds > opts.simultaneousWindowSec) break;
      if (prev.pitchMidi === n.pitchMidi) {
        isDup = true;
        break;
      }
    }
    if (!isDup) deduped.push(n);
  }

  if (onProgress) onProgress(1);

  return deduped;
}

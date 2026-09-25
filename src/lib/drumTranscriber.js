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
 *   5. Clasificar cada onset según las bandas activas simultáneamente.
 *
 * Cambios del PASO 3.7.7b respecto a la v3 (3.7.6):
 *   - banda de hi-hat movida de [6000,12000] a [8000,14000] Hz para
 *     desenmascararla de la energía del snare (que domina 4-8 kHz).
 *   - ELIMINADA la regla "si hay snare simultáneo, no emitas hi-hat".
 *     En música real, hats y snares suenan juntos constantemente.
 *   - AÑADIDA regla específica para crash: si hay un snare en el mismo
 *     instante, no emitir crash (el HF del snare cuela en 2-9 kHz).
 *   - crashMinDurationSec subido de 0.14 a 0.18.
 *
 * Modo debug:
 *   `diagnoseDrums()` devuelve { notes, stats } con estadísticas completas.
 *   `transcribeDrums()` (la que usa la app) devuelve SOLO el array de notas.
 */

import { magnitudeSpectrum, hannWindow, bandEnergy } from './fft.js';

// ---------------------------------------------------------------------------
// Parámetros por defecto (todos ajustables vía `options`)
// ---------------------------------------------------------------------------

export const DEFAULT_DRUM_OPTIONS = {
  // Análisis espectral
  frameSize: 2048,
  hopSize: 512,

  // Detección de onsets
  minIntervalMs: 80,
  onsetThresholdMult: 1.4,
  crashOnsetThresholdMult: 1.3,
  onsetWindowSec: 1.0,
  ampPercentile: 0.9,

  // Supresión de re-disparos en la cola de un sonido
  decaySuppressionRatio: 0.30,

  // Duración mínima de una nota MIDI
  minNoteDurationSec: 0.04,

  // Discriminación hi-hat cerrado vs abierto
  hatOpenMinDurationSec: 0.25,

  // Ventana para considerar dos onsets "simultáneos" en bandas distintas
  simultaneousWindowSec: 0.05,

  // Umbral relativo para decidir que una banda está "activa" en un onset
  bandActiveRatio: 2.3,

  // Discriminación caja vs crash desde la banda snareWire
  snareBodyFactorVsMean: 1.2,

  // Duración mínima (segundos) para considerar un onset de snareWire o
  // crash como crash. Los crashes tienen cola más larga.
  crashMinDurationSec: 0.18,

  // Bandas de frecuencia (Hz) para cada elemento.
  // CAMBIO 3.7.7b: hiHat ahora 8-14 kHz (antes 6-12), para no capturar
  // el HF del snare (que está en 4-8 kHz).
  bands: {
    kick:       [40,    100],
    snareBody:  [200,   500],
    snareWire:  [1500,  6000],
    hiHat:      [8000,  14000],
    crash:      [2000,  9000]
  },

  // Pitches General MIDI (canal 10) para cada sonido
  gmPitches: {
    kick:      36,
    snare:     38,
    closedHat: 42,
    openHat:   46,
    crash:     49
  },

  // Modo debug: si es true, transcribeDrums devuelve { notes, stats }.
  debug: false
};

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function mean(values) {
  if (values.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

function detectOnsetsInBand(energy, sampleRate, hopSize, options, thresholdOverride) {
  const { minIntervalMs, onsetWindowSec, decaySuppressionRatio } = options;

  const onsetThresholdMult = (typeof thresholdOverride === 'number')
    ? thresholdOverride
    : options.onsetThresholdMult;

  const hopTimeSec = hopSize / sampleRate;
  const minFramesBetween = Math.max(1, Math.round((minIntervalMs / 1000) / hopTimeSec));
  const halfWindow = Math.max(8, Math.round((onsetWindowSec / 2) / hopTimeSec));

  const onsets = [];
  let lastOnsetFrame = -Infinity;
  let suppressUntilFrame = -1;

  for (let i = 1; i < energy.length - 1; i++) {
    if (i <= suppressUntilFrame) continue;
    if (energy[i] <= energy[i - 1] || energy[i] <= energy[i + 1]) continue;

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
    if (i - lastOnsetFrame < minFramesBetween) continue;

    onsets.push({
      frameIndex: i,
      timeSeconds: (i * hopSize) / sampleRate,
      energy: energy[i]
    });
    lastOnsetFrame = i;

    const suppressionFloor = energy[i] * decaySuppressionRatio;
    let k = i + 1;
    while (k < energy.length && energy[k] > suppressionFloor) {
      k++;
    }
    suppressUntilFrame = k - 1;
  }

  return onsets;
}

function estimateDurationSeconds(energy, onsetFrameIndex, sampleRate, hopSize, options) {
  const peak = energy[onsetFrameIndex];
  if (peak <= 0) return options.minNoteDurationSec;

  const decayFactor = 0.15;
  let end = onsetFrameIndex;
  while (end + 1 < energy.length && energy[end + 1] > peak * decayFactor) {
    end++;
  }

  const durSec = ((end - onsetFrameIndex) * hopSize) / sampleRate;
  return Math.max(options.minNoteDurationSec, durSec);
}

function normalizeAmplitude(onsetEnergy, allEnergies, options) {
  const ref = percentile(allEnergies, options.ampPercentile);
  if (ref <= 0) return 0.7;
  const amp = onsetEnergy / ref;
  return Math.max(0.05, Math.min(1, amp));
}

function onsetsAreSimultaneous(a, b, windowSec) {
  return Math.abs(a.timeSeconds - b.timeSeconds) <= windowSec;
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

/**
 * Transcribe un audio de batería a notas MIDI (en pitches General MIDI).
 *
 * Si `options.debug` es false (por defecto), devuelve el array de notas.
 * Si es true, devuelve { notes, stats }.
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
    return opts.debug ? { notes: [], stats: { reason: 'audio-too-short' } } : [];
  }

  const numFrames = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const durationSec = samples.length / sampleRate;
  const window = hannWindow(frameSize);

  const stats = opts.debug ? {
    meta: {
      durationSec: +durationSec.toFixed(3),
      sampleRate,
      frameSize,
      hopSize,
      numFrames
    },
    params: {
      onsetThresholdMult: opts.onsetThresholdMult,
      crashOnsetThresholdMult: opts.crashOnsetThresholdMult,
      minIntervalMs: opts.minIntervalMs,
      bandActiveRatio: opts.bandActiveRatio,
      simultaneousWindowSec: opts.simultaneousWindowSec,
      snareBodyFactorVsMean: opts.snareBodyFactorVsMean,
      crashMinDurationSec: opts.crashMinDurationSec,
      hatOpenMinDurationSec: opts.hatOpenMinDurationSec,
      bands: opts.bands
    }
  } : null;

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
  const crashOnsets     = detectOnsetsInBand(crashEnergy,     sampleRate, hopSize, opts, opts.crashOnsetThresholdMult);

  const snareBodyMean = mean(snareBodyEnergy);
  const snareWireMean = mean(snareWireEnergy);
  const hiHatMean     = mean(hiHatEnergy);
  const crashMean     = mean(crashEnergy);

  const snareBodyThreshold   = snareBodyMean * opts.snareBodyFactorVsMean;
  const hiHatActiveThreshold = hiHatMean * opts.bandActiveRatio;
  const crashActiveThreshold = crashMean * opts.bandActiveRatio;

  if (stats) {
    stats.meanEnergy = {
      kick:      +mean(kickEnergy).toFixed(2),
      snareBody: +snareBodyMean.toFixed(2),
      snareWire: +snareWireMean.toFixed(2),
      hiHat:     +hiHatMean.toFixed(2),
      crash:     +crashMean.toFixed(2)
    };
    stats.thresholds = {
      snareBodyThreshold:   +snareBodyThreshold.toFixed(2),
      hiHatActiveThreshold: +hiHatActiveThreshold.toFixed(2),
      crashActiveThreshold: +crashActiveThreshold.toFixed(2)
    };
    stats.onsetsDetected = {
      kick:      kickOnsets.length,
      snareWire: snareWireOnsets.length,
      hiHat:     hiHatOnsets.length,
      crash:     crashOnsets.length
    };
    stats.onsetsTimesFirst20 = {
      kick:      kickOnsets.slice(0, 20).map(o => +o.timeSeconds.toFixed(3)),
      snareWire: snareWireOnsets.slice(0, 20).map(o => +o.timeSeconds.toFixed(3)),
      hiHat:     hiHatOnsets.slice(0, 20).map(o => +o.timeSeconds.toFixed(3)),
      crash:     crashOnsets.slice(0, 20).map(o => +o.timeSeconds.toFixed(3))
    };
    stats.classification = {
      snareWireAsSnare: 0,
      snareWireAsCrash: 0,
      hatsDiscardedByLowActivity: 0,
      hatsDiscardedExamples: [],
      crashDiscardedBySnareSimul: 0,
      crashDiscardedByShortDuration: 0
    };
  }

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

  // 4b. Caja o crash desde snareWire
  for (const o of snareWireOnsets) {
    const bodyAtFrame  = snareBodyEnergy[o.frameIndex];
    const crashAtFrame = crashEnergy[o.frameIndex];
    const isSnareBody  = bodyAtFrame > snareBodyThreshold;
    const dur          = estimateDurationSeconds(snareWireEnergy, o.frameIndex, sampleRate, hopSize, opts);
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
      if (stats) stats.classification.snareWireAsCrash++;
    } else {
      notes.push({
        startTimeSeconds: o.timeSeconds,
        durationSeconds: dur,
        pitchMidi: gmPitches.snare,
        amplitude: normalizeAmplitude(o.energy, snareWireEnergy, opts),
        drumType: 'snare'
      });
      if (stats) stats.classification.snareWireAsSnare++;
    }
  }

  // 4c. Hi-hat (cerrado o abierto según duración)
  // CAMBIO 3.7.7b: se ha ELIMINADO la regla "si hay snare simultáneo, no
  // emitir hi-hat". Con la banda de hi-hat movida a 8-14 kHz, ya no captura
  // el HF del snare. Solo descartamos si la banda está poco activa.
  for (const o of hiHatOnsets) {
    const hiHatActive = hiHatEnergy[o.frameIndex] > hiHatActiveThreshold;

    if (!hiHatActive) {
      if (stats) {
        stats.classification.hatsDiscardedByLowActivity++;
        if (stats.classification.hatsDiscardedExamples.length < 10) {
          stats.classification.hatsDiscardedExamples.push({
            t: +o.timeSeconds.toFixed(3),
            reason: 'low-activity',
            hiHatEnergy: +hiHatEnergy[o.frameIndex].toFixed(2),
            threshold: +hiHatActiveThreshold.toFixed(2)
          });
        }
      }
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

  // 4d. Crash desde su propia banda.
  // CAMBIO 3.7.7b: si hay un snare en el mismo instante, NO emitimos crash.
  // El HF del snare cuela en 2-9 kHz y estaba generando crashes falsos.
  for (const o of crashOnsets) {
    // ¿Hay un snare simultáneo?
    let snareSimultaneous = false;
    for (const s of snareWireOnsets) {
      if (onsetsAreSimultaneous(o, s, opts.simultaneousWindowSec)) {
        snareSimultaneous = true;
        break;
      }
    }
    if (snareSimultaneous) {
      if (stats) stats.classification.crashDiscardedBySnareSimul++;
      continue;
    }

    const dur = estimateDurationSeconds(crashEnergy, o.frameIndex, sampleRate, hopSize, opts);
    if (dur < opts.crashMinDurationSec) {
      if (stats) stats.classification.crashDiscardedByShortDuration++;
      continue;
    }

    notes.push({
      startTimeSeconds: o.timeSeconds,
      durationSeconds: dur,
      pitchMidi: gmPitches.crash,
      amplitude: normalizeAmplitude(o.energy, crashEnergy, opts),
      drumType: 'crash'
    });
  }

  // -------- 5. Deduplicación --------
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

  if (stats) {
    stats.emittedFinal = {
      total: deduped.length,
      kick:      deduped.filter(n => n.drumType === 'kick').length,
      snare:     deduped.filter(n => n.drumType === 'snare').length,
      crash:     deduped.filter(n => n.drumType === 'crash').length,
      closedHat: deduped.filter(n => n.drumType === 'closedHat').length,
      openHat:   deduped.filter(n => n.drumType === 'openHat').length
    };
  }

  if (onProgress) onProgress(1);

  return opts.debug ? { notes: deduped, stats } : deduped;
}

/**
 * Envoltorio de diagnóstico: siempre llama a transcribeDrums con debug true.
 */
export async function diagnoseDrums(samples, sampleRate, options = {}, onProgress) {
  return transcribeDrums(samples, sampleRate, { ...options, debug: true }, onProgress);
}

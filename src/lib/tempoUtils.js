/**
 * tempoUtils.js
 * 
 * Detección de BPM (tempo) usando pleco-xa.
 * 
 * Notas importantes:
 * - La detección es fiable en pistas con percusión (batería).
 * - En pistas melódicas (bajo, piano) puede dar el doble, la mitad,
 *   o un valor sin relación musical. En esos casos, mejor introducir
 *   el BPM manualmente o reutilizar el detectado en la batería.
 */

import { beat_track } from 'pleco-xa';

/**
 * Detecta el BPM y los beats de una señal de audio mono.
 * 
 * @param {Float32Array} samples - Muestras mono.
 * @param {number} sampleRate - Sample rate.
 * @returns {{ bpm: number, beats: number[], reliable: boolean }}
 */
export function detectBpm(samples, sampleRate) {
  try {
    const { tempo, beats } = beat_track(samples, sampleRate, {
      units: 'time'
    });

    const bpm = Math.round(tempo * 100) / 100;
    const beatCount = Array.isArray(beats) ? beats.length : 0;

    // Heurística de fiabilidad:
    // - Si hay menos de 4 beats detectados, es poco fiable.
    // - Si el BPM está fuera de 60-180, probablemente es doble o mitad.
    const reliable = beatCount >= 4 && bpm >= 60 && bpm <= 180;

    return { bpm, beats, reliable };
  } catch (err) {
    console.error('Error detectando BPM:', err);
    return { bpm: 120, beats: [], reliable: false };
  }
}

/**
 * Redondea un BPM al entero más cercano.
 * La mayoría de la música comercial está en BPM entero.
 * 
 * @param {number} bpm
 * @returns {number}
 */
export function roundBpm(bpm) {
  return Math.round(bpm);
}

/**
 * Carga el último BPM guardado en localStorage.
 * @returns {number | null}
 */
export function loadLastBpm() {
  try {
    const value = localStorage.getItem('lastBpm');
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Guarda el BPM actual en localStorage para reutilizarlo.
 * @param {number} bpm
 */
export function saveLastBpm(bpm) {
  try {
    localStorage.setItem('lastBpm', String(bpm));
  } catch {
    // localStorage no disponible, ignorar
  }
}
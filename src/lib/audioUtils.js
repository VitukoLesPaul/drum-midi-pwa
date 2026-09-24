/**
 * audioUtils.js
 * 
 * Utilidades para procesar archivos de audio:
 * - Decodificar MP3/WAV/OGG/etc. a PCM (muestras de audio en bruto).
 * - Convertir a mono, remuestrear a 44.1 kHz.
 * - Extraer información básica (duración, canales, sample rate).
 * 
 * Usa la Web Audio API, disponible en todos los navegadores modernos.
 */

/**
 * Formatos de audio aceptados por la app.
 */
export const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg',       // .mp3
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm'
];

export const ACCEPTED_EXTENSIONS = [
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.webm'
];

/**
 * Comprueba si un archivo es de audio aceptado.
 * @param {File} file
 * @returns {boolean}
 */
export function isAcceptedAudio(file) {
  if (!file) return false;
  if (ACCEPTED_AUDIO_TYPES.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Decodifica un archivo de audio (ArrayBuffer) a AudioBuffer usando Web Audio API.
 * 
 * @param {ArrayBuffer} arrayBuffer - Contenido del archivo.
 * @param {number} [sampleRate=44100] - Sample rate deseado para el AudioContext.
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudioFile(arrayBuffer, sampleRate = 44100) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API no está disponible en este navegador.');
  }

  const audioContext = new AudioContextClass({ sampleRate });

  try {
    // decodeAudioData consume el ArrayBuffer, así que le pasamos una copia
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return audioBuffer;
  } finally {
    // Cerramos el contexto para liberar recursos
    await audioContext.close();
  }
}

/**
 * Convierte un AudioBuffer a mono, promediando los canales.
 * 
 * @param {AudioBuffer} audioBuffer
 * @returns {Float32Array} - Muestras mono en punto flotante (-1.0 a 1.0).
 */
export function audioBufferToMono(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  if (numChannels === 1) {
    // Ya es mono
    return audioBuffer.getChannelData(0).slice();
  }

  // Mezcla todos los canales a uno solo
  const mono = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }
  // Promedio
  for (let i = 0; i < length; i++) {
    mono[i] /= numChannels;
  }

  return mono;
}

/**
 * Remuestrea un array de muestras mono de un sample rate a otro.
 * Usa interpolación lineal (suficiente para alimentar a un modelo de IA).
 * 
 * Si los sample rates coinciden, devuelve el mismo array.
 * 
 * @param {Float32Array} samples - Muestras de entrada.
 * @param {number} fromRate - Sample rate original.
 * @param {number} toRate - Sample rate destino.
 * @returns {Float32Array} - Muestras remuestreadas.
 */
export function resampleMono(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;

  const ratio = toRate / fromRate;
  const newLength = Math.round(samples.length * ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i / ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    resampled[i] =
      samples[srcIndexFloor] * (1 - fraction) +
      samples[srcIndexCeil] * fraction;
  }

  return resampled;
}

/**
 * Pipeline completo: recibe un File de audio y devuelve:
 * - Las muestras mono remuestreadas a 44.1 kHz.
 * - Información básica del archivo original.
 * 
 * @param {File} file - El archivo de audio.
 * @param {number} [targetSampleRate=44100] - Sample rate de destino.
 * @returns {Promise<{
 *   samples: Float32Array,
 *   sampleRate: number,
 *   duration: number,
 *   originalSampleRate: number,
 *   originalChannels: number
 * }>}
 */
export async function processAudioFile(file, targetSampleRate = 44100) {
  // 1. Leer el archivo como ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // 2. Decodificar a AudioBuffer
  const audioBuffer = await decodeAudioFile(arrayBuffer, targetSampleRate);

  // 3. Guardar info del original
  const originalSampleRate = audioBuffer.sampleRate;
  const originalChannels = audioBuffer.numberOfChannels;
  const duration = audioBuffer.duration;

  // 4. Convertir a mono
  let mono = audioBufferToMono(audioBuffer);

  // 5. Remuestrear si hace falta
  if (originalSampleRate !== targetSampleRate) {
    mono = resampleMono(mono, originalSampleRate, targetSampleRate);
  }

  return {
    samples: mono,
    sampleRate: targetSampleRate,
    duration,
    originalSampleRate,
    originalChannels
  };
}

/**
 * Formatea un tamaño en bytes a string legible (KB, MB, GB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Formatea una duración en segundos a string "MM:SS".
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
/**
 * transcriptionUtils.js
 * 
 * Transcripción de audio a notas MIDI usando Basic Pitch (de Spotify).
 * 
 * Basic Pitch EXIGE que el audio esté a 22050 Hz. Internamente remuestreamos.
 * El MIDI resultante guarda tiempos en segundos, así que es independiente
 * del sample rate y compatible con Logic Pro (44100 Hz).
 */

import {
  BasicPitch,
  outputToNotesPoly,
  noteFramesToTime,
  addPitchBendsToNoteEvents
} from '@spotify/basic-pitch';

const BASIC_PITCH_SAMPLE_RATE = 22050;

// ----- Instancia singleton del modelo -----
let _basicPitchInstance = null;

/**
 * Carga (una sola vez) el modelo Basic Pitch.
 * @returns {Promise<BasicPitch>}
 */
export async function loadBasicPitchModel() {
  if (_basicPitchInstance) return _basicPitchInstance;
  const modelUrl = '/models/basic-pitch/model.json';
  _basicPitchInstance = new BasicPitch(modelUrl);
  return _basicPitchInstance;
}

/**
 * Remuestrea un AudioBuffer a otro sample rate.
 * 
 * @param {AudioBuffer} sourceBuffer
 * @param {number} targetSampleRate
 * @returns {Promise<AudioBuffer>}
 */
async function resampleAudioBuffer(sourceBuffer, targetSampleRate) {
  if (sourceBuffer.sampleRate === targetSampleRate) {
    return sourceBuffer;
  }

  // Usamos OfflineAudioContext para remuestrear de forma correcta.
  // Basic Pitch es monofónico, así que solo conservamos el canal 0.
  const length = Math.ceil(
    sourceBuffer.duration * targetSampleRate
  );

  const offlineCtx = new OfflineAudioContext(
    1, // mono
    length,
    targetSampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer;
}

/**
 * Transcribe un AudioBuffer a un array de notas MIDI.
 * 
 * @param {AudioBuffer} audioBuffer - Puede ser mono a cualquier sample rate.
 * @param {(progress: number) => void} [onProgress] - Callback con progreso 0-1.
 * @returns {Promise<Array<{
 *   startTimeSeconds: number,
 *   durationSeconds: number,
 *   pitchMidi: number,
 *   amplitude: number,
 *   pitchBends: number[]
 * }>>}
 */
export async function transcribeWithBasicPitch(audioBuffer, onProgress) {
  // 1. Remuestrear a 22050 Hz (requisito de Basic Pitch)
  let bufferForBasicPitch = audioBuffer;
  if (audioBuffer.sampleRate !== BASIC_PITCH_SAMPLE_RATE) {
    bufferForBasicPitch = await resampleAudioBuffer(
      audioBuffer,
      BASIC_PITCH_SAMPLE_RATE
    );
  }

  // 2. Cargar modelo
  const basicPitch = await loadBasicPitchModel();

  // 3. Acumuladores
  const allFrames = [];
  const allOnsets = [];
  const allContours = [];

  await basicPitch.evaluateModel(
    bufferForBasicPitch,
    (frames, onsets, contours) => {
      allFrames.push(...frames);
      allOnsets.push(...onsets);
      allContours.push(...contours);
    },
    (progress) => {
      if (typeof onProgress === 'function') {
        onProgress(Math.max(0, Math.min(1, progress)));
      }
    }
  );

  // 4. Post-procesado
  const onsetThreshold = 0.3;
  const frameThreshold = 0.3;
  const minNoteLength = 5;

  const notes = outputToNotesPoly(
    allFrames,
    allOnsets,
    onsetThreshold,
    frameThreshold,
    minNoteLength
  );

  const notesWithBends = addPitchBendsToNoteEvents(allContours, notes);
  const timedNotes = noteFramesToTime(notesWithBends);

  return timedNotes;
}

/**
 * Cuantiza las notas al grid más cercano según el BPM.
 */
export function quantizeNotes(notes, bpm, grid = 16) {
  const secondsPerBeat = 60 / bpm;
  const gridDuration = secondsPerBeat / (grid / 4);

  return notes.map(note => {
    const startQuantized =
      Math.round(note.startTimeSeconds / gridDuration) * gridDuration;
    const durationQuantized =
      Math.max(
        gridDuration,
        Math.round(note.durationSeconds / gridDuration) * gridDuration
      );

    return {
      ...note,
      startTimeSeconds: startQuantized,
      durationSeconds: durationQuantized
    };
  });
}

/**
 * Devuelve el nombre legible de una nota MIDI (ej: "C1", "D#2").
 */
export function midiNoteName(pitchMidi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitchMidi / 12) - 1;
  const name = names[pitchMidi % 12];
  return `${name}${octave}`;
}
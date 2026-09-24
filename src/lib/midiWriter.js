/**
 * midiWriter.js
 * 
 * Genera archivos MIDI (SMF Tipo 1) a partir de notas transcritas.
 * 
 * - Para BAJO: usa los pitches detectados tal cual.
 * - Para BATERÍA: mapea los pitches detectados a los sonidos GM en Canal 10.
 * 
 * El archivo generado es compatible con Logic Pro (Drum Kit Designer con
 * Input Mapping = GM para batería).
 */

import { Midi } from '@tonejs/midi';

/**
 * Mapeo General MIDI para batería (Canal 10).
 * https://en.wikipedia.org/wiki/General_MIDI#Percussion
 * 
 * Nota: en notación científica, C1 = MIDI 36, D1 = 38, etc.
 */
export const GM_DRUM_MAP = {
  KICK: 36,        // C1  - Bombo
  SNARE: 38,       // D1  - Caja
  CLOSED_HAT: 42,  // F#1 - Hi-hat cerrado
  PEDAL_HAT: 44,   // G#1 - Hi-hat con pedal
  OPEN_HAT: 46,    // A#1 - Hi-hat abierto
  LOW_TOM: 45,     // A1  - Tom grave
  MID_TOM: 47,     // B1  - Tom medio
  HIGH_TOM: 50,    // D2  - Tom agudo
  CRASH: 49,       // C#2 - Crash
  RIDE: 51,        // D#2 - Ride
  RIDE_BELL: 53    // F2  - Campana del ride
};

/**
 * Genera un archivo MIDI (SMF Tipo 1) y lo devuelve como Blob.
 * 
 * @param {Array<{
 *   startTimeSeconds: number,
 *   durationSeconds: number,
 *   pitchMidi: number,
 *   amplitude: number
 * }>} notes - Notas transcritas.
 * @param {number} bpm - Tempo de la canción.
 * @param {'bass' | 'drums'} instrumentType - Tipo de instrumento.
 * @param {Object} [options] - Opciones adicionales.
 * @param {number} [options.minVelocity=30] - Velocidad MIDI mínima (1-127).
 * @param {number} [options.maxVelocity=127] - Velocidad MIDI máxima.
 * @param {boolean} [options.quantize=true] - Cuantizar al grid.
 * @param {number} [options.grid=16] - Subdivisión (4=negras, 8=corcheas, 16=semicorcheas).
 * @param {string} [options.trackName] - Nombre de la pista.
 * @returns {Blob} - Archivo MIDI listo para descargar.
 */
export function generateMidiFile(notes, bpm, instrumentType, options = {}) {
  const {
    minVelocity = 30,
    maxVelocity = 127,
    quantize = true,
    grid = 16,
    trackName = instrumentType === 'drums' ? 'Drums' : 'Bass'
  } = options;

  if (!Array.isArray(notes) || notes.length === 0) {
    throw new Error('No hay notas para generar el MIDI.');
  }

  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignature = [4, 4];

  const track = midi.addTrack();
  track.name = trackName;

  // Canal 10 (índice 9) para batería según GM; canal 1 (índice 0) para bajo.
  // En @tonejs/midi, el canal se asigna al exportar; aquí lo guardamos como metadato.
  track.channel = instrumentType === 'drums' ? 9 : 0;

  // Duración del grid en segundos (para cuantización)
  const secondsPerBeat = 60 / bpm;
  const gridDuration = quantize ? secondsPerBeat / (grid / 4) : 0;

  // Mapeo de pitches a notas GM si es batería.
  // Como Basic Pitch no está entrenado para percusión, sus pitches no
  // corresponden a sonidos GM. Aplicamos una heurística:
  //   - pitches graves (MIDI < 45) → bombo
  //   - pitches medios (45-60)     → caja
  //   - pitches agudos (> 60)      → hi-hat cerrado
  // Esto es provisional. Mejoraremos con un análisis por bandas de frecuencia.
  const mapPitchForDrums = (pitch) => {
    if (pitch < 45) return GM_DRUM_MAP.KICK;
    if (pitch < 60) return GM_DRUM_MAP.SNARE;
    return GM_DRUM_MAP.CLOSED_HAT;
  };

  // Calcula la duración total del audio (para saber cuándo termina)
  const lastNote = notes.reduce((max, n) => {
    const end = n.startTimeSeconds + n.durationSeconds;
    return end > max ? end : max;
  }, 0);

  for (const note of notes) {
    let startTime = note.startTimeSeconds;
    let duration = note.durationSeconds;

    // Cuantización opcional
    if (quantize) {
      startTime = Math.round(startTime / gridDuration) * gridDuration;
      duration = Math.max(
        gridDuration,
        Math.round(duration / gridDuration) * gridDuration
      );
    }

    // Asegura que startTime no sea negativo
    if (startTime < 0) startTime = 0;

    // Velocidad MIDI: mapea amplitude (0-1) al rango [minVelocity, maxVelocity]
    const amplitude = typeof note.amplitude === 'number'
      ? Math.max(0, Math.min(1, note.amplitude))
      : 0.7;
    const velocity = Math.round(
      minVelocity + amplitude * (maxVelocity - minVelocity)
    );

    // Determina el pitch final
    let finalPitch;
    if (instrumentType === 'drums') {
      finalPitch = mapPitchForDrums(note.pitchMidi);
    } else {
      // Bajo: acepta pitches de 0 a 127 tal cual
      finalPitch = Math.max(0, Math.min(127, Math.round(note.pitchMidi)));
    }

    // Añade la nota al track
    track.addNote({
      midi: finalPitch,
      time: startTime,
      duration: duration,
      velocity: velocity / 127  // @tonejs/midi usa 0-1
    });
  }

  // Ajusta la duración del header a la última nota
  midi.header.update();

  // Devuelve el archivo como Blob
  const arrayBuffer = midi.toArray();
  return new Blob([arrayBuffer], { type: 'audio/midi' });
}

/**
 * Descarga un Blob como archivo en el navegador.
 * 
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Genera un nombre de archivo MIDI a partir del nombre del audio original.
 * 
 * @param {string} originalFilename - Ej: "cancion_bateria.wav"
 * @param {'bass' | 'drums'} instrumentType
 * @returns {string} - Ej: "cancion_bateria_drums.mid"
 */
export function buildMidiFilename(originalFilename, instrumentType) {
  const base = originalFilename.replace(/\.[^/.]+$/, ''); // quita extensión
  const suffix = instrumentType === 'drums' ? 'drums' : 'bass';
  return `${base}_${suffix}.mid`;
}
/**
 * fft.js
 *
 * Implementación de una FFT (Fast Fourier Transform) radix-2 Cooley-Tukey,
 * iterativa e in-place, en JavaScript puro.
 *
 * Se usa para el análisis espectral del audio en el transcriptor de batería
 * (PASO 3.7). Es un módulo aislado: no depende de nada y no afecta al resto
 * de la aplicación.
 *
 * Uso típico:
 *   const mag = magnitudeSpectrum(frame);        // frame: Float32Array de tamaño potencia de 2
 *   const freq = binFrequency(peakBin, 44100, frame.length);
 *
 * Convenciones:
 *   - Las longitudes de los arrays deben ser potencias de 2 (128, 256, 512, 1024,
 *     2048, 4096, ...).
 *   - La FFT trabaja con arrays separados de parte real e imaginaria.
 *   - El espectro de magnitud devuelto tiene N/2 + 1 bins (de 0 Hz a Nyquist).
 */

/**
 * Devuelve la siguiente potencia de 2 mayor o igual que n.
 * @param {number} n
 * @returns {number}
 */
export function nextPowerOfTwo(n) {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Comprueba si un número es potencia de 2.
 * @param {number} n
 * @returns {boolean}
 */
export function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * FFT radix-2 Cooley-Tukey, in-place.
 *
 * Modifica los arrays `re` e `im` que se le pasan.
 *
 * @param {Float32Array|Float64Array} re - Parte real (entrada/salida).
 * @param {Float32Array|Float64Array} im - Parte imaginaria (entrada/salida).
 */
export function fftInPlace(re, im) {
  const n = re.length;

  if (n !== im.length) {
    throw new Error('fftInPlace: re e im deben tener la misma longitud.');
  }
  if (!isPowerOfTwo(n)) {
    throw new Error('fftInPlace: la longitud debe ser potencia de 2.');
  }
  if (n === 1) return;

  // --- 1. Reordenación bit-reversal ---
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i];    im[i] = im[j]; im[j] = tmp;
    }
  }

  // --- 2. Mariposas (butterflies) iterativas ---
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);

    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;

      for (let k = 0; k < half; k++) {
        const idxA = i + k;
        const idxB = i + k + half;

        const uRe = re[idxA];
        const uIm = im[idxA];

        const bRe = re[idxB];
        const bIm = im[idxB];

        const vRe = bRe * curRe - bIm * curIm;
        const vIm = bRe * curIm + bIm * curRe;

        re[idxA] = uRe + vRe;
        im[idxA] = uIm + vIm;

        re[idxB] = uRe - vRe;
        im[idxB] = uIm - vIm;

        // Actualiza el twiddle factor hacia el siguiente
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

/**
 * Genera una ventana de Hann de tamaño `size`.
 *
 * Se aplica al frame antes de la FFT para reducir el "leakage" espectral
 * (que la energía de una frecuencia se derrame a las vecinas).
 *
 * @param {number} size
 * @returns {Float32Array}
 */
export function hannWindow(size) {
  const w = new Float32Array(size);
  if (size === 1) {
    w[0] = 1;
    return w;
  }
  const denom = size - 1;
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
  }
  return w;
}

/**
 * Calcula el espectro de magnitud de un frame real.
 *
 * Internamente:
 *   1. Copia el frame a los arrays de parte real e imaginaria.
 *   2. Aplica la FFT.
 *   3. Devuelve sqrt(re^2 + im^2) para los bins 0..N/2 (el resto es simétrico).
 *
 * @param {Float32Array|Float64Array|Array<number>} frame - Muestras reales.
 *   Su longitud debe ser potencia de 2.
 * @returns {Float32Array} - Magnitudes, de longitud N/2 + 1.
 */
export function magnitudeSpectrum(frame) {
  const n = frame.length;

  if (!isPowerOfTwo(n)) {
    throw new Error('magnitudeSpectrum: la longitud del frame debe ser potencia de 2.');
  }

  const re = new Float32Array(n);
  const im = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    re[i] = frame[i];
  }

  fftInPlace(re, im);

  const half = (n >> 1) + 1;
  const mag = new Float32Array(half);

  for (let i = 0; i < half; i++) {
    const r = re[i];
    const m = im[i];
    mag[i] = Math.sqrt(r * r + m * m);
  }

  return mag;
}

/**
 * Devuelve la frecuencia central (en Hz) del bin `binIndex` para un
 * sample rate y un tamaño de FFT dados.
 *
 * @param {number} binIndex
 * @param {number} sampleRate - Hz (p. ej. 44100).
 * @param {number} fftSize - Tamaño de la FFT (potencia de 2).
 * @returns {number} - Hz.
 */
export function binFrequency(binIndex, sampleRate, fftSize) {
  return (binIndex * sampleRate) / fftSize;
}

/**
 * Devuelve el índice de bin más cercano a una frecuencia dada (en Hz).
 *
 * @param {number} frequency - Hz.
 * @param {number} sampleRate - Hz.
 * @param {number} fftSize - Tamaño de la FFT.
 * @returns {number}
 */
export function frequencyToBin(frequency, sampleRate, fftSize) {
  return Math.round((frequency * fftSize) / sampleRate);
}

/**
 * Suma la energía (magnitudes al cuadrado) dentro de una banda de frecuencia.
 *
 * Es la operación base del análisis por bandas: para cada frame, sabremos
 * cuánta energía hay en los graves (bombo), medios (caja), agudos (hi-hat), etc.
 *
 * @param {Float32Array} magnitudes - Espectro de magnitud (N/2 + 1 bins).
 * @param {number} sampleRate - Hz.
 * @param {number} fftSize - Tamaño de la FFT usada.
 * @param {number} lowHz - Límite inferior de la banda (inclusive).
 * @param {number} highHz - Límite superior de la banda (inclusive).
 * @returns {number} - Suma de magnitudes al cuadrado en la banda.
 */
export function bandEnergy(magnitudes, sampleRate, fftSize, lowHz, highHz) {
  const lowBin = Math.max(0, frequencyToBin(lowHz, sampleRate, fftSize));
  const highBin = Math.min(
    magnitudes.length - 1,
    frequencyToBin(highHz, sampleRate, fftSize)
  );

  let sum = 0;
  for (let i = lowBin; i <= highBin; i++) {
    const m = magnitudes[i];
    sum += m * m;
  }
  return sum;
}

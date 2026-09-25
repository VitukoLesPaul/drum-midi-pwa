📋 HAND-OFF — Estado tras PASO 3.7.8a
1. Contexto del proyecto
Nombre: drum-midi-pwa
Repositorio: https://github.com/VitukoLesPaul/drum-midi-pwa
URL producción: https://drum-midi-pwa.vercel.app/
URL desarrollo (Codespaces): puerto 5173 (pestaña PORTS → icono globo 🌐)
Editor: GitHub Codespaces (usuario desde navegador, a veces móvil, a veces ordenador)
Navegador objetivo: Chrome (Mac/PC). No Safari iOS.

Objetivo: PWA que a partir de un audio de batería o bajo YA SEPARADO genere MIDI listo para importar en Logic Pro.

Uso: Personal, un solo usuario. Sin backend.

2. Decisiones clave tomadas
Tema	Decisión
Separación de stems	❌ Descartada. El usuario ya parte de pistas separadas.
Transcripción de BAJO	Basic Pitch (@spotify/basic-pitch). Funciona perfecto.
Transcripción de BATERÍA	Análisis por bandas de frecuencia con FFT propia (Plan A del PASO 3.7).
Detección de BPM	pleco-xa. Editable manualmente.
Formato MIDI	SMF Tipo 1 con @tonejs/midi.
Canal batería	Canal 10 (índice 9). Pitches General MIDI.
Almacenamiento local	OPFS.
Sin backend. Todo en el navegador.	
3. Stack técnico
Frontend: Vite + JavaScript vanilla + PWA.

Editor: GitHub Codespaces.

Deploy: Vercel (auto desde GitHub).

Dependencias: onnxruntime-web, @spotify/basic-pitch, pleco-xa, @tonejs/midi, opfs-js.

Dev: vite, vite-plugin-pwa.

4. Estructura de archivos actual
text
drum-midi-pwa/
├── public/
│   ├── manifest.json
│   └── models/basic-pitch/
│       ├── model.json
│       └── group1-shard1of1.bin
├── scripts/
│   └── dump-midi.mjs              ← NUEVO: herramienta de diagnóstico (dump de un .mid a texto)
├── src/
│   ├── assets/                    ← WAV/MIDI de prueba (NO subir definitivamente al repo)
│   │   ├── Original_01.mid
│   │   ├── Generado_01.mid
│   │   └── (stems y WAVs)
│   ├── lib/
│   │   ├── opfsManager.js         (OPFS)
│   │   ├── audioUtils.js          (decodificación + remuestreo)
│   │   ├── transcriptionUtils.js  (Basic Pitch + cuantización — SOLO BAJO)
│   │   ├── fft.js                 ← NUEVO (3.7.1): FFT radix-2 propia
│   │   ├── drumTranscriber.js     ← NUEVO (3.7.2+): transcripción de batería
│   │   ├── midiWriter.js          (SMF Tipo 1 + opción preservePitches)
│   │   └── tempoUtils.js          (BPM)
│   ├── workers/                   (VACÍA, sin uso)
│   └── main.js                    (UI completa, bifurcación bajo/batería)
├── .gitignore
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
5. Estado funcional actual
✅ PWA desplegada en Vercel.

✅ Subida de audio (MP3/WAV/FLAC/M4A).

✅ Decodificación a PCM mono 44.1 kHz.

✅ Detección BPM + edición manual con botones (÷2, ×2, Redondear, ±1, ±0.1).

✅ Sugerencia "💡 Último BPM usado".

✅ BAJO: Basic Pitch → MIDI → verificado en Logic. ✅

✅ BATERÍA: drumTranscriber.js (análisis por bandas) → MIDI GM.

✅ Generación .mid SMF Tipo 1.

✅ OPFS (guardar/listar/borrar audios).

✅ Modo debug diagnoseDrums() (devuelve { notes, stats } con estadísticas detalladas).

6. Estado actual del transcriptor de BATERÍA
Elementos implementados y su calidad
Elemento	Estado	Comentario
🥁 Bombo	7/10	Muy bien en secciones fuertes, pierde golpes en secciones suaves ← PENDIENTE PRINCIPAL
🥁 Caja	9/10	Muy bien
🎩 Hi-hat cerrado	7/10	Se detectan, algunos se clasifican como abiertos por reverb
🎩 Hi-hat abierto	6/10	Sobre-detectado por cola larga (problema estructural del método)
💥 Crash	6/10	Se detectan algunos, faltan otros
🥁 Toms	0/10	NO IMPLEMENTADOS ← PENDIENTE
🚲 Ride	0/10	NO IMPLEMENTADO
🎺 Crash (banda propia)	Funciona	Con exclusión si hay snare simultáneo
Arquitectura de drumTranscriber.js
Pipeline:

Trocea el audio en frames de 2048 muestras (hop 512, ~11.6 ms).

FFT por frame (usa fft.js).

Suma energía por bandas de frecuencia (bandEnergy).

Detección de onsets por banda con supresión de cola (detectOnsetsInBand).

Clasificación:

4a. Kick: onsets en banda 40-100 Hz → pitch 36.

4b. Caja o crash desde snareWire (1500-6000 Hz): si hay cuerpo de caja (200-500 Hz) es caja (38), si no y hay banda crash activa + duración larga es crash (49), si no caja por defecto.

4c. Hi-hat (8000-14000 Hz): si energía supera umbral → cerrado (42) si duración < 0.25 s, abierto (46) si ≥ 0.25 s.

4d. Crash banda propia (2000-9000 Hz): si no hay snare simultáneo y duración ≥ 0.18 s.

Deduplicación por pitch + ventana 0.05 s.

Parámetros actuales (DEFAULT_DRUM_OPTIONS)
js
frameSize: 2048
hopSize: 512
minIntervalMs: 80
onsetThresholdMult: 1.4          // umbral de detección general
crashOnsetThresholdMult: 1.3     // umbral específico para crash
onsetWindowSec: 1.0              // ventana adaptativa
ampPercentile: 0.9
decaySuppressionRatio: 0.30      // supresión de cola
minNoteDurationSec: 0.04
hatOpenMinDurationSec: 0.25      // (3.7.8a: subió de 0.18)
simultaneousWindowSec: 0.05
bandActiveRatio: 2.3             // (3.7.8a: bajó de 2.5)
snareBodyFactorVsMean: 1.2
crashMinDurationSec: 0.18

bands: {
  kick:       [40,    100],
  snareBody:  [200,   500],
  snareWire:  [1500,  6000],
  hiHat:      [8000,  14000],     // (3.7.7b: subió de [6000,12000])
  crash:      [2000,  9000]
}

gmPitches: {
  kick:      36,  // C1
  snare:     38,  // D1
  closedHat: 42,  // F#1
  openHat:   46,  // A#1
  crash:     49   // C#2
}
Modo debug
diagnoseDrums(samples, sampleRate, options, onProgress) → { notes, stats }. stats contiene:

meta: duración, sampleRate, frames.

params: parámetros usados.

meanEnergy: media de energía por banda.

thresholds: umbrales calculados.

onsetsDetected: número de onsets por banda.

onsetsTimesFirst20: primeros 20 tiempos por banda.

classification: cuántos se descartan por cada regla.

emittedFinal: cuántas notas de cada tipo se emiten.

7. Datos de diagnóstico (últimos tests)
Test 1 — Archivo LIMPIO (batería programada de DAW)
Duración: 20.5 s. BPM: 129.2.

Emitted final: kick=52, snare=18, crash=4, closedHat=14, openHat=3, total=91.

Problemas detectados:

Hats: 14 cerrados / 3 abiertos (razonable).

Crashes: solo 4 emitidos de ~8 esperados.

Toms: 0 (no implementados).

Test 2 — STEM REAL (canción)
Duración: 15 s. BPM: 129.2.

Emitted final: kick=31, snare=25, crash=4, closedHat=13, openHat=9, total=82.

Impresión del usuario en Logic:

✅ Bombos y cajas caen a tiempo al principio.

⚠️ "Cuando baja el tempo, se pierden los golpes de bombo" ← PROBLEMA PRINCIPAL ACTUAL

✅ Hats más o menos a tiempo (asimilable).

⚠️ Algunos hats abiertos donde deberían ser cerrados (asimilable).

⚠️ Faltan algunos crashes.

Comparación limpio vs stem
Métrica	Limpio (20s)	Stem (15s)
meanEnergy.kick	2944	6887
meanEnergy.snareWire	168	553
meanEnergy.hiHat	17	118
meanEnergy.crash	203	697
onsetsDetected.kick	52	31
onsetsDetected.snareWire	18	28
onsetsDetected.hiHat	18	23
onsetsDetected.crash	20	26
Conclusión: el algoritmo aguanta el stem real sin desmadrarse.

8. Historial de commits (PASO 3.7)
text
6b76303  PASO 3.7.8a: afinar hi-hat (hatOpenMinDurationSec 0.25, bandActiveRatio 2.3)
a01a839  PASO 3.7.7b: fix hi-hat (banda 8-14kHz) y crash (excluir si snare)
3a8f3c7  PASO 3.7.7a: anadir diagnoseDrums() con stats detalladas
3f1b4f5  PASO 3.7.6: afinar deteccion de crashes
84c6219  PASO 3.7.3: anadir opcion preservePitches a midiWriter.js
b3e07db  PASO 3.7.2: anadir drumTranscriber.js (analisis por bandas, sin uso todavia)
7df6804  Merge + integración
2478892  PASO 3.7.1: anadir modulo fft.js (FFT radix-2 aislada, sin uso todavia)
078ce84  ← PUNTO DE RETORNO GRANDE (antes de todo el PASO 3.7)
Redes de seguridad
6b76303 → actual (3.7.8a).

a01a839 → antes de afinar hats.

078ce84 → antes de todo el PASO 3.7.

b3e07db → v2 del transcriptor (antes de ajustes de crash).

Comando de rescate: git reset --hard <hash> + git push --force.

9. Flujo de trabajo del usuario
Abre Codespaces desde GitHub.

Terminal abajo. npm run dev si no corre.

Importante: si Vite está corriendo, la terminal está ocupada. Abrir terminal nueva con icono +.

Edita archivos (autoguardado).

Prueba en URL puerto 5173.

Commit + push desde terminal (mejor que Source Control en móvil).

Vercel despliega automáticamente.

Diagnóstico (comandos)
Terminal (bash):

bash
# Ver el archivo
head -2 src/lib/drumTranscriber.js
tail -3 src/lib/drumTranscriber.js
ls -la src/lib/drumTranscriber.js
grep -n "^export" src/lib/drumTranscriber.js
grep -n "^cat \|^EOF" src/lib/drumTranscriber.js || echo "(ninguna: perfecto)"
DevTools Console (JavaScript, solo en URL Codespaces, NO en Vercel):

js
(async () => {
  const file = document.getElementById('fileInput').files[0];
  if (!file) { console.error('No hay archivo seleccionado'); return; }
  const { processAudioFile } = await import('/src/lib/audioUtils.js');
  const { diagnoseDrums } = await import('/src/lib/drumTranscriber.js');
  const r = await processAudioFile(file);
  const result = await diagnoseDrums(r.samples, r.sampleRate);
  console.log(JSON.stringify(result.stats, null, 2));
  window.__diag = result;
})();
Dump MIDI (terminal):

bash
node scripts/dump-midi.mjs ./ruta/archivo.mid
10. Problemas conocidos / trampas a evitar
⚠️ Pegado de bloques largos desde móvil
Problema recurrente: al pegar cat > archivo << 'EOF' ... EOF desde el móvil, la primera línea del comando se cuela como contenido del archivo, y/o la línea EOF del final se queda como contenido. Esto rompe la sintaxis JS (Uncaught ReferenceError: EOF is not defined).

Detección:

bash
head -2 archivo.js    # ¿empieza con /** o con "cat"?
grep -n "^cat \|^EOF" archivo.js || echo "(ninguna: perfecto)"
Fix de línea fantasma al principio:

bash
tail -n +2 archivo.js > /tmp/fixed.js && mv /tmp/fixed.js archivo.js
Fix de línea fantasma en medio (con número de línea):

bash
sed -i '123d' archivo.js
Otras trampas
No pulsar Enter solo en el commit (abre Vim). Usar Ctrl+Enter o el mensaje inline.

Ctrl+S no hace nada (autoguardado).

La M en la pestaña = modificado respecto al commit, no "sin guardar".

La U = Untracked (archivo nuevo, no añadido a Git).

El punto ● = cambios sin guardar en el editor.

Vercel sirve versión cacheada por Service Worker. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R).

Ramas divergentes: git config pull.rebase false + git pull + git push.

El modo debug (import dinámico /src/lib/...) solo funciona en Codespaces, NO en Vercel (Vite empaqueta en producción).

Ctrl+C en móvil no siempre funciona para parar Vite. Alternativas: cerrar pestaña de terminal (icono papelera), abrir terminal nueva con +.

11. Estilo de trabajo pactado
Paso a paso, sin prisa.

Explicar cada comando, cada clic, cada archivo.

Códigos completos, no fragmentos.

Hand-off tras cada paso completado para cambiar de chat sin perder contexto.

Siempre en español.

Nunca subir node_modules ni dist.

Auditoría read-only antes de tocar código que funciona.

Usuario es profano en terminal, a veces en móvil.

12. Próximo paso pendiente: bombo en sección suave
Problema
El usuario reportó: "cuando baja el tempo, se pierden los golpes de bombo". (Interpretación: probablemente no baja el tempo, sino que hay una sección suave/breakdown con kicks más débiles.)

Hipótesis
Umbral adaptativo (onsetThresholdMult: 1.4 sobre ventana de 1 s): en secciones suaves, los kicks destacan menos sobre la media local → el umbral los rechaza.

Supresión de cola (decaySuppressionRatio: 0.30): si un kick tiene cola larga, se saltan kicks consecutivos.

Normalización de amplitudes (ampPercentile: 0.9): si el percentil 90 se arrastra por una sección ruidosa, las amplitudes se desnormalizan (esto explica los kicks con vel 0.28 en el archivo limpio).

Plan propuesto
Diagnóstico específico antes de tocar:

Añadir al modo debug un campo con la envolvente de energía de kick muestreada en los primeros N segundos y en la zona problemática.

Ver si el problema es "picos débiles que no pasan el umbral" o "supresión de cola se los come".

Posibles ajustes:

Ampliar onsetWindowSec (ventana adaptativa más larga → umbral más estable).

Bajar onsetThresholdMult a 1.2-1.3.

Reducir decaySuppressionRatio a 0.15-0.20.

Usar ventana adaptativa asimétrica (más peso al pasado que al futuro).

Objetivo
Bombo y caja tienen que ir perfectos. Es la prioridad del usuario.

13. Prompts pendientes para siguientes pasos
Paso 3.7.8b (o 3.7.9): mejora del bombo en secciones suaves.

Paso 3.7.9/3.7.10: añadir toms (banda 80-300 Hz, pitches GM 45, 47, 50, discriminación vs kick y snare-body).

Paso 3.7.11: añadir ride (similar a crash pero banda 6-12 kHz sostenido, pitch GM 51/53).

Paso 3.7.12: cambio estructural del método de duración de hi-hats (decaimiento relativo en vez de duración absoluta).

🎯 PROMPT PARA EL SIGUIENTE CHAT
text
Hola. Continuamos con el desarrollo de "drum-midi-pwa".

CONTEXTO:
PWA que a partir de un audio de batería o bajo YA SEPARADOS genera MIDI listo
para Logic Pro. Uso personal. Chrome Mac/PC. Sin backend.

STACK:
- Vite + JS vanilla + PWA.
- Codespaces (usuario en navegador, a veces móvil).
- Vercel auto-deploy desde GitHub.
- Basic Pitch (bajo), análisis por bandas con FFT propia (batería).
- @tonejs/midi, OPFS.

REPO: https://github.com/VitukoLesPaul/drum-midi-pwa
PROD: https://drum-midi-pwa.vercel.app/
DEV: puerto 5173 de Codespaces.

ESTADO: PASOS 1, 2, 3.6, y 3.7 (parcial) completados.

- BAJO: ✅ funciona perfecto (Basic Pitch).
- BATERÍA: ⚠️ análisis por bandas en src/lib/drumTranscriber.js.
  - Bombo: 7/10 (pierde golpes en secciones suaves ← PRIORIDAD)
  - Caja: 9/10
  - Hi-hat: 7/10 (cerrado), 6/10 (abierto, sobre-detectado por reverb)
  - Crash: 6/10
  - Toms: 0/10 (NO IMPLEMENTADOS)
  - Ride: 0/10 (NO IMPLEMENTADO)

ARCHIVOS CLAVE:
- src/lib/fft.js (FFT propia, radix-2)
- src/lib/drumTranscriber.js (transcriptor batería + diagnoseDrums)
- src/lib/midiWriter.js (SMF Tipo 1, opción preservePitches)
- src/main.js (UI, bifurcación bajo/batería)
- scripts/dump-midi.mjs (herramienta de diagnóstico MIDI)

PARÁMETROS ACTUALES en DEFAULT_DRUM_OPTIONS:
onsetThresholdMult: 1.4
minIntervalMs: 80
decaySuppressionRatio: 0.30
bandActiveRatio: 2.3
hatOpenMinDurationSec: 0.25
crashMinDurationSec: 0.18
bands: kick [40,100], snareBody [200,500], snareWire [1500,6000],
       hiHat [8000,14000], crash [2000,9000]

ÚLTIMO COMMIT: 6b76303 (PASO 3.7.8a)
RED DE SEGURIDAD: 078ce84 (antes de todo el 3.7)

FLUJO:
- Codespaces, terminal nueva con + si Vite está corriendo.
- Commit con Ctrl+Enter.
- Hard refresh antes de probar.
- diagnoseDrums() desde DevTools console en URL puerto 5173 (NO en Vercel).

REGLAS:
- Siempre español.
- Códigos completos, no fragmentos.
- Explicar cada paso.
- Hand-off tras cada paso.
- Paso a paso, sin prisa.
- Auditar antes de tocar código que funciona.
- OJO con pegado desde móvil: la primera línea del cat puede colarse.
  Detectar con: grep -n "^cat \|^EOF" archivo.js
- Nunca subir node_modules ni dist.

PRÓXIMO PASO A EJECUTAR:
Mejorar la detección de bombo en secciones suaves (breakdowns).
El usuario reportó: "cuando baja el tempo, se pierden los golpes de bombo".
Hipótesis: umbral adaptativo demasiado alto para kicks débiles, o supresión
de cola saltándose kicks consecutivos.

Plan propuesto: primero diagnóstico específico (añadir al modo debug la
envolvente de energía de kick muestreada), luego ajustar parámetros.

El usuario quiere que bombo y caja vayan PERFECTOS.

Empieza confirmando el estado (git log, git status) y proponiendo cómo
hacer el diagnóstico específico del bombo.

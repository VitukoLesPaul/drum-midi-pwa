📋 HAND-OFF — Estado tras completar PASO 3.7.8

1. CONTEXTO DEL PROYECTO

Nombre: drum-midi-pwa
Repositorio GitHub: https://github.com/VitukoLesPaul/drum-midi-pwa
URL producción (Vercel): https://drum-midi-pwa.vercel.app/
URL desarrollo (Codespaces): puerto 5173 (pestaña PORTS → icono globo 🌐)

Objetivo: PWA que, a partir de un archivo de audio (MP3/WAV/FLAC) de batería
o bajo YA SEPARADOS, genera archivos MIDI listos para importar en Logic Pro.

Uso: Personal, un solo usuario. Sin autenticación ni backend.

Navegador objetivo: Chrome (Mac/PC). No se soporta Safari iOS.

Equipo de desarrollo: Codespaces (16 GB de RAM en plan gratuito).


2. DECISIONES CLAVE TOMADAS

- Separación de stems: Descartada. El usuario parte de pistas separadas.
- Pistas de entrada: Batería o bajo ya separados (WAV/MP3/FLAC).
- Transcripción BAJO: Basic Pitch (@spotify/basic-pitch). Funciona perfecto.
- Transcripción BATERÍA: Análisis por bandas de frecuencia con FFT propia.
- Detección BPM: pleco-xa (beat_track). Editable manualmente.
- Formato MIDI: SMF Tipo 1.
- Batería en MIDI: Canal 10, mapeo General MIDI.
- Generación MIDI: @tonejs/midi.
- Almacenamiento local: OPFS.
- Sin backend. Todo en el navegador.


3. STACK TÉCNICO

Frontend: Vite + JavaScript vanilla + PWA.
Editor: GitHub Codespaces.
Deploy: Vercel (auto desde GitHub).

Dependencias: onnxruntime-web, @spotify/basic-pitch, pleco-xa, @tonejs/midi, opfs-js.
Dev: vite, vite-plugin-pwa.


4. ESTRUCTURA DE ARCHIVOS

drum-midi-pwa/
├── public/
│   ├── manifest.json
│   └── models/basic-pitch/
├── scripts/
│   └── dump-midi.mjs
├── src/
│   ├── assets/ (WAV/MIDI de prueba)
│   ├── lib/
│   │   ├── opfsManager.js
│   │   ├── audioUtils.js
│   │   ├── transcriptionUtils.js (Basic Pitch, SOLO BAJO)
│   │   ├── fft.js (FFT radix-2 propia)
│   │   ├── drumTranscriber.js (transcriptor batería)
│   │   ├── midiWriter.js (SMF Tipo 1)
│   │   └── tempoUtils.js
│   ├── workers/ (VACÍA)
│   └── main.js
├── .gitignore
├── index.html
├── package.json
├── vercel.json
└── vite.config.js


5. ESTADO FUNCIONAL

- PWA desplegada en Vercel.
- Subida de audio (MP3/WAV/FLAC/M4A).
- Decodificación a PCM mono 44.1 kHz.
- Detección BPM + edición manual (÷2, ×2, Redondear, ±1, ±0.1).
- Transcripción BAJO con Basic Pitch (verificado en Logic).
- Transcripción BATERÍA con drumTranscriber.js.
- Generación .mid SMF Tipo 1.
- Descarga del .mid.
- Almacenamiento OPFS.
- Modo debug diagnoseDrums().


6. ESTADO DEL TRANSCRIPTOR DE BATERÍA

- Bombo: 9/10
- Caja: 9/10
- Hi-hat cerrado: 7/10
- Hi-hat abierto: 7/10
- Crash: 7/10
- TOMS: 0/10 (NO IMPLEMENTADOS) ← SIGUIENTE
- Ride: 0/10 (NO IMPLEMENTADO)


7. ARQUITECTURA DE drumTranscriber.js

Pipeline:
1. Frames de 2048 muestras (hop 512, ~11.6 ms).
2. FFT por frame.
3. Energía por bandas.
4. Detección de onsets por banda (umbral adaptativo + absoluto mínimo).
5. Clasificación:
   - 4a. Kick (40-100 Hz) → pitch 36.
   - 4b. Caja o crash desde snareWire (1500-6000 Hz):
        * isSnareBody (cuerpo 200-500 Hz > umbral) → caja (38)
        * !isSnareBody + crashSimultaneous → crash (49)
        * !isSnareBody + crashBandActive + durLong → crash (49)
        * si no → caja (default)
   - 4c. Hi-hat (8000-14000 Hz) → cerrado (42) o abierto (46) según duración.
   - 4d. Crash desde banda propia (2000-9000 Hz):
        * NO snare simultáneo + dur ≥ crashMinDurationSec → crash (49).
6. Deduplicación por pitch + ventana simultaneousWindowSec.


PARÁMETROS ACTUALES (DEFAULT_DRUM_OPTIONS):

frameSize: 2048
hopSize: 512
minIntervalMs: 80
onsetThresholdMult: 1.4
crashOnsetThresholdMult: 1.3
onsetWindowSec: 1.0
ampPercentile: 0.9
minEnergyRatioVsMean: 0.15
decaySuppressionRatio: 0.30
minNoteDurationSec: 0.04
hatOpenMinDurationSec: 0.25
simultaneousWindowSec: 0.05
bandActiveRatio: 2.3
snareBodyFactorVsMean: 2.0
crashMinDurationSec: 0.18

bands: kick [40,100], snareBody [200,500], snareWire [1500,6000],
       hiHat [8000,14000], crash [2000,9000]

gmPitches: kick 36, snare 38, closedHat 42, openHat 46, crash 49


MODO DEBUG:
diagnoseDrums(samples, sampleRate, options, onProgress) → { notes, stats }
stats: meta, params, meanEnergy, thresholds, onsetsDetected,
onsetsDiscardedByAbsoluteThreshold, onsetsTimesFirst20, classification,
emittedFinal, kickDetail (si debugKickDetail), snareWireDetail (si debugSnareWireDetail).


8. HISTORIAL DE COMMITS (PASO 3.7)

- PASO 3.7.1: fft.js (2478892)
- PASO 3.7.2: drumTranscriber.js (b3e07db)
- PASO 3.7.3: preservePitches en midiWriter.js (84c6219)
- PASO 3.7.4: conectar a main.js
- PASO 3.7.6: afinar crashes (3f1b4f5)
- PASO 3.7.7a: diagnoseDrums (3a8f3c7)
- PASO 3.7.7b: fix hi-hat y crash (a01a839)
- PASO 3.7.8a: afinar hi-hat (6b76303)
- PASO 3.7.8b: diagnóstico kick (9ffa728)
- PASO 3.7.8c: umbral absoluto
- PASO 3.7.8d: snareWire detail (b04b4c7)
- PASO 3.7.8e: snareBodyFactorVsMean 2.0

RED DE SEGURIDAD: 078ce84 (antes de todo el 3.7)


9. FLUJO DE TRABAJO

1. Codespaces. Terminal abajo. `npm run dev` si no corre.
2. Si Vite corre, terminal OCUPADA: abrir terminal nueva con "+".
3. Editar archivos (autoguardado).
4. Probar en URL puerto 5173.
5. Commit + push desde terminal.
6. Vercel despliega automáticamente.


10. COMANDOS ÚTILES

Crear archivo:
  cat > ruta/archivo.js << 'EOF'
  contenido...
  EOF

Ver: head -2 archivo.js / tail -3 archivo.js
Estado: git status / git log --oneline -5 / git diff archivo.js
Commit: git add . && git commit -m "msg" && git push

Push falla por divergencia:
  git config pull.rebase false && git pull && git push

Cerrar merge pendiente: git commit --no-edit

Verificar sintaxis: node --check archivo.js && echo "SINTAXIS OK"

Detectar líneas fantasma: grep -n "^cat \|^EOF" archivo.js || echo "(ninguna: perfecto)"

Volcar MIDI: node scripts/dump-midi.mjs ruta/archivo.mid

Diagnóstico (SOLO en URL Codespaces, NO en Vercel):
DevTools → Console:
  (async () => {
    const file = document.getElementById('fileInput').files[0];
    const { processAudioFile } = await import('/src/lib/audioUtils.js');
    const { diagnoseDrums } = await import('/src/lib/drumTranscriber.js');
    const r = await processAudioFile(file);
    const result = await diagnoseDrums(r.samples, r.sampleRate);
    window.__diag = result;
    console.log(JSON.stringify(result.stats, null, 2));
  })();


11. PROBLEMAS CONOCIDOS

PEGADO DESDE MÓVIL: al pegar bloques largos, la primera línea del cat
puede colarse como contenido. Detecta con:
  grep -n "^cat \|^EOF" archivo.js
Si aparece, fix:
  tail -n +2 archivo.js > /tmp/fixed.js && mv /tmp/fixed.js archivo.js

Otras:
- Enter solo en commit abre Vim.
- Ctrl+S no hace nada (autoguardado).
- "M" = modificado; "U" = untracked; "●" = sin guardar en editor.
- Vercel cachea vía SW: hard refresh.
- Modo debug (import dinámico) NO funciona en Vercel.
- Ctrl+C en móvil no siempre para Vite: cerrar pestaña o abrir nueva.
- No subir node_modules ni dist.


12. ESTILO DE TRABAJO

- Paso a paso, sin prisa.
- Explicar cada comando y archivo.
- Códigos COMPLETOS.
- Hand-off tras cada paso.
- Siempre en español.
- Auditar (read-only) antes de tocar.
- Nunca dar por supuesto nada.


13. PRÓXIMO PASO: 3.7.9 — TOMS

- Nueva banda tomBody [110, 250] Hz.
- Detección de onsets propia.
- Clasificación low/mid/high por pitch dominante.
- Pitches GM: 45 (low), 47 (mid), 50 (high).
- Reglas de exclusión vs kick y snareBody.

Pendiente confirmar con el usuario:
1. ¿Qué tipo de toms hay en el archivo limpio? (grave, los tres, fills)
2. ¿En qué se distinguen auditivamente?


14. PROMPT PARA SIGUIENTE CHAT

Hola. Continuamos con "drum-midi-pwa".

CONTEXTO:
PWA que a partir de un audio de batería o bajo YA SEPARADOS genera MIDI
listo para Logic Pro. Uso personal. Chrome Mac/PC. Sin backend.

STACK:
- Vite + JS vanilla + PWA.
- Codespaces (usuario en navegador, a veces móvil).
- Vercel auto-deploy.
- Basic Pitch (bajo), análisis por bandas con FFT propia (batería).
- @tonejs/midi, OPFS.

REPO: https://github.com/VitukoLesPaul/drum-midi-pwa
PROD: https://drum-midi-pwa.vercel.app/
DEV: puerto 5173 de Codespaces.

ESTADO: PASOS 1, 2, 3.6, y 3.7 completos hasta 3.7.8e.

- BAJO: funciona perfecto.
- BATERÍA: análisis por bandas.
  - Bombo 9/10, Caja 9/10, Hi-hat 7/10, Crash 7/10.
  - Toms 0/10 (NO IMPLEMENTADOS) ← SIGUIENTE.
  - Ride 0/10.

ARCHIVOS CLAVE:
- src/lib/fft.js, src/lib/drumTranscriber.js, src/lib/midiWriter.js.
- src/main.js (bifurcación bajo/batería).
- scripts/dump-midi.mjs.

PARÁMETROS ACTUALES:
onsetThresholdMult 1.4, minEnergyRatioVsMean 0.15,
decaySuppressionRatio 0.30, bandActiveRatio 2.3,
hatOpenMinDurationSec 0.25, snareBodyFactorVsMean 2.0,
crashMinDurationSec 0.18.
bands: kick [40,100], snareBody [200,500], snareWire [1500,6000],
       hiHat [8000,14000], crash [2000,9000].

RED DE SEGURIDAD: 078ce84.

FLUJO:
- Codespaces, terminal nueva con "+" si Vite corre.
- Hard refresh antes de probar.
- diagnoseDrums() en DevTools console (URL puerto 5173, NO Vercel).

REGLAS:
- Siempre español.
- Códigos completos.
- Hand-off tras cada paso.
- Paso a paso.
- OJO con pegado desde móvil (grep -n "^cat \|^EOF" archivo.js).
- No subir node_modules ni dist.

PRÓXIMO PASO: 3.7.9 — TOMS.

Plan: banda tomBody [110,250], detección propia, clasificación
low/mid/high, pitches GM 45/47/50, exclusiones vs kick y snareBody.

Antes de implementar, pregúntame:
1. ¿Qué tipo de toms hay en el archivo limpio? (grave, los tres, fills)
2. ¿En qué se distinguen auditivamente?

Empieza confirmando el estado (git log, git status) y proponiendo plan.

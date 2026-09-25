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

Tamaño típico de audio: Hasta 20 MB.

Equipo de desarrollo: Codespaces (16 GB de RAM en plan gratuito).


2. DECISIONES CLAVE TOMADAS

Tema                     | Decisión
-------------------------|------------------------------------------------
Separación de stems      | ❌ Descartada. El usuario parte de pistas separadas.
Pistas de entrada        | Batería o bajo ya separados (WAV/MP3/FLAC).
Transcripción de BAJO    | Basic Pitch (@spotify/basic-pitch). Funciona perfecto.
Transcripción de BATERÍA | Análisis por bandas de frecuencia con FFT propia.
Detección de BPM         | pleco-xa (beat_track). Editable manualmente.
Formato MIDI             | SMF Tipo 1 con mapa de tempo en pista 0.
Batería en MIDI          | Canal 10, mapeo General MIDI.
Generación MIDI          | @tonejs/midi (no midi-rw).
Almacenamiento local     | OPFS.
Sin backend. Todo en el navegador.


3. STACK TÉCNICO

Frontend: Vite + JavaScript vanilla + PWA.
Editor: GitHub Codespaces (usuario desde navegador, a veces móvil).
Deploy: Vercel (auto desde GitHub).

Dependencias principales:
- onnxruntime-web
- @spotify/basic-pitch (transcripción bajo)
- pleco-xa (BPM)
- @tonejs/midi (generación MIDI)
- opfs-js

Dev: vite, vite-plugin-pwa


4. ESTRUCTURA DE ARCHIVOS ACTUAL

drum-midi-pwa/
├── public/
│   ├── manifest.json
│   └── models/basic-pitch/
│       ├── model.json
│       └── group1-shard1of1.bin
├── scripts/
│   └── dump-midi.mjs              (herramienta de diagnóstico MIDI → texto)
├── src/
│   ├── assets/                    (WAV/MIDI de prueba — NO subir al repo a largo plazo)
│   │   ├── Original_01.mid
│   │   ├── Generado_01.mid
│   │   └── (stems y WAVs)
│   ├── lib/
│   │   ├── opfsManager.js         (gestión OPFS)
│   │   ├── audioUtils.js          (decodificación + remuestreo)
│   │   ├── transcriptionUtils.js  (Basic Pitch + cuantización — SOLO BAJO)
│   │   ├── fft.js                 (FFT radix-2 propia)
│   │   ├── drumTranscriber.js     (transcriptor de batería — Plan A)
│   │   ├── midiWriter.js          (SMF Tipo 1 + preservePitches)
│   │   └── tempoUtils.js          (BPM)
│   ├── workers/                   (VACÍA, sin uso)
│   └── main.js                    (UI completa, bifurcación bajo/batería)
├── .gitignore
├── index.html
├── package.json
├── vercel.json
└── vite.config.js


5. ESTADO FUNCIONAL ACTUAL

✅ PWA desplegada en Vercel.
✅ Subida de audio (MP3/WAV/FLAC/M4A).
✅ Decodificación a PCM mono 44.1 kHz.
✅ Detección automática de BPM con pleco-xa.
✅ BPM editable manualmente con botones (÷2, ×2, Redondear, ±1, ±0.1).
✅ Sugerencia "💡 Último BPM usado".
✅ Transcripción BAJO con Basic Pitch → SMF Tipo 1 → verificado en Logic. ✅
✅ Transcripción BATERÍA con drumTranscriber.js (análisis por bandas).
✅ Generación de .mid (SMF Tipo 1).
✅ Descarga del .mid.
✅ Almacenamiento local OPFS (guardar/listar/borrar audios).
✅ Modo debug diagnoseDrums() → { notes, stats } con estadísticas detalladas.


6. ESTADO ACTUAL DEL TRANSCRIPTOR DE BATERÍA

Elementos implementados y su calidad:

🥁 Bombo                | 9/10 | Muy bien. Sin falsos positivos en silencio.
🥁 Caja                 | 9/10 | Muy bien. Sin falsos positivos.
🎩 Hi-hat cerrado       | 7/10 | Se detectan bien. Algunos abiertos de más por reverb.
🎩 Hi-hat abierto       | 7/10 | Mejorado tras 3.7.8a.
💥 Crash                | 7/10 | Se detectan los que hay. Falta alguno.
🥁 TOMS                 | 0/10 | NO IMPLEMENTADOS ← SIGUIENTE PASO
🚲 Ride                 | 0/10 | NO IMPLEMENTADO


7. ARQUITECTURA DE drumTranscriber.js

PIPELINE:
1. Trocea el audio en frames de 2048 muestras (hop 512, ~11.6 ms a 44.1 kHz).
2. FFT por frame (usa fft.js).
3. Suma energía por bandas (bandEnergy).
4. Detección de onsets por banda con supresión de cola:
   - detectOnsetsInBand aplica umbral adaptativo + umbral absoluto mínimo.
5. Clasificación:
   - 4a. Kick: onsets banda 40-100 Hz → pitch 36.
   - 4b. Caja o crash desde snareWire (1500-6000 Hz):
        * Si isSnareBody (cuerpo 200-500 Hz > umbral) → caja (38).
        * Si !isSnareBody y crashSimultaneous → crash (49).
        * Si !isSnareBody y crashBandActive y durLong → crash (49).
        * Si no → caja (default).
   - 4c. Hi-hat (8000-14000 Hz):
        * Si supera umbral actividad → cerrado (42) o abierto (46) por duración.
   - 4d. Crash desde banda propia (2000-9000 Hz):
        * Si NO hay snare simultáneo y duración ≥ crashMinDurationSec → crash.
6. Deduplicación por pitch + ventana simultaneousWindowSec.


PARÁMETROS ACTUALES (DEFAULT_DRUM_OPTIONS):

frameSize: 2048
hopSize: 512
minIntervalMs: 80
onsetThresholdMult: 1.4              (revertido en 3.7.8d desde 1.3)
crashOnsetThresholdMult: 1.3
onsetWindowSec: 1.0
ampPercentile: 0.9
minEnergyRatioVsMean: 0.15           (nuevo en 3.7.8c: umbral absoluto mínimo)
decaySuppressionRatio: 0.30
minNoteDurationSec: 0.04
hatOpenMinDurationSec: 0.25
simultaneousWindowSec: 0.05
bandActiveRatio: 2.3
snareBodyFactorVsMean: 2.0           (subido en 3.7.8e desde 1.2 — fix caja falsa)
crashMinDurationSec: 0.18

bands: {
  kick:       [40,    100],
  snareBody:  [200,   500],
  snareWire:  [1500,  6000],
  hiHat:      [8000,  14000],
  crash:      [2000,  9000]
}

gmPitches: {
  kick:      36,  // C1
  snare:     38,  // D1
  closedHat: 42,  // F#1
  openHat:   46,  // A#1
  crash:     49   // C#2
}


MODO DEBUG:
- diagnoseDrums(samples, sampleRate, options, onProgress) → { notes, stats }
- stats contiene:
  * meta (duración, sampleRate, frames)
  * params (parámetros usados)
  * meanEnergy (media por banda)
  * thresholds (umbrales calculados)
  * onsetsDetected (número por banda)
  * onsetsDiscardedByAbsoluteThreshold (descartes por umbral mínimo)
  * onsetsTimesFirst20 (primeros 20 tiempos por banda)
  * classification (descartes por regla)
  * emittedFinal (cuántas notas de cada tipo salen)
  * kickDetail (si debugKickDetail: true):
    - envelope: envolvente de energía + umbral por frame
    - onsetsDetected: onsets con e, thr, ratio
  * snareWireDetail (si debugSnareWireDetail: true):
    - por onset: t, e, thr, body, isSnareBody, crashE, crashBandActive,
      durMs, crashSimultaneous, crashBefore, decision, reason


8. HISTORIAL DE COMMITS (PASO 3.7)

[b04b4c7] PASO 3.7.8d: revertir onsetThreshold a 1.4 + diag snareWire
[6b76303] PASO 3.7.8a: afinar hi-hat (hatOpenMinDurationSec 0.25, bandActiveRatio 2.3)
[bf9f311] Merge branch 'main' (hand-offs)
[9ffa728] PASO 3.7.8b: diagnostico especifico de kick
[975b090] chore: anadir scripts/dump-midi.mjs
[6b76303] PASO 3.7.8a
...
[84c6219] PASO 3.7.3: opcion preservePitches
[b3e07db] PASO 3.7.2: drumTranscriber.js
[2478892] PASO 3.7.1: fft.js
[078ce84] ← PUNTO DE RETORNO GRANDE (antes de todo el 3.7)

NOTA: Los commits del 3.7.8c y 3.7.8e se hicieron como PASO 3.7.8c y
PASO 3.7.8e (mensajes "PASO 3.7.8c: umbral absoluto..." y
"PASO 3.7.8e: subir snareBodyFactorVsMean a 2.0...").

REDES DE SEGURIDAD:
- 078ce84 → antes de todo el PASO 3.7
- b3e07db → v2 del transcriptor (antes de ajustes de crash)
- 84c6219 → antes de afinar
- Comando: git reset --hard <hash> + git push --force


9. DATOS DE DIAGNÓSTICO (últimos tests)

ARCHIVO LIMPIO (batería programada DAW, 20 s, BPM 129.2):
- meanEnergy.kick: 2944
- emittedFinal: kick=52, snare=18, crash=4, closedHat=14, openHat=3, total=91
- Problemas: faltaban hats al principio (resuelto en 3.7.7b)
- Falsos positivos en silencio (resuelto en 3.7.8c)

STEM REAL (canción, 15 s, BPM 129.2):
- meanEnergy.kick: 6887
- Antes 3.7.8e:
  * emittedFinal: kick=29, snare=25, crash=3, closedHat=13, openHat=9, total=79
  * Problema: caja falsa en t=13.212 (era cola de crash)
- Después 3.7.8e:
  * emittedFinal: kick=29, snare=24, crash=5, closedHat=13, openHat=9, total=80
  * Segundo 13: ahora suena como BOMBO + CRASH (correcto) ✅


10. FLUJO DE TRABAJO DEL USUARIO

1. Abre Codespaces desde GitHub (Code → Codespaces).
2. Terminal abajo. `npm run dev` si no corre.
3. IMPORTANTE: si Vite está corriendo, la terminal está OCUPADA. Abrir
   terminal nueva con el icono "+" (junto a las pestañas).
4. Edita archivos (autoguardado activado).
5. Prueba en URL puerto 5173.
6. Commit + push desde terminal (mejor que Source Control en móvil).
7. Vercel despliega automáticamente.

TERMINOLOGÍA INTERFAZ EN ESPAÑOL:
- "Confirmar" / "Hacer commit" = Commit.
- "Insertar" / "Sincronizar cambios" = Push.


11. COMANDOS ÚTILES

Crear archivo desde terminal:
    cat > ruta/archivo.js << 'EOF'
    contenido...
    EOF

Ver contenido:
    cat archivo.js
    head -2 archivo.js
    tail -3 archivo.js

Estado de Git:
    git status
    git log --oneline -5
    git diff archivo.js

Commit + Push:
    git add .
    git commit -m "mensaje"
    git push

Si push falla por ramas divergentes:
    git config pull.rebase false
    git pull
    git push

Cerrar merge pendiente:
    git commit --no-edit

Verificar sintaxis:
    node --check archivo.js && echo "SINTAXIS OK"

Detectar líneas fantasma (por pegado desde móvil):
    grep -n "^cat \|^EOF" archivo.js || echo "(ninguna: perfecto)"

Eliminar primera línea fantasma:
    tail -n +2 archivo.js > /tmp/fixed.js && mv /tmp/fixed.js archivo.js

Eliminar línea fantasma en medio (número de línea):
    sed -i '123d' archivo.js

Volcar MIDI a texto:
    node scripts/dump-midi.mjs ruta/archivo.mid

DIAGNÓSTICO (solo en URL Codespaces, NO en Vercel):
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


12. PROBLEMAS CONOCIDOS / TRAMPAS A EVITAR

⚠️ PEGADO DE BLOQUES LARGOS DESDE MÓVIL:
Al pegar `cat > archivo << 'EOF' ... EOF` desde el móvil, a veces la
primera línea del comando se cuela como CONTENIDO del archivo, y/o la
línea EOF del final queda como contenido. Esto ROMPE la sintaxis JS:
"Uncaught ReferenceError: EOF is not defined".
DETECCIÓN: grep -n "^cat \|^EOF" archivo.js
FIX: ver sección 11.

⚠️ OTRAS TRAMPAS:
- No pulsar Enter solo en el commit (abre Vim). Usar Ctrl+Enter o terminal.
- Ctrl+S no hace nada (autoguardado).
- La "M" en la pestaña = modificado respecto al commit, no "sin guardar".
- La "U" = Untracked (archivo nuevo, no añadido a Git).
- El punto ● = cambios sin guardar en el editor.
- Vercel sirve versión cacheada por Service Worker. Hard refresh.
- El modo debug (import dinámico /src/lib/...) SOLO funciona en Codespaces,
  NO en Vercel (Vite empaqueta en producción).
- Ctrl+C en móvil no siempre para Vite. Alternativas: cerrar pestaña de
  terminal (papelera 🗑️), o abrir terminal nueva con "+".
- No subir node_modules ni dist.
- Los WAV/MIDI en src/assets/ son de prueba. No dejarlos permanentemente.


13. ESTILO DE TRABAJO PACTADO

- Paso a paso, sin prisa.
- Explicar cada comando, cada clic, cada archivo.
- Códigos COMPLETOS, no fragmentos.
- Hand-off tras cada paso completado.
- Siempre en español.
- Auditar (read-only) antes de tocar código que funciona.
- Nunca dar por supuesto nada.
- El usuario puede estar en móvil o en ordenador; en móvil el pegado de
  bloques largos requiere cuidado (por el problema de EOF).


14. PRÓXIMO PASO: PASO 3.7.9 — AÑADIR TOMS

OBJETIVO: Detectar toms (low, mid, high) en el audio de batería.

ELEMENTOS A IMPLEMENTAR:
- Nueva banda tomBody (aprox. 80-300 Hz, evitando solape con kick 40-100 Hz
  y con snareBody 200-500 Hz). Zona aprox: 110-250 Hz.
- Detección de onsets propia en esa banda.
- Clasificación de tom agudo / medio / grave según el pitch dominante:
  * Low tom  → pitch GM 45 (A1)
  * Mid tom  → pitch GM 47 (B1)
  * High tom → pitch GM 50 (D2)
- Reglas de exclusión:
  * Si hay kick simultáneo → preferir kick (los toms no suelen ir a la vez
    que el bombo, pero si coincide, priorizar kick).
  * Si hay snareBody activo → preferir caja.
- Probablemente 2-3 iteraciones con diagnóstico.

INFORMACIÓN PENDIENTE DE CONFIRMAR POR EL USUARIO:
- ¿Qué tipo de toms hay en el archivo limpio? (grave solo, los tres, fills)
- ¿En qué se distinguen auditivamente? (afinación, duración, tono)

DESPUÉS DE TOMS:
- Paso 3.7.10: añadir ride (similar a crash, banda 6-12 kHz sostenido,
  pitches GM 51/53).


15. PROMPT PARA EL SIGUIENTE CHAT

Hola. Continuamos con el desarrollo de "drum-midi-pwa".

CONTEXTO:
PWA que a partir de un audio de batería o bajo YA SEPARADOS genera MIDI
listo para Logic Pro. Uso personal. Chrome Mac/PC. Sin backend.

STACK:
- Vite + JS vanilla + PWA.
- Codespaces (usuario en navegador, a veces móvil).
- Vercel auto-deploy desde GitHub.
- Basic Pitch (bajo), análisis por bandas con FFT propia (batería).
- @tonejs/midi, OPFS.

REPO: https://github.com/VitukoLesPaul/drum-midi-pwa
PROD: https://drum-midi-pwa.vercel.app/
DEV: puerto 5173 de Codespaces.

ESTADO: PASOS 1, 2, 3.6, y 3.7 COMPLETO (hasta 3.7.8e) COMPLETADOS.

- BAJO: ✅ funciona perfecto (Basic Pitch).
- BATERÍA: análisis por bandas en src/lib/drumTranscriber.js.
  - Bombo: 9/10
  - Caja: 9/10
  - Hi-hat cerrado: 7/10
  - Hi-hat abierto: 7/10
  - Crash: 7/10
  - Toms: 0/10 (NO IMPLEMENTADOS) ← SIGUIENTE
  - Ride: 0/10 (NO IMPLEMENTADO)

ARCHIVOS CLAVE:
- src/lib/fft.js (FFT propia radix-2)
- src/lib/drumTranscriber.js (transcriptor batería + diagnoseDrums)
- src/lib/midiWriter.js (SMF Tipo 1, opción preservePitches)
- src/main.js (UI, bifurcación bajo/batería)
- scripts/dump-midi.mjs (herramienta de diagnóstico MIDI)

PARÁMETROS ACTUALES en DEFAULT_DRUM_OPTIONS:
onsetThresholdMult: 1.4
minEnergyRatioVsMean: 0.15
decaySuppressionRatio: 0.30
bandActiveRatio: 2.3
hatOpenMinDurationSec: 0.25
snareBodyFactorVsMean: 2.0
crashMinDurationSec: 0.18
bands: kick [40,100], snareBody [200,500], snareWire [1500,6000],
       hiHat [8000,14000], crash [2000,9000]

ÚLTIMO COMMIT: b04b4c7 (PASO 3.7.8d) + commit 3.7.8c y 3.7.8e
RED DE SEGURIDAD GRANDE: 078ce84 (antes de todo el 3.7)

FLUJO:
- Codespaces, terminal nueva con + si Vite está corriendo.
- Commit con Ctrl+Enter o desde terminal.
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
Paso 3.7.9 - Añadir detección de TOMS.

Plan:
- Nueva banda tomBody [110, 250] Hz (evitar solape con kick y snareBody).
- Detección de onsets propia.
- Clasificación de tom agudo/medio/grave por pitch dominante.
- Pitches GM: 45 (low), 47 (mid), 50 (high).
- Reglas de exclusión vs kick y vs snareBody.

Antes de implementar, pregúntame:
1. ¿Qué tipo de toms hay en el archivo limpio? (grave solo, los tres, fills)
2. ¿En qué se distinguen auditivamente? (afinación, duración, tono)

Empieza confirmando el estado (git log, git status) y proponiendo el plan
del 3.7.9.

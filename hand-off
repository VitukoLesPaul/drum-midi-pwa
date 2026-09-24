📋 HAND-OFF — Estado tras completar PASO 3.6
1. Contexto del proyecto
Nombre: drum-midi-pwa
Repositorio GitHub: https://github.com/VitukoLesPaul/drum-midi-pwa
URL de producción (Vercel): (la que tenga el usuario; el dominio Vercel del proyecto)
URL de desarrollo (Codespaces): https://redesigned-giggle-6v545qwj9wxpfrj6-5173.app.github.dev/

Objetivo: PWA que, a partir de un archivo de audio (MP3/WAV/FLAC/etc.) de batería o bajo ya separados, genere archivos MIDI listos para importar en Logic Pro.

Uso: Personal, un solo usuario. No requiere autenticación ni backend.

Navegador objetivo: Chrome (Mac y PC). No se soporta Safari iOS.

Tamaño típico de audio: Hasta 20 MB.

Equipo de desarrollo: Codespaces (16 GB de RAM en el plan gratuito).

2. Decisiones clave tomadas
Tema	Decisión
Separación de stems	❌ Descartada. El usuario ya parte de pistas separadas con otro software.
Pistas de entrada	Batería o bajo ya separados (WAV/MP3/FLAC).
Transcripción	Basic Pitch (de Spotify), modelo ya incluido en node_modules y copiado a public/models/basic-pitch/.
Detección de BPM	pleco-xa (beat_track). Funciona muy bien en batería, mal en bajo.
Formato MIDI	SMF Tipo 1 con mapa de tempo en pista 0.
Batería en MIDI	Canal 10, mapeo General MIDI (bombo C1, caja D1, etc.).
Generación MIDI	Librería @tonejs/midi (no midi-rw).
Almacenamiento local	OPFS (Origin Private File System).
Sin backend	Todo se procesa en el navegador.
3. Stack técnico
Frontend: Vite + JavaScript vanilla + PWA.

Editor: GitHub Codespaces.

Despliegue: Vercel con auto-deploy desde GitHub.

Dependencias principales:

onnxruntime-web

@spotify/basic-pitch (transcripción)

pleco-xa (BPM)

@tonejs/midi (generación MIDI)

opfs-js

Dev: vite, vite-plugin-pwa

4. Estructura de archivos actual
text
drum-midi-pwa/
├── public/
│   ├── manifest.json
│   └── models/
│       └── basic-pitch/
│           ├── model.json
│           └── group1-shard1of1.bin
├── src/
│   ├── lib/
│   │   ├── opfsManager.js         (gestión OPFS)
│   │   ├── audioUtils.js          (decodificación + remuestreo)
│   │   ├── transcriptionUtils.js  (Basic Pitch + cuantización)
│   │   ├── midiWriter.js          (generación SMF Tipo 1)
│   │   └── tempoUtils.js          (detección BPM + saveLastBpm)
│   ├── workers/                   (VACÍA, sin uso por ahora)
│   └── main.js                    (UI completa)
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── vercel.json
└── vite.config.js
5. Estado funcional actual (✅ = funciona)
✅ PWA desplegada en Vercel.

✅ Subida de audio (MP3/WAV/FLAC/M4A).

✅ Decodificación a PCM mono a 44.1 kHz.

✅ Detección automática de BPM con pleco-xa.

✅ BPM editable manualmente con botones:

÷ 2

× 2

Redondear

− 1, − 0.1, + 0.1, + 1

✅ Sugerencia "💡 Último BPM usado" (se guarda en localStorage).

✅ Transcripción con Basic Pitch → notas MIDI.

✅ Cuantización al grid de semicorcheas según BPM.

✅ Generación de archivo .mid (SMF Tipo 1).

✅ Descarga del .mid para importar en Logic.

✅ Almacenamiento local OPFS (guardar/listar/borrar audios).

✅ Verificado en Logic: el MIDI del bajo se importa y suena correctamente.

6. Estado actual del MIDI por instrumento
🎸 Bajo: ✅ FUNCIONA BIEN
Basic Pitch transcribe bien el bajo.

Notas correctas, duraciones y velocidades aceptables.

El usuario ha verificado que suena en Logic.

🥁 Batería: ⚠️ FUNCIONA PERO MAL
Basic Pitch no está entrenado para percusión.

El mapeo actual es una heurística provisional en midiWriter.js:

Pitch < 45 → Bombo (C1 = MIDI 36)

Pitch 45-60 → Caja (D1 = MIDI 38)

Pitch > 60 → Hi-hat cerrado (F#1 = MIDI 42)

Resultado: muchas notas perdidas, notas fantasma, mapeo incorrecto.

Pendiente: mejorar esto en el PASO 3.7.

7. Problema conocido: detección de BPM
Batería: detección fiable (126.5 BPM en prueba real).

Bajo: detección poco fiable (246.09 BPM en la misma canción).

Solución actual: el usuario introduce manualmente el BPM detectado con la batería (con aviso "💡 Último BPM usado").

Aviso: si la música tiene tempo variable (grabación con instrumentos reales sin clic), ningún BPM fijo cuadrará perfectamente de principio a fin.

8. Flujo de trabajo del usuario
Abre Codespaces desde GitHub (Code → Codespaces).

Espera a que arranque. Terminal en la parte inferior.

npm run dev si el servidor no está corriendo.

Abre el puerto 5173 desde la pestaña "PORTS".

Edita archivos (autoguardado activado en Codespaces).

Prueba en el navegador en la URL de Codespaces.

Cuando funcione: commit y push.

Vercel despliega automáticamente.

Terminología interfaz en español:

"Confirmar" / "Hacer commit" = Commit.

"Insertar" / "Sincronizar cambios" = Push.

Si pregunta "¿agregar al stage todos los cambios?" → Sí.

9. Comandos útiles aprendidos
Crear archivo desde terminal (evita errores de carpetas anidadas):

text
cat > ruta/al/archivo.js << 'EOF'
contenido...
EOF
Ver contenido de archivo:

text
cat archivo.js
Ver estado de Git:

text
git status
Commit + Push desde terminal (recomendado):

text
git add .
git commit -m "mensaje"
git push
Si el push falla por ramas divergentes:

text
git config pull.rebase false
git pull
# Si pide editor, salir con :wq o configurar nano
git push
Editor por defecto (cambiar de Vim a nano):

text
git config --global core.editor "nano"
10. Problemas conocidos / Trampas a evitar
Nunca subir node_modules/ ni dist/ a GitHub. Están en .gitignore.

No pulsar Enter solo en el mensaje de commit (abre Vim). Usar Ctrl+Enter o botón.

Ctrl+S no hace nada (autoguardado activado). Es normal.

La M en la pestaña = modificado respecto al último commit. No = "sin guardar". Para saber si está sin guardar: punto ● o asterisco *.

Crear archivos con la interfaz gráfica puede anidar carpetas mal. Si pasa, revisar con ls -la ruta/ y mover con mv.

Vercel sirve la versión cacheada por el Service Worker. A veces hay que refrescar dos veces o hacer hard refresh (Ctrl+Shift+R).

11. Próximo paso: PASO 3.7 – Mejorar el mapeo de batería
Objetivo: Sustituir la heurística actual de Basic Pitch por un sistema de transcripción específico para batería.

Plan A (a probar primero): Análisis por bandas de frecuencia.

Filtro paso-banda por rangos característicos de cada tambor.

Detección de onsets en cada banda.

Bombo: 50-100 Hz.

Caja: 150-250 Hz + 2-5 kHz.

Hi-hat cerrado: 6-10 kHz, corta duración.

Hi-hat abierto: 6-10 kHz, larga duración.

Crash: 4-8 kHz, muy larga.

Toms: rangos variables.

Plan B (si el A no convence): Convertir el modelo ADTOF (PyTorch) a ONNX.

Pendiente de confirmar en el siguiente chat:

Tipo de batería que usará el usuario (acústica, electrónica, programada).

12. Estilo de trabajo pactado
Paso a paso, sin prisas. El usuario es profano en terminal y edición de código.

Nunca dar por supuesto nada. Explicar cada comando, cada clic, cada archivo.

Códigos completos. Al modificar un archivo, dar el contenido completo, no fragmentos.

Hand-off después de cada paso completado para poder cambiar de chat sin perder contexto.

Siempre en español.

🎯 PROMPT PARA EL SIGUIENTE CHAT
Copia y pega este bloque completo en el siguiente chat:

text
Hola. Continuamos con el desarrollo de una PWA llamada "drum-midi-pwa".

CONTEXTO:
PWA que, a partir de un archivo de audio (WAV/MP3/FLAC) de batería o bajo YA SEPARADOS, genera archivos MIDI listos para importar en Logic Pro. Uso personal, un solo usuario. Navegador objetivo: Chrome (Mac/PC). No se soporta Safari iOS.

STACK:
- Vite + JavaScript vanilla + PWA.
- Editor: GitHub Codespaces (el usuario no usa terminal local, solo navegador).
- Despliegue: Vercel con auto-deploy desde GitHub.
- Transcripción: Basic Pitch (@spotify/basic-pitch).
- Detección BPM: pleco-xa.
- Generación MIDI: @tonejs/midi.
- Almacenamiento local: OPFS.
- Sin backend, sin Supabase, sin APIs externas.

REPOSITORIO: https://github.com/VitukoLesPaul/drum-midi-pwa

ESTADO ACTUAL: PASOS 1, 2 y 3.6 COMPLETADOS Y FUNCIONANDO.
- Interfaz completa con subida de audio, selector de instrumento (Bajo/Batería), BPM editable con botones (÷2, ×2, Redondear, ±1, ±0.1), transcripción a MIDI y descarga.
- Detección de BPM con pleco-xa + guardado del último BPM en localStorage.
- Transcripción con Basic Pitch → SMF Tipo 1 → descarga.
- BAJO: transcripción correcta, verificada en Logic.
- BATERÍA: usa el mismo Basic Pitch pero da resultados malos porque no está entrenado para percusión.

ESTRUCTURA:
├── public/models/basic-pitch/ (model.json, group1-shard1of1.bin)
├── src/lib/opfsManager.js
├── src/lib/audioUtils.js
├── src/lib/transcriptionUtils.js (Basic Pitch + cuantización)
├── src/lib/midiWriter.js (SMF Tipo 1 + mapeo GM heurístico para batería)
├── src/lib/tempoUtils.js (detectBpm, roundBpm, loadLastBpm, saveLastBpm)
├── src/main.js (UI completa)
├── src/workers/ (VACÍA)
├── vercel.json (headers COOP/COEP)
├── vite.config.js
└── index.html

FLUJO DE TRABAJO DEL USUARIO:
- Edita en Codespaces, prueba en la URL del puerto 5173, hace commit+push desde Source Control (Ctrl+Enter para commit, luego "Sync Changes" para push), Vercel despliega automáticamente.
- El usuario es profano: hay que explicar cada clic, cada comando, cada archivo.
- Los cambios de archivos, darlos COMPLETOS, nunca fragmentos.
- Estilo paso a paso, sin prisa.
- SIEMPRE EN ESPAÑOL.

REGLAS:
- Nunca subir node_modules ni dist a GitHub.
- No pulsar Enter solo en el mensaje de commit (abre Vim). Usar Ctrl+Enter.
- Ctrl+S no hace nada (autoguardado).
- La M en la pestaña = modificado respecto al último commit, no "sin guardar".
- Configurar git con nano: git config --global core.editor "nano".
- Si hay ramas divergentes: git config pull.rebase false, git pull, git push.

PRÓXIMO PASO A EJECUTAR: PASO 3.7 - Mejorar el mapeo de batería.
- El usuario quiere transcribir batería con calidad.
- Plan A (recomendado): análisis por bandas de frecuencia (bombo 50-100Hz, caja 150-250Hz + 2-5kHz, hi-hat cerrado/abierto 6-10kHz, crash 4-8kHz, toms rangos variables) con detección de onsets.
- Plan B (si A falla): convertir ADTOF de PyTorch a ONNX.
- El mapeo actual en midiWriter.js es heurístico y da malos resultados.

Por favor, empieza proponiendo cómo abordar el PASO 3.7. Antes de implementar, pregúntame:
1. Qué tipo de batería usaré (acústica, electrónica, programada).
2. Si quiero empezar por el Plan A (bandas de frecuencia) o ir directo al Plan B (ADTOF ONNX).

Vamos paso a paso.

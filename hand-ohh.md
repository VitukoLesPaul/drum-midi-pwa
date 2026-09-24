📋 HAND-OFF — Estado tras completar PASO 2
1. Contexto del proyecto
Nombre: drum-midi-pwa
Repositorio GitHub: https://github.com/VitukoLesPaul/drum-midi-pwa
Objetivo: PWA que, a partir de un archivo de audio (MP3/WAV/FLAC/etc.), separe instrumentos usando IA en el navegador y genere archivos MIDI listos para importar en Logic Pro, con foco en batería y bajo.

Uso: Personal (un solo usuario). No requiere autenticación, ni multiusuario, ni backend con GPU. Todo se procesa en el navegador del cliente.

Navegadores objetivo: Chrome (Mac/PC). No se soporta Safari iOS.

Tamaño típico de audio: Hasta 20 MB.

Equipo de desarrollo del usuario: 16 GB RAM.

2. Stack técnico decidido
Frontend: Vite + JavaScript vanilla (sin frameworks por ahora) + PWA.

Editor: GitHub Codespaces (VS Code en el navegador). El usuario no usa terminal local, todo desde el navegador.

Despliegue: Vercel (conectado a GitHub, despliegue automático en cada push).

Almacenamiento local: OPFS (Origin Private File System) + Web Audio API.

Modelos IA: ONNX Runtime Web (onnxruntime-web). Todo corre en Web Workers para no bloquear la UI.

Generación de MIDI: Librería midi-rw.

Sin backend: No se usa Supabase ni APIs externas. Todo cliente.

3. Decisiones clave tomadas
Tema	Decisión
Separación de stems	Modelo especializado en batería y bajo (~80 MB). Opción B.
Precisión transcripción batería	Empezar con modelo de 8 clases (kit completo) e implementar versión lite (3 clases) como fallback.
Transcipción de bajo	Usar Basic Pitch ONNX (~230 KB).
Transcripción de teclado/piano	❌ Descartado. Se cambia por bajo.
Tempo	Detectar BPM y generar mapa de tempo en pista 0 del SMF.
Formato MIDI	SMF Tipo 1 con pistas separadas. Batería en Canal 10 con mapeo GM.
Edición pre-export	Piano roll simplificado para corregir notas (pendiente, se implementará más adelante).
Feedback al usuario	Barra de progreso detallada por etapas.
4. Estructura de archivos actual
text
drum-midi-pwa/
├── node_modules/           (autogenerado, NO subir a GitHub)
├── public/
│   └── manifest.json       (manifiesto PWA)
├── src/
│   ├── lib/
│   │   ├── opfsManager.js  (✅ gestión de OPFS)
│   │   └── audioUtils.js   (✅ decodificación audio y remuestreo)
│   ├── workers/            (vacía, se llenará en Paso 3)
│   └── main.js             (✅ UI con upload + OPFS)
├── .gitignore              (✅ excluye node_modules, dist, .vercel, etc.)
├── index.html              (raíz)
├── package.json
├── package-lock.json
├── vercel.json             (✅ solo headers COOP/COEP)
├── vite.config.js
└── README.md
5. Estado funcional actual (✅ = funciona)
✅ PWA instalable, desplegada en Vercel.

✅ Interfaz con dos secciones: subida de audio y almacenamiento OPFS.

✅ Carga de MP3/WAV/FLAC/OGG/M4A.

✅ Decodificación a PCM mono a 44.1 kHz.

✅ Visualización de info del archivo (nombre, tamaño, duración, canales, sample rate, muestras).

✅ Guardar/Listar/Borrar archivos en OPFS.

✅ Estimación de espacio disponible.

✅ Flujo de trabajo: Codespaces → commit → push → Vercel (dominado).

6. Flujo de trabajo del usuario
Abre Codespaces desde GitHub (Code → Codespaces).

Espera a que arranque (~30s). La terminal muestra el prompt $.

Si el servidor no corre: npm run dev. Si ya corre, pulsar Ctrl+C antes de relanzar.

Abre el puerto 5173 desde la pestaña "PORTS" o con el popup de Codespaces.

Edita archivos en VS Code web (autoguardado activado).

Prueba en el navegador en la URL de Codespaces.

Cuando funcione: Source Control → mensaje → Ctrl+Enter (Commit) → Sync Changes (Push).

Vercel despliega automáticamente. En 30-60 s, la URL pública refleja los cambios.

Terminología en la interfaz en español:

Confirmar / Hacer commit = Commit.

Insertar / Sincronizar cambios = Push.

Si al hacer commit pregunta "¿agregar al stage todos los cambios?" → Sí.

7. Problemas conocidos / Trampas a evitar
Nunca subir node_modules/ ni dist/ a GitHub. Están en .gitignore. Si aparecen en el panel de Source Control, hay que quitarlos (icono − en cada archivo).

No pulsar solo Enter en el mensaje de commit. Eso abre un editor de texto (Vim) que confunde. Usar Ctrl+Enter o el botón Commit.

Ctrl+S no hace nada (autoguardado activado). Es normal.

La M en la pestaña del archivo significa "modificado respecto al último commit". No significa "sin guardar". Para saber si está sin guardar: buscar punto ● o asterisco * junto al nombre.

localhost:5173 NO funciona desde el navegador local. Hay que usar la URL pública de Codespaces (https://<nombre>-5173.app.github.dev).

Vercel siempre despliega lo que hay en GitHub, no lo que hay en Codespaces. Si un cambio no se ve en Vercel, es porque falta commit+push.

8. Estilo de trabajo pactado con el usuario
Paso a paso, sin prisas. El usuario es profano en terminal y edición de código.

Nunca dar por supuesto nada. Explicar cada comando, cada clic, cada archivo.

Códigos completos. Al modificar un archivo, dar siempre el contenido completo del archivo, no fragmentos. Evita errores.

Después de cada paso completado, generar un hand-off como este, para poder cambiar de chat sin perder contexto.

9. Próximo paso a ejecutar — PASO 3: Separación de stems con Demucs
Modelo elegido: Modelo especializado en batería y bajo, ~80 MB. ONNX. Se descargará y se meterá en public/models/.

Sub-pasos:

3.1 – Descargar el modelo ONNX y meterlo en public/models/.

3.2 – Crear src/workers/separation.worker.js (carga el modelo y ejecuta inferencia).

3.3 – Integrar onnxruntime-web (ya está en package.json).

3.4 – Conectar la UI con el worker: botón "Separar instrumentos" + barra de progreso.

Pendiente de decidir en el siguiente chat: qué modelo concreto descargar (candidatos a evaluar: demucs-onnx, htdemucs-ft-drums, Spleeter 2-stems, MDX-Net drums). El ingeniero deberá investigar la mejor fuente de un modelo ONNX que pese ~80 MB y se centre en separar batería.

🎯 PROMPT PARA EL SIGUIENTE CHAT
Copia y pega este bloque completo en el siguiente chat para que el nuevo asistente tenga todo el contexto:

text
Hola. Continuamos con el desarrollo de una PWA llamada "drum-midi-pwa".

CONTEXTO:
PWA que, a partir de un archivo MP3/WAV, separa instrumentos usando IA en el navegador (sin backend) y genera MIDI listo para importar en Logic Pro. El foco es BATERÍA y BAJO. Uso personal, un solo usuario. Navegador objetivo: Chrome (Mac/PC). No se soporta Safari iOS.

STACK:
- Vite + JavaScript vanilla + PWA.
- Editor: GitHub Codespaces (el usuario no usa terminal local, solo navegador).
- Despliegue: Vercel con auto-deploy desde GitHub.
- Almacenamiento local: OPFS + Web Audio API.
- IA: onnxruntime-web en Web Workers.
- MIDI: librería midi-rw.
- Sin backend, sin Supabase, sin APIs externas.

ESTADO ACTUAL: PASOS 1 y 2 COMPLETADOS Y FUNCIONANDO.
- Repositorio: https://github.com/VitukoLesPaul/drum-midi-pwa
- Estructura:
  ├── public/manifest.json
  ├── src/lib/opfsManager.js      (gestión OPFS: saveFile, readFile, listFiles, deleteFile, clearDir, getStorageEstimate)
  ├── src/lib/audioUtils.js       (processAudioFile, decodeAudioFile, audioBufferToMono, resampleMono, formatBytes, formatDuration)
  ├── src/main.js                 (UI con subida de audio y gestión OPFS)
  ├── src/workers/                (VACÍA, se llenará en el PASO 3)
  ├── .gitignore                  (excluye node_modules, dist, .vercel)
  ├── index.html
  ├── package.json                (deps: onnxruntime-web, midi-rw, opfs-js; dev: vite, vite-plugin-pwa)
  ├── vercel.json                 (solo headers COOP/COEP)
  └── vite.config.js

FLUJO DE TRABAJO DEL USUARIO:
- Edita en Codespaces, prueba en la URL del puerto 5173, hace commit+push desde Source Control (Ctrl+Enter para commit, luego "Sync Changes" para push), Vercel despliega automáticamente.
- El usuario es profano: hay que explicar cada clic, cada comando, cada archivo.
- Los cambios de archivos, darlos COMPLETOS, nunca fragmentos.
- Estilo paso a paso, sin prisa.

REGLAS:
- Nunca subir node_modules ni dist a GitHub.
- No pulsar Enter solo en el mensaje de commit (abre Vim). Usar Ctrl+Enter.
- Ctrl+S no hace nada (autoguardado).
- La M en la pestaña = modificado respecto al último commit, no "sin guardar".

PRÓXIMO PASO A EJECUTAR: PASO 3 - Separación de stems con Demucs.
- Modelo elegido: especializado en batería y bajo, ~80 MB, ONNX.
- Sub-pasos: 3.1 descargar modelo ONNX en public/models/; 3.2 crear src/workers/separation.worker.js; 3.3 integrar onnxruntime-web (ya está en package.json); 3.4 conectar UI con worker (botón "Separar instrumentos" + barra de progreso).
- Pendiente: elegir fuente concreta del modelo ONNX (candidatos: demucs-onnx, htdemucs-ft-drums, Spleeter 2-stems, MDX-Net drums).

Por favor, empieza proponiendo opciones concretas de modelos ONNX disponibles (URLs de descarga incluidas), evalúa tamaño y calidad, y ayúdame a descargar e integrar el elegido. Vamos paso a paso.

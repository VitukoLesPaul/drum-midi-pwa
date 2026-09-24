/**
 * opfsManager.js
 * 
 * Gestión de archivos en OPFS (Origin Private File System).
 * Permite guardar, leer, listar y borrar archivos de audio de forma
 * local en el navegador, sin subirlos a ningún servidor.
 */

/**
 * Comprueba si el navegador soporta OPFS.
 * @returns {boolean}
 */
export function isOPFSSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  );
}

/**
 * Obtiene el directorio raíz de OPFS.
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getRootDir() {
  if (!isOPFSSupported()) {
    throw new Error('OPFS no está soportado en este navegador.');
  }
  return await navigator.storage.getDirectory();
}

/**
 * Obtiene (o crea) un subdirectorio dentro de OPFS.
 * @param {string} name - Nombre del subdirectorio.
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getSubDir(name) {
  const root = await getRootDir();
  return await root.getDirectoryHandle(name, { create: true });
}

/**
 * Guarda un archivo (Blob) en OPFS.
 * 
 * @param {Blob} blob - El archivo a guardar.
 * @param {string} filename - Nombre del archivo (ej: "cancion.mp3").
 * @param {string} [subdir='audio'] - Subdirectorio donde guardarlo.
 * @returns {Promise<{name: string, size: number, path: string}>}
 */
export async function saveFile(blob, filename, subdir = 'audio') {
  const dir = await getSubDir(subdir);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  return {
    name: filename,
    size: blob.size,
    path: `${subdir}/${filename}`
  };
}

/**
 * Lee un archivo de OPFS y lo devuelve como Blob.
 * 
 * @param {string} filename - Nombre del archivo.
 * @param {string} [subdir='audio'] - Subdirectorio donde está.
 * @returns {Promise<Blob>}
 */
export async function readFile(filename, subdir = 'audio') {
  const dir = await getSubDir(subdir);
  const fileHandle = await dir.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file;
}

/**
 * Lista todos los archivos de un subdirectorio de OPFS.
 * 
 * @param {string} [subdir='audio'] - Subdirectorio a listar.
 * @returns {Promise<Array<{name: string, size: number, lastModified: number}>>}
 */
export async function listFiles(subdir = 'audio') {
  const dir = await getSubDir(subdir);
  const files = [];

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      files.push({
        name,
        size: file.size,
        lastModified: file.lastModified
      });
    }
  }

  return files;
}

/**
 * Borra un archivo de OPFS.
 * 
 * @param {string} filename - Nombre del archivo a borrar.
 * @param {string} [subdir='audio'] - Subdirectorio donde está.
 * @returns {Promise<void>}
 */
export async function deleteFile(filename, subdir = 'audio') {
  const dir = await getSubDir(subdir);
  await dir.removeEntry(filename);
}

/**
 * Borra todo el contenido de un subdirectorio de OPFS.
 * 
 * @param {string} [subdir='audio'] - Subdirectorio a vaciar.
 * @returns {Promise<void>}
 */
export async function clearDir(subdir = 'audio') {
  const dir = await getSubDir(subdir);
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      await dir.removeEntry(name);
    }
  }
}

/**
 * Comprueba cuánto espacio hay disponible y cuánto se está usando.
 * 
 * @returns {Promise<{quota: number, usage: number, available: number}>}
 */
export async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) {
    throw new Error('storage.estimate no soportado.');
  }
  const { quota, usage } = await navigator.storage.estimate();
  return {
    quota,
    usage,
    available: quota - usage
  };
}
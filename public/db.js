/* ObraPro - db.js
   Guarda los datos en la tablet con IndexedDB.
   Nada de esto se envía a internet. */
'use strict';

const DB_NOMBRE = 'obrapro';
const DB_VERSION = 1;
/* Se crean desde ahora todas las tablas que usarán las siguientes etapas. */
const TABLAS = ['proyectos', 'espacios', 'fotos', 'catalogo', 'partidas', 'ajustes'];
const CON_PROYECTO = ['espacios', 'fotos', 'partidas'];

let _db = null;

function abrirDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLAS) {
        if (!db.objectStoreNames.contains(t)) {
          const store = db.createObjectStore(t, { keyPath: 'id' });
          if (CON_PROYECTO.includes(t)) store.createIndex('proyectoId', 'proyectoId');
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Cierra otras pestañas de ObraPro e inténtalo de nuevo.'));
  });
}

function _peticion(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbTodos(tabla) {
  const db = await abrirDB();
  return _peticion(db.transaction(tabla).objectStore(tabla).getAll());
}

async function dbObtener(tabla, id) {
  const db = await abrirDB();
  return _peticion(db.transaction(tabla).objectStore(tabla).get(id));
}

async function dbPorProyecto(tabla, proyectoId) {
  const db = await abrirDB();
  return _peticion(db.transaction(tabla).objectStore(tabla).index('proyectoId').getAll(proyectoId));
}

async function dbGuardar(tabla, obj) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(tabla, 'readwrite');
    tx.objectStore(tabla).put(obj);
    tx.oncomplete = () => resolve(obj);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar. ¿Hay espacio libre en la tablet?'));
  });
}

async function dbBorrar(tabla, id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(tabla, 'readwrite');
    tx.objectStore(tabla).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Borra un proyecto y todo lo que le pertenece, en una sola operación. */
async function dbBorrarProyecto(proyectoId) {
  const db = await abrirDB();
  const tablas = ['proyectos', ...CON_PROYECTO];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(tablas, 'readwrite');
    tx.objectStore('proyectos').delete(proyectoId);
    for (const t of CON_PROYECTO) {
      const cursorReq = tx.objectStore(t).index('proyectoId').openKeyCursor(IDBKeyRange.only(proyectoId));
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c) { tx.objectStore(t).delete(c.primaryKey); c.continue(); }
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* Copia de seguridad: todo en un solo objeto. */
async function dbExportar() {
  const datos = {};
  for (const t of TABLAS) datos[t] = await dbTodos(t);
  return { app: 'ObraPro', formato: 1, exportado: new Date().toISOString(), datos };
}

/* Restaurar: reemplaza todo. Si algo falla, no se cambia nada. */
async function dbImportar(respaldo) {
  if (!respaldo || respaldo.app !== 'ObraPro' || !respaldo.datos) {
    throw new Error('El archivo no es una copia de seguridad de ObraPro.');
  }
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TABLAS, 'readwrite');
    for (const t of TABLAS) {
      const store = tx.objectStore(t);
      store.clear();
      for (const obj of (respaldo.datos[t] || [])) {
        if (obj && obj.id) store.put(obj);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo restaurar la copia.'));
  });
}

function nuevoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

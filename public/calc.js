/* ObraPro - calc.js
   Fórmulas de medidas y de dinero. No depende de la pantalla.
   Las medidas se convierten a metros antes de calcular.
   El dinero se maneja en centavos enteros. */
'use strict';

const UNIDADES = {
  m:  { nombre: 'metros',      corto: 'm',  factor: 1 },
  cm: { nombre: 'centímetros', corto: 'cm', factor: 0.01 },
  ft: { nombre: 'pies',        corto: 'ft', factor: 0.3048 }
};

/* Redondeo a 2 decimales (0.005 sube). */
function redondear2(x) {
  if (x == null || !isFinite(x)) return null;
  return Math.round(Number(x.toFixed(8)) * 100) / 100;
}

/* Convierte un valor capturado en la unidad indicada a metros. */
function aMetros(valor, unidad) {
  if (valor == null || !isFinite(valor)) return null;
  const u = UNIDADES[unidad] || UNIDADES.m;
  return valor * u.factor;
}

/* Lee un número escrito por el usuario. Acepta punto o coma decimal.
   Devuelve { valor, error, vacio }. */
function leerNumero(texto) {
  const s = String(texto == null ? '' : texto).trim();
  if (s === '') return { valor: null, error: null, vacio: true };
  if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) {
    return { valor: null, error: 'Usa solo números (punto o coma decimal).', vacio: false };
  }
  return { valor: parseFloat(s.replace(',', '.')), error: null, vacio: false };
}

/* Valida una medida: obligatoria o no, mayor que cero. */
function validarMedida(texto, etiqueta, obligatoria) {
  const r = leerNumero(texto);
  if (r.vacio) return { valor: null, error: obligatoria ? 'Ingresa ' + etiqueta + '.' : null };
  if (r.error) return r;
  if (r.valor <= 0) return { valor: null, error: 'La medida debe ser mayor que cero.' };
  return r;
}

/* Cálculo de un espacio.
   Devuelve valores en metros (sin redondear) y avisos. */
function calcularEspacio(e) {
  const u = e.unidad || 'm';
  const res = { superficie: null, perimetro: null, muros: null, aviso: null };
  const altura = aMetros(e.altura, u);

  if (e.forma === 'irregular') {
    const tramos = (e.tramos || []).filter(t => t.largo > 0 && t.ancho > 0);
    if (tramos.length) {
      let suma = 0;
      for (const t of tramos) {
        suma += (t.signo === -1 ? -1 : 1) * aMetros(t.largo, u) * aMetros(t.ancho, u);
      }
      if (suma < 0) {
        res.aviso = 'Los tramos que restan son mayores que los que suman. Revisa las medidas.';
      } else {
        res.superficie = suma;
      }
    }
    res.perimetro = e.perimetroManual > 0 ? aMetros(e.perimetroManual, u) : null;
  } else {
    const largo = aMetros(e.largo, u);
    const ancho = aMetros(e.ancho, u);
    if (largo > 0 && ancho > 0) {
      res.superficie = largo * ancho;
      res.perimetro = 2 * (largo + ancho);
    }
  }
  if (res.perimetro > 0 && altura > 0) res.muros = res.perimetro * altura;
  return res;
}

/* Superficie de un tramo en m². */
function superficieTramo(t, unidad) {
  if (!(t.largo > 0 && t.ancho > 0)) return null;
  return aMetros(t.largo, unidad) * aMetros(t.ancho, unidad);
}

/* ---------- Dinero (para la Etapa 6) ---------- */

/* Redondea a centavos enteros, 0.5 sube. */
function centavos(x) {
  return Math.round(Number(Number(x).toFixed(6)));
}

/* Partida: cantidad, precios en centavos, % de desperdicio (solo material). */
function calcularPartida(p) {
  const cantidad = Number(p.cantidad) || 0;
  const desperdicio = Number(p.desperdicio) || 0;
  const material = centavos(cantidad * (p.precioMaterial || 0) * (1 + desperdicio / 100));
  const manoObra = centavos(cantidad * (p.precioManoObra || 0));
  return { material, manoObra, subtotal: material + manoObra };
}

/* Presupuesto completo. Porcentajes como números (10 = 10 %). */
function calcularPresupuesto(partidas, conf) {
  let material = 0, manoObra = 0;
  for (const p of partidas) {
    const r = calcularPartida(p);
    material += r.material;
    manoObra += r.manoObra;
  }
  const directo = material + manoObra;
  const indirectos = centavos(directo * (Number(conf.indirectos) || 0) / 100);
  const utilidad = centavos((directo + indirectos) * (Number(conf.utilidad) || 0) / 100);
  const subtotal = directo + indirectos + utilidad;
  const iva = conf.aplicarIva ? centavos(subtotal * (Number(conf.iva) || 0) / 100) : 0;
  return { material, manoObra, directo, indirectos, utilidad, subtotal, iva, total: subtotal + iva };
}

/* Formato $1,234.56 MXN */
function formatoMXN(cents) {
  const n = (cents || 0) / 100;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN';
}

if (typeof module !== 'undefined') {
  module.exports = { UNIDADES, redondear2, aMetros, leerNumero, validarMedida, calcularEspacio,
    superficieTramo, centavos, calcularPartida, calcularPresupuesto, formatoMXN };
}

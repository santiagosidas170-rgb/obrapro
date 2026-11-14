#!/usr/bin/env bash
# Corre todas las pruebas automáticas de ObraPro.
# Requisitos: Node.js 18+, el paquete "playwright" con Chromium instalado y Python 3.
#   npm install -g playwright && npx playwright install chromium
# Uso (desde la carpeta del proyecto):  bash pruebas/ejecutar.sh
set -u
cd "$(dirname "$0")/.."
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
export SALIDA="${SALIDA:-/tmp/obrapro-pruebas}"
mkdir -p "$SALIDA"
PUERTO="${PUERTO:-8124}"
export BASE="http://localhost:$PUERTO/"
(cd public && python3 -m http.server "$PUERTO" >/dev/null 2>&1) &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
sleep 1
malas=0
echo "== Fórmulas";   node pruebas/test_calc.js "$PWD/public/calc.js" | tail -1 || malas=1
for t in e2e design splash fotos-test presupuesto-test seguimiento-test listas-test reporte-test backup-test tabla-ancho; do
  echo "== $t"
  node "pruebas/$t.js" > "$SALIDA/$t.log" 2>&1 && echo "   bien ($(grep -c '✔' "$SALIDA/$t.log") comprobaciones)" || { echo "   FALLÓ, mira $SALIDA/$t.log"; grep '✘' "$SALIDA/$t.log" | head -5; malas=1; }
done
[ "$malas" = 0 ] && echo "TODO BIEN" || echo "HAY PRUEBAS QUE FALLAN"
exit $malas

#!/bin/bash
# setup-dolibarr.sh
# Configuración inicial de Dolibarr vía API REST.
# Ejecutar UNA SOLA VEZ tras el primer arranque de Dolibarr.
#
# Requisitos:
#   - Dolibarr corriendo en localhost:8085
#   - Variables de entorno: DOLI_ADMIN_LOGIN, DOLI_ADMIN_PASSWORD
#   - curl + jq instalados en el NAS
#
# Uso:
#   source /volume1/docker/club/erp/.env
#   bash scripts/setup-dolibarr.sh

set -euo pipefail

DOLI_URL="${DOLI_URL:-http://localhost:8085}"
DOLI_LOGIN="${DOLI_ADMIN_LOGIN:?Falta DOLI_ADMIN_LOGIN}"
DOLI_PASS="${DOLI_ADMIN_PASSWORD:?Falta DOLI_ADMIN_PASSWORD}"

echo "→ Obteniendo token de Dolibarr..."
TOKEN=$(curl -sf -X POST \
  "${DOLI_URL}/api/index.php/login" \
  -H "Content-Type: application/json" \
  -d "{\"login\":\"${DOLI_LOGIN}\",\"password\":\"${DOLI_PASS}\"}" \
  | jq -r '.success.token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "ERROR: No se pudo obtener el token. ¿Está Dolibarr arriba?" >&2
  exit 1
fi
echo "✓ Token obtenido."

api() {
  local method="$1" endpoint="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sf -X "$method" \
      "${DOLI_URL}/api/index.php/${endpoint}" \
      -H "DOLAPIKEY: ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sf -X "$method" \
      "${DOLI_URL}/api/index.php/${endpoint}" \
      -H "DOLAPIKEY: ${TOKEN}"
  fi
}

echo ""
echo "→ Creando tipos de socio por sección..."

declare -A TIPOS=(
  ["Atletismo"]="105"
  ["Trail Running"]="105"
  ["Kenpo"]="45"
  ["Kickboxing"]="45"
  ["Fútbol"]="32"
  ["Patinaje"]="32"
  ["Baloncesto"]="27"
  ["Fútbol 7"]="27"
  ["Fútbol Sala"]="27"
  ["Gimnasia Rítmica"]="27"
  ["Voleibol"]="20"
  ["Colaborador / No federado"]="20"
)

for NOMBRE in "${!TIPOS[@]}"; do
  CUOTA="${TIPOS[$NOMBRE]}"
  RESULT=$(api POST "memberstypes" "{
    \"label\": \"${NOMBRE}\",
    \"amount\": ${CUOTA},
    \"duration_value\": 1,
    \"duration_unit\": \"y\",
    \"subscription\": 1,
    \"statut\": 1
  }" 2>/dev/null || echo "skip")
  if [[ "$RESULT" == "skip" ]]; then
    echo "  ! ${NOMBRE}: ya existe o error (ignorado)"
  else
    echo "  ✓ ${NOMBRE}: ${CUOTA}€/año"
  fi
done

echo ""
echo "→ Creando categorías de gasto..."

CATEGORIAS=(
  "Árbitros Fútbol"
  "Árbitros Fútbol Sala"
  "Árbitros Baloncesto"
  "Gestoría"
  "Licencias / Fichas Federativas"
  "Equipación y Material"
  "Transporte"
  "Dietas"
  "Sanciones"
  "Juegos Escolares Aragón"
  "Premios y Trofeos"
  "Instalaciones"
  "Seguros"
  "Otros"
)

for CAT in "${CATEGORIAS[@]}"; do
  api POST "categories" "{
    \"label\": \"${CAT}\",
    \"type\": 6,
    \"visible\": 1
  }" > /dev/null 2>&1 || true
  echo "  ✓ ${CAT}"
done

echo ""
echo "→ Creando proveedores habituales..."

PROVEEDORES=(
  "Federación Aragonesa de Fútbol:C.I.F. pendiente:Zaragoza"
  "Federación Aragonesa de Baloncesto:C.I.F. pendiente:Zaragoza"
  "Federación Aragonesa de Atletismo:C.I.F. pendiente:Zaragoza"
  "Fútbol Emotion:B12345678:Zaragoza"
  "Porteromania:B12345679:Zaragoza"
  "Tagoya Kenpo:B12345680:Zaragoza"
)

for PROV in "${PROVEEDORES[@]}"; do
  IFS=':' read -r NOMBRE CIF CIUDAD <<< "$PROV"
  api POST "thirdparties" "{
    \"name\": \"${NOMBRE}\",
    \"idprof2\": \"${CIF}\",
    \"town\": \"${CIUDAD}\",
    \"country_code\": \"ES\",
    \"fournisseur\": 1,
    \"client\": 0,
    \"status\": 1
  }" > /dev/null 2>&1 || true
  echo "  ✓ ${NOMBRE}"
done

echo ""
echo "✅ Configuración inicial completada."
echo ""
echo "Siguiente paso — importar socios:"
echo "  1. Exporta el Excel como CSV UTF-8 (Google Sheets → Descargar → CSV)"
echo "  2. python3 scripts/import-socios.py socios.csv > socios_dolibarr.csv"
echo "  3. En Dolibarr → Adherentes → Importar → sube socios_dolibarr.csv"

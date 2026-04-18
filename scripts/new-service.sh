#!/bin/bash
#
# new-service.sh — Scaffold de un servicio nuevo a partir del de Paperless.
#
# Uso:  bash scripts/new-service.sh <nombre>
#
# Crea services/<nombre>/ con docker-compose.yml, .env.example y README.md
# basados en los de Paperless. El usuario tiene que adaptarlos a su servicio.

set -euo pipefail

# --- Colores ---
readonly C_RESET='\033[0m'
readonly C_VERDE='\033[0;32m'
readonly C_AMARILLO='\033[0;33m'
readonly C_ROJO='\033[0;31m'

ok()    { printf "${C_VERDE}[OK]${C_RESET}    %s\n" "$*"; }
warn()  { printf "${C_AMARILLO}[AVISO]${C_RESET} %s\n" "$*"; }
error() { printf "${C_ROJO}[ERROR]${C_RESET} %s\n" "$*" >&2; }

# shellcheck disable=SC2155
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2155
readonly REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly SERVICES_DIR="${REPO_DIR}/services"
readonly TEMPLATE="${SERVICES_DIR}/paperless"

# --- Argumentos ---
if [[ $# -ne 1 ]]; then
  error "Uso: $0 <nombre-del-servicio>"
  error "Ejemplo: $0 nocodb"
  exit 1
fi

NAME="$1"

# Validar nombre: minúsculas, números, guiones. Sin espacios ni mayúsculas.
if [[ ! "${NAME}" =~ ^[a-z][a-z0-9-]*$ ]]; then
  error "Nombre inválido: '${NAME}'"
  error "Solo minúsculas, números y guiones, empezando por letra. Ej: nocodb, metabase, my-service."
  exit 1
fi

readonly NAME
readonly DEST="${SERVICES_DIR}/${NAME}"

# --- Verificaciones ---
if [[ -e "${DEST}" ]]; then
  error "Ya existe ${DEST}. Borra o renómbralo si quieres regenerarlo."
  exit 1
fi

if [[ ! -d "${TEMPLATE}" ]]; then
  error "No encuentro la plantilla en ${TEMPLATE}"
  exit 1
fi

# --- Copiar plantilla ---
cp -r "${TEMPLATE}" "${DEST}"

# Eliminar un .env real si por error existiera en la plantilla (no debería).
rm -f "${DEST}/.env"

# Sustituir 'paperless' por el nombre nuevo dentro de los archivos copiados.
# OJO: solo sustituimos el literal exacto de directorios, container names y
# comentarios. La imagen `ghcr.io/paperless-ngx/paperless-ngx` la dejamos
# como está; el usuario tiene que reemplazarla a mano por la imagen del
# servicio nuevo (no se puede inferir).
find "${DEST}" -type f \( -name "*.yml" -o -name ".env.example" -o -name "*.md" \) \
  -exec sed -i.bak \
    -e "s|club-paperless|club-${NAME}|g" \
    -e "s|/club/paperless/|/club/${NAME}/|g" \
    -e "s|services/paperless|services/${NAME}|g" \
    {} \;

# Limpiar backups del sed.
find "${DEST}" -name "*.bak" -delete

ok "Servicio '${NAME}' creado en ${DEST}"

cat <<EOF

${C_AMARILLO}Pasos manuales pendientes:${C_RESET}

  1. Editar ${DEST}/docker-compose.yml:
     - Sustituir la imagen 'ghcr.io/paperless-ngx/paperless-ngx:latest' por la
       imagen real del servicio nuevo.
     - Ajustar puertos, volúmenes, env vars, healthcheck.
     - Quitar los servicios db/redis si no aplican.

  2. Editar ${DEST}/.env.example:
     - Variables propias del servicio nuevo.

  3. Editar ${DEST}/README.md:
     - Reescribir para el servicio nuevo (no es Paperless).

  4. Documentar en docs/NN-${NAME}.md (siguiente número libre).

  5. Añadirlo al README.md raíz y a CLAUDE.md (tabla de servicios).

  6. Commit, PR, merge a main.

  7. En el NAS: bootstrap-nas.sh creará la carpeta /volume1/docker/club/${NAME}/.
     Crear .env con secretos reales y hacer 'docker compose up -d' la primera vez.

  8. Añadir el subdominio al Cloudflare Tunnel.

EOF

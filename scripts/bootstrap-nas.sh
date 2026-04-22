#!/bin/bash
#
# bootstrap-nas.sh — Primera instalación del stack del club en el NAS Synology.
#
# Idempotente: se puede ejecutar varias veces sin riesgo.
# NO sobrescribe datos existentes. Si una carpeta ya existe, se respeta.
# NO toca nada fuera de /volume1/docker/club/.
#
# Uso:  sudo bash scripts/bootstrap-nas.sh

set -euo pipefail

# --- Colores ---
readonly C_RESET='\033[0m'
readonly C_VERDE='\033[0;32m'
readonly C_AMARILLO='\033[0;33m'
readonly C_ROJO='\033[0;31m'
readonly C_AZUL='\033[0;34m'

info()  { printf "${C_AZUL}[INFO]${C_RESET}  %s\n" "$*"; }
ok()    { printf "${C_VERDE}[OK]${C_RESET}    %s\n" "$*"; }
warn()  { printf "${C_AMARILLO}[AVISO]${C_RESET} %s\n" "$*"; }
error() { printf "${C_ROJO}[ERROR]${C_RESET} %s\n" "$*" >&2; }

# --- Constantes ---
readonly BASE_DIR="/volume1/docker/club"
readonly NETWORK_NAME="club-network"
# shellcheck disable=SC2155
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2155
readonly REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Verificaciones previas ---

if [[ ${EUID} -ne 0 ]]; then
  error "Este script debe ejecutarse con sudo (necesita crear carpetas en /volume1/docker/)."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  error "Docker no está instalado o no está en el PATH."
  error "Instala Container Manager desde el Centro de Paquetes de DSM."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  error "Docker Compose v2 no disponible. Actualiza Container Manager."
  exit 1
fi

# Detectar el usuario real que invocó sudo, no root.
readonly REAL_USER="${SUDO_USER:-$(whoami)}"
if [[ "${REAL_USER}" == "root" ]]; then
  warn "Te ejecutas como root directamente, no vía sudo."
  warn "Los UID/GID que se imprimen al final pueden no ser los que quieres."
fi
REAL_UID="$(id -u "${REAL_USER}")"
REAL_GID="$(id -g "${REAL_USER}")"
readonly REAL_UID REAL_GID

info "Usuario operador detectado: ${REAL_USER} (UID=${REAL_UID}, GID=${REAL_GID})"

# --- Red Docker ---

info "Verificando red Docker '${NETWORK_NAME}'..."
if docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  ok "La red '${NETWORK_NAME}' ya existe. No se toca."
else
  docker network create "${NETWORK_NAME}" >/dev/null
  ok "Red '${NETWORK_NAME}' creada."
fi

# --- Carpetas base ---

info "Verificando jerarquía de carpetas en ${BASE_DIR}..."

declare -a SUBDIRS_PAPERLESS=(
  "paperless/data"
  "paperless/media"
  "paperless/export"
  "paperless/consume"
  "paperless/trash"
  "paperless/db-data"
)

declare -a SUBDIRS_BASE=(
  "logs"
)

create_dir_if_absent() {
  local path="$1"
  if [[ -d "${path}" ]]; then
    ok "Existe: ${path} (no se toca)"
  else
    mkdir -p "${path}"
    chown "${REAL_UID}:${REAL_GID}" "${path}"
    ok "Creado: ${path}"
  fi
}

create_dir_if_absent "${BASE_DIR}"

for sub in "${SUBDIRS_BASE[@]}"; do
  create_dir_if_absent "${BASE_DIR}/${sub}"
done

for sub in "${SUBDIRS_PAPERLESS[@]}"; do
  create_dir_if_absent "${BASE_DIR}/${sub}"
done

# Para cada `services/<x>/` del repo, asegurar que existe la carpeta de
# datos correspondiente bajo BASE_DIR. (Las subcarpetas concretas las gestiona
# cada servicio en su .env / compose.)
info "Verificando carpeta de datos para cada servicio del repo..."
for svc_dir in "${REPO_DIR}/services"/*/; do
  svc_name="$(basename "${svc_dir}")"
  create_dir_if_absent "${BASE_DIR}/${svc_name}"
done

# --- Resumen final ---

cat <<EOF

$(printf '%s' "${C_VERDE}===========================================================${C_RESET}")
 Bootstrap completado.
$(printf '%s' "${C_VERDE}===========================================================${C_RESET}")

 Próximos pasos:

 1. Configurar Paperless:
      cd ${REPO_DIR}/services/paperless
      cp .env.example .env
      nano .env
      # Rellena:
      #   USERMAP_UID=${REAL_UID}
      #   USERMAP_GID=${REAL_GID}
      #   POSTGRES_PASSWORD=<openssl rand -base64 32 | tr -d '/+=' | head -c 32>
      #   PAPERLESS_SECRET_KEY=<openssl rand -base64 60 | tr -d '\\n'>

 2. Levantar contenedores:
      docker compose up -d

 3. Crear superusuario de Paperless:
      docker compose exec web python3 manage.py createsuperuser

 4. Levantar el portal:
      cd ${REPO_DIR}/services/portal
      cp .env.example .env  # placeholder, no necesita rellenar
      docker compose up -d

 5. Activar el cron de auto-deploy (crontab -e):
      */5 * * * * ${REPO_DIR}/scripts/deploy.sh >> ${BASE_DIR}/logs/deploy.log 2>&1

 6. Configurar Cloudflare Tunnel para los hostnames:
      contabilidad.deportepedrola.com → http://localhost:8010 (WebSocket ON)
      erp.deportepedrola.com           → http://localhost:8020

 7. Configurar backups: ver docs/07-backups.md

EOF

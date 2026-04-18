#!/bin/bash
#
# deploy.sh — Pull de main y reconciliación de servicios. Lo llama el cron.
#
# Comportamiento:
#  - Si no hay cambios remotos → silencioso, exit 0.
#  - Si hay cambios → git pull (FAIL-HARD), luego para cada services/<x>/
#    con .env existente: docker compose pull && docker compose up -d.
#  - Si un servicio no tiene .env → se loguea aviso y se salta (no rompe).
#  - Cualquier fallo en git pull o en compose → exit != 0 con log claro.
#
# IMPORTANTE: este script NO puede tener "|| true" silenciador en git pull.
# Debe fallar ruidosamente. Lección aprendida en otro repo.

set -euo pipefail

# --- Constantes ---
# shellcheck disable=SC2155
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2155
readonly REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly BRANCH="main"

cd "${REPO_DIR}"

# --- Helpers ---
ts()   { date '+%Y-%m-%d %H:%M:%S'; }
log()  { printf "[%s] %s\n" "$(ts)" "$*"; }
die()  { printf "[%s] ERROR: %s\n" "$(ts)" "$*" >&2; exit 1; }

# --- Verificar que es un repo git ---
if [[ ! -d ".git" ]]; then
  die "No estoy en un repositorio git: ${REPO_DIR}"
fi

# --- Working tree limpio ---
# Si hay modificaciones locales, no se puede hacer pull sin perder/conflictar.
# Mejor abortar ruidosamente que mergear sorpresas.
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree sucio en ${REPO_DIR}. Investigar antes de continuar (git status)."
fi

# --- ¿Hay cambios en remoto? ---
# Fetch silencioso; no logueamos para no llenar el log con miles de líneas/día.
if ! git fetch --quiet origin "${BRANCH}"; then
  die "git fetch falló."
fi

LOCAL_HASH="$(git rev-parse HEAD)"
REMOTE_HASH="$(git rev-parse "origin/${BRANCH}")"

if [[ "${LOCAL_HASH}" == "${REMOTE_HASH}" ]]; then
  # Sin cambios. Silencioso. exit 0.
  exit 0
fi

# --- Hay cambios. A partir de aquí, sí logueamos. ---
log "Detectados cambios en origin/${BRANCH}: ${LOCAL_HASH:0:8} -> ${REMOTE_HASH:0:8}"

# git pull FAIL-HARD: si falla, abortamos. NO seguir adelante con el código viejo
# fingiendo que todo va bien (lección aprendida).
if ! git pull --ff-only origin "${BRANCH}"; then
  die "git pull falló. Abortando deploy."
fi
log "git pull OK. HEAD = $(git rev-parse --short HEAD)"

# --- Reconciliar cada servicio ---
declare -i deployed=0
declare -i skipped=0
declare -i failed=0

for svc_dir in "${REPO_DIR}/services"/*/; do
  svc_name="$(basename "${svc_dir}")"

  if [[ ! -f "${svc_dir}/docker-compose.yml" ]]; then
    log "  · ${svc_name}: sin docker-compose.yml, saltando."
    skipped+=1
    continue
  fi

  if [[ ! -f "${svc_dir}/.env" ]]; then
    log "  · ${svc_name}: sin .env (servicio aún no configurado), saltando."
    skipped+=1
    continue
  fi

  log "  → ${svc_name}: pull + up -d"
  pushd "${svc_dir}" >/dev/null

  if ! docker compose pull 2>&1 | sed 's/^/      /'; then
    log "    ${svc_name}: docker compose pull FALLÓ."
    failed+=1
    popd >/dev/null
    continue
  fi

  if ! docker compose up -d 2>&1 | sed 's/^/      /'; then
    log "    ${svc_name}: docker compose up -d FALLÓ."
    failed+=1
    popd >/dev/null
    continue
  fi

  popd >/dev/null
  deployed+=1
done

log "Resumen: ${deployed} desplegado(s), ${skipped} saltado(s), ${failed} fallido(s)."

if (( failed > 0 )); then
  exit 1
fi

exit 0

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "${TARGET}" ]]; then
  echo "Usage: ./scripts/with-db-target.sh <preview|production> <command...>" >&2
  exit 1
fi

shift

if [[ "$#" -eq 0 ]]; then
  echo "A command is required after the target." >&2
  echo "Example: ./scripts/with-db-target.sh preview npx prisma migrate status" >&2
  exit 1
fi

case "${TARGET}" in
  preview|production)
    ;;
  *)
    echo "Unsupported target '${TARGET}'. Use 'preview' or 'production'." >&2
    exit 1
    ;;
esac

TARGET_ENV_FILE="${ROOT_DIR}/.env.db.${TARGET}.local"

if [[ ! -f "${TARGET_ENV_FILE}" ]]; then
  echo "Missing ${TARGET_ENV_FILE}" >&2
  echo "Create it with XD_POSTGRES=<connection string>." >&2
  exit 1
fi

load_env_file() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    while IFS= read -r line || [[ -n "${line}" ]]; do
      line="${line%$'\r'}"

      if [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]]; then
        continue
      fi

      if [[ "${line}" != *=* ]]; then
        continue
      fi

      local key="${line%%=*}"
      local value="${line#*=}"

      key="${key#"${key%%[![:space:]]*}"}"
      key="${key%"${key##*[![:space:]]}"}"

      if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi

      export "${key}=${value}"
    done < "${file}"
  fi
}

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/.env.local"
load_env_file "${TARGET_ENV_FILE}"

unset DATABASE_URL XD_POSTGRESS || true

if [[ -z "${XD_POSTGRES:-}" ]]; then
  echo "XD_POSTGRES is not set after loading ${TARGET_ENV_FILE}" >&2
  exit 1
fi

echo "[db-target] ${TARGET} via ${TARGET_ENV_FILE##*/}" >&2
exec "$@"

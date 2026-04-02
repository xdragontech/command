#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "${TARGET}" ]]; then
  echo "Usage: ./scripts/deploy-db-migrations.sh <preview|production>" >&2
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

if [[ -z "${XD_POSTGRES:-}" ]]; then
  echo "XD_POSTGRES must be set before running deploy-db-migrations.sh." >&2
  exit 1
fi

cd "${ROOT_DIR}"

require_binary() {
  local binary="$1"
  if ! command -v "${binary}" >/dev/null 2>&1; then
    echo "Required binary '${binary}' is not installed or not on PATH." >&2
    exit 1
  fi
}

run_prisma_deploy() {
  npx prisma migrate deploy
}

run_prisma_status() {
  npx prisma migrate status
}

list_local_migration_dirs() {
  find prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
}

list_applied_migrations() {
  psql "${XD_POSTGRES}" -X -A -t -v ON_ERROR_STOP=1 \
    -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
}

ensure_no_unfinished_migrations() {
  local unfinished
  unfinished="$(psql "${XD_POSTGRES}" -X -A -t -v ON_ERROR_STOP=1 \
    -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at")"

  if [[ -n "${unfinished}" ]]; then
    echo "Unfinished migration rows already exist in _prisma_migrations. Refusing fallback apply." >&2
    printf '%s\n' "${unfinished}" >&2
    exit 1
  fi
}

compute_checksum() {
  local migration_file="$1"
  shasum -a 256 "${migration_file}" | awk '{ print $1 }'
}

record_migration_row() {
  local migration_name="$1"
  local checksum="$2"
  local migration_id
  migration_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"

  psql "${XD_POSTGRES}" -X -v ON_ERROR_STOP=1 \
    -v migration_id="${migration_id}" \
    -v migration_name="${migration_name}" \
    -v migration_checksum="${checksum}" <<'SQL'
INSERT INTO _prisma_migrations (
  id,
  checksum,
  migration_name,
  logs,
  rolled_back_at,
  started_at,
  finished_at,
  applied_steps_count
)
SELECT
  :'migration_id',
  :'migration_checksum',
  :'migration_name',
  NULL,
  NULL,
  NOW(),
  NOW(),
  1
WHERE NOT EXISTS (
  SELECT 1
  FROM _prisma_migrations
  WHERE migration_name = :'migration_name'
);
SQL
}

apply_pending_migrations_with_psql() {
  local applied_names
  local pending_count=0

  applied_names="$(list_applied_migrations)"

  while IFS= read -r migration_name; do
    [[ -z "${migration_name}" ]] && continue

    if grep -Fqx "${migration_name}" <<<"${applied_names}"; then
      continue
    fi

    local migration_file="prisma/migrations/${migration_name}/migration.sql"
    if [[ ! -f "${migration_file}" ]]; then
      echo "Missing migration SQL file: ${migration_file}" >&2
      exit 1
    fi

    echo "Applying pending migration with psql fallback: ${migration_name}" >&2
    psql "${XD_POSTGRES}" -X -v ON_ERROR_STOP=1 -f "${migration_file}"
    record_migration_row "${migration_name}" "$(compute_checksum "${migration_file}")"

    applied_names+=$'\n'"${migration_name}"
    pending_count=$((pending_count + 1))
  done < <(list_local_migration_dirs)

  if [[ "${pending_count}" -eq 0 ]]; then
    echo "No pending local migrations found during psql fallback." >&2
  fi
}

main() {
  require_binary psql
  require_binary shasum
  require_binary uuidgen

  local prisma_output
  prisma_output="$(mktemp)"

  if run_prisma_deploy >"${prisma_output}" 2>&1; then
    cat "${prisma_output}"
    rm -f "${prisma_output}"
    return 0
  fi

  local prisma_exit_code=$?
  cat "${prisma_output}" >&2
  rm -f "${prisma_output}"

  if [[ "${TARGET}" != "production" ]]; then
    return "${prisma_exit_code}"
  fi

  if ! grep -Fq "Schema engine error:" "${prisma_output}"; then
    echo "Prisma migrate deploy failed without the known schema-engine signature. Not attempting psql fallback." >&2
    return "${prisma_exit_code}"
  fi

  echo "Prisma migrate deploy hit the known production schema-engine failure. Falling back to direct SQL apply." >&2

  ensure_no_unfinished_migrations
  apply_pending_migrations_with_psql
  run_prisma_status
}

main "$@"

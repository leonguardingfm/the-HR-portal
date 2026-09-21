#!/usr/bin/env bash
#
# Applies the migration to a throwaway database and proves every constraint in
# prisma/constraints.sql rejects the case it exists to reject.
#
# Needs a running PostgreSQL 16 and psql on PATH. Override the connection with
# PGHOST / PGPORT / PGUSER.
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
DB="leon_constraint_test_$$"
export PGHOST PGPORT PGUSER

cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

createdb "$DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f prisma/migrations/20260921120000_init/migration.sql
OUT=$(psql -d "$DB" -q -f prisma/constraints.test.sql 2>&1)

echo "$OUT" | grep -oE "PASS  .*" || true

if echo "$OUT" | grep -qE "FAIL|^ERROR"; then
  echo
  echo "FAILURES:"
  echo "$OUT" | grep -E "FAIL|^ERROR"
  exit 1
fi

echo
echo "$(echo "$OUT" | grep -c PASS) assertions passed."

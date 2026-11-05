#!/usr/bin/env bash
# Локальный прогон на голом Postgres (без Supabase CLI): заглушки auth + миграции + тесты.
# Использование: DATABASE_URL=postgres://postgres@localhost:5432/crm_test ./supabase/tests/run-local.sh
# База должна быть пустой: тест работает в транзакции и всё откатывает (rollback).
set -euo pipefail
cd "$(dirname "$0")/.."
for f in local-stubs/00_supabase_stub.sql migrations/*.sql tests/rls_and_workflow.test.sql; do
  echo "== $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

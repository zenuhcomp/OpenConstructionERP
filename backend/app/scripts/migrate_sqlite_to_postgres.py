"""One-shot data migration: copy every row from SQLite into PostgreSQL.

Schema is created on the target via ``Base.metadata.create_all`` (the same path
the app and Alembic use on a fresh DB), then rows are copied table-by-table in
foreign-key-safe order. Copying goes through SQLAlchemy Core with the *typed*
table objects, so each column's bind/result processors convert values for the
target dialect automatically:

  * GUID    -> String(36) on both backends, copies verbatim
  * JSON    -> SQLite TEXT read, validated, inserted into PostgreSQL json/jsonb
  * Boolean -> SQLite 0/1 read, inserted as PostgreSQL true/false
  * DateTime -> SQLite ISO string read, inserted as PostgreSQL timestamp

Usage (from backend/):

    python -m app.scripts.migrate_sqlite_to_postgres \
        --source sqlite:////root/OpenConstructionERP/data/openestimate.db \
        --target postgresql+psycopg2://oce:PASS@localhost:5432/openconstructionerp

Flags:
    --batch N         rows per insert (default 1000)
    --truncate        TRUNCATE every target table before copying (re-runnable)
    --skip-create     do not run create_all (assume schema already migrated)
    --only T1,T2      copy only these tables (debug)
    --dry-run         create schema + report source counts, copy nothing

The source SQLite file is opened with the sync driver and never written, so this
is safe to run repeatedly. On success it prints a per-table source/target
row-count table and exits 0 only if every count matches.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from sqlalchemy import JSON, create_engine, func, insert, select
from sqlalchemy.engine import Engine


def _load_metadata():
    """Import every model so Base.metadata is fully populated, return Base."""
    try:
        import app.main  # noqa: F401  (side effect: module loader registers all models)
    except Exception as exc:  # noqa: BLE001
        print(f"warning: app.main import raised {exc!r}; trying models_registry", file=sys.stderr)
    try:
        import app.core.models_registry  # noqa: F401
    except Exception:  # noqa: BLE001
        pass
    from app.database import Base

    return Base


def _coerce_sqlite_url(url: str) -> str:
    if url.startswith("sqlite+aiosqlite"):
        url = url.replace("sqlite+aiosqlite", "sqlite", 1)
    return url


def _coerce_pg_url(url: str) -> str:
    # This script is synchronous; force psycopg2 rather than asyncpg.
    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "+psycopg2", 1)
    return url


def _count(engine: Engine, table) -> int:
    with engine.connect() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def _sanitize_row(table, row: dict) -> dict:
    """Fix values SQLite stored loosely so PostgreSQL accepts them.

    The real hazard is JSON columns: SQLite is untyped TEXT, so a legacy seed
    could have written a bare scalar or invalid JSON. Mirror the app's tolerant
    loader: parse JSON text, and on failure keep the raw string as a JSON string
    value rather than crashing the whole migration.
    """
    out = dict(row)
    for col in table.columns:
        if isinstance(col.type, JSON):
            v = out.get(col.name)
            if isinstance(v, str):
                try:
                    out[col.name] = json.loads(v)
                except (ValueError, TypeError):
                    out[col.name] = v
    return out


def migrate(
    source_url: str,
    target_url: str,
    *,
    batch: int = 1000,
    truncate: bool = False,
    skip_create: bool = False,
    only: Sequence[str] | None = None,
    dry_run: bool = False,
) -> int:
    base = _load_metadata()
    metadata = base.metadata

    src = create_engine(_coerce_sqlite_url(source_url))
    dst = create_engine(_coerce_pg_url(target_url), future=True)

    tables = list(metadata.sorted_tables)
    if only:
        wanted = set(only)
        tables = [t for t in tables if t.name in wanted]

    print(f"source: {src.url}")
    print(f"target: {dst.url}")
    print(f"tables in metadata: {len(metadata.sorted_tables)}; copying: {len(tables)}")

    if not skip_create and not dry_run:
        print("creating schema on target (create_all)...")
        metadata.create_all(dst)

    if truncate and not dry_run and tables:
        names = ", ".join(f'"{t.name}"' for t in tables)
        from sqlalchemy import text

        with dst.begin() as conn:
            conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
        print(f"truncated {len(tables)} target tables")

    report: list[tuple[str, int, int]] = []
    mismatch = False

    for t in tables:
        src_n = _count(src, t)
        if dry_run:
            report.append((t.name, src_n, 0))
            continue
        if src_n == 0:
            report.append((t.name, 0, _count(dst, t)))
            continue

        copied = 0
        with src.connect() as sconn:
            result = sconn.execution_options(stream_results=True).execute(select(t))
            while True:
                chunk = result.fetchmany(batch)
                if not chunk:
                    break
                rows = [_sanitize_row(t, dict(r._mapping)) for r in chunk]
                with dst.begin() as dconn:
                    dconn.execute(insert(t), rows)
                copied += len(rows)
                print(f"  {t.name}: {copied}/{src_n}", end="\r")

        dst_n = _count(dst, t)
        report.append((t.name, src_n, dst_n))
        if dst_n != src_n:
            mismatch = True
        print(f"  {t.name}: {src_n} -> {dst_n}{' MISMATCH' if dst_n != src_n else ''}        ")

    # Reset PostgreSQL sequences for any integer autoincrement PKs (UUID PKs
    # have no sequence). Safe even when there are none.
    if not dry_run:
        from sqlalchemy import text

        with dst.begin() as conn:
            for t in tables:
                for col in t.primary_key.columns:
                    try:
                        is_int = col.type.python_type is int
                    except (NotImplementedError, AttributeError):
                        is_int = False
                    if is_int and col.primary_key:
                        seq = f"pg_get_serial_sequence('{t.name}', '{col.name}')"
                        conn.execute(
                            text(
                                f"SELECT setval({seq}, COALESCE((SELECT MAX(\"{col.name}\") "
                                f'FROM "{t.name}"), 1)) WHERE {seq} IS NOT NULL'
                            )
                        )

    print("\n=== row-count report ===")
    print(f"{'table':45} {'source':>10} {'target':>10}")
    total_src = total_dst = 0
    for name, s, d in sorted(report):
        total_src += s
        total_dst += d
        flag = "" if s == d else "  <-- MISMATCH"
        print(f"{name:45} {s:>10} {d:>10}{flag}")
    print(f"{'TOTAL':45} {total_src:>10} {total_dst:>10}")

    if dry_run:
        print("\nDRY RUN - no rows copied.")
        return 0
    if mismatch:
        print("\nFAIL: at least one table row-count mismatch.")
        return 1
    print("\nOK: all tables copied with matching row counts.")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Copy all rows from SQLite to PostgreSQL.")
    ap.add_argument("--source", required=True, help="SQLite URL (sqlite:////abs/path.db)")
    ap.add_argument("--target", required=True, help="PostgreSQL URL (postgresql+psycopg2://...)")
    ap.add_argument("--batch", type=int, default=1000)
    ap.add_argument("--truncate", action="store_true", help="TRUNCATE target tables first (re-runnable)")
    ap.add_argument("--skip-create", action="store_true", help="assume schema already exists")
    ap.add_argument("--only", help="comma-separated table names to copy")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    only = [s.strip() for s in args.only.split(",")] if args.only else None
    return migrate(
        args.source,
        args.target,
        batch=args.batch,
        truncate=args.truncate,
        skip_create=args.skip_create,
        only=only,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())

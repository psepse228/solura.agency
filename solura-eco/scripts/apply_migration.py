#!/usr/bin/env python3
"""Apply a Solura Eco SQL migration file directly against Postgres.

Usage: python scripts/apply_migration.py <path/to/migration.sql>

Reads DB-level connection info from env vars — separate from the backend's
own SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (those are for PostgREST/the
supabase-py client; this needs a real Postgres connection to run DDL,
which PostgREST can't do):
  SUPABASE_DB_HOST      e.g. db.djtdvxtfhqhbqsymzkyq.supabase.co
  SUPABASE_DB_PASSWORD  Postgres password (Settings -> Database on the
                         Supabase dashboard) -- NOT the service-role key
"""
import os
import sys

import psycopg2


def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/apply_migration.py <path/to/migration.sql>", file=sys.stderr)
        sys.exit(1)

    host = os.environ["SUPABASE_DB_HOST"]
    password = os.environ["SUPABASE_DB_PASSWORD"]
    path = sys.argv[1]

    conn = psycopg2.connect(
        host=host, port=5432, dbname="postgres", user="postgres",
        password=password, sslmode="require", connect_timeout=15,
    )
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            with open(path, "r", encoding="utf-8") as f:
                cur.execute(f.read())
        conn.commit()
        print(f"Applied: {path}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()

#!/bin/bash

DB_NAME="d1local"

echo "Initializing local D1 database..."

wrangler d1 execute $DB_NAME --local --command "
CREATE TABLE IF NOT EXISTS darouter (
  c1 TEXT PRIMARY KEY,
  t1 TEXT NOT NULL
);

INSERT OR IGNORE INTO darouter (c1, t1)
VALUES (
  'v99/mock',
  '{\"type\":\"REST\",\"targetUrl\":\"https://httpbin.org/post\"}'
);
"

echo "Starting Pages dev server..."
wrangler pages dev . --d1 DB=$DB_NAME

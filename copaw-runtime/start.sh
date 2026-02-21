#!/bin/bash
# Load .env file
set -a
source "$(dirname "$0")/.env"
set +a

cd "$(dirname "$0")"
exec python3 server.py

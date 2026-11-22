#!/usr/bin/env bash
# Buduje BM-Win.exe (Windows x64) z wbudowaną aplikacją z folderu app/.
# Wymaga Go ≥ 1.24. Uruchomienie z katalogu repozytorium: tools/build-exe.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(date +%Y.%m.%d)-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)"
rm -rf "$ROOT/desktop/app"
cp -r "$ROOT/app" "$ROOT/desktop/app"
cd "$ROOT/desktop"
go mod tidy >/dev/null
mkdir -p "$ROOT/dist"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w -X main.version=$VER" -o "$ROOT/dist/BM-Win.exe" .
rm -rf "$ROOT/desktop/app"
echo "Zbudowano: dist/BM-Win.exe ($VER)"

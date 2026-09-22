#!/bin/sh
# All headless gates, in order, stopping at the first failure.
# Two more need a browser and this script says so when it finishes, because a
# gate nobody is reminded of is a gate nobody runs.
set -e
cd "$(dirname "$0")"

echo "── kernel"    && node tools/test-sim.mjs
echo "── generator" && node tools/test-gen.mjs
echo "── items"     && node tools/test-items.mjs
echo "── provenance"&& node tools/test-provenance.mjs
echo "── assets"    && node tools/test-pack.mjs

if [ "$1" != "--fast" ]; then
  echo "── server"
  if ! curl -sf -o /dev/null "http://localhost:${PORT:-3140}/"; then
    echo "  (starting a server on ${PORT:-3140})"
    node tools/serve.mjs >/dev/null 2>&1 &
    SERVER=$!; sleep 1
  fi
  node tools/serve-check.mjs
  [ -n "$SERVER" ] && kill $SERVER 2>/dev/null || true
fi

echo
echo "  2 gates need a browser: npm start, then"
echo "    /tools/pagecheck.html   render, light, toast, replay"
echo "    /tools/tile-mapper.html the art, judged by eye"

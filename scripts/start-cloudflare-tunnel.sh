#!/usr/bin/env bash
set -eo pipefail

# Ensure ~/.local/bin is in PATH
export PATH="$HOME/.local/bin:$PATH"

PORT="${CRM_PORT:-4000}"
HOST="${CRM_HOST:-127.0.0.1}"

echo "============================================================"
echo "  ENTERPRISES CRM — CLOUDFLARE SECURE TUNNEL LAUNCHER"
echo "============================================================"

# 1. Verify cloudflared is installed
if ! command -v cloudflared &>/dev/null; then
  echo "❌ Error: 'cloudflared' command not found."
  echo "Please install cloudflared or place the binary in ~/.local/bin/cloudflared"
  exit 1
fi

CF_VERSION=$(cloudflared --version 2>&1 | head -n 1)
echo "✅ Cloudflare Tunnel CLI: $CF_VERSION"

# 2. Verify local CRM is running and healthy on the target port
echo "🔍 Checking local CRM availability on http://${HOST}:${PORT}..."
if ! curl -s -f -m 3 "http://${HOST}:${PORT}/health" >/dev/null 2>&1; then
  # Fallback check on root endpoint
  if ! curl -s -f -m 3 "http://${HOST}:${PORT}/" >/dev/null 2>&1; then
    echo "❌ Error: CRM is not reachable at http://${HOST}:${PORT}"
    echo "Please ensure Enterprises CRM is running (e.g. 'pnpm dev' or 'pnpm start') before launching tunnel."
    exit 1
  fi
fi

echo "✅ Local CRM is running and healthy on http://${HOST}:${PORT}"

# 3. Create a temporary log file for cloudflared output
LOG_FILE=$(mktemp /tmp/cloudflared-tunnel-XXXXXX.log)

cleanup() {
  echo -e "\n🛑 Stopping Cloudflare Tunnel..."
  if [[ -n "${CF_PID:-}" ]] && kill -0 "$CF_PID" 2>/dev/null; then
    kill "$CF_PID" 2>/dev/null || true
    wait "$CF_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
  echo "✅ Tunnel terminated. Public access removed."
  exit 0
}

trap cleanup INT TERM EXIT

echo "🌐 Starting Cloudflare Quick Tunnel for http://${HOST}:${PORT}..."
cloudflared tunnel --url "http://${HOST}:${PORT}" >"$LOG_FILE" 2>&1 &
CF_PID=$!

# Wait for tunnel URL to appear in logs (max 30 seconds)
TUNNEL_URL=""
for i in {1..60}; do
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "❌ Error: cloudflared process terminated unexpectedly."
    cat "$LOG_FILE"
    exit 1
  fi
  TUNNEL_URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" "$LOG_FILE" | head -n 1 || true)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 0.5
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "❌ Error: Could not determine public tunnel URL within timeout."
  cat "$LOG_FILE"
  exit 1
fi

echo "============================================================"
echo "🎉 CLOUDFLARE TUNNEL ONLINE & SECURE!"
echo "============================================================"
echo "  Public HTTPS Origin:  $TUNNEL_URL"
echo "  Target Local Service: http://${HOST}:${PORT}"
echo ""
echo "  Admin Portal URL:     $TUNNEL_URL/"
echo "  Technician Portal:    $TUNNEL_URL/technician"
echo "  API Root:             $TUNNEL_URL/api/v1"
echo "  Health Check:         $TUNNEL_URL/health"
echo "============================================================"
echo "⚠️  SECURITY NOTICE:"
echo "  - This Quick Tunnel URL is temporary for development/testing."
echo "  - Remote devices on cellular/Wi-Fi can access this URL directly."
echo "  - Press Ctrl+C in this terminal to immediately stop the tunnel."
echo "============================================================"

# Follow log output to monitor connections
tail -n 0 -f "$LOG_FILE" &
TAIL_PID=$!

wait "$CF_PID"

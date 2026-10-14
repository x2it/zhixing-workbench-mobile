#!/usr/bin/env bash
# 产物部署使用
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5000}"

# ==================== 工具函数 ====================
info() {
  echo "[INFO] $1"
}
warn() {
  echo "[WARN] $1"
}
error() {
  echo "[ERROR] $1"
  exit 1
}
check_command() {
  if ! command -v "$1" &> /dev/null; then
    error "命令 $1 未找到，请先安装"
  fi
}

# ============== 启动服务 ======================
# 直接以 node 启动（绕过 pnpm 额外开销，加快冷启动，避免平台 30s 超时）
if [ ! -f "$ROOT_DIR/server/dist/index.js" ]; then
  error "服务端产物缺失：server/dist/index.js 不存在，请先执行 prod_build.sh"
fi

info "开始执行：node dist/index.js (server)"
(cd "$ROOT_DIR/server" && NODE_ENV=production HOST="$HOST" PORT="$PORT" node dist/index.js) || error "服务启动失败"

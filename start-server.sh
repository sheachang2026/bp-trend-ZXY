#!/bin/bash
# 血压趋势页面 HTTP 服务启动脚本
# 固定端口 8765

SERVER_PORT=8765
SERVER_DIR="/Users/zhangxingyue/.openclaw/workspace/bp-trend"
LOG_FILE="/tmp/bp-server.log"

# 检查端口是否已被占用
if lsof -i :$SERVER_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "血压页面服务已在运行（端口 $SERVER_PORT）"
else
    cd "$SERVER_DIR"
    nohup python3 -m http.server $SERVER_PORT > "$LOG_FILE" 2>&1 &
    echo "血压页面服务已启动（端口 $SERVER_PORT）"
fi

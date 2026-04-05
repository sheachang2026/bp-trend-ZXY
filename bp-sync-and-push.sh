#!/bin/bash
# bp-sync-and-push.sh
# 从飞书同步血压数据，自动提交并推送到 GitHub Pages
# 需要 VPN（git 代理: http://127.0.0.1:7897）

set -e

REPO_DIR="$HOME/.openclaw/workspace/bp-trend"
cd "$REPO_DIR"

# 飞书认证（硬编码，cron 任务无法获取环境变量）
export FEISHU_APP_ID="cli_a92400c4f6b8dcb6"
export FEISHU_APP_SECRET="pE1E7Sgu5Ehzp5ARKcdHVcMlK06PdEJG"

# 1. 运行飞书同步脚本
node sync-from-feishu.js

# 2. 检查是否有变化
if git diff --quiet; then
  echo "[$(date)] 数据无变化，无需推送"
  exit 0
fi

# 3. 提交
git add index.html
TODAY=$(date +"%Y年%m月%d日")
git commit -m "Auto sync: $TODAY 血压数据"

# 4. 推送（走代理）
git push origin main

echo "[$(date)] 推送完成"

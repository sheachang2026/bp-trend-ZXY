#!/bin/bash
cd ~/.openclaw/workspace/bp-trend
export FEISHU_APP_ID="cli_a92400c4f6b8dcb6"
export FEISHU_APP_SECRET="pE1E7Sgu5Ehzp5ARKcdHVcMlK06PdEJG"
node sync-from-feishu.js
echo "--- Records in file ---"
grep -c "date:" index.html
grep "2026-04-05" index.html
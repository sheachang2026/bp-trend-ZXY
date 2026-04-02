#!/bin/bash
# bp-update-github.sh
# 自动更新血压页面到 GitHub Pages
# 用法: ./bp-update-github.sh < systolic> <diastolic> <heartrate> [date]
# 示例: ./bp-update-github.sh 120 80 66
#        ./bp-update-github.sh 120 80 66 2026-04-02

set -e

TOKEN="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"
OWNER="sheachang2026"
REPO="bp-trend-ZXY"
FILE_PATH="index.html"
BRANCH="main"

# 解析参数
if [ $# -lt 3 ]; then
    echo "用法: $0 <高压> <低压> <心率> [日期]"
    echo "示例: $0 120 80 66"
    echo "      $0 120 80 66 2026-04-02"
    exit 1
fi

SYS=$1
DIA=$2
HR=$3
DATE=${4:-$(date +%Y-%m-%d)}

# 生成 label (如 "03/11")
MONTH=$(echo $DATE | cut -d'-' -f2 | sed 's/^0//')
DAY=$(echo $DATE | cut -d'-' -f3 | sed 's/^0//')
LABEL="${MONTH}/${DAY}"

echo "📝 录入数据: $DATE  高压=$SYS 低压=$DIA 心率=$HR"

# 工作目录
WORKDIR="$(cd "$(dirname "$0")" && pwd)"
INDEX_FILE="$WORKDIR/index.html"

# 获取当前 SHA
echo "🔍 获取 GitHub 文件 SHA..."
SHA=$(curl -s -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/$OWNER/$REPO/contents/$FILE_PATH?ref=$BRANCH" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")

echo "✅ SHA: $SHA"

# 读取当前文件内容
CONTENT=$(cat "$INDEX_FILE")

# 生成新的数据条目 (JSON 格式)
NEW_ENTRY="    { date: '$DATE', label: '$LABEL', sys: $SYS, dia: $DIA, hr: $HR }"

# 在 RAW 数组末尾追加新条目（插入倒数第二个 } 之前）
# 用 Python 来处理 JSON 修改，更可靠
python3 << PYEOF
import re

content = '''$CONTENT'''

new_entry = """    { date: '$DATE', label: '$LABEL', sys: $SYS, dia: $DIA, hr: $HR },"""

# 找到 RAW 数组的结束位置（最后一个 ]; 之前）
# 在最后一个已有的条目（最后一个 } 后，]; 前）插入新条目
pattern = r'(\n  \];)'
replacement = f'\n{new_entry}\n  ];'
new_content = re.sub(pattern, replacement, content, count=1)

if new_content == content:
    print("❌ 未找到 RAW 数组末尾，无法插入新数据")
    exit(1)

with open('$INDEX_FILE', 'w') as f:
    f.write(new_content)
print("✅ index.html 已更新")
PYEOF

# Base64 编码文件内容
B64=$(base64 -b 0 < "$INDEX_FILE")

# 构建 GitHub API 请求
echo "🚀 推送更新到 GitHub..."
COMMIT_MSG="血压更新: $DATE 高压$SYS 低压$DIA 心率$HR"

RESPONSE=$(curl -s -X PUT \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"message\": \"$COMMIT_MSG\",
      \"content\": \"$B64\",
      \"sha\": \"$SHA\",
      \"branch\": \"$BRANCH\"
    }" \
    "https://api.github.com/repos/$OWNER/$REPO/contents/$FILE_PATH")

# 检查是否成功
if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ 提交成功!' if 'commit' in d else '❌ 失败: ' + d.get('message',''))" 2>/dev/null; then
    echo ""
    echo "🌐 GitHub Pages 将在 1-2 分钟后自动更新"
    echo "🔗 https://sheachang2026.github.io/bp-trend-ZXY/"
else
    echo "❌ 推送失败"
    echo "$RESPONSE"
    exit 1
fi

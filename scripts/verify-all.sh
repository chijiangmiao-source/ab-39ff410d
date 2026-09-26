#!/bin/sh
# Compose verify 服务总控，围绕一组可覆盖网与一组不可覆盖网，依次运行：
#   1) 算法测试（先直接驱动两组样例网，再跑完整 node --test 套件）
#   2) 前端构建检查
#   3) 健康页 HTTP 冒烟（对 web 服务探测）
# 任一步失败立即以其退出码终止，最终以退出码报告结果。
set -eu

echo "=== [1/3] 算法测试 ==="
echo "--- [1a] 两组样例网审计验证（可覆盖组 / 不可覆盖组）---"
node scripts/verify-nets.js
echo
echo "--- [1b] 完整算法/校验/端到端测试套件 ---"
node --test test/

echo
echo "=== [2/3] 前端构建检查 ==="
node scripts/build.js

echo
echo "=== [3/3] 健康页 HTTP 冒烟（目标: http://web:${WEB_PORT:-8080}）==="
node scripts/smoke.js "http://web:${WEB_PORT:-8080}"

echo
echo ">>> verify 全部通过"

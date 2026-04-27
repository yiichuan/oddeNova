#!/bin/bash

cd "$(dirname "$0")"

if [ ! -d "node_modules" ] || [ ! -d "node_modules/@anthropic-ai/sdk" ]; then
  echo "正在安装依赖..."
  npm install
fi

echo "正在启动 Vibe Live Music (Demo 模式)..."
npm run dev &
DEV_PID=$!

# 等待服务器就绪（最多 30 秒）
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --app=http://localhost:5173/?demo=true
    break
  fi
  sleep 1
done

wait $DEV_PID

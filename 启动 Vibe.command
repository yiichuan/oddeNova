#!/bin/bash

# 切换到项目目录
cd "$(dirname "$0")"

# 检查依赖是否完整
if [ ! -d "node_modules" ] || [ ! -d "node_modules/@anthropic-ai/sdk" ]; then
  echo "正在安装依赖..."
  npm install
fi

# 启动开发服务器并自动打开浏览器
echo "正在启动 Vibe Live Music..."
npm run dev -- --open

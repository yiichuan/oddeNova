# 分享功能设计规格

**日期**：2026-05-17  
**状态**：待实现  

---

## 目标

支持通过链接分享完整工作内容，接收方打开链接后自动将会话 fork 到自己的 oddeNova 中继续创作。分享内容包括完整聊天历史和 strudel 代码。

---

## 技术选型

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 存储后端 | Vercel Blob | 项目已部署在 Vercel，无需额外账号，免费额度充足 |
| 链接形式 | `/s/{shareId}` 专用路径 | 链接干净，风格类似 Figma/CodeSandbox |
| 接收方体验 | 直接 fork（无确认弹窗） | 降低摩擦，打开即可用 |
| 分享入口 | 顶部工具栏按钮 | 靠近导出 WAV 按钮区域 |

---

## 架构

### 数据流

```
分享方                              Vercel                        接收方
──────                              ──────                        ──────
点击"分享"按钮
  │
  ├─ 序列化当前会话 JSON
  │   (title, messages, code)
  │
  └─ POST /api/share ──────────────▶ serverless function
                                       │ 写入 Vercel Blob
                                       │ 生成 shareId (nanoid)
                                       └─ 返回 { shareId }
                                                                  打开 /s/{shareId}
                                                                    │
                                                                    ├─ App 检测路径前缀 /s/
                                                                    │
                                                                    └─ GET /api/share?id={shareId}
                                                                              │
                                                                        serverless function
                                                                        从 Vercel Blob 读取
                                                                        返回 session JSON
                                                                              │
                                                                        fork 为新会话
                                                                        写入 IndexedDB
                                                                        跳转主界面
```

### API Endpoints

**`POST /api/share`**
- 请求体：`SharePayload` JSON
- 响应：`{ shareId: string }`
- 行为：将 payload 写入 Vercel Blob，路径为 `shares/{shareId}.json`，shareId 由 `nanoid(10)` 生成

**`GET /api/share?id={shareId}`**
- 响应：`SharePayload` JSON
- 行为：从 Vercel Blob 读取对应文件并返回；文件不存在时返回 404

**`GET /api/cleanup`（Vercel Cron Job）**
- 触发方式：每天 UTC 00:00 自动执行（配置在 `vercel.json` 的 `crons` 字段）
- 行为：调用 `blob.list({ prefix: 'shares/' })`，遍历所有 blob，删除 `uploadedAt` 距今超过 30 天的文件
- 响应：返回 `{ deleted: number }` 供日志查阅
- 安全：通过检查 `CRON_SECRET` 环境变量防止外部触发

### 共享数据格式

```typescript
interface SharePayload {
  version: 1;
  title: string;
  code: string;
  messages: ChatMessage[];  // 完整聊天历史
  sharedAt: number;         // 分享时间戳 (ms)
}
```

---

## 文件结构

新增以下文件：

```
api/
├── share.ts                  # Vercel serverless function（POST 写入 / GET 读取）
└── cleanup.ts                # Vercel Cron Job：清理 30 天前的旧 blob

src/
├── services/
│   └── share.ts              # 前端调用封装：uploadShare() / fetchShare()
├── components/
│   └── ShareButton.tsx       # 分享按钮 + 链接复制 Toast
└── hooks/
    └── useImportShare.ts     # App 挂载时检测 /s/ 路径并执行导入
```

---

## UI 交互

### 分享方（发起分享）

1. 点击顶部工具栏分享按钮（图标：链接/上传）
2. 按钮进入 loading 状态
3. 调用 `POST /api/share`，上传当前会话
4. 成功后弹出 Popover，展示：
   - 完整分享链接（如 `https://oddenova.vercel.app/s/abc123`）
   - 一键复制按钮
5. 复制后显示"已复制"反馈，Popover 可手动关闭
6. 失败时按钮恢复默认状态，Toast 提示失败原因

### 接收方（打开链接）

App 挂载时（`useImportShare` hook）执行：

```
检测 window.location.pathname
  │
  ├─ 前缀为 /s/ ?
  │     │
  │     ├─ 是 → 显示全屏 loading（"正在加载分享内容…"）
  │     │        调用 GET /api/share?id={shareId}
  │     │        成功 → fork 为新会话
  │     │                title 保留原名 + 后缀"（共享）"
  │     │                写入 IndexedDB，置顶并激活
  │     │                history.replaceState("/")，跳回主界面
  │     │        失败 → 显示错误提示（链接无效）
  │     │
  │     └─ 否 → 正常启动
```

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| 分享上传失败（网络错误） | 按钮恢复，Toast 提示"分享失败，请重试" |
| 分享上传失败（Blob 错误） | 同上 |
| shareId 不存在（链接无效） | 显示"链接无效或已失效"，提供"新建会话"按钮 |
| 导入时网络失败 | 显示"加载失败，请检查网络"，提供重试按钮 |

---

## 安全

- Vercel Blob token 仅在 serverless function 中使用，不暴露给浏览器端
- 分享内容为公开读取，无需鉴权（与 Vercel Blob public access 模式一致）
- 不对单次上传体积做限制

---

## 依赖

| 包 | 用途 | 安装位置 |
|----|------|---------|
| `@vercel/blob` | Blob 读写 | serverless function |
| `nanoid` | 生成 shareId | serverless function（项目中未安装，需新增） |

---

## 路由与 Cron 配置

`vercel.json` 的 `rewrites` 无需修改，现有通配规则已覆盖 `/s/*`。需在 `vercel.json` 新增 `crons` 字段：

```json
{
  "crons": [
    {
      "path": "/api/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```

Cron Job 通过 `CRON_SECRET` 环境变量验证合法调用（Vercel 会在请求头中携带），需在 Vercel 项目的 Environment Variables 中配置。

---

## 不在此次范围内

- 分享链接主动撤回（用户手动删除）
- 单次上传体积限制
- 分享内容预览页（接收方直接 fork，无预览确认步骤）
- 用户鉴权/私有分享

# 设计：CI/CD 流水线

**日期：** 2026-05-16  
**子项目：** 2/4（生产化路线图）  
**背景：** 项目使用 Vercel 自动部署（连接 GitHub repo `yiichuan/oddeNova`，push to main 即上线），多人协作通过 PR 合并。目前 push 到 main 没有任何自动检查，坏代码可以直接进生产。Vercel Preview 已为每个 PR 提供预览 URL。

---

## 目标

- PR 合并到 main 之前，自动运行 lint + tsc + test + build 四道检查
- CI 失败时，GitHub PR 合并按钮自动灰掉，阻止坏代码进入 main
- main 分支每次有新 commit 也跑一次，保证 main 始终是绿的

---

## 方案选择

选定**方案 B**：GitHub Actions CI（lint + tsc + test + build），Vercel 保持现有自动部署不动。不需要配置 Vercel token 或 secrets。

---

## CI Workflow 设计

**文件路径：** `.github/workflows/ci.yml`

### 触发条件

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

### 执行环境

- `ubuntu-latest`
- Node.js `20`（LTS）
- 依赖缓存：`~/.npm`（`actions/setup-node` 内建 cache 支持）

### 步骤顺序

| # | 步骤 | 命令 | 失败行为 |
|---|---|---|---|
| 1 | Checkout | `actions/checkout@v4` | 停止 |
| 2 | Setup Node 20 | `actions/setup-node@v4` with `cache: 'npm'` | 停止 |
| 3 | Install deps | `npm ci` | 停止 |
| 4 | Lint | `npm run lint` | 停止，后续不跑 |
| 5 | Type check | `npx tsc --noEmit -p tsconfig.app.json` | 停止 |
| 6 | Test | `npm test` | 停止 |
| 7 | Build | `npm run build` | 停止 |

> 使用 `npm ci` 而不是 `npm install`：`ci` 严格按 `package-lock.json` 安装，速度更快，结果可重现。

### Job 名称

`ci`（简洁，在 PR status checks 里显示为 `ci`）

---

## Branch Protection 配置（手动操作，一次性）

在 GitHub → `yiichuan/oddeNova` → Settings → Branches → Add rule，针对 `main`：

| 选项 | 设置 |
|---|---|
| Require status checks to pass | ✅ 勾选，选择 `ci` job |
| Require branches to be up to date | ✅ 勾选 |
| Do not allow bypassing the above settings | ✅ 勾选（防止管理员绕过） |
| Restrict pushes | ✅ 勾选（禁止直接 push 到 main，必须走 PR） |

---

## 不做的事

- 不上传 build 产物（Vercel 在 merge 后自己 build）
- 不配 Vercel token / Secrets（方案 B 不需要）
- 不加 staging 环境（Vercel Preview 已满足）
- 不跑 E2E 测试（详见子项目 1 的设计决策）
- 不配置 Dependabot / 自动依赖更新（超出本次范围）

---

## 后续（本次不包含）

- 子项目 3：Sentry 错误监控（依赖有稳定的生产部署流程，即本子项目）
- 子项目 4：前端架构导览文档

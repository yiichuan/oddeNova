# CI/CD 流水线 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GitHub Actions 上建立 CI workflow，PR 合并到 main 前自动运行 lint + tsc + test + build，阻断坏代码进入生产。

**Architecture:** 单个 `.github/workflows/ci.yml` 文件，监听 PR 和 push to main 事件，顺序执行四道检查。Branch protection rule 在 GitHub Dashboard 手动配置一次，要求 CI job 通过才能合并。

**Tech Stack:** GitHub Actions、`actions/checkout@v4`、`actions/setup-node@v4`（含 npm cache）、Node 20。

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `.github/workflows/ci.yml` | 新建 | CI workflow：lint → tsc → test → build |

---

## Task 1：创建 CI Workflow 文件

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1：创建 workflow 目录和文件**

```bash
mkdir -p .github/workflows
```

然后创建 `.github/workflows/ci.yml`，内容如下：

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  ci:
    name: ci
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit -p tsconfig.app.json

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
```

> **注意：** job id 和 `name` 都是 `ci`，branch protection 里填的 status check 名称要与此一致。

- [ ] **Step 2：在本地验证文件格式正确（YAML 不报错）**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"
```

期望输出：`YAML OK`

- [ ] **Step 3：提交 workflow 文件**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI workflow (lint + tsc + test + build)"
```

- [ ] **Step 4：push 到远程分支，触发首次 CI 运行**

```bash
git push origin HEAD
```

然后在 GitHub → Actions tab 查看 workflow 是否出现并开始运行。

期望：在 Actions tab 看到一条正在运行或已完成的 `CI` workflow。

---

## Task 2：确认 CI 通过

- [ ] **Step 1：等待 CI 完成，确认全部步骤绿色**

在 GitHub → Actions → 最新的 `CI` run，确认以下所有 step 都是 ✅：
- Checkout
- Setup Node 20
- Install dependencies
- Lint
- Type check
- Test
- Build

如果有任何 step 失败，按错误信息修复后重新提交。常见失败原因：
- **Lint 失败**：本地运行 `npm run lint` 确认并修复
- **Type check 失败**：本地运行 `npx tsc --noEmit -p tsconfig.app.json` 确认并修复
- **Test 失败**：本地运行 `npm test` 确认并修复
- **Build 失败**：本地运行 `npm run build` 确认并修复

- [ ] **Step 2：确认 CI 全绿后，记录 status check 名称**

CI 全绿后，进入 GitHub → `yiichuan/oddeNova` → Settings → Branches → Add branch protection rule，在 "Require status checks to pass" 的搜索框里输入 `ci`，确认能搜索到这个 check name。

> 如果搜索不到，需要先有一次成功的 CI run 才会出现在列表里。

---

## Task 3：配置 Branch Protection（手动，一次性）

> 这一步在 GitHub Dashboard 操作，无需写代码。

- [ ] **Step 1：进入 Branch Protection 设置**

打开 `https://github.com/yiichuan/oddeNova/settings/branches`，点击 "Add branch protection rule"。

- [ ] **Step 2：填写规则**

| 字段 | 值 |
|---|---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ 勾选 |
| Require status checks to pass before merging | ✅ 勾选 |
| Status checks that are required | 搜索并选择 `ci` |
| Require branches to be up to date before merging | ✅ 勾选 |
| Do not allow bypassing the above settings | ✅ 勾选 |
| Restrict who can push to matching branches | ✅ 勾选（防止直接 push 到 main） |

点击 "Create" 保存。

- [ ] **Step 3：验证 Branch Protection 生效**

打开任意一个 PR（或新建一个测试 PR），确认 PR 页面底部出现 "CI / ci" status check，且在 CI 未完成时合并按钮是灰色的。

---

## 完成验证

全部完成后，验证流程：

1. 新开一个功能分支，做一个小改动（如修改注释），推送并开 PR
2. 确认 PR 页面自动触发 CI
3. CI 通过后合并按钮变为可点击
4. 合并后，在 Actions tab 确认 `push to main` 也触发了一次 CI 并通过

此后每个 PR 都有自动检查保障，直接 push 到 main 会被 branch protection 拒绝。

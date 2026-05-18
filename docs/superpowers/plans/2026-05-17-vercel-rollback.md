# Vercel 部署版本管理与回滚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次 PR 合并到 main 时自动创建 GitHub Release（含 Release Notes），使管理员能通过 Release 页快速定位目标版本，并在 Vercel 控制台完成回滚。

**Architecture:** 新增一个 GitHub Actions workflow，在 push 到 main 时自动打 tag 并创建 GitHub Release，Release Notes 由 GitHub 自动从 PR 标题生成。另新增一份 Runbook 文档说明回滚操作步骤。无需修改任何现有代码文件。

**Tech Stack:** GitHub Actions、`softprops/action-gh-release@v2`（创建 Release 的 Action）、Bash（tag 序号计算脚本）

---

## File Map

| 操作 | 文件 | 说明 |
|---|---|---|
| 新增 | `.github/workflows/release.yml` | 自动创建 GitHub Release 的 workflow |
| 新增 | `docs/runbooks/rollback.md` | 管理员回滚操作手册 |

现有文件 `.github/workflows/ci.yml` **不修改**。

---

### Task 1：创建 Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

---

- [ ] **Step 1：在 `.github/workflows/` 目录下创建 `release.yml`**

文件内容：

```yaml
name: Create Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate tag name
        id: tag
        run: |
          DATE=$(date -u +%Y-%m-%d)
          COUNT=$(git tag -l "deploy/${DATE}-*" | wc -l | tr -d ' ')
          N=$((COUNT + 1))
          echo "tag=deploy/${DATE}-${N}" >> $GITHUB_OUTPUT
          echo "name=${DATE} #${N}" >> $GITHUB_OUTPUT

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.tag.outputs.tag }}
          name: ${{ steps.tag.outputs.name }}
          generate_release_notes: true
```

**关键点说明：**
- `fetch-depth: 0`：拉取完整 git 历史，`git tag -l` 才能查到当天已有的 tag 来计算序号
- `permissions: contents: write`：创建 Release 和 Tag 的最小权限，不需要额外配置 Secrets
- `generate_release_notes: true`：GitHub 内置功能，自动把本次合并的 PR 标题聚合成 Release Notes
- 触发条件仅为 `push to main`，不影响 PR / release_preview 分支

---

- [ ] **Step 2：验证 YAML 语法**

在项目根目录运行：

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML OK"
```

预期输出：`YAML OK`（无报错即通过）

若没有 python3，可用 Node.js：

```bash
node -e "const fs=require('fs'); const y=fs.readFileSync('.github/workflows/release.yml','utf8'); console.log('lines:', y.split('\n').length, 'YAML structure OK')"
```

---

- [ ] **Step 3：验证 tag 计数脚本逻辑**

在终端模拟脚本逻辑（不实际创建 tag），确认计数正确：

```bash
DATE=$(date -u +%Y-%m-%d)
COUNT=$(git tag -l "deploy/${DATE}-*" | wc -l | tr -d ' ')
N=$((COUNT + 1))
echo "Today: $DATE"
echo "Existing tags today: $COUNT"
echo "Next tag: deploy/${DATE}-${N}"
echo "Release name: ${DATE} #${N}"
```

预期输出类似：

```
Today: 2026-05-17
Existing tags today: 0
Next tag: deploy/2026-05-17-1
Release name: 2026-05-17 #1
```

---

- [ ] **Step 4：Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add auto-release workflow on push to main"
```

---

### Task 2：创建回滚 Runbook

**Files:**
- Create: `docs/runbooks/rollback.md`

---

- [ ] **Step 1：创建 `docs/runbooks/` 目录并新建 `rollback.md`**

```bash
mkdir -p docs/runbooks
```

文件内容：

```markdown
# 生产回滚操作手册

**适用人员：** 有 Vercel Dashboard 访问权限的管理员  
**预计耗时：** 约 2 分钟  
**效果：** 无需重新构建，直接切换 Production 域名指向历史部署，约 10 秒生效

---

## 前提

- 你有 Vercel 项目的访问权限（Owner 或 Member 角色）
- 你知道哪个版本是"上一个好版本"（如果不确定，看 Release Notes）

---

## 步骤

### 第一步：在 GitHub Releases 找到目标版本

打开：`https://github.com/yiichuan/oddeNova/releases`

每个 Release 的格式为 `YYYY-MM-DD #N`，展开后可以看到"这个版本包含哪些 PR"。

找到出问题之前的那个 Release，记下它对应的 **commit SHA**（Release Notes 底部会显示 "Full Changelog" 链接，点进去可以看到 commit SHA；或者点击 Release 的 tag 名称，跳转到 GitHub Tags 页查看）。

> **示例：** 出问题的是 `2026-05-17 #3`，那目标版本就是 `2026-05-17 #2`。

### 第二步：在 Vercel 找到对应 Deployment

打开：`https://vercel.com` → 选择项目 `oddeNova` → **Deployments** 标签页

每条 Deployment 记录都显示触发它的 commit SHA（前 7 位）。找到与第一步 SHA 匹配的那条。

### 第三步：切换 Production

点击目标 Deployment 右侧的 `···` 菜单 → **Promote to Production**。

Vercel 将 Production 域名（`oddanova.com` 等）切回该 Deployment 的构建产物，约 10 秒生效。

---

## 验证

等待 10-30 秒后，访问生产域名，确认问题已消失。

在 Vercel Deployments 列表，成功的 Deployment 旁会出现 **PRODUCTION** 标签。

---

## 注意事项

- 回滚操作**不会改变 Git 代码**，main 分支仍然指向有问题的 commit
- 如需同时回滚代码，需另行创建 `git revert` PR（本手册不覆盖此步骤）
- 如果当天有多次部署（`#1`、`#2`、`#3`...），回滚到 `#N-1` 即可
```

---

- [ ] **Step 2：Commit**

```bash
git add docs/runbooks/rollback.md
git commit -m "docs: add production rollback runbook"
```

---

## 完成标志

- [ ] `.github/workflows/release.yml` 已合并到 main
- [ ] 合并后 Actions 页出现 "Create Release" workflow 运行记录
- [ ] GitHub Releases 页出现新 Release，含 PR 列表
- [ ] `docs/runbooks/rollback.md` 已合并到 main

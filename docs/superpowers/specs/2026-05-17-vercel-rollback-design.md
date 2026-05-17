# 设计：Vercel 部署版本管理与回滚

**日期：** 2026-05-17  
**背景：** 项目通过 GitHub PR 合并到 main 触发 Vercel 自动部署。出现问题时需要快速回滚到历史版本，但目前没有清晰的版本标识机制，管理员无法直观判断"应该回滚到哪个版本"。

---

## 目标

- 每次 PR 合并到 main 后，自动生成一个带版本说明的 GitHub Release
- 管理员能通过 Release 页快速定位目标版本，并在 Vercel 控制台完成回滚
- 整个流程无需额外账号权限，无需改变开发工作流

## 范围限制

- **本设计仅覆盖 Vercel 部署层回滚**，不涉及 Git 代码层（git revert）
- **回滚操作由有 Vercel 账号的管理员手动执行**，不做自动化触发
- 不引入错误率监控或自动回滚

---

## 方案：GitHub Release 自动生成

每次 push 到 main，GitHub Actions 自动：
1. 生成一个带日期序号的 tag（格式：`deploy/YYYY-MM-DD-N`）
2. 创建 GitHub Release，名称为 `YYYY-MM-DD #N`
3. 自动从本次合并的 PR 标题生成 Release Notes

### 为什么选这个方案

相比纯 Git Tag（方案 A），Release 携带"这个版本包含哪些 PR"的人类可读信息，管理员无需点进 commit 逐条查看即可判断回滚目标。相比 Deployment ID 追踪文件（方案 C），不需要 Vercel API token，也不会污染 git log。

---

## 实现

### 新增文件：`.github/workflows/release.yml`

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
          fetch-depth: 0          # 需要完整 tag 历史来计算当天序号

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

**权限说明：** `contents: write` 是创建 Release 和 Tag 的最小权限，无需额外 Secrets 配置。

**Release Notes 示例：**

```
2026-05-17 #3

What's Changed
- feat: 分享功能支持 code/messages props by @xxx in #37
- fix: 导出文件名重置问题 by @yyy in #38
```

---

### 新增文件：`docs/runbooks/rollback.md`

回滚操作手册（见下方 SOP）。

---

## 回滚 SOP

> **适用人员：** 有 Vercel Dashboard 访问权限的管理员  
> **预计耗时：** 约 2 分钟  
> **效果：** 不重新构建，直接切换 Production 域名指向，约 10 秒生效

### 步骤

**第一步：确认目标版本**

打开 GitHub → 仓库主页 → **Releases** 标签页。

找到出问题之前的那个 Release（根据 Release Notes 里的 PR 列表判断）。记下：
- Release 名称，例如 `2026-05-17 #2`
- Release Notes 底部显示的 commit SHA（前 7 位即可）

**第二步：在 Vercel 找到对应 Deployment**

打开 [Vercel Dashboard](https://vercel.com) → 选择项目 → **Deployments** 标签页。

每条 Deployment 记录都显示触发它的 commit SHA。找到与第一步 SHA 匹配的那条 Deployment。

**第三步：切换 Production**

点击目标 Deployment 右侧的 `···` 菜单 → **Promote to Production**。

Vercel 将 Production 域名切回该 Deployment 的构建产物，无需重新构建，约 10 秒生效。

### 验证

等待约 10-30 秒后，访问生产域名，确认问题已消失。

---

## 改动清单

| 文件 | 操作 |
|---|---|
| `.github/workflows/release.yml` | 新增（约 25 行） |
| `docs/runbooks/rollback.md` | 新增（SOP 文档） |

无需修改任何现有代码或配置文件。

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

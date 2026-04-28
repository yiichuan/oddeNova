# Windows 构建指南

oddeNova 支持通过 GitHub Actions 自动构建 Windows 安装包（NSIS `.exe`），无需开发者本地准备 Windows 环境。

---

## 方案概述

| 项目 | 说明 |
|------|------|
| 打包格式 | NSIS 一键安装程序（`.exe`） |
| 构建环境 | GitHub Actions `windows-latest` runner |
| 触发方式 | 推送 `v*` tag 自动触发，或在 Actions 页面手动触发 |
| 产物位置 | GitHub Actions Artifact（保留 30 天） |
| 代码签名 | 暂不支持，安装时会出现 SmartScreen 警告 |
| AirJelly | Windows 上静默禁用（功能不受影响，仅 AirJelly 集成不可用） |

---

## 如何触发构建

### 方式一：推送版本 tag（推荐）

```bash
git tag v1.0.0
git push origin v1.0.0
```

推送后，GitHub Actions 会自动开始构建。

### 方式二：手动触发

1. 打开仓库的 **Actions** 页面
2. 左侧选择 **Build Windows**
3. 点击右侧 **Run workflow**
4. 选择分支，点击绿色按钮确认

---

## 获取安装包

构建完成后：

1. 打开 **Actions** → 对应的 **Build Windows** 运行记录
2. 页面底部 **Artifacts** 区域下载 **oddeNova-Windows.zip**
3. 解压后得到 `oddeNova Setup x.x.x.exe`

> **安装提示：** 首次安装时 Windows SmartScreen 可能弹出警告，点击"更多信息" → "仍要运行"即可继续安装。这是因为安装包目前没有代码签名，属于正常现象。

---

## 本地构建（可选）

如果你在 Windows 机器上本地开发，也可以直接运行：

```bash
npm run dist:win
```

产物输出到 `release/` 目录。

**依赖：** Node.js 20+，其他依赖由 `npm ci` 自动安装。

---

## 后续扩展

### 代码签名

在 GitHub 仓库 Settings → Secrets 中配置以下变量，electron-builder 会自动签名：

```
CSC_LINK        # .p12/.pfx 证书文件（Base64 编码）
CSC_KEY_PASSWORD # 证书密码
```

### 自动发布到 GitHub Release

在 `.github/workflows/build-windows.yml` 的上传步骤替换为：

```yaml
- uses: softprops/action-gh-release@v2
  with:
    files: release/*.exe
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

这样每次推 tag 时，安装包会直接附加到对应的 GitHub Release，用户可从 Release 页面直接下载，无需访问 Actions。

### Windows ARM64 支持

修改 `package.json` 中 `build.win.target` 的 `arch`：

```json
"arch": ["x64", "arm64"]
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `.github/workflows/build-windows.yml` | GitHub Actions 工作流 |
| `package.json` → `dist:win` | 本地构建脚本 |
| `package.json` → `build.win` / `build.nsis` | electron-builder Windows 配置 |
| `electron/main.ts` → `loadAirJellyRuntime()` | AirJelly 平台判断 |
| `public/icon.ico` | Windows 安装程序图标 |
| `scripts/gen-ico.mjs` | 图标生成脚本（从 SVG logo 转换） |

# oddeNova 隐私政策页面实现方案

日期：2026-09-14

检查基线：`codex/branding`，`7b2c119`；检查开始时工作区干净。

状态：方案待实施。本次只新增本文档，不修改产品代码、不部署、不调整 Google 或 Supabase 控制台。

## 1. 目标与推荐决策

让 `https://oddenova.com/privacy` 成为可长期使用的公开隐私政策链接，供 Google Auth Platform Branding 填写，也供用户在登录前和使用过程中阅读。

推荐采用 **Vite 多页面构建中的独立静态 HTML 页面**。正文直接包含在 HTML 中，不依赖 React、登录状态、AI 服务、数据库或 JavaScript 执行。沿用现有构建和域名，不引入路由库、CMS、后端接口或数据库迁移。

首版交付包括：

1. `/privacy` 独立页面及明确的 URL 映射。
2. 中文与英文完整正文，首版用同页两个语言区块和锚点导航，避免新增语言状态与脚本依赖。
3. 首页可发现的入口、移动端入口、登录/注册弹窗入口。
4. 与实际数据流一致的隐私说明，以及发布前需要运营方补齐的信息。
5. 路由、构建、链接检查和线上人工验收清单。

本方案不把账号注销系统、分析同意管理、服务条款或首页重设计混入首版。若最终政策承诺依赖这些能力，应先补能力或调整承诺，不发布与产品不符的内容。

## 2. Google 官方要求与本项目的关系

Google 要求隐私政策公开可见、与应用主页同域、在 OAuth 页面配置链接，并要求主页提供政策入口。政策需要说明如何访问、使用、保存及分享 Google 用户数据。品牌资料与应用身份应一致。[Google 品牌验证要求](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

这意味着仅让 `/privacy` 返回 HTTP 200 不够：正文不能是工作台、登录墙或空白应用壳；首页入口也必须落实。静态 HTML 是本项目的工程选择，不是 Google 指定的技术栈要求。

Google 用户数据的使用必须与已公开的说明相符。应核对相关数据政策及实际权限，不机械复制适用于其他产品或敏感权限的声明。[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

当前 `src/services/auth-service.ts` 调用 Supabase Google OAuth，显式追加 `openid`；代码注释指出 Supabase 已请求 `email profile`。不能因为代码里只有 `openid` 就宣称不获取邮箱或资料。实施验收时应比对真实授权请求和 Google Data Access 配置。[Supabase Google 登录文档](https://supabase.com/docs/guides/auth/social-login/auth-google)

本次尝试通过网页工具读取线上 `/privacy`，工具返回 Internal Error，未获得有效响应。因此本文不把线上状态判定为 404，也未确认裸域名与 www 的实际跳转行为。缺少政策页的结论来自用户说明和本地代码检查。

## 3. 当前代码事实与内容约束

以下是本地实现证据，不能替代生产环境配置、供应商合同或保留期限的核实。

| 数据/能力 | 当前证据 | 政策需要说明的内容 |
| --- | --- | --- |
| Google 登录 | `src/services/auth-service.ts`、`src/lib/account-identity.ts`；应用身份映射读取 ID、邮箱、显示名 | Google/Supabase 用于身份认证与关联账户；基础资料范围按真实授权核对。Supabase 可能保留比前端显示更多的身份元数据，不能把 UI 未展示等同于未接收 |
| 邮箱密码登录 | `src/services/auth-service.ts` | 凭据由认证服务处理；与 Google 登录区分，不宣称整个网站完全不处理密码 |
| 账户与云端会话 | `api/sessions.ts`、`src/services/cloud-session-repository.ts`、`supabase/migrations/20260707000000_account_sessions.sql` | 账户标识/邮箱及会话消息、代码等用于保存和跨设备使用 |
| 收藏 | `supabase/migrations/20260816000000_favorites.sql`、`api/sessions.ts` | 收藏内容、关联标识等；取消收藏、删除会话与注销账号分别说明 |
| 浏览器存储 | `src/lib/session-storage.ts`、`src/lib/session-sync-storage.ts`、`src/lib/persona-storage.ts`、偏好设置模块 | 本地历史、同步工作副本/队列、偏好等使用 IndexedDB 或 localStorage；清除站点数据不等于删除服务器数据 |
| 自带 API Key | `src/lib/model-settings.ts`、`src/services/llm-config.ts` | Key 保存于当前浏览器 localStorage，并在调用相应供应商时作为凭据发送；不宣称 Key 永远不离开设备，也不宣称已加密保存 |
| AI 输入输出 | `src/services/llm.ts`、`src/services/llm-config.ts` | 生成所需指令、相关历史、代码/工具上下文发送给所选服务商；按功能解释用途 |
| 官方 AI 通道 | `api/official/v1/chat/completions.ts` | 通过 oddeNova 的 Vercel 接口转发至 DeepSeek；错误日志会记录状态、请求标识和部分上游错误信息，不宣称服务器从不留日志 |
| 自选 AI 通道 | `src/services/llm-config.ts`、`src/services/llm.ts` | 当前预设含 DeepSeek、Kimi/Moonshot、OpenAI、Anthropic、GLM/智谱；披露按选择发送，不暗示每次生成都会发给全部供应商 |
| 公开分享 | `src/services/share.ts`、`api/share.ts` | 分享载荷包含标题、代码、消息、可选修订记录、时间、语言；Vercel Blob 对象为 public，持有链接的人可读取，分享不是仅保存音频 |
| 分享清理 | `api/cleanup.ts`、`vercel.json` | 代码按超过 30 天筛选分享对象并设置每日清理任务；必须验证生产 Cron 成功执行后才能形成确定保留承诺，不写成精确第 30 天即时删除 |
| 产品分析 | `src/lib/analytics.ts`、`src/main.tsx` | PostHog 在配置 Key 且未禁用时初始化，记录受限业务事件、浏览器/设备类别及随机标识等；关闭自动捕获、会话录制，采用事件字段白名单；不能称为零跟踪或绝对匿名 |
| 访问/性能分析 | `src/App.tsx` 中的 Vercel Analytics、Speed Insights；`vercel.json` 中的 PostHog 代理 | 按生产启用情况和供应商实际处理说明访问与性能数据；PostHog 的过滤措施不自动适用于 Vercel 或托管访问日志 |

补充核对项：播放依赖的第三方采样/字体/CDN 请求及可选外部集成，按实际启用的功能说明接收网络请求信息的服务方。不可从“浏览器合成音频”推出“没有任何第三方请求”。

当前检索未发现可确认的隐私联系邮箱、自助账号注销入口或面向普通用户的分析关闭设置。PostHog 有 `oddenova_analytics_disabled` 存储键，但不能把开发者控制台操作描述为产品现有的隐私设置，也不能说该键会关闭 Vercel 分析。

## 4. 页面与路由实现

### 4.1 页面源文件

新增项目根目录 `privacy.html`，与已有 `index.html`、`presentation.html` 同级；新增 `src/legal/privacy.css`，由页面通过 stylesheet 引入并交给 Vite 处理。

`privacy.html` 直接包含完整语义正文，无 React 根节点，无 `src/main.tsx` 入口，无分析脚本，无外部字体。这样政策页本身不会初始化 Supabase、PostHog、WebAudio、会话存储或 AI 调用。托管平台仍可能产生访问日志，不能承诺访问政策页绝不产生网络元数据。

在 `vite.config.ts` 现有 `build.rollupOptions.input` 中增加：

```ts
privacy: resolve(__dirname, 'privacy.html'),
```

保留现有 `main`、`presentation` 输入和插件。构建后应生成 `dist/privacy.html` 及对应样式资源。

### 4.2 生产映射

在 `vercel.json` 的 SPA 兜底规则之前增加两条精确 rewrite：

```json
{ "source": "/privacy", "destination": "/privacy.html" },
{ "source": "/privacy/", "destination": "/privacy.html" }
```

顺序与行为约束：

- 保留 `/s/:id`、全部 API、PostHog 代理及 Cron 路由的现有行为。
- 保留最终 `/((?!api/).*) -> /index.html` 规则，不用 `/privacy*` 广泛匹配。
- `/privacy`、`/privacy/`、`/privacy.html` 均应能看到同一政策正文；以 `/privacy` 为对外标准地址。
- 若托管平台标准化尾斜线，允许一次规范化跳转后返回正文；不得出现重定向循环。
- 查询参数不能让请求回到工作台；锚点仅用于页内目录和语言导航。
- 不为此打开全站 `cleanUrls` 或 `trailingSlash` 配置，避免扩大对分享/API/其他页面的影响。

### 4.3 开发与预览一致性

Vercel rewrite 不会自动作用于 Vite。实施时在 `vite.config.ts` 增加一个小型、只处理精确政策路径的插件，在 `configureServer` 和 `configurePreviewServer` 注册相同中间件，将 `/privacy` 和 `/privacy/` 的请求路径改写为 `/privacy.html`，保留查询串后继续交给 Vite 静态文件处理。

仅处理 GET/HEAD；其他路径直接 `next()`。不要复制整个 Vercel 路由系统，也不要修改 `src/main.tsx` 的启动分支。中间件路径规则可独立导出到小工具模块，但只有测试/复用确有需要时才拆文件。

### 4.4 裸域与 www

仓库 `package.json` 与 `docs/deployment/google-auth.md` 使用 `https://www.oddenova.com`，用户指定的政策链接为 `https://oddenova.com/privacy`。

本次页面工程不自动改变主域名或 OAuth callback。上线时核对两种主机的 HTTPS 与跳转，确保用户指定的地址最终可公开读到政策。若现有裸域统一跳转 www，保持该规则并将 canonical 与最终主域保持一致；Google Branding 主页与政策 URL 尽量使用同一标准主机名，裸域政策地址继续兼容。

`oddenova.com` 是需要核对的注册域；Google 控制台 authorized domains、Supabase callback、JavaScript origins 是不同配置项，不将隐私政策 URL 填入 callback，也不为了页面新增 OAuth 权限。

## 5. 页面结构与视觉要求

采用简单长文页面，延续 oddeNova 品牌和现有颜色方向，不复用有副作用的应用壳。

- 顶部：本地品牌文字/图标、返回 oddeNova 链接、中文与 English 锚点。
- 标题：`隐私政策 / Privacy Policy`，应用名、正式生效日期、最后更新日期。
- 导读：简要说明政策涵盖登录、音乐创作、存储、分享和分析。
- 目录：链接到各章节，正文在初始 HTML 中展开，避免必须点击才能看到披露内容。
- 正文：中文完整区块与英文完整区块，分别指定 `lang="zh-CN"`、`lang="en"`；条款编号、范围和日期一致。
- 页尾：可用的隐私联系邮箱、返回首页。

建议正文最大宽度 760–820px，桌面留白 32px，手机 20px；正文 16–18px、行高约 1.75。长邮箱和 URL 可换行；320px 宽、200% 缩放可读。使用系统字体、本地资源、清晰可见的链接与键盘焦点。支持打印，隐藏非正文装饰；CSS 使用独立类或作用域，不改应用全局 token。

HTML 元数据包括 UTF-8、viewport、明确 title/description、canonical。无需把法律正文塞进 JSON-LD；不设置登录保护或主动阻止索引的规则。

## 6. 应用内入口

### 6.1 登录/注册弹窗

修改 `src/components/overlays/AccountModal.tsx`，在认证内容底部、社区邀请卡之前放置稳定可见的简短说明和“隐私政策”链接；登录、注册、重置、已登录视图均能访问。

推荐文案：`了解我们如何处理你的数据，请阅读隐私政策。` 英文同步加入 `src/lib/i18n.ts`。

使用真实 `<a href="/privacy" target="_blank" rel="noopener noreferrer">`，为新标签页行为提供可访问说明。链接不继承表单 busy 的禁用状态，不提交表单，不触发 OAuth，不改变登录模式。无需新增“已同意”复选框或宣称点击登录即同意全部处理活动。

### 6.2 首页与移动端

首页必须有可发现的直接文本入口，不能只在登录后看到。推荐在 `src/App.tsx` 的首页空状态/介绍区域增加轻量页脚链接，分别照顾桌面和手机分支，不把链接固定覆盖在编辑器或输入框上。

对已有会话的用户，再提供常驻导航入口：桌面 `src/components/nav/PrimaryNav.tsx` 的 MoreMenu 增加外链项，移动 `src/components/nav/MobileNavDrawer.tsx` 底部增加文字链接。不要把隐私政策加入 `PrimaryNavItem` 并触发工作台页面状态切换；它是独立文档。

如有抽取需要，可新增 `src/components/legal/PrivacyPolicyLink.tsx` 统一 href、外链属性和本地化名称；该组件不持有会话/认证状态。首页直接入口与菜单入口职责不同，两者都保留，不能仅依赖一个多层菜单满足首页可发现性。

从工作台打开政策使用新标签页，保留当前生成、编辑、播放与待同步状态。政策页返回首页用固定站内 `/` 链接，不读取用户提供的 return URL。

## 7. 政策正文逐章内容提纲

此节是待定稿的内容规格，不是可以未经核对直接发布的法律正文。

| 章节 | 必须解释 | 避免的错误承诺 |
| --- | --- | --- |
| 1. 适用范围与运营方 | 谁提供 oddeNova、适用站点和功能、联系渠道 | 编造公司名称、地址或邮箱 |
| 2. 收集的数据 | 登录资料、创作内容、收藏/分享、本地设置与凭据、访问/性能事件 | “只收集邮箱”“不收集任何个人信息” |
| 3. Google 用户数据 | 实际基础权限、认证用途、Supabase 保存/处理、访问撤销方式 | 虚构 Gmail/Drive/日历读取；把撤销 Google 授权等同删除账户 |
| 4. 数据用途 | 登录、安全、保存同步、生成音乐、主动分享、性能与功能改进 | 未实际实施却写已取得所有用途的同意 |
| 5. AI 服务 | 所选服务商、发送的创作上下文、官方代理与用户 Key 模式 | 声称全部 AI 本地运行，或未经合同核对承诺所有供应商不训练/不保留 |
| 6. 服务商与披露 | Supabase、Vercel/Blob、PostHog、当前模型服务商，各自目的；依法处理请求的安排 | 用“可能与合作伙伴分享”替代已明确的数据流 |
| 7. 本地存储和分析 | IndexedDB/localStorage、认证状态、随机分析标识、已实现的控制方式 | 把不录屏写成不跟踪，或把禁用 PostHog 写成关闭全部分析 |
| 8. 公开分享 | 包含消息与代码，持链接可访问；他人可能保存副本 | “只有被邀请的人能看”“删除会话会让所有分享失效” |
| 9. 保存与删除 | 本地、云端、分享、认证、日志/备份分别说明期限或确定期限的标准 | 编造统一 30 天期限、立即彻底删除所有备份 |
| 10. 用户选择与请求 | 删除会话、取消收藏、清理本地数据、撤销 Google 连接、联系运营方申请访问/删除账户数据 | 宣称已有自助注销或完整数据导出功能 |
| 11. 安全与地域 | 根据实际托管地域、处理安排和适用市场定稿；描述合理保护措施 | “绝对安全”“端到端加密”“所有数据只在本地/某国” |
| 12. 未成年人、变更、联系 | 按实际目标人群和服务地区确定适用说明；更新日期及通知方式 | 随意套用年龄门槛或声称已经通过某法规认证 |

可供定稿参考的事实句：

- “当你使用 Google 登录时，我们通过 Google 和 Supabase 完成身份认证，并使用获得的账户标识、邮箱地址和基本资料来建立和识别你的 oddeNova 账户。”应结合实际 metadata 补全资料范围。
- “当你请求生成或修改音乐时，完成该请求所需的指令、相关会话内容和代码会发送给你选择的 AI 服务。官方通道通过我们的服务器转发请求。”
- “当你创建分享链接时，该分享可能包含标题、代码、会话消息和修订记录。获得链接的人可以访问和保存这些内容。”
- “清除浏览器站点数据会移除该浏览器保存的内容和设置，但不会自动删除已同步或已分享到服务器的数据。”

如加入 Google Limited Use 声明，应核对其适用条件和实际遵循情况。不能只粘贴该声明代替完整披露，也不能让声明暗示所有创作内容都来自 Google API。

## 8. 发布前必须补齐的事实

这些信息不阻塞页面结构开发，但阻塞正式正文发布。不得把占位符部署后提交 Google 验证。

1. **运营方名称与有效联系邮箱**：可使用个人开发者真实身份，不要求虚构公司。确认邮箱能收信、有人处理；与 Branding 支持信息保持可解释的一致性。
2. **生效日期**：使用真正发布日期，不能直接把方案日期当生效日期。
3. **生产数据处理配置**：Supabase、Vercel、PostHog 实际启用情况、区域、保留规则和必要的供应商政策链接。
4. **删除请求流程**：谁受理、如何核验账户归属、怎样处理认证账户/云端会话/收藏/公开分享/日志备份；不要求用户提交 Google 密码或 API Key。未建立流程前不能承诺服务时限。
5. **公开分享清理**：检查 Cron、密钥配置、最近成功记录以及超期对象处理；明确链接删除不能召回他人副本。
6. **AI 数据处理约定**：尤其官方通道的供应商保留与训练条款；不要用供应商消费端聊天产品政策替代 API 条款。
7. **目标地区与人群**：据此确定跨境、未成年人、分析同意/退出等必要安排。若需要功能改动，另列实施任务，不以补一页文字替代。

不在方案里编造确定期限。可以按已验证的“为提供账户功能所需期间”等标准表述，但仍需明确删除渠道、例外和适用的数据类型。

## 9. 文件改动清单与实施顺序

| 顺序 | 文件 | 工作 |
| --- | --- | --- |
| 1 | `privacy.html`（新增） | 语义静态 HTML、双语正文、目录、日期、联系方式、canonical |
| 2 | `src/legal/privacy.css`（新增） | 阅读版式、手机/打印、焦点样式 |
| 3 | `vite.config.ts` | 多页面输入、开发/预览精确路径别名 |
| 4 | `vercel.json` | 增加政策路由，保留原有规则顺序和范围 |
| 5 | `src/components/legal/PrivacyPolicyLink.tsx`（按需新增） | 共用无状态链接 |
| 6 | `src/components/overlays/AccountModal.tsx`、`src/lib/i18n.ts` | 认证相关视图入口与文案 |
| 7 | `src/App.tsx` | 首页游客可见直接入口，适配两种布局 |
| 8 | `src/components/nav/PrimaryNav.tsx`、`src/components/nav/MobileNavDrawer.tsx` | 使用中的导航入口 |
| 9 | `src/lib/__tests__/vercel-api-layout.test.ts` | 更新现有完整 rewrites 数组断言；新增政策优先于兜底的回归检查 |
| 10 | 对应导航/AccountModal 测试、按需新增静态产物检查 | 验证入口与构建路由契约 |
| 11 | `docs/deployment/google-auth.md` | 补政策地址、主域核对、部署后验收及 Branding 发布步骤 |

建议以“正文事实确认 → 静态页面与路由 → 应用入口 → 检查与部署 → Google 配置”执行。独立静态页已经规避应用启动副作用，无需拆分整个应用入口或重构认证服务。

## 10. 验证计划

### 10.1 本地自动检查

本次只有文档，执行文档 diff/空白检查即可，不运行测试或构建。

实际实施后按改动风险检查：

- 定向运行 Vercel 路由与 AccountModal/导航相关测试。既有测试对 rewrite 数组做完整相等断言，新增规则时须同步更新，不能删除断言绕过失败。
- 路径中间件检查精确匹配、尾斜线、查询串、HEAD，以及 `/privacy-other`、`/api/*` 不被误改写。
- 对修改的 TS/TSX 做定向 ESLint 和应用类型检查；因改动构建输入，运行 `npm run build` 验证 `dist/privacy.html` 存在。
- 检查产物已包含完整正文与可用 CSS 引用，未引入主应用脚本或分析脚本，且无邮箱/日期占位符。不要为固定段落逐句写脆弱快照。
- 链接测试验证未登录可见、href 正确、新窗口属性、busy 时仍能访问，点击不调用登录/提交回调。
- `git diff --check`。若后续请求提交或发布，遵守项目要求运行完整检查。

遵循 `CLAUDE.md`：不自行启动开发服务器或驱动浏览器验证 UI。下面浏览器项交由开发者人工验收；如果用户明确授权变更验证方式，再按授权执行。

### 10.2 Preview / Production 验收矩阵

| 场景 | 预期 |
| --- | --- |
| 直接访问 `/privacy` 并刷新 | 最终 HTTP 200 HTML，政策标题和正文齐全 |
| `/privacy/`、`/privacy.html`、附加查询参数 | 同样显示政策，无循环跳转 |
| 禁用 JavaScript / 无痕 / 未登录 | 正文完整，不弹登录、欢迎或工作台 |
| 检查网络请求 | 政策页不加载应用、AI、音频、Supabase 或产品分析脚本；托管访问日志单独看待 |
| 生产裸域与 www | HTTPS 有效，标准主机/跳转/canonical 一致，用户指定地址可用 |
| 首页游客入口与导航入口 | 桌面、手机均可发现，文案清楚 |
| 登录、注册、重置和 busy | 链接有效，不触发认证或改变表单状态 |
| 正在生成/播放时打开政策 | 原标签页状态保留，链接操作不触发停止/切换会话 |
| 手机 320px、200% 缩放、键盘、打印 | 无水平溢出/遮挡，焦点可见，正文可读 |
| 既有 `/`、`/learn`、`/s/:id`、API 和 `/_nova` | 原功能与路由不被政策规则影响 |

Preview 可保持原有部署保护；提交 Google 的 Production 链接必须公开。构建成功或 Preview 截图不能替代 Production URL 验证。

## 11. 部署与 Google Auth Platform 操作

1. 完成正文事实补齐、实现与检查后部署；本方案阶段不执行部署。
2. 验证 Production 政策正文、首页入口、重定向和公开可达性，记录正式日期与部署版本。
3. 在正确的生产 Google 项目的 Branding 页面填写应用名、主页、隐私政策 URL、支持邮箱及域名。按已核实的主域填写，保持 `https://oddenova.com/privacy` 可访问。
4. 核对 Data Access 与实际登录请求相符；不为展示政策新增权限，不改 Supabase callback。
5. 按控制台实际流程验证并发布品牌资料；保存草稿不等于更新已发布品牌。品牌验证与敏感/受限权限审核不是同一个步骤。[Google 品牌验证流程](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
6. 在真实 OAuth 流程中确认政策链接指向最终正文；记录验证结果，不承诺 Google 审核一定通过。

如果页面上线后出现问题，优先修复正文资源/路由，维持政策 URL 连续可访问。删除页面或回滚到工作台兜底会使已提交链接失效；只有页面和 Branding 配置均妥善处理后才考虑撤回。

## 12. 完成定义

- 用户指定 URL 在生产环境公开可读，初始 HTML 有完整政策正文。
- 首页、导航、认证流程均有合理入口，桌面与手机可使用。
- 正文与已核实的数据处理行为一致，运营方/邮箱/日期没有占位符。
- 分享内容、AI 服务、分析、本地/云端删除边界解释清楚。
- 路由与构建检查通过，人工验收缺口明确记录。
- 部署成功与 Google 品牌验证结果分别记录，不混为一谈。

本次完成的是详细方案；以上产品实现、生产验证、运营事实确认与 Google 控制台操作均未执行。

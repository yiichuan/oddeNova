# oddeNova Strudel Bridge 架构与运行流程

**面向：** 维护 `oddenova-strudel` skill、本地 Bridge 和浏览器同步逻辑的开发者  
**目标：** 说明当前 v3 Bridge 如何绑定作品、页面和会话，以及标签页接管、页面反向同步、outbox 和冲突处理的实际语义  
**更新：** 2026-09-21

---

## 一句话概括

`oddenova-strudel` 不直接操纵浏览器编辑器。它把完整作品提交给运行在 `127.0.0.1` 的本地 helper；一个经过配对并持有 receiver lease 的 oddeNova 页面通过长轮询收取更新，并把页面内的编辑反向写回 helper。

系统保证的是“同一作品只有一个有效接收端”，而不是“浏览器物理上只能打开一个标签页”。

---

## 组件与职责

```text
Codex / 其他支持 skill 的宿主
  │
  │ 调用 open-in-oddenova.mjs
  ▼
本地 Bridge helper（127.0.0.1）
  ├─ 保存项目快照、revision、消息和配对凭据
  ├─ 接收 skill 提交
  ├─ 向页面提供长轮询
  ├─ 接收页面反向修改
  └─ 维护项目级 receiver lease
  │
  │ loopback HTTP + 配对凭据
  ▼
oddeNova 浏览器页面
  ├─ 将 Bridge 绑定到精确的本地 session
  ├─ 应用 skill 快照
  ├─ 确认 CodeMirror 实际内容
  ├─ 将页面改动写入本地 outbox
  └─ 把页面改动发送回 helper
```

核心文件：

| 文件 | 职责 |
|---|---|
| [`skills/oddenova-strudel/SKILL.md`](../skills/oddenova-strudel/SKILL.md) | skill 对作品身份、pull、恢复和提交结果的行为约束 |
| [`skills/oddenova-strudel/scripts/open-in-oddenova.mjs`](../skills/oddenova-strudel/scripts/open-in-oddenova.mjs) | CLI、helper 生命周期、提交、pull、reopen 和浏览器入口 |
| [`skills/oddenova-strudel/scripts/bridge-service.mjs`](../skills/oddenova-strudel/scripts/bridge-service.mjs) | 本地 HTTP 服务、配对、lease、长轮询和读屏障 |
| [`skills/oddenova-strudel/scripts/bridge-core.mjs`](../skills/oddenova-strudel/scripts/bridge-core.mjs) | revision、幂等、快照合并和冲突规则 |
| [`src/hooks/useOddeNovaBridge.ts`](../src/hooks/useOddeNovaBridge.ts) | 浏览器端连接、会话绑定、应用快照、反向同步和恢复 |
| [`src/lib/oddenova-bridge.ts`](../src/lib/oddenova-bridge.ts) | Bridge 类型、身份归一化、bootstrap 和连接解析 |
| [`src/lib/oddenova-bridge-receiver-lock.ts`](../src/lib/oddenova-bridge-receiver-lock.ts) | 同一 binding 的跨标签页独占接收锁 |
| [`src/lib/session-storage.ts`](../src/lib/session-storage.ts) | session、checkpoint 和 outbox 的原子持久化及重绑迁移 |
| [`src/hooks/useSessions.ts`](../src/hooks/useSessions.ts) | 将持久化的 Bridge 重绑结果发布到 React 会话状态 |

---

## 身份模型

| 字段 | 表示什么 | 生命周期 |
|---|---|---|
| `ownerKey` | 当前浏览器数据所属的访客或账户 | 随账户身份变化 |
| `baseUrl` | 目标 oddeNova 站点 | 一个部署环境内稳定 |
| `projectId` | skill 侧的一件音乐作品 | 同一作品持续复用 |
| `turnId` | 一次创作请求 | 每个新创作回合生成一个；精确重试复用 |
| `sessionId` | oddeNova 内部承载作品的本地会话 | 作品绑定后长期稳定 |
| `bindingId` | 当前一代页面配对关系 | 每次重新配对都会旋转 |
| `pageToken` | 页面访问本地 helper 的凭据 | 每次重新配对都会旋转 |
| `clientId` | 当前接收页面实例的标识 | 页面配对时生成随机 UUID |
| `changeId` | 一次页面反向修改 | 每项页面修改一个；精确重试复用 |
| `revision` | 项目总版本 | skill 或页面内容变化都可前进 |
| `skillRevision` | skill 提交版本 | 只有 skill 接受新提交时前进 |

主要层级可以理解为：

```text
ownerKey
  └─ baseUrl + projectId
       └─ sessionId
            └─ bindingId + pageToken
                 └─ clientId
```

其中 `projectId` 标识作品，`sessionId` 标识 oddeNova 里的承载位置，`bindingId` 标识当前配对代次，`clientId` 标识当前接收页面。

---

## 新作品流程

每个新的宿主对话默认创建新的 `projectId`。不能因为 helper 缓存或浏览器中存在一个旧项目，就自动把新对话绑定到旧作品。

```text
新创作请求
  ↓
生成新的 projectId 和 turnId
  ↓
提交完整 title、code 和本轮 messages
  ↓
helper 保存 revision 1
  ↓
如果项目尚未配对且从未打开入口，生成一次 bootstrap URL
  ↓
系统浏览器打开配对入口
  ↓
页面校验 origin 和 pairingToken
  ↓
helper 返回 pageToken、bindingId、pairingKind=initial
  ↓
页面生成 clientId，绑定精确 sessionId
  ↓
页面开始长轮询并取得 receiver lease
```

正常提交只在首次配对时打开入口。已有有效配对时，后续提交只进入 helper 缓存并唤醒已连接页面，不打开或强制前置浏览器标签页。

---

## 已有作品续作流程

继续一个已明确识别的作品前，skill 必须先执行：

```sh
printf '%s\n' '{"projectId":"example-project"}' \
  | node skills/oddenova-strudel/scripts/open-in-oddenova.mjs \
      --pull --auto-reconnect
```

### 页面在线

```text
skill 发起 /v3/read
  ↓
helper 创建 read request 并唤醒页面 poll
  ↓
页面停止接受不完整的读取结论
  ↓
页面刷新 session、编辑器和 outbox
  ↓
页面确认精确绑定 session 已激活
  ↓
页面确认 CodeMirror 实际文档等于快照代码
  ↓
页面发送 read-response: ready
  ↓
helper 返回 status=ready、freshness=page_confirmed
```

只有 `ready/page_confirmed` 才表示 skill 拿到了当前页面状态。以下状态都不能替代它：

- helper 中的缓存快照；
- HTTP 成功；
- 页面曾经 ack；
- `paired=true`；
- `pageConnected=true`；
- 浏览器启动命令成功；
- 编辑器尚未直接核对的 React/session 状态。

### 页面离线

普通 `--pull` 是只读诊断，不会打开浏览器。`--pull --auto-reconnect` 在第一次得到 `page_unavailable` 后会：

1. 对同一 `projectId` 调用一次 `/v3/reopen`；
2. 打开一次新的配对入口；
3. 每秒重新读取一次；
4. 最多等待 30 秒；
5. 只在最终得到 `ready/page_confirmed` 时继续。

遇到 `busy`、`upgrade_required`、超时或 helper 错误时停止。不能反复 reopen，也不能静默退回 cached 内容或旧版 URL 导入。

---

## 重新配对与精确会话重绑

重新配对不是创建一个新作品会话，而是把旧配对代次精确迁移到新代次。

helper 在 `/v3/pair` 响应中返回：

```ts
{
  pageToken: "new-page-token",
  bindingId: "new-binding-id",
  previousBindingId: "old-binding-id",
  pairingKind: "rebind"
}
```

新页面必须先使用 `previousBindingId` 定位精确旧状态，然后在一个持久化事务中迁移：

- 原 `sessionId` 对应的 session；
- Bridge checkpoint；
- 未发送的 outbox；
- session 外部来源中的 `bindingId`；
- outbox payload 中的 `bindingId` 和 `clientId`。

迁移提交后，React 才发布新绑定，页面随后开始 poll。不得按时间戳、标题、最近使用顺序或“唯一候选项目”猜测目标 session。

### 两阶段校验与单一权威事务

重绑的所有权威读取和所有写入都位于同一个覆盖 `sessions_by_owner`、`oddenova_bridge_checkpoints`、`oddenova_bridge_outbox` 的 `readwrite` 事务中。WebCrypto 内容哈希校验不能在事务内 await（浏览器可能在等待非 IndexedDB Promise 时自动结束事务），因此校验分为两个阶段：

1. **预验证阶段**（事务外）：读取候选 previous/target checkpoint，仅用于执行 WebCrypto 哈希校验和规范化校验，得到经过验证的候选副本。预验证结果不是权威读取，不作为写入依据。
2. **权威事务阶段**：开启单一 `readwrite` 事务，从事务内的 object store 重新读取 previous/target checkpoint、owner-scoped session，以及 previous/target binding 的 outbox（`getAll()` 后按完整 identity 过滤）。事务内将重新读取的 checkpoint 与预验证候选做精确内容比较：

```text
记录与预验证候选不同
  ↓ 第一次
abort 事务 → 重新执行一次完整预验证 → 重试
  ↓ 第二次仍变化
recovery-required，零写入
```

写入只使用事务内重新读取并通过复核的数据；写入顺序固定为：写 session、写新 checkpoint、删除旧 checkpoint、删除并迁移旧 binding outbox，`await tx.done` 之后才向 React 发布结果。任何读取、校验或写入失败都 abort，不提交部分数据。

### 旧 generation 不得复活

重绑提交后，旧 binding 的 checkpoint 已被删除。两条防御保证旧页面的迟来写入不会重建旧 generation：

- **outbox generation guard**：v3 outbox 写入（`generationGuard`）与 checkpoint 读取在同一事务完成。目标 binding 的 checkpoint 不存在或身份不一致时，旧页面的排队写入被拒绝，不会产生孤儿记录；guard 之前的合法旧写入会在重绑事务内被读取并迁移。
- **checkpoint 存在性约束**：`commitBridgeSessionState()` 区分 `initial`（首次创建 checkpoint）与 `update`（必须已存在）。checkpoint 行已消失时，`update` 提交失败关闭；`initial` 同时检查当前 session 和同作品其他 binding 的 checkpoint，拒绝重建已迁移的旧代次。首次创建路径必须显式标记 `initial`，不能靠“checkpoint 不存在”自动猜测。
- **幂等重绑校验**：previous checkpoint 已消失、target checkpoint 已存在时，target session 的 revision、skillRevision 和 contentHash 仍须与 checkpoint 完全一致，不能只凭 binding 身份接受重试。

memory fallback 不共享跨标签页状态，但同一事件循环内的异步哈希仍可能让调用交错：异步候选验证完成后重新从 maps 读取权威值，随后的同步 prepare 与写入之间没有任何 `await`，形成不可分割临界区；异常后全量回滚，保持与 IndexedDB 路径等价的幂等与冲突语义。

如果旧 checkpoint、旧 session、owner、project identity 或内容哈希不一致，重绑必须失败关闭：

```text
pair 成功
  ↓
精确重绑失败
  ↓
新页面调用 disconnect 释放刚生成的绑定
  ↓
状态进入 recovery-required
```

重新配对会旋转 `pageToken` 和 `bindingId`，并删除旧 lease。旧页面下一次请求会因凭据或 binding 不匹配得到 401，随后清除本地连接；它不会被自动关闭。

---

## Receiver 所有权与多个标签页

### 两层所有权

页面在开始 poll 前先通过 Web Locks API 取得按 `baseUrl + projectId + bindingId` 命名的浏览器独占锁。只有锁持有者可以进入接收循环、观察页面修改并写入 outbox；没有取得锁的页面立即进入 `occupied`，不会向 helper 发起 poll。

锁名包含 `bindingId`。同一 binding 的复制页互斥，显式重配对产生的新 binding 则可以独立启动，并由新的凭据轮换让旧页面失效。页面关闭或 Bridge effect 清理时，浏览器自动释放锁。

若浏览器不支持 Web Locks，页面以 `recovery-required` 失败关闭，不会退回到可能产生双接收端的路径。

浏览器锁之后还有 helper lease。helper 以归一化后的 `baseUrl + projectId` 为键，只保存一个当前接收者：

```ts
{
  clientId,
  expiresAt: Date.now() + 35_000
}
```

页面每次调用 `/v3/poll` 都会把同一 `clientId` 的 lease 延长 35 秒。长轮询通常在 lease 到期前返回，页面立即开始下一次 poll，因此连接正常时 lease 会持续续期。

页面关闭、崩溃、休眠或 Bridge 循环停止后，最后一次 lease 到期，helper 才把页面视为离线。这是对短暂请求切换和网络波动的容忍窗口，不是重新配对。

### 多标签页结果

| 情况 | 结果 |
|---|---|
| 普通手动打开新 oddeNova 标签页 | 没有 Bridge `sessionStorage`，不参与同步 |
| 新标签页对同一项目重新配对 | 新页旋转凭据并接管，旧页失效 |
| 同一项目、有效凭据但不同 `clientId` | lease 持有者继续；竞争者得到 409 `occupied` |
| 不同 `projectId` | 各自拥有独立 lease，可以同时工作 |
| 复制已配对标签页 | 原页面保留浏览器独占锁；复制页进入 `occupied`，不 poll、不写 outbox |

### 复制已配对标签页

部分浏览器在“复制标签页”时会复制原标签页的 `sessionStorage`。两个页面可能因此拥有相同的 `pageToken`、`bindingId` 和 `clientId`。

helper lease 无法仅凭相同的 `clientId` 区分这两个页面，因此浏览器独占锁必须先于 helper lease。两个页面竞争同一 binding 锁时，只有一个页面能运行 poll、ack、page-change 和 read-response；另一个页面停在 `occupied`。这条约束也覆盖页面改动入 outbox，避免未持锁的复制页把本地编辑交给原页面发送。

---

## 页面修改代码时发生什么

页面对精确绑定 session 的标题、代码或创作消息发生变化时，会走反向同步：

```text
页面内容变化
  ↓
检测 page signature 与 baseline 不同
  ↓
确认当前标签页持有 binding 独占锁
  ↓
生成 changeId 和 page-change payload
  ↓
先写入浏览器 IndexedDB outbox
  ↓
确认当前页面持有 receiver lease
  ↓
POST /v3/page-change
  ↓
helper 验证 origin、pageToken、bindingId、clientId 和 lease
  ↓
helper 合并修改并返回完整 snapshot
  ↓
页面将 snapshot 应用到精确 session
  ↓
在持久化成功后删除对应 outbox
```

初次检测到页面变化时会进行一个短暂聚合，连续变化可以更快排队。页面切入后台时也会尝试把最新状态加入 outbox。

页面修改可以推进 `revision`，但不会推进 `skillRevision`。

### pending local message delta（import 窗口内的本地消息保护）

新 skill snapshot 到达时，页面会先尝试 flush 本地变更再 import。但 flush 只读取一次页面状态——flush 之后、真正 import 之前完成的本地创作消息可能不在本次 canonical snapshot 中。直接用 canonical 覆盖 session 会丢失这部分消息及其 `code`、`revisionId`、`inputMode` 等富字段。

关闭这个窗口的流程：

```text
poll / recovery / 新 skill 入口收到 snapshot
  ↓
若页面 busy：保持 queued，等待生成/回放结束
  ↓
busy 结束后重新读取 localSequence 与精确绑定页面，再执行一次 flushPageChanges
  ↓
若本轮实际发送了 page-change，优先使用其响应 snapshot 继续 import
（它已包含 helper 当前 skill revision 与成功合并的页面消息）
  ↓
localSequence 在 flush 中继续推进 → 重新循环读取并 flush；页面持续变化时保持 queued
  ↓
import 前用精确绑定的 resolvePage 重新读取页面，
按 baseline 计算消息差集（upsertMessages / deleteMessageIds），
连同捕获时的 localSequence 一起放入 import context
  ↓
mergeBridgeMessages 在 canonical 之上叠加 pending delta
  ↓
importer 返回 hasPendingLocalMessages 时：
canonical 持久化完成后，显式重新入队最新页面状态，
abort 当前 poll 让发送循环尽快处理 outbox
```

消息合并的显式规则：

- canonical 消息的 ID、顺序、role、content 由 snapshot 决定；
- pending delete 移除对应 canonical 消息；pending upsert 替换同 ID 投影，canonical 中没有的 pending 新消息按本地相对位置插入；
- 未列入 pending delta、又不在 canonical 中的旧创作消息不复活（canonical 已确认删除的 tombstone 保持删除）；
- pending upsert 优先复用本地完整 `ChatMessage`（保留富字段），找不到本地对象时才从 page-change 投影构造四字段消息；
- importer 落盘期间又完成的消息在发布会话前从最新本地工作副本再次合并并落盘；结束 import 后重新读取页面，发现仍有差异就立即排入 outbox；
- pending 操作若已被本次 canonical 表达（同内容 upsert 或已删除的消息），不再标记为待回传；
- progress 等网页局部消息按最近一个仍然存活的创作消息锚定，锚点被删除则一并移除，progress 不会发送给 helper；
- 合并后过滤已失去消息引用的 revision。

两条边界必须同时成立：

1. pending delta 只描述创作消息，不把本地标题/代码带入 import——新 skill snapshot 的 title/code 仍然覆盖页面（skill 优先规则不变）。
2. “当前 snapshot 不含某条本地消息”不能被解释为用户删除；删除只来自显式 pending delete 或 canonical tombstone。

`read-response`/ack 中报告的 `completedLocalSequence` 只统计已经由 page-change 进入 helper canonical 的 sequence；import 窗口内尚未回传的本地消息不得让更晚的 sequence 冒充完成。

---

## 本地 outbox

outbox 是浏览器内“已经产生、但尚未被 helper 确认并完成本地落盘”的页面改动队列。

典型记录：

```ts
{
  ownerKey,
  projectKey,       // normalized baseUrl + projectId
  bindingId,
  changeId,
  payload: {
    baseRevision,
    baseSkillRevision,
    title?,
    code?,
    upsertMessages,
    deleteMessageIds
  },
  createdAt
}
```

### 为什么先写 outbox

- 页面刷新或短暂断线时不丢待发送改动；
- HTTP 结果不确定时可以用同一 `changeId` 精确重试；
- helper 返回的规范化 snapshot 成功持久化后才删除队列项；
- 重新配对时可以把旧 `bindingId` 的队列原子迁移到新绑定。

同一个 `changeId` 加同一内容是幂等重试；同一个 `changeId` 被用于不同内容时，helper 会拒绝。

### 持久化边界

正常情况下 outbox 位于浏览器 IndexedDB。若 IndexedDB 不可用，存储层会退化到内存；此时页面关闭或刷新后，未发送改动不具备持久恢复保证。

不要混淆以下三个存储位置：

| 数据 | 位置 | 作用 |
|---|---|---|
| oddeNova session | 浏览器 IndexedDB | 保存作品、消息和代码 |
| Bridge outbox/checkpoint | 浏览器 IndexedDB | 保存页面待发送改动和已确认基线 |
| helper 项目缓存 | 本机 helper 缓存目录 | skill 与页面之间的权威交换状态 |

---

## 并发与冲突规则

### 页面改动基于当前 skill 版本

当 `page-change.baseSkillRevision === helper.skillRevision` 时：

- 页面标题和代码可以更新 helper 快照；
- 新增、修改和删除的创作消息会合并；
- 内容变化时 `revision` 前进；
- `skillRevision` 保持不变。

### skill 已经提交更新版本

当页面提交到达时，如果：

```text
page-change.baseSkillRevision < helper.skillRevision
```

页面的标题和代码被视为 stale content，不能覆盖较新的 skill 版本；但使用稳定消息 ID 表达的消息 upsert 和 tombstone 删除仍可以合并。

规则可以概括为：

```text
并发时：
  skill 的标题和代码胜出
  双方新增的创作消息尽量保留
```

页面的 `baseSkillRevision` 若反而领先于 helper，说明双方状态不可能合法对应，helper 返回 409。

---

## `page_confirmed` 的严格含义

`page_confirmed` 不只是“页面回了一个成功响应”。对于新的 skill 版本，浏览器必须完成：

1. 解析并验证快照身份和内容哈希；
2. 定位精确绑定的 `sessionId`；
3. 将完整快照持久化到该 session；
4. 保存用户当前正在查看的其他 session 草稿；
5. 切换到绑定 session；
6. 停止旧播放；
7. 把新代码写入编辑器，但不自动播放；
8. 等待浏览器绘制；
9. 直接读取 CodeMirror 的实际文档；
10. 确认 visible session、binding 和代码完全匹配；
11. 原子标记 editor presentation 已确认；
12. 才能回复 read request 为 `ready`。

普通同代 revision 更新、outbox 恢复和页面反向同步不得借此抢占浏览器前台；只有新的 skill 版本需要确保精确绑定 session 和编辑器已经实际呈现。

---

## 常见状态与处理

| 状态 | 含义 | 调用方行为 |
|---|---|---|
| `ready/page_confirmed` | 页面已刷新、落盘并直接确认编辑器 | 可以继续创作 |
| `not_found` | helper 中没有该精确项目 | 不得改用其他缓存项目；由用户决定目标 |
| `page_unavailable/cached` | 没有有效页面 lease | cached 仅供识别，不能覆盖页面 |
| `busy` | 页面正在生成、回放、导出或无法完成读屏障 | 停止本轮，不从缓存继续 |
| `occupied` / HTTP 409 | 另一个标签页持有同一 binding 锁，或另一个 `clientId` 持有 helper lease | 当前页面停止 Bridge 循环 |
| HTTP 401 | pageToken、binding 或 lease 身份失效 | 清除连接，要求显式恢复 |
| `recovery-required` | 精确会话、checkpoint 或 binding 无法安全对应 | 停止同步，禁止猜测目标 |
| `upgrade_required` | 已运行 helper 不支持当前协议 | 停止并升级 helper |

---

## 管理命令语义

所有管理命令从 stdin 接收最小身份对象：

```json
{"projectId":"example-project"}
```

非生产站点额外传入 `--base-url`。

| 命令 | 行为 |
|---|---|
| `--status` | 读取 helper 缓存状态、配对状态、lease 和最后 ack |
| `--pull` | 发起只读 read barrier；不打开浏览器 |
| `--pull --auto-reconnect` | 仅在 `page_unavailable` 后 reopen 一次并等待确认 |
| `--retry` | 重试 helper 中最新 pending 快照，不增加创作消息 |
| `--reopen` | 显式创建一次新的配对入口 |
| `--stop` | 停止 helper，保留项目缓存 |
| `--clear` | 只清除指定项目的 helper 缓存 |
| `--link` | 用户明确要求时使用 legacy v1 URL 流程 |

`Saved revision` 只表示 helper 已保存或排队，不表示页面已经应用。判断最终应用必须结合 matching ack、无 pending，以及必要时的 `ready/page_confirmed` pull。

---

## 维护时必须保持的约束

- 新宿主对话默认生成新的 `projectId`；不得从缓存猜测旧项目。
- 同一作品续作复用 `projectId`，每个新创作请求使用新的 `turnId`。
- 页面重新配对必须使用明确的 `previousBindingId` 精确重绑。
- session、checkpoint 和 outbox 的重绑迁移必须原子完成；WebCrypto 校验在事务外完成，写入依据来自单一 readwrite 事务内的权威复核。
- v3 outbox 写入必须经过 checkpoint generation guard；旧 binding 的 checkpoint 消失后，旧页面的排队写入与 `update` 型 session 提交都必须失败关闭。
- import 窗口内完成的本地创作消息不得被 canonical 覆盖丢失，也不得让 canonical tombstone 复活。
- 页面反向修改只能由 binding 独占锁持有者进入 outbox，并由当前 helper lease 持有者发送。
- skill 的较新标题和代码不能被基于旧 `skillRevision` 的页面修改覆盖。
- `cached`、ack、持久化成功或浏览器打开都不能冒充 `page_confirmed`。
- 新版本应用时停止旧播放，但不自动播放新版本。
- 普通更新不强制浏览器前置。
- 任何身份含糊、候选会话不唯一或 checkpoint 不一致都必须失败关闭。

---

## 验证边界

单元和集成测试可以覆盖：

- 首次配对与重配对凭据旋转；
- 旧页面凭据失效；
- 不同 `clientId` 的 lease 竞争；
- 相同 `clientId`、`bindingId` 的复制页只能有一个进入 poll；
- auto-reconnect 只 reopen 一次；
- 精确 session/checkpoint/outbox 重绑；
- page-change 幂等与 stale skill revision 合并；
- CodeMirror 确认之前不发送 `page_confirmed`。

但以下项目仍需要真实浏览器验收：

- 浏览器的本地网络权限；
- 系统 `open` 最终新建还是复用标签页；
- 浏览器“复制标签页”对 `sessionStorage` 的实际行为；
- Web Locks 在复制页关闭、刷新和崩溃后的实际交接；
- CodeMirror 挂载、绘制和焦点体验；
- IndexedDB 在刷新、崩溃和浏览器回收后的恢复；
- WebAudio 是否确实停止旧播放且没有自动播放新版本。

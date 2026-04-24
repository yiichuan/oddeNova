AirJelly 能帮你做什么？
🧠 记住你做过的一切
AirJelly 会在后台悄悄记录你的工作过程。不是简单的"你打开过什么 App"，它能理解你在做什么事——比如"你在调试一个支付接口的 CORS 问题"，或者"你和设计团队开了一个评审会，讨论了新版首页的改版方向"。
它把记忆分成 6 种类型，让你检索的时候更精准：
- event（事件）：你做了什么事，比如"周二下午和 Tom 开了需求对齐会"
- case（案例）：你遇到了什么问题、怎么解决的，比如"Nginx 502 排查过程"
- procedure（流程）：你怎么一步步完成某件事，比如"线上发布的操作步骤"
- preference（偏好）：你的工作习惯和个人风格，比如"喜欢用 Bun 而不是 npm"
- entity（实体）：出现过的人、项目、产品，比如"小王是设计师，负责移动端"
- profile（档案）：关于你是谁、你做什么的基本信息
你可以直接问 AirJelly："上次那个数据库连接的问题是怎么解决的？"——它会帮你找出来，而不是让你去翻聊天记录或者笔记
✅ 帮你管理任务
AirJelly 会根据你的工作行为，自动识别出你在推进哪些事情，并整理成任务。它能记住每个任务的进展、你上次做到哪一步了、下一步应该干什么。
当然你也可以手动创建任务，给它设置截止时间、标记重要程度、暂时"搁一搁"（snooze）
知道你使用时长
每天用了多少时间在写代码、多少时间在刷飞书、多少时间在开会——AirJelly 都帮你记着呢。你可以随时查今天、这周、上个月的 App 使用情况，找出自己的效率规律。
🔔 提醒
AirJelly 可以给你发提醒。如果收到了提醒但现在不方便处理，可以延后一段时间再弹出，或者直接关掉。

黑客松Use Case
- 桌面执行
用户说"帮我整理今天的文件"，但没说具体是哪些。执行前先调用 getEventsByDate 拉取近两小时的事件记忆，从 keywords 和 entities 字段里找出用户刚操作过的文件名和项目名，Agent 自己推断出要处理的对象，不需要用户重复交代。对于进行中的任务，用 getTaskMemories 拉出该任务的完整历史事件，续做时直接接上之前的进度。
- 情感陪伴 Agent
Agent 需要主动感知用户状态，但不能打扰用户。定时调用 getEventsByDate 拉取当天事件，累加工作类应用的 duration_seconds，超过阈值就触发问候；再用 getOpenTasks 看任务积压数量，结合 scheduler_state 判断是否处于高压期。两个信号叠加，Agent 知道"现在该说点什么"
- AI阅读
用户第一次打开应用时，调用 getEventsByDate 拉取过去 30 天的浏览器和 PDF 阅读器事件，从 title、keywords、entities 字段还原阅读历史，省去手动录入。之后用户读新内容时，在本地对历史事件做关键词匹配，自动在侧边栏显示"你 X 天前读过相关内容"，跨会话记忆从第一天就有。CLI 用法：airjelly memory search <关键词> --hours 720 --json，把结果直接喂给应用初始化
- 多智能体编排平台
平台启动时用 airjelly status 确认 AirJelly 在线。调用 getOpenTasks 把当前所有 open 任务作为待处理队列，按 l1_scene 字段分发给对应专项 Agent。某个 Agent 接到任务后，再调用 getTask 读进度摘要和下一步计划、getTaskMemories 读历史事件，开工前先把上下文摸清楚

---
怎么使用？
AirJelly 有三种用法，你可以按喜好选择，也可以混着用。

用法一：直接和它说话（最简单）
打开 AirJelly 的对话窗口，用中文或英文随便聊就行。不需要什么特殊格式，就像给朋友发消息一样：
"帮我总结一下今天干了什么""上周五那个接口超时的问题，后来怎么解决的？""我现在有哪些事情没做完？""帮我创建一个任务，下周三之前写完 API 文档"
AirJelly 知道你的上下文，不需要你每次都解释背景。

用法二：用命令行
如果你喜欢在终端里工作，或者想把 AirJelly 的数据接入脚本、管道，可以用 CLI。
安装
# 推荐用 bun（比 npm 快很多）
bun add -g @airjelly/cli

# 用 npm 也可以
npm install -g @airjelly/cli

装完之后，先确认 AirJelly 桌面端在运行：
airjelly status
# ✓ AirJelly v0.1.0 is running.
如果提示连接不上，说明 AirJelly Desktop 没开，先把它打开就好。
记忆相关命令
- 搜索记忆 ——用自然语言找你做过的事
airjelly memory search "上周的接口设计讨论"
airjelly memory search "TypeScript 报错" --types case --limit 5
--types 可以限定你要找的记忆类型（event 事件、case 案例、procedure 流程、preference 偏好、entity 人物实体、profile 档案），不填就是全搜。
--limit 控制返回多少条，默认 10 条，最多 30 条。
注意：搜索会用到 AI embedding，会消耗 credit。如果只是想按时间浏览，用下面的 memory list 更划算。
- 列出记忆 ——按时间顺序浏览，不消耗 credit
airjelly memory list                                     # 列出所有记忆
airjelly memory list --types event --limit 20            # 只看事件类型
airjelly memory list --app "VS Code" --since 2026-04-01T00:00:00   # 只看 VS Code 里发生的
--since 和 --until 用来过滤时间范围，格式是 2026-04-23T10:00:00 这样的。
- 查看最近的活动 ——快速回顾刚才都干了啥
airjelly memory events             # 过去 24 小时
airjelly memory events --hours 8   # 只看最近 8 小时
- 获取单条记忆详情
airjelly memory get mem_abc123
ID 是 mem_ 开头的字符串，从 memory list 或 memory search 的结果里可以拿到。
- 查看 AirJelly 认识的人
```bash
airjelly memory persons            # 列出所有人物
airjelly memory entity mem_abc123  # 看某个人参与的所有事件
人物实体本质上也是一条 memory 记录，ID 同样以 mem_ 开头，从 memory persons 的输出里拿。
AirJelly 会自动从你的工作记录里识别出出现过的人，比如经常一起开会的同事、合作过的外部伙伴。
任务相关命令
- 看看有哪些任务
airjelly task list                          # 全部任务
airjelly task open                          # 只看进行中的
airjelly task list --status completed       # 只看已完成的
- 查看某个任务的详情
airjelly task get task_abc123
ID 可以从 airjelly task list / airjelly task open 的输出里拿到。
- 查看任务关联的记忆
airjelly task memories task_abc123
这个命令会把和这个任务相关的所有记忆都列出来——比如你在做这个任务期间写的代码、开的会、遇到的问题，全都串在一起。
- 创建新任务
airjelly task create "写完 API 文档"
airjelly task create "上线 v2.0" \
  --description "把新版本推到生产环境" \
  --scene build \
  --due 2026-05-01T18:00:00
--scene 是任务的场景分类，可选：build（开发构建）、connect（沟通协作）、explore（探索调研）、sustain（维护运营）。
--due 是截止时间，格式同上。
注意：创建任务同样会消耗 embedding credit。
- 更新任务
# 改标题
airjelly task update task_abc123 --title "新标题"

# 更新进展描述
airjelly task update task_abc123 --progress "鉴权模块已完成，剩余数据层"

# 添加下一步行动（可以加多个）
airjelly task update task_abc123 \
  --next-step "写单元测试" \
  --next-step "更新文档"

# 改截止时间
airjelly task update task_abc123 --due 2026-06-01T00:00:00
至少要传一个字段，不然会报错。
- 完成 / 重开任务
airjelly task complete task_abc123   # 标记为完成
airjelly task reopen task_abc123     # 重新打开（完成了又有新进展时用）
- 暂缓任务 ——先搁一搁，到时候再提醒我
airjelly task snooze task_abc123 --until 2026-05-01T09:00:00
- 归档任务 ——做完不想看到了，但又不想删
airjelly task archive task_abc123
airjelly task unarchive task_abc123   # 后悔了可以取消归档
App 使用数据
- 看今天用了哪些 App、用了多久
airjelly apps today
- 看一段时间内的使用情况
airjelly apps usage                                           # 默认最近 7 天
airjelly apps usage --since 2026-04-01 --until 2026-04-23   # 指定日期范围
- 看哪个 App 用得最多
airjelly apps top                      # Top 10
airjelly apps top --limit 5            # 只看前 5
- 看某天每次切换 App 的详细记录
airjelly apps sessions                       # 今天的
airjelly apps sessions --date 2026-04-20     # 某天的
这个命令会列出你当天每一次切换窗口的时间点和时长，比如"10:23 打开 VS Code，待了 47 分钟，10:10 切到飞书，待了 12 分钟"这样的粒度。
提醒管理
- 提醒的 ID 是数字，可以从 AirJelly 桌面端或者 AI 助手那里拿到。
airjelly reminder dismiss 42          # 关掉这条提醒
airjelly reminder snooze 42 --minutes 30   # 30 分钟后再提醒我
录制状态
- AirJelly 在后台通过截屏来"看"你在做什么，这几个命令可以查看它的工作状态：
airjelly recording status       # 是否在运行中（running / stopped / no_permission）
airjelly recording permissions  # 有没有屏幕录制权限
airjelly recording stats        # 截图数量、磁盘占用、最早/最新日期
本地 Web 调试界面
- 如果你想直接在浏览器里探索 AirJelly 能做什么、测试各种接口调用：
airjelly ui             # 打开 127.0.0.1:17777
airjelly ui --port 18888 --no-open   # 自定义端口、不自动开浏览器
组合技：配合 jq 处理数据
- 所有命令加上 --json 就会输出原始 JSON，配合 jq 可以做各种筛选和处理：
# 列出所有进行中任务的标题
airjelly task list --status open --json | jq '[.[].title]'

# 今天用得最多的 3 个 App
airjelly apps today --json | \
  jq 'sort_by(-.total_seconds) | .[0:3][] | "\(.app_name): \(.total_seconds)s"'

# 统计最近 24 小时记录了多少条事件
airjelly memory events --hours 24 --json | jq 'length'

# 把事件记忆导出成 CSV
airjelly memory list --types event --limit 100 --json | \
  jq -r '["title","app","duration_seconds"],
         (.[] | [.title, .app_name, (.duration_seconds|tostring)]) | @csv' \
  > my_events.csv



用法三：SDK 集成（在你自己的项目里调用）
如果你在开发一个 Node.js 或 Bun 项目，想把 AirJelly 的数据接进来——比如做一个个性化 dashboard、构建自动化脚本、或者做一个连接 AirJelly 的工具——可以用 SDK。
安装
bun add @airjelly/sdk
# 或者
npm install @airjelly/sdk
第一步：连接
import { createClient } from '@airjelly/sdk'

const client = createClient()

// 先做一个兼容性检查（推荐），不兼容会自动报错
await client.assertCompatible()

// 检查 AirJelly 是否在运行
const health = await client.healthCheck()
console.log(health) // { ok: true, version: '0.5.0' }
createClient() 会自动读取 AirJelly 运行时配置，不需要手动填端口和 token。如果你需要指定（比如做测试），可以传参数：
const client = createClient({ port: 12345, token: 'your-token' })

---
记忆相关方法
- 语义搜索记忆 💰（消耗 credit）
const results = await client.searchMemory('上周的接口设计讨论', {
  memory_types: ['event'],   // 只搜事件类型
  limit: 5,
})
可选参数：
{
  memory_types?: ('profile' | 'preference' | 'entity' | 'event' | 'case' | 'procedure')[]
  task_id?: string          // 只搜某个任务相关的记忆
  app_name?: string         // 只搜某个 App 里的记忆
  start_time_after?: number  // 时间范围（毫秒时间戳）
  start_time_before?: number
  limit?: number             // 最多 30 条
}
- 列出记忆（不消耗 credit）
const memories = await client.listMemories({
  memory_types: ['event', 'case'],
  limit: 50,   // 最多 100 条
})
- 按时间范围查活动事件
const yesterday = Date.now() - 24 * 60 * 60 * 1000
const events = await client.getEventsByDate(yesterday, Date.now())
- 获取单条记忆
const memory = await client.getMemory('mem_abc123')
- 把截图 ID 解析成本地文件路径
记忆里的 screenshot_paths 字段有时候存的是 raw ID，用这个方法可以把它转成实际的绝对路径：
const paths = await client.resolveScreenshotPaths(['id1', 'id2'])
// { id1: '/Users/xxx/...', id2: '/Users/xxx/...' }

---
任务相关方法
- 查询任务
// 查看进行中的任务（默认最多 20 条）
const openTasks = await client.getOpenTasks()
const openTasks10 = await client.getOpenTasks(10)  // 只取前 10

// 按条件查询
const tasks = await client.getTaskList({
  status: 'open',
  l1_scene: 'build',   // 只看 build 场景的任务
  limit: 20,
})

// 单个任务详情
const task = await client.getTask('task_abc123')

// 任务关联的记忆
const memories = await client.getTaskMemories('task_abc123')
getTaskList 的完整查询参数：
{
  status?: 'open' | 'completed' | ('open' | 'completed')[]
  origin?: string
  l1_scene?: string
  limit?: number
  last_active_at_after?: number    // 最近活跃时间过滤（毫秒时间戳）
  last_active_at_before?: number
  start_time_after?: number
  start_time_before?: number
  updated_at_after?: number
  updated_at_before?: number
  scheduler_state?: 'running' | 'blocked' | 'waiting' | 'queued'
  scheduler_archived?: number
}
- 创建和修改任务 💰（createTask 消耗 credit）
// 创建任务
const task = await client.createTask({
  title: '写完 API 文档',
  description: '包含所有接口的请求/响应示例',
  l1_scene: 'build',
  due_date: new Date('2026-05-01').getTime(),  // 毫秒时间戳，不填表示没有截止时间
})

// 更新任务（只有以下 6 个字段可以改）
await client.updateTask('task_abc123', {
  title: '新标题',
  description: '新描述',
  l1_scene: 'connect',
  next_steps: ['写单元测试', '更新文档'],
  progress_summary: '已完成 60%',
  due_date: new Date('2026-06-01').getTime(),
})
- 任务生命周期操作
await client.completeTask('task_abc123')                          // 标记完成
await client.reopenTask('task_abc123')                            // 重新打开
await client.snoozeTask('task_abc123', new Date('2026-05-01').getTime())  // 暂缓
await client.archiveTask('task_abc123')                           // 归档
await client.unarchiveTask('task_abc123')                         // 取消归档
App 使用数据方法
// 今天（或某天）的使用汇总
const today = await client.getDailyAppUsage('2026-04-23')
// 返回: [{ app_name: 'VS Code', total_seconds: 7200, session_count: 12 }, ...]

// 一段时间内的逐日数据
const range = await client.getAppUsageRange('2026-04-01', '2026-04-23')
// 返回每天每个 App 的使用时长

// 时间段内的 Top App 排行
const topApps = await client.getTopApps('2026-04-01', '2026-04-23', 10)

// 某天的会话级别明细
const sessions = await client.getAppSessions('2026-04-23')
// 返回每一次窗口切换的开始时间、结束时间、时长

// 批量获取 App 图标（base64 格式，做 UI 时用）
const icons = await client.getAppIcons(['VS Code', 'Figma', 'Slack'])
人物知识图谱
AirJelly 会从你的记忆里识别出人物，这两个方法可以让你查询：
// 列出 AirJelly 见过的所有人
const persons = await client.listPersons()
// 每个人有姓名、别名、出现次数、参与的事件数等信息

```typescript
// 查某个人参与的事件记录（ID 从 listPersons() 返回的 PersonEntity.id 拿，格式是 mem_*）
const events = await client.getEventsForEntity('mem_abc123')
提醒操作
await client.dismissReminder(42)                // 关闭提醒（ID 是数字）
await client.snoozeReminder(42, 30)             // 延后 30 分钟
录制控制
// 查询状态
const status = await client.getRecordingStatus()
// 'running' | 'stopped' | 'no_permission'

const hasPermission = await client.getRecordingPermissions()
// true | false

const stats = await client.getRecordingStats()
// { totalScreenshots: 1234, totalSize: 506000000, oldestDate: '2026-03-01', ... }

// ⚠️ 以下两个会直接影响 AirJelly 的核心采集，谨慎使用
await client.startRecording()   // 启动截屏 + AI 分析
await client.stopRecording()    // 停止所有数据采集
错误处理
SDK 会抛出几种明确的错误，可以用 instanceof 来判断：
import {
  AirJellyNotRunningError,         // AirJelly Desktop 没有运行
  AirJellyConnectionError,          // 连接建立失败（网络层问题）
  AirJellyRpcError,                 // 服务器返回了错误
  AirJellyMethodNotSupportedError,  // 这个方法在当前版本不支持
  AirJellyApiVersionMismatchError,  // 客户端和服务器版本不兼容
} from '@airjelly/sdk'

try {
  const client = createClient()
  await client.assertCompatible()
  const tasks = await client.getOpenTasks()
} catch (e) {
  if (e instanceof AirJellyNotRunningError) {
    console.log('AirJelly Desktop 没打开，请先启动它')
  } else if (e instanceof AirJellyApiVersionMismatchError) {
    console.log(`版本不兼容，请升级 AirJelly Desktop（服务端版本: ${e.serverVersion}）`)
  } else if (e instanceof AirJellyMethodNotSupportedError) {
    console.log(`当前版本不支持 ${e.method} 方法，请升级 AirJelly Desktop`)
  } else {
    throw e
  }
}


---

遇到问题？
遇到的情况
可能原因
Cannot connect to AirJelly
AirJelly Desktop 没有运行，打开它
Method not found
Desktop 版本太旧，需要升级
at least one field must be specified
task update 没有传任何要修改的内容
--until is required
task snooze 忘了加 --until
--minutes is required
reminder snooze 忘了加 --minutes
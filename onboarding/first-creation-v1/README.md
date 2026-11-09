# first-creation-v1

桌面端新手指引的练习案例。方案见 `docs/first-creation-onboarding-plan.md`，运行时入口是
`src/onboarding/first-creation-case.ts`（对话文案在 `first-creation-copy.ts`）。

| 文件 | 内容 | 新增音层 |
| --- | --- | --- |
| `step-1.{zh,en}.strudel.js` | 一段简单的节奏 | KICK、SNARE、HAT |
| `step-2.{zh,en}.strudel.js` | 钢琴写一段旋律，加上去 | PIANO |
| `step-3.{zh,en}.strudel.js` | 添加一些背景渲染（钢琴补 `.delay(0.18)`） | PAD、TEXTURE |
| `step-4.{zh,en}.strudel.js` | 扩展成一段 30 秒的曲子（14 cycle mask 编排） | FILL |

中英文脚本代码逐字相同，只有注释语言不同；`src/onboarding/__tests__/first-creation-case.test.ts` 会检查这一点，以及每一步只新增上表的音层。修改脚本时两种语言要同步改。

听感验收：尚未完成。

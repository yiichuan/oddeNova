import { CodeBlock, StaticCode, Callout } from '../../components';

export default function Faq() {
  return (
    <>
      <p>这里收录了一些常见问题及解答，解答中通常会附上相关章节的链接，方便你查看更详细的说明。</p>

      <h2>Strudel / Tidal 是免费的吗？</h2>
      <p>
        是的，完全免费——这是一个集体维护的开源项目，你用它做出来的音乐也完全属于你自己。不过如果条件允许，欢迎向我们的{' '}
        <a href="https://opencollective.com/tidalcycles" target="_blank" rel="noopener noreferrer">
          opencollective 基金
        </a>{' '}
        做一次性或定期捐赠，支持 Strudel 及其他 Uzu 语言的软件与文化发展。
      </p>
      <p>虽然不收费，但有一些附加条件，例如：</p>
      <ul>
        <li>
          源代码必须保持自由开放，也就是说你不能把 strudel 或 tidal 打包进使用了不兼容协议的项目里——详见{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.en.html" target="_blank" rel="noopener noreferrer">
            许可证
          </a>
          。
        </li>
        <li>社区贡献的示例和曲目也各自拥有独立的许可，未经许可不得用于训练 AI 模型等用途。</li>
      </ul>

      <h2>怎么体验最新功能？</h2>
      <p>
        主站、稳定版 Strudel 网站是{' '}
        <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer">
          strudel.cc
        </a>
        。还有一个叫{' '}
        <a href="https://warm.strudel.cc" target="_blank" rel="noopener noreferrer">
          warm.strudel.cc
        </a>{' '}
        （俗称 "warm strudel"）的版本，包含最新的开发中功能。warm strudel 可能会有主站还没有的 bug 修复和新特性，但也可能不太稳定，不建议在重要演出中使用。
      </p>
      <p>
        你也可以在本地运行 Strudel 来尝试最新功能，可以参考{' '}
        <a
          href="https://codeberg.org/uzu/strudel/src/branch/main/CONTRIBUTING.md#project-setup"
          target="_blank"
          rel="noopener noreferrer"
        >
          面向开发者的搭建说明
        </a>
        。
      </p>
      <p>
        你可以在{' '}
        <a
          href="https://codeberg.org/uzu/strudel/pulls?q=&type=all&sort=recentupdate&state=closed&labels=&milestone=0&project=0&assignee=0&poster=0"
          target="_blank"
          rel="noopener noreferrer"
        >
          这里
        </a>{' '}
        以 pull request 的形式看到最新的改动。
      </p>

      <h2>怎么录制或导出音频？</h2>
      <p>Strudel 不是数字音频工作站（DAW），运作原理和大多数传统音频软件不太一样。不过还是有多种方式可以录下 Strudel 的音频（和视频）输出：</p>
      <ul>
        <li>使用「export」标签页，把作品渲染并下载为音频文件。</li>
        <li>直接捕获浏览器输出的原始立体声信号，这需要借助外部音频编辑器/DAW，比如 Reaper、Audacity、Ardour 等。</li>
        <li>使用替代的 SuperDirt 音频引擎（详见输入输出相关章节）。</li>
        <li>
          使用录屏工具捕获音视频流，例如{' '}
          <a href="https://obsproject.com/fr" target="_blank" rel="noopener noreferrer">
            OBS
          </a>
          ，虽然它是为直播设计的，但用来录制效果也很好。
        </li>
        <li>什么都不录，直接在朋友面前重新敲一遍代码。</li>
      </ul>

      <h2>可以在自己的 IDE 里用 Strudel 吗？</h2>
      <p>可以。社区成员为一些 IDE 做了实验性的支持模式，例如：</p>
      <ul>
        <li>
          VS Code：
          <a
            href="https://marketplace.visualstudio.com/items?itemName=cmillsdev.strudelvs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Strudel VS
          </a>
          ，是已停止维护的{' '}
          <a
            href="https://marketplace.visualstudio.com/items?itemName=roipoussiere.tidal-strudel"
            target="_blank"
            rel="noopener noreferrer"
          >
            TidalStrudel
          </a>{' '}
          的复活版。
        </li>
        <li>
          nvim：
          <a href="https://github.com/gruvw/strudel.nvim" target="_blank" rel="noopener noreferrer">
            strudel.nvim
          </a>
        </li>
      </ul>

      <h2>怎么使用自己的采样？</h2>
      <p>有多种方式导入你自己的采样集合，有些适合快速试验，有些更适合和其他音乐人分享你的音频库：</p>
      <ul>
        <li>从界面导入文件夹，样本会存储在浏览器本地，不会被上传。</li>
        <li>用 Strudel 的「sampler」命令行工具在本地起一个采样服务器，这种方式最可靠，但需要安装 Node.js。</li>
        <li>把音频库托管到网上，然后通过 URL 加载它们。</li>
      </ul>

      <h2>可以把 Strudel 和 AI / LLM 工具结合使用吗？</h2>
      <p>
        在自由/开源 AGPLv3 许可证允许的范围内，你可以随意使用 Strudel。不过作为一个社区，我们更关注人类的创造力本身。眼下 AI
        被严重过度炒作，其中不乏动机可疑的人。社区里很多人非常反感有人拿他们倾注心血的曲子去训练模型。所以请把关于 AI 和
        LLM 的讨论、提问放到专门讨论这个话题的频道，并充分尊重他人的劳动成果。
      </p>
      <p>另外，像 ChatGPT 这样的工具给出的答案往往是错的。请不要要求社区帮你修正那些答案，这通常只是浪费大家的时间。</p>
      <p>人类提出的问题永远受欢迎！</p>

      <h2>哪里能下载大量 pattern 来训练我的 LLM？</h2>
      <p>没有这种地方。关于我们对 AI / LLM 的立场，详见上一条问答。</p>

      <h2>怎么离线使用？</h2>
      <p>Strudel 完全可以离线使用！实现方式有好几种，详见「离线使用」章节的说明。</p>

      <h2>怎么改变速度？BPM 要怎么换算成 cpm？</h2>
      <p>Strudel 是以 cycle（周期）而非 beat（拍子）为单位工作的，不过只要你确定了每个 cycle 对应多少拍，就可以在两者之间换算。</p>
      <p>
        举例来说，如果你的曲子速度以 BPM 计，并且每个 cycle 有 4 拍（比如曲子是 4/4 拍），那么可以用{' '}
        <code>setcpm(BPM/4)</code> 换算，这里的 BPM 就是你想要的每分钟拍数。
      </p>
      <p>如果每小节的拍数不同，或者你想让一个 cycle 对应半小节、两小节等，相应调整这个换算就可以了。</p>

      <h2>哪里能看到所有的函数？</h2>
      <p>在 strudel.cc 打开右侧的侧边栏（右边那个小小的白色 &lt; 符号），里面有个「reference」标签页，列出了 Strudel 的所有函数。</p>

      <h2>哪里能看到所有的采样和合成器？</h2>
      <p>同样打开右侧边栏，有个「sounds」标签页，列出了当前加载的所有鼓机、采样和合成器。</p>

      <h2>怎么把它完全当 DAW 来用？</h2>
      <p>
        Strudel 的设计目标和 DAW 不一样，硬要把它当 DAW 用大概率会让你很沮丧。DAW 的设计理念是以可预测的方式在时间线上排列音符，而
        Strudel 这类 Uzu 语言的设计理念则是组合与变换 pattern——这个过程往往难以完全预测。
      </p>
      <p>
        如果你想在 Strudel 里模拟出 DAW 的某些功能，你需要先弄清楚 DAW 具体做了哪些操作（排序、重复、加滤波器和包络等），然后写出等价的代码。比如在
        Strudel 里，<code>arrange</code> 和 <code>pick</code> 这两个方法就很适合用来在时间线上排列 pattern。
      </p>
      <p>
        你可能还是会发现，典型的 DAW 工作流并不太适合 live coding——虽然两者都是用电脑做音乐，但终究是很不一样的工具。这时不妨换个思路，去适应代码这种媒介，也许意味着要给随性和不可预测的结果留出更多空间。
      </p>

      <h2>为什么不干脆都用 DAW 呢？</h2>
      <p>这个问题没有简单的答案，这里给出一些想法：</p>
      <ul>
        <li>Strudel 这类 live coding 工具非常适合即兴创作音乐和视觉效果，而 DAW 则是制作、母带处理、混音等其他工作中宝贵而可靠的伙伴。用一种工具并不妨碍你使用另一种，打造自己的工具箱就好。</li>
        <li>Live coding 作为一种独特的创作实践已经发展了几十年。比如 live coding 艺术家喜欢在表演时把屏幕投影给观众看，这是他们与大家分享创作过程的重要方式。</li>
        <li>
          代码是一种给人阅读的语言。你可以一边读代码一边欣赏音乐，代码本身也有意义和价值，甚至有种诗意。Strudel
          是自由开源的，你可以查看代码、修改它、参与贡献，这里没有黑箱、没有晦涩的抽象、没有商业模式，也没有用户追踪或隐藏功能。艺术领域需要开放的工具！不少 live coder 平时也会用 DAW，尤其是在它能让 live coding 变得更轻松的时候。
        </li>
        <li>代码本身也是一种艺术材料。通过代码创作音乐这个过程本身就有价值——创造性思考、搭建自己的解决方案、DIY 式的音乐制作、算法带来的意外结果、有趣的人为失误，等等。</li>
        <li>你的 DAW 里也有钢琴和小号插件，可人们为什么还继续弹钢琴、吹小号呢？把 live coding 工具想象成一种通过编程来演奏的乐器就好了。</li>
      </ul>

      <h2>怎么把 Strudel 和我喜欢的音乐软件对接？能用它做什么？</h2>
      <p>Strudel 可以发送 MIDI 和 OSC，这些是用来传递音乐信息的通信协议。</p>
      <p>其他音乐软件（甚至硬件！）可以监听这些消息，并按照自己的能力去处理它们。</p>
      <p>一个简单的例子是：把 live coding 生成的音频发送到 DAW（比如 Ardour）的不同音轨上，再做混音。</p>
      <p>你也可以把某个音序 pattern 的 MIDI 发送到 Musescore，让它把你的 live coding 作品转写成乐谱。</p>
      <p>你还可以把 MIDI 发给你的硬件合成器，如果你喜欢它们的音色的话。</p>

      <h2>怎么在自己的闭源网页游戏或其他软件里使用它？</h2>
      <p>
        不能这样用。你需要把你的项目以自由/开源许可证发布，以满足 Strudel 所使用的{' '}
        <a
          href="https://codeberg.org/uzu/strudel/src/branch/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
        >
          AGPLv3 许可证
        </a>{' '}
        的要求。
      </p>

      <h2>怎么同时播放多个 pattern？</h2>
      <p>
        使用 <code>$</code> 操作符，可以同时播放多个 pattern：
      </p>
      <CodeBlock
        code={`$: s("bd*4").bank("tr707")
$: s("- sd").bank("tr909")`}
      />
      <p>
        另见 <code>stack</code>。
      </p>

      <h2>可以让某个 pattern 静音吗？</h2>
      <p>
        在名字前多加一个下划线，就可以让某个 pattern 静音：
      </p>
      <CodeBlock
        code={`$: s("bd*4").bank("tr707")
_$: s("- sd").bank("tr909")`}
      />
      <p>
        另见 <code>hush</code>。
      </p>

      <h2>
        怎么用 <code>mask</code> 在 Strudel 里做编曲（arrange）？
      </h2>
      <p>
        在迷你记谱法里，配合 <code>{'<>'}</code> 和 <code>!</code> 操作符，可以这样写：
      </p>
      <StaticCode code={`.mask("<0!24 1!40>")`} />
      <p>这样会让这个 pattern 先静音 24 个 cycle，再播放 40 个 cycle。总共 64 个 cycle，是西方音乐里常用的 2/4/8 倍数。</p>
      <p>如果把每个 cycle 当成一个小节，作为起点，你可以给任意 pattern 写一个这样的 mask：</p>
      <StaticCode code={`.mask("<0!16 0!16 0!16 0!16 0!16 0!10>")`} />
      <p>它会让 pattern 全程静音。</p>
      <p>要编曲的话，可以给每个声部都加上同样的 mask，再把不同 mask 里的部分 0 换成 1，来控制哪部分该响起。</p>
      <p>
        如果给不同 pattern 用的 <code>.mask()</code> 打乱了你的计数，pattern 之间就会不再对齐。反过来说，有意这样做也正是 tidalcycles
        和 Strudel 的一种优势——可以让作品带上一点（可控的）干扰，显得更鲜活、更有机，全凭你自己的品味取舍。你也完全可以用 3、6、9
        这样的 cycle 数来编曲。
      </p>
      <p>
        如果想一次性修改所有内容，可以试试 <code>all</code> 和 <code>when</code>，例如：
      </p>
      <StaticCode code={`all(x=>x.when("<0!7 1>", x=>x.lpf(saw.range(200, 2000))))`} />
      <p>这样会让所有内容每 8 个 cycle 做一次低通滤波扫频。</p>

      <h2>
        怎么用 <code>arrange</code> 或 <code>pick</code> 在 Strudel 里做编曲？
      </h2>
      <p>
        以帕赫贝尔的《D 大调卡农》为例，它有 4 个声部（一把大提琴和三把小提琴），各自都有重复出现的 pattern。下面的代码把每个声部定义成常量，再用于不同的声部。
        <code>arrange</code> 接受多个参数，每个参数是一个 cycle 数和对应 pattern 组成的 <code>[]</code>
        对；如果 pattern 比这个数短，就会重复播放。
      </p>
      <CodeBlock
        code={`const cello = note(
  "<[d3 a2 b2 f#2] [g2 d3 g2 a2]>")
  .color("grey").sound("gm_tremolo_strings:3")
 const violin_p1 = note(
  "<[f#5 e5 d5 c#5] [b4 a4 b4 c#5]>")
  .color("blue")
 const violin_p2 = note(
  "<[d5 c#5 b4 a4] [ g4 f#4 g4 f#4]>")
 .color("green")
 const violin_p3 = note(
  "<[d4 f#4 a4 g4 f#4 d4 f#4 e4] [d4 b3 d4 a4 g4 b4 a4 g4]>")
  .color("purple")
 const violin_p4 = note(
  "<[f#4 d4 e4 c#5 d5 f#5 a5 a4] [b4 g4 a4 f#4 d4 d5 [d5@3 c#5]@2]>")
  .color("red")

cello$: arrange(
  [2, silence],
  [18,cello])
 violin1$: arrange(
[4,silence],
[2,violin_p1], [2,violin_p2],
[2,violin_p3], [2,violin_p4],
[2,violin_p1], [2,violin_p2],
[2,violin_p3], [2,violin_p4]
).sound("gm_tremolo_strings:0")
violin2$: arrange(
  [6,silence], [2,violin_p1],
  [2,violin_p2], [2,violin_p3],
  [2,violin_p4], [2,violin_p1],
  [2,violin_p2], [2,violin_p3]
  ).sound("gm_tremolo_strings:1")
 violin3$: arrange(
[8,silence],
[2,violin_p1], [2,violin_p2],
[2,violin_p3], [2,violin_p4],
[2,violin_p1], [2,violin_p2]
).sound("gm_tremolo_strings:2")

    all(x => x.release(.2))
`}
      />
      <p>
        另一种写法是把 4 个小提琴声部放进一个数组（
        <code>const violins = [violin_p1, violin_p2, violin_p3, violin_p4]</code>
        ），再用一个 pattern 当索引，通过 <code>pick</code> 取出数组里的第 n 个元素来代替上面的写法。这里用{' '}
        <code>0@2</code> 表示「第 0 个元素播放 2 个 cycle」。
      </p>
      <p>
        <code>pick</code> 的高亮效果比 <code>arrange</code> 更好：
      </p>
      <CodeBlock
        code={`const cello = note(
  "<[d3 a2 b2 f#2] [g2 d3 g2 a2]>")
  .color("grey").sound("gm_tremolo_strings:3")
 const violin_p1 = note(
  "<[f#5 e5 d5 c#5] [b4 a4 b4 c#5]>")
  .color("blue")
 const violin_p2 = note(
  "<[d5 c#5 b4 a4] [ g4 f#4 g4 f#4]>")
 .color("green")
 const violin_p3 = note(
  "<[d4 f#4 a4 g4 f#4 d4 f#4 e4] [d4 b3 d4 a4 g4 b4 a4 g4]>")
  .color("purple")
 const violin_p4 = note(
  "<[f#4 d4 e4 c#5 d5 f#5 a5 a4] [b4 g4 a4 f#4 d4 d5 [d5@3 c#5]@2]>")
  .color("red")

const violins = [violin_p1, violin_p2, violin_p3, violin_p4]

cello$: "<~@2 0@18>".pick([cello])
violin1$: "<~@4 0@2 1@2 2@2 3@2 0@2 1@2 2@2 3@2>".pick(violins)
.sound("gm_tremolo_strings:0")
violin2$: "<~@6 0@2 1@2 2@2 3@2 0@2 1@2 2@2>".pick(violins)
.sound("gm_tremolo_strings:1")
violin3$: "<~@8 0@2 1@2 2@2 3@2 0@2 1@2 >".pick(violins)
.sound("gm_tremolo_strings:2")
all(x => x.release(.2))
`}
      />
      <p>
        <code>pick</code> 也支持用带命名字段的 json，可读性更好。<code>pickRestart</code>{' '}
        会在每次选中 pattern 时重新开始播放，这在选中的索引长度和被选中 pattern 的长度对不齐时会有明显区别（不过这个例子里没有这个问题）。
      </p>
      <p>
        试试在 <code>release(.2)</code> 后面加上 <code>.punchcard()</code> 来看可视化效果。
      </p>

      <h3>
        在 Switch Angel 的作品里看到了一些参考文档里找不到的函数（比如 <code>trancegate</code>），要怎么用？
      </h3>
      <p>
        <code>trancegate()</code>、<code>rlpf()</code> 和 <code>acidenv()</code> 目前并不是 Strudel 内置的 pattern 方法。
      </p>
      <p>
        它们是 Switch Angel 编写、发布在{' '}
        <a href="https://github.com/switchangel/strudel-scripts" target="_blank" rel="noopener noreferrer">
          这里
        </a>{' '}
        的一个脚本 / prebake 里的内容。
      </p>
      <p>使用方法可以参考那个仓库里的 readme.md。</p>

      <h2>
        <code>n</code> 和 <code>note</code> 有区别吗？
      </h2>
      <p>
        它们并不是彼此的别名，这一点和 <code>s</code> / <code>sound</code> 不同。
      </p>
      <p>
        <code>note</code> 用来指代具体的某个音符（可以是音名，比如 <code>c</code> 或 <code>b2</code>，也可以是 MIDI
        编号，比如 <code>69</code>，例如 <code>note("c3 e3 g3")</code>）。
      </p>
      <p>
        而 <code>n</code> 则是用来引用「第 n 个」，可以是某个 scale 里的第 n 个音（比如{' '}
        <code>n("0 2 4").scale("C:major")</code>），也可以是某个和弦里的某个具体音符。
      </p>
      <p>
        <code>n</code> 也能用在与音符完全无关的地方，比如某个采样库里的第 n 个采样：
        <code>s("hh*8").bank("RolandTR909").n("0 1 2 3")</code>。
      </p>
      <CodeBlock
        code={`n("<[0 1 2 3@3 -@2] [3 2 1 0@3 -@2] >")
.scale("A:minor:pentatonic")
.s("gm_acoustic_guitar_steel").n("<0 1 2 3>/2")`}
      />
      <p>
        注意 <code>n</code> 并不是唯一用索引的方式，有些函数用的是带编号的 pattern。
      </p>

      <h2>有没有一份所有符号的速查表？</h2>
      <p>有的！</p>
      <Callout>
        <ul>
          <li>
            <code>'</code>：单引号，标记字符串的起止，和 <code>"</code> 不同
          </li>
          <li>
            <code>"</code>：双引号，标记单行迷你记谱法的起止，和 <code>'</code> 不同
          </li>
          <li>
            <code>`</code>：反引号，标记带换行的迷你记谱法的起止，和 <code>'</code> 不同
          </li>
          <li>
            <code>[]</code>：迷你记谱法中的 pattern，里面每一项长度相同
          </li>
          <li>
            <code>{'<>'}</code>：pattern，每个 cycle 交替播放其中一项
          </li>
          <li>
            <code>{'{}'}</code>：历史上用于多节奏 pattern，<code>{'{a b c}%4'}</code> 等价于 <code>{'<a b c>*4'}</code>
          </li>
          <li>
            <code>@3</code>：把某一项拉长为 3 倍（其他数字同理，甚至可以是非整数，但 0 到 1 之间的数需要写成带前导 0 的形式，比如{' '}
            <code>@0.5</code>）
          </li>
          <li>
            <code>@</code>（放在某项之后）：把该项拉长一次（多个 @ 也可以叠加，<code>c @ @</code> 等价于 <code>c@3</code>）
          </li>
          <li>
            <code>_</code>（放在某项之后）：同样是把该项拉长一次（多个 <code>_</code> 也可以叠加，<code>c _ _</code>{' '}
            等价于 <code>c@3</code>），下面还有另一种用法
          </li>
          <li>
            <code>.</code>：把 pattern 等分成若干段，叫做 foot，可以用来代替 <code>[]</code>，例如{' '}
            <code>"1 6 7 8 . 2 . 3 . 4"</code> 等价于 <code>"[1 6 7 8] 2 3 4"</code>
          </li>
          <li>
            <code>-</code>：静音
          </li>
          <li>
            <code>~</code>：同样表示静音
          </li>
          <li>
            <code>x</code>：非静音（用于 <code>struct</code> 时，任何非静音符号都可以）
          </li>
          <li>b：降半音，对 scale 的级数、音名（但不能用于 MIDI 编号）和和弦名都有效</li>
          <li>
            s：升半音，对 scale 的级数、音名（但不能用于 MIDI 编号）有效，但对和弦名无效
          </li>
          <li>
            <code>#</code>：也表示升半音，对 scale 的级数、音名和和弦名都有效
          </li>
          <li>
            <code>#</code>：也用于 Mondo 记谱法
          </li>
          <li>
            <code>*3</code>：让采样或 pattern 播放速度变为 3 倍，即 <code>fast(3)</code>
          </li>
          <li>
            <code>!3</code>：把采样或 pattern 重复播放 3 次
          </li>
          <li>
            <code>/2</code>：让采样或 pattern 播放速度变为一半，即 <code>slow(2)</code>
          </li>
          <li>
            <code>?</code>：让这个 pattern 有时（随机）播放
          </li>
          <li>
            <code>|</code>：每个 cycle 随机选择其中一个，即 <code>chooseCycles()</code>
          </li>
          <li>
            <code>,</code>：让用它分隔的各项同时播放，即 <code>stack()</code>
          </li>
          <li>
            <code>:</code>：用来分隔多个参数，比如 <code>adsr(".1:.1:.5:.2")</code>，本质是创建一组这样的对象的操作符
          </li>
          <li>
            <code>$:</code>：写在一行开头，定义 stack 里的一个成员，是唯一可以重复出现的 stack 名称
          </li>
          <li>
            <code>_</code>（写在 stack 名称前）：让这个 stack 静音，即 <code>hush()</code>，例如{' '}
            <code>{'_$: s("bd")'}</code>，上面提到过它的另一种用法
          </li>
        </ul>
      </Callout>
    </>
  );
}

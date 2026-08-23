import { CodeBlock, StaticCode, Callout, Table } from '../../components';

export default function FirstSounds() {
  return (
    <>
      <p>这是 Strudel workshop 的第一章，很高兴你能加入！</p>

      <h2>代码输入框</h2>
      <p>这份 workshop 里到处都是可交互的代码输入框。我们先来学习怎么用它。这是一个例子：</p>
      <CodeBlock code={`sound("casio")`} />
      <Callout>
        <ol>
          <li>⬆️ 点击上面的文本框 ⬆️</li>
          <li>按 <code>ctrl</code>+<code>enter</code> 播放（Mac 上是 <code>option</code>+<code>enter</code>）</li>
          <li>把 <code>casio</code> 改成 <code>metal</code></li>
          <li>按 <code>ctrl</code>+<code>enter</code> 更新（Mac 上是 <code>option</code>+<code>enter</code>）</li>
          <li>按 <code>ctrl</code>+<code>.</code> 停止（Mac 上是 <code>option</code>+<code>.</code>）</li>
        </ol>
      </Callout>
      <p>恭喜，你现在已经开始 live coding 了！</p>

      <h2>声音</h2>
      <p>刚才我们用 <code>sound</code> 这样播放了一个声音：</p>
      <CodeBlock code={`sound("casio")`} />
      <Callout>
        <p><code>casio</code> 是众多内置标准声音里的一个。</p>
        <p>试试其他几个声音：</p>
        <StaticCode code={`insect wind jazz metal east crow casio space numbers`} />
        <p>加载声音时可能会听到短暂的停顿。</p>
      </Callout>

      <p><strong>用 : 切换采样编号</strong></p>
      <p>一个 sound 可以包含多个采样（音频文件）。你可以在名字后面加上 <code>:</code> 加数字来选择采样：</p>
      <CodeBlock code={`sound("casio:1")`} />
      <Callout>
        <p>试试不同的 sound / 采样编号组合。</p>
        <p>不写数字就等于写 <code>:0</code>。</p>
      </Callout>
      <p>现在你已经知道怎么用不同的声音了。我们暂时先用这一小批声音，之后会讲怎么加载自己的声音。</p>

      <h2>鼓组声音</h2>
      <p>Strudel 默认自带一套丰富的鼓组声音：</p>
      <CodeBlock code={`sound("bd hh sd oh")`} />
      <Callout>
        <p>这些字母组合代表鼓组的不同部件：</p>
        <img src="/learn-img/drumset.png" alt="鼓组各部件对应的缩写标注图" className="max-w-full mb-1" />
        <a
          href="https://de.wikipedia.org/wiki/Schlagzeug#/media/Datei:Drum_set.svg"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-right text-[11px] text-white/40 hover:text-white/60 mb-3"
        >
          原图作者 Pbroks13
        </a>
        <ul>
          <li><code>bd</code> = bass drum（底鼓）</li>
          <li><code>sd</code> = snare drum（军鼓）</li>
          <li><code>rim</code> = rimshot（军鼓边击）</li>
          <li><code>hh</code> = hihat（踩镲）</li>
          <li><code>oh</code> = open hihat（开镲）</li>
          <li><code>lt</code> = low tom（低音嗵鼓）</li>
          <li><code>mt</code> = middle tom（中音嗵鼓）</li>
          <li><code>ht</code> = high tom（高音嗵鼓）</li>
          <li><code>rd</code> = ride cymbal（叮叮镲）</li>
          <li><code>cr</code> = crash cymbal（吊镲）</li>
        </ul>
        <p>试试不同的鼓组声音！</p>
      </Callout>
      <p>用 <code>bank</code> 可以切换鼓机型号，改变鼓组的音色：</p>
      <CodeBlock code={`sound("bd hh sd oh").bank("RolandTR909")`} />
      <p><code>RolandTR909</code> 是我们这里用的鼓机名字，是一台在 house 和 techno 音乐里很有名的鼓机。</p>
      <Callout>
        <p>试试把 <code>RolandTR909</code> 换成下面这些：</p>
        <ul>
          <li><code>AkaiLinn</code></li>
          <li><code>RhythmAce</code></li>
          <li><code>RolandTR808</code></li>
          <li><code>RolandTR707</code></li>
          <li><code>ViscoSpaceDrum</code></li>
        </ul>
        <p>还有很多其他型号，这里先保持简单。</p>
        <p>🦥 小技巧：双击选中名字，然后直接复制粘贴即可！</p>
      </Callout>

      <h2>序列（Sequences）</h2>
      <p>上一个例子里我们已经看到，用空格隔开就能顺序播放多个声音：</p>
      <CodeBlock code={`sound("bd hh sd hh")`} punchcard />
      <p>注意当前播放的声音会在代码里高亮，下方也会有可视化展示。</p>
      <Callout>
        <p>试着往序列里加更多声音！</p>
      </Callout>

      <p><strong>序列越长，播放越快</strong></p>
      <CodeBlock code={`sound("bd bd hh bd rim bd hh bd")`} punchcard />
      <p>
        Strudel 会把一个序列的内容压缩进一个叫 cycle 的时间单位里。默认情况下，一个 cycle 长 2 秒。
      </p>

      <p><strong>用 <code>{'< .. >'}</code> 让每个 cycle 只播放一个</strong></p>
      <p>还是刚才这个序列，这次用尖括号 <code>{'< .. >'}</code> 包起来：</p>
      <CodeBlock code={`sound("<bd bd hh bd rim bd hh bd>")`} punchcard />
      <p>这样每个 cycle 只会播放一个声音。用了尖括号之后，增加或减少元素都不会改变节奏的速度！</p>
      <p>现在节奏变得很慢，我们可以再把它加速回来：</p>
      <CodeBlock code={`sound("<bd bd hh bd rim bd hh bd>*8")`} punchcard />
      <p>这里的 <code>*8</code> 表示把整体速度加快 8 倍。</p>
      <Callout>
        <p>等一下，这和不用 <code>{'< ... >*8'}</code> 不是一样的吗？那为什么还需要它？</p>
        <p>确实很像，但这种写法特别之处在于：增加或删除元素时节奏不会变，试试看！</p>
        <p>也可以试着改变末尾的数字来调整速度！</p>
      </Callout>

      <p><strong>用 setcpm 改变速度</strong></p>
      <CodeBlock code={`setcpm(90/4)
sound("<bd hh rim hh>*8")`} punchcard />
      <Callout>
        <p>cpm = cycles per minute（每分钟多少个 cycle）</p>
        <p>默认速度是每分钟 30 个 cycle，也就是 120/4，每 2 秒一个 cycle。</p>
        <p>
          用西方乐理的说法，上面这段相当于 90bpm、4/4 拍下的八分音符。不过不了解这些乐理概念也完全没关系，
          用 Strudel 做音乐不需要它们。
        </p>
      </Callout>

      <p><strong>用 '-' 或 '~' 在序列中加入休止（空拍）</strong></p>
      <CodeBlock code={`sound("bd hh - rim - bd hh rim")`} punchcard />

      <p><strong>用 [方括号] 表示子序列</strong></p>
      <CodeBlock code={`sound("bd [hh hh] sd [hh bd] bd - [hh sd] cp")`} punchcard />
      <Callout>
        <p>试着在方括号里加更多声音！</p>
      </Callout>
      <p>和整个序列一样，子序列里的内容也会被压缩到它自己的长度里。</p>

      <p><strong>倍速：加快节奏</strong></p>
      <CodeBlock code={`sound("bd hh*2 rim hh*3 bd [- hh*2] rim hh*2")`} punchcard />

      <p><strong>倍速：加快子序列</strong></p>
      <CodeBlock code={`sound("bd [hh rim]*2 bd [hh rim]*1.5")`} punchcard />

      <p><strong>倍速：飞——快</strong></p>
      <CodeBlock code={`sound("bd hh*32 rim hh*16")`} punchcard />
      <Callout>
        <p>音高 = 极快的节奏</p>
      </Callout>

      <p><strong>用 [[双层方括号]] 表示子子序列</strong></p>
      <CodeBlock code={`sound("bd [[rim rim] hh] bd cp")`} punchcard />
      <Callout>
        <p>你可以嵌套任意多层！</p>
      </Callout>

      <p><strong>用逗号让多个序列并行播放</strong></p>
      <CodeBlock code={`sound("hh hh hh, bd casio")`} punchcard />
      <p>逗号可以用任意多个：</p>
      <CodeBlock code={`sound("hh hh hh, bd bd, - casio")`} punchcard />
      <p>逗号也可以用在子序列内部：</p>
      <CodeBlock code={`sound("hh hh hh, bd [bd,casio]")`} punchcard />
      <Callout>
        <p>注意到上面两个例子其实是一样的吗？</p>
        <p>很多时候，同一个想法可以有不同的写法。</p>
      </Callout>

      <p><strong>用反引号写多行</strong></p>
      <CodeBlock code={`sound(\`bd*2, - cp,
- - - oh, hh*4,
[- casio]*2\`)`} punchcard />

      <p><strong>分别选择采样编号</strong></p>
      <p>与其逐个写采样编号：</p>
      <CodeBlock code={`sound("jazz:0 jazz:1 [jazz:4 jazz:2] jazz:3*2")`} punchcard />
      <p>我们也可以用 <code>n</code> 函数让写法更短、更清晰：</p>
      <CodeBlock code={`n("0 1 [4 2] 3*2").sound("jazz")`} punchcard />

      <h2>回顾总结</h2>
      <p>现在我们学会了迷你记谱法（Mini-Notation）的基础，这是 Tidal 的节奏语言。到目前为止我们学到了：</p>
      <Table>
        <thead>
          <tr><th>概念</th><th>写法</th><th>示例</th></tr>
        </thead>
        <tbody>
          <tr><td>序列</td><td>空格</td><td><CodeBlock code={`sound("bd bd sd hh")`} /></td></tr>
          <tr><td>采样编号</td><td>:x</td><td><CodeBlock code={`sound("hh:0 hh:1 hh:2 hh:3")`} /></td></tr>
          <tr><td>休止</td><td>- 或 ~</td><td><CodeBlock code={`sound("metal - jazz jazz:1")`} /></td></tr>
          <tr><td>交替</td><td>{'<>'}</td><td><CodeBlock code={`sound("<bd hh rim oh bd rim>")`} /></td></tr>
          <tr><td>子序列</td><td>[]</td><td><CodeBlock code={`sound("bd wind [metal jazz] hh")`} /></td></tr>
          <tr><td>子子序列</td><td>[[]]</td><td><CodeBlock code={`sound("bd [metal [jazz [sd cp]]]")`} /></td></tr>
          <tr><td>加速</td><td>*</td><td><CodeBlock code={`sound("bd sd*2 cp*3")`} /></td></tr>
          <tr><td>并行</td><td>,</td><td><CodeBlock code={`sound("bd*2, hh*2 [hh oh]")`} /></td></tr>
        </tbody>
      </Table>
      <p>迷你记谱法通常写在某个函数里面。目前我们见过的函数有：</p>
      <Table>
        <thead>
          <tr><th>名称</th><th>说明</th><th>示例</th></tr>
        </thead>
        <tbody>
          <tr><td>sound</td><td>播放指定名字的声音</td><td><CodeBlock code={`sound("bd sd [- bd] sd")`} /></td></tr>
          <tr><td>bank</td><td>选择音色库（鼓机型号）</td><td><CodeBlock code={`sound("bd sd [- bd] sd").bank("RolandTR909")`} /></td></tr>
          <tr><td>setcpm</td><td>设置每分钟 cycle 数（速度）</td><td><CodeBlock code={`setcpm(45); sound("bd sd [- bd] sd")`} /></td></tr>
          <tr><td>n</td><td>选择采样编号</td><td><CodeBlock code={`n("0 1 4 2 0 6 3 2").sound("jazz")`} /></td></tr>
        </tbody>
      </Table>

      <h2>示例</h2>
      <p><strong>基础摇滚节奏</strong></p>
      <CodeBlock code={`setcpm(100/4)
sound("[bd sd]*2, hh*8").bank("RolandTR505")`} punchcard />
      <p><strong>经典 house</strong></p>
      <CodeBlock code={`sound("bd*4, [- cp]*2, [- hh]*4").bank("RolandTR909")`} punchcard />
      <Callout>
        <p>注意到这两个 pattern 非常相似吗？某些鼓点在不同曲风间是通用的。</p>
      </Callout>
      <p>We Will Rock You</p>
      <CodeBlock code={`setcpm(81/2)
sound("bd*2 cp").bank("RolandTR707")`} punchcard />
      <p><strong>Yellow Magic Orchestra - Firecracker</strong></p>
      <CodeBlock code={`setcpm(120/2)
sound("bd sd, - - - hh - hh - -, - perc - perc:1*2")
.bank("RolandCompurhythm1000")`} punchcard />
      <p><strong>模拟一个 16 步音序器</strong></p>
      <CodeBlock code={`setcpm(90/4)
sound(\`
[-  -  oh - ] [-  -  -  - ] [-  -  -  - ] [-  -  -  - ],
[hh hh -  - ] [hh -  hh - ] [hh -  hh - ] [hh -  hh - ],
[-  -  -  - ] [cp -  -  - ] [-  -  -  - ] [cp -  -  - ],
[bd -  -  - ] [-  -  -  bd] [-  -  bd - ] [-  -  -  bd]
\`)`} punchcard />
      <p><strong>再来一个</strong></p>
      <CodeBlock code={`setcpm(88/4)
sound(\`
[-  -  -  - ] [-  -  -  - ] [-  -  -  - ] [-  -  oh:1 - ],
[hh hh hh hh] [hh hh hh hh] [hh hh hh hh] [hh hh -  - ],
[-  -  -  - ] [cp -  -  - ] [-  -  -  - ] [~  cp -  - ],
[bd bd -  - ] [-  -  bd - ] [bd bd - bd ] [-  -  -  - ]
\`).bank("RolandTR808")`} punchcard />
      <p><strong>不太一样的鼓组</strong></p>
      <CodeBlock code={`setcpm(100/2)
s(\`jazz*2,
insect [crow metal] - -,
- space:4 - space:1,
- wind\`)`} punchcard />
      <p>了解了怎么做鼓点节奏之后，我们来看看怎么演奏音符。</p>
    </>
  );
}

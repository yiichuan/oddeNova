import { CodeBlock } from '../../components';

export default function MiniNotation() {
  return (
    <>
      <p>
        和 <a href="https://tidalcycles.org/" target="_blank" rel="noopener noreferrer">Tidal Cycles</a>{' '}
        一样，Strudel 使用一种叫做「迷你记谱法」（Mini-Notation）的自定义语言，专门用极少的文字来写出节奏 pattern。
      </p>

      <h2>说明</h2>
      <p>
        这一章会完整讲解迷你记谱法的全部语法。如果你才刚开始接触 Strudel，建议先在 workshop 里以更实践的方式学习迷你记谱法的基础，之后再回来看这一章，了解每一个细节。
      </p>

      <h2>示例</h2>
      <p>在深入细节之前，先感受一下迷你记谱法大概长什么样：</p>
      <CodeBlock
        code={`note(\`<
[e5 [b4 c5] d5 [c5 b4]]
[a4 [a4 c5] e5 [d5 c5]]
[b4 [~ c5] d5 e5]
[c5 a4 a4 ~]
[[~ d5] [~ f5] a5 [g5 f5]]
[e5 [~ c5] e5 [d5 c5]]
[b4 [b4 c5] d5 e5]
[c5 a4 a4 ~]
,
[[e2 e3]*4]
[[a2 a3]*4]
[[g#2 g#3]*2 [e2 e3]*2]
[a2 a3 a2 a3 a2 a3 b1 c2]
[[d2 d3]*4]
[[c2 c3]*4]
[[b1 b2]*2 [e2 e3]*2]
[[a1 a2]*4]
>\`)`}
      />

      <h2>迷你记谱法的写法</h2>
      <p>
        上面这段代码用反引号（`）包起来，这样才能写多行字符串。
      </p>
      <p>
        对于单行的迷你记谱法，我们也可以像之前那样用双引号（"）。
      </p>
      <p>
        如果你只是想得到一个 <em>不会</em>被解析为迷你记谱法的普通字符串，就用单引号（'）。
      </p>

      <h2>一个 cycle 内的事件序列</h2>
      <p>用空格隔开多个音符，就可以依次播放它们：</p>
      <CodeBlock code={`note("c e g b")`} punchcard />
      <p>
        这里的四个音符被压缩进一个 cycle 里，所以每个音符只有四分之一秒长。试试增删几个音符，感受一下节奏是怎么变化的！
      </p>
      <CodeBlock code={`note("c d e f g a b")`} punchcard />
      <p>
        注意整体的持续时间没有变，变的是每个音符自身的长度——这正是 TidalCycles 里「cycle」概念的核心体现！
      </p>
      <p>
        这个序列里每个用空格分隔的音符都是一个「事件」（event）。每个事件占用的时长取决于 cycle 的速度以及事件的数量。上面两个例子分别有 4 个和 8
        个事件，由于它们的 cycle 时长相同，所以每个事件必须把自己塞进相同的总时长里。
      </p>
      <p>
        如果你习惯了音序器或钢琴卷帘窗那种「加音符、时长就跟着变长」的逻辑，这个概念可能一开始有点反直觉。不过随着我们继续学习迷你记谱法的其他元素，你会慢慢理解它的道理。
      </p>

      <h2>乘法（Multiplication）</h2>
      <p>
        用星号（<code>*</code>）可以给一个序列加速：
      </p>
      <CodeBlock code={`note("[e5 b4 d5 c5]*2")`} punchcard />
      <p>这里乘以 2 意味着这个序列每个 cycle 会播放两次。</p>
      <p>
        乘数也可以是小数（<code>*2.75</code>）：
      </p>
      <CodeBlock code={`note("[e5 b4 d5 c5]*2.75")`} punchcard />

      <h2>除法（Division）</h2>
      <p>
        和乘法相反，用括号把序列包起来再除以一个数（<code>/2</code>），可以让序列变慢：
      </p>
      <CodeBlock code={`note("[e5 b4 d5 c5]/2")`} punchcard />
      <p>除以 2 意味着这个序列会分摊到两个 cycle 才播放完。同样可以用小数来表示任意速度（<code>/2.75</code>）。</p>
      <CodeBlock code={`note("[e5 b4 d5 c5]/2.75")`} punchcard />

      <h2>尖括号（Angle Brackets）</h2>
      <p>
        用尖括号 <code>{'<>'}</code>，我们可以根据事件数量来决定序列的长度：
      </p>
      <CodeBlock code={`note("<e5 b4 d5 c5>")`} punchcard />
      <p>上面这段代码和下面这段是一样的：</p>
      <CodeBlock code={`note("[e5 b4 d5 c5]/4")`} punchcard />
      <p>尖括号的好处是，我们可以增加事件而不需要改动末尾的数字。</p>
      <CodeBlock code={`note("<e5 b4 d5 c5 e5>")`} punchcard />
      <CodeBlock code={`note("<e5 b4 d5 c5 e5 b4>")`} punchcard />
      <p>
        这更接近传统音序器或钢琴卷帘窗的行为——加一个音符，整体的（感知）时长就会增加。我们也可以配合乘法，让尖括号每个 cycle 播放固定数量的音符：
      </p>
      <CodeBlock code={`note("<e5 b4 d5 c5 a4 c5>*8")`} punchcard />
      <p>现在我们每个 cycle 播放 8 个音符！</p>

      <h2>用方括号嵌套细分时间</h2>
      <p>
        想做出更有意思的节奏，可以用方括号 <code>[]</code> 把序列嵌套（放进另一个序列里）：
      </p>
      <p>对比下面几个例子：</p>
      <CodeBlock code={`note("e5 b4 c5 d5 c5 b4")`} />
      <CodeBlock code={`note("e5 [b4 c5] d5 c5 b4")`} />
      <CodeBlock code={`note("e5 [b4 c5] d5 [c5 b4]")`} />
      <CodeBlock code={`note("e5 [b4 c5] d5 [c5 b4 d5 e5]")`} />
      <CodeBlock code={`note("e5 [b4 c5] d5 [c5 b4 [d5 e5]]")`} />
      <p>
        发生了什么？当我们把多个事件用方括号嵌套（<code>[]</code>）包起来时，它们的总时长就变成了外层序列中一个事件的长度。
      </p>
      <p>
        这个改动看似简单，影响却很深远。还记得前面提到的：cycle 的整体长度是固定的，各个事件的长度是从这个 cycle 里划分出来的吗？这意味着在
        TidalCycles 里，你不仅可以任意划分时间，还可以任意地再细分时间！
      </p>

      <h2>休止（Rests）</h2>
      <p>
        <code>~</code> 表示休止，会在其他事件之间制造出静音：
      </p>
      <CodeBlock code={`note("[b4 [~ c5] d5 e5]")`} punchcard />
      <p>
        也可以用 <code>-</code> 代替 <code>~</code>，两者意义相同。
      </p>

      <h2>并行 / 复音（Parallel / polyphony）</h2>
      <p>用逗号可以演奏和弦。下面两种写法是等价的：</p>
      <CodeBlock code={`note("[g3,b3,e4]")`} />
      <CodeBlock code={`note("g3,b3,e4")`} punchcard />
      <p>但如果想在一个序列里依次演奏多个和弦，就需要用方括号把它们包起来：</p>
      <CodeBlock code={`note("<[g3,b3,e4] [a3,c3,e4] [b3,d3,f#4] [b3,e4,g4]>*2")`} punchcard />

      <h2>拉长（Elongation）</h2>
      <p>
        用 <code>@</code> 符号，可以指定序列中某一项的时间「权重」：
      </p>
      <CodeBlock code={`note("<[g3,b3,e4]@2 [a3,c3,e4] [b3,d3,f#4]>*2")`} punchcard />
      <p>这里第一个和弦的权重是 2，长度是其他和弦的两倍。默认权重是 1。</p>

      <h2>复制（Replication）</h2>
      <p>
        用 <code>!</code> 可以重复某一项而不改变整体速度：
      </p>
      <CodeBlock code={`note("<[g3,b3,e4]!2 [a3,c3,e4] [b3,d3,f#4]>*2")`} punchcard />

      <h2>随机性（Randomness）</h2>
      <p>
        在某一项后面加上 <code>?</code>，这个事件就有 50% 的概率被从 pattern 中移除：
      </p>
      <CodeBlock code={`note("[g3,b3,e4]*8?")`} punchcard />
      <p>
        在 <code>?</code> 后面加一个 0 到 1 之间的数字，可以调整被移除的概率。比如 <code>?0.1</code> 表示这个事件有 10%
        的概率被移除：
      </p>
      <CodeBlock code={`note("[g3,b3,e4]*8?0.1")`} punchcard />
      <p>
        用 <code>|</code> 分隔的多个事件，会随机选取其中一个来播放：
      </p>
      <CodeBlock code={`note("[g3,b3,e4] | [a3,c3,e4] | [b3,d3,f#4]")`} punchcard />

      <h2>迷你记谱法回顾</h2>
      <p>回顾一下我们目前学到的内容，对比下面这些 pattern：</p>
      <CodeBlock code={`note("<g3 b3 e4 [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4] [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4]/2 [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4]*2 [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4] _ [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4]@2 [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4]!2 [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3,b3,e4]? [a3,c3,e4] [b3,d3,f#4]>*2")`} />
      <CodeBlock code={`note("<[g3|b3|e4] [a3,c3,e4] [b3,d3,f#4]>*2")`} />

      <h2>欧几里得节奏（Euclidian rhythms）</h2>
      <p>
        在某个事件后面用圆括号，可以基于三个参数——<code>beats</code>（拍数）、<code>segments</code>
        （段数）和 <code>offset</code>（偏移）——创造出富有节奏感的细分。这个算法在许多不同的音乐软件中都能见到，通常被称为「欧几里得节奏」（Euclidean
        rhythm），得名于计算机科学家 Godfriend Toussaint。它为什么有意思呢？来看这个简单的例子：
      </p>
      <CodeBlock code={`s("bd(3,8,0)")`} punchcard />
      <p>
        听着耳熟吗？这就是一种很常见的欧几里得节奏，有各种叫法，比如「Pop Clave」。这类节奏几乎存在于所有音乐文化中，而欧几里得节奏算法能让我们非常轻松地把它们表达出来。如果完整写出这个节奏，需要这样描述：
      </p>
      <CodeBlock code={`s("bd ~ ~ bd ~ ~ bd ~")`} punchcard />
      <p>
        但用欧几里得记谱法，我们只需要表达「8 段中的 3 拍，从第 1 段开始」。
      </p>
      <p>这让我们可以轻松写出既有趣又依然熟悉的节奏结构和变化：</p>
      <CodeBlock code={`note("e5(2,8) b4(3,8) d5(2,8) c5(3,8)").slow(2)`} punchcard />
      <p>
        注意上面的例子没有用到第三个参数 <code>offset</code>，所以可以简写成 <code>"(3,8)"</code>：
      </p>
      <CodeBlock code={`s("bd(3,8)")`} punchcard />
      <p>接下来我们详细看看这三个参数。</p>

      <h3>拍数（Beats）</h3>
      <p>第一个参数控制会播放多少拍。对比一下：</p>
      <CodeBlock code={`s("bd(2,8)")`} punchcard />
      <CodeBlock code={`s("bd(5,8)")`} punchcard />
      <CodeBlock code={`s("bd(7,8)")`} punchcard />

      <h3>段数（Segments）</h3>
      <p>第二个参数控制这些拍会分布在总共多少段上：</p>
      <CodeBlock code={`s("bd(3,4)")`} punchcard />
      <CodeBlock code={`s("bd(3,8)")`} punchcard />
      <CodeBlock code={`s("bd(3,13)")`} punchcard />

      <h3>偏移（Offsets）</h3>
      <p>第三个（可选）参数控制拍分布的起始位置。需要一个次要节奏来听出差异：</p>
      <CodeBlock code={`s("bd(3,8,0), hh cp")`} punchcard />
      <CodeBlock code={`s("bd(3,8,3), hh cp")`} punchcard />
      <CodeBlock code={`s("bd(3,8,5), hh cp")`} punchcard />

      <h2>迷你记谱法练习</h2>
      <p>
        迷你记谱法最有趣的地方在于，前面学到的所有元素都可以以各种方式组合起来！
      </p>
      <p>
        从下面这一个 <code>n</code> 开始，你能写出一个用上以上每一种迷你记谱法元素的 pattern 字符串吗？
      </p>
      <CodeBlock code={`n("60")`} />
    </>
  );
}

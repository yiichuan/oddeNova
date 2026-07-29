import { CodeBlock, Callout } from '../../components';

export default function Cycles() {
  return (
    <>
      <p>
        cycle（周期）这个概念对于理解 Strudel 的运作方式至关重要。Strudel 的母语言 TidalCycles，
        甚至把它写进了自己的名字里。
      </p>

      <h2>Cycle 与 BPM</h2>
      <p>
        大多数音乐软件用 BPM（每分钟节拍数）来设定速度。Strudel 用 CPS（cycles per second，每秒 cycle 数）来表达速度，
        默认值是 0.5 CPS：
      </p>
      <CodeBlock code={`s("bd")`} />
      <p>这里可以听到 0.5CPS 的效果：底鼓每两秒重复一次。我们把它变成 4 个底鼓：</p>
      <CodeBlock code={`s("bd bd bd bd")`} />
      <p>
        现在每个 cycle 有 4 个底鼓，但整个 pattern 仍然是以 0.5CPS 播放。用 BPM 来说，大多数音乐人会说这是 120bpm。
        再看这个：
      </p>
      <CodeBlock code={`s("bd hh bd hh")`} />
      <p>因为第二个声音变成了踩镲，速度感觉又变慢了。这让我们意识到一个重要的道理：</p>
      <Callout>
        <p>速度（tempo）的感受是主观的。所选择的声音也会影响对速度的感知。这就是为什么相同的 CPS 会产生不同的感知速度。</p>
      </Callout>

      <h2>设置 CPM</h2>
      <p>
        如果你更熟悉 BPM，可以用 <code>setcpm</code> 方法以「每分钟 cycle 数」来设置全局速度：
      </p>
      <CodeBlock code={`setcpm(110)
s("bd hh")`} />
      <p>如果你想让每个 cycle 里有更多拍子，可以把 cpm 除以一个数：</p>
      <CodeBlock code={`setcpm(110/4)
s("bd sd bd rim, hh*8")`} />
      <p>或者每个 cycle 用 2 拍：</p>
      <CodeBlock code={`setcpm(110/2)
s("bd sd, hh*4")`} />
      <p>
        你也可以用 <code>setcps</code> 方法以「每秒 cycle 数」设置全局速度。<code>setcpm(x)</code> 等价于
        <code>setcps(x / 60)</code>。
      </p>
      <Callout>
        <p>
          要设定一个具体的 BPM，使用 <code>setcpm(bpm/bpc)</code>
        </p>
        <ul>
          <li>bpm：目标每分钟节拍数</li>
          <li>bpc：每个 cycle 里感知到的拍子数</li>
        </ul>
      </Callout>

      <h2>Cycle 与小节</h2>
      <p>
        大多数音乐软件里，多个拍子组成一个小节（bar / measure）。所谓的拍号（time signature）规定了每个小节有多少拍。
        很多类型的音乐常用每小节 4 拍，也就是 4/4 拍，很多音乐软件也把它作为默认值。
      </p>
      <p>Strudel 没有小节的概念，只有 cycle。怎么使用 cycle 由你自己决定。前面我们有这个例子：</p>
      <CodeBlock code={`setcpm(110/4)
s("bd sd bd rim, hh*8")`} />
      <p>这可以理解为 110bpm 的 4/4 拍。我们可以像这样写出多个小节：</p>
      <CodeBlock code={`setcpm(110/4)
s(\`<
[bd sd bd rim, hh*8]
[bd sd bd rim*2, hh*8]
>\`)`} />
      <p>与其把每个小节都单独写出来，我们也可以更简短地表达：</p>
      <CodeBlock code={`setcpm(110/2)
s("bd <sd rim*<1 2>>,hh*4")`} />
      <p>
        可以看到，以 cycle 而不是小节来思考问题，能大大简化写法！这类简化之所以可行，是因为节奏本身具有重复性。
        用计算机的说法，前一种写法有很多冗余。
      </p>

      <h2>拍号</h2>
      <p>要得到某个拍号，只需要改变每小节的元素数量。这是一个 7 拍的节奏：</p>
      <CodeBlock code={`s("bd ~ rim bd bd rim ~")`} />
      <p>或者 5 拍：</p>
      <CodeBlock code={`s("bd hh hh bd hh hh bd rim bd hh")`} />
      <p>我们还可以写出拍号不同的多个小节：</p>
      <CodeBlock code={`setcpm(110*2)
s(\`<
[bd hh rim]@3
[bd hh rim sd]@4
>\`)`} />
      <p>这里我们在 3/4 拍和 4/4 拍之间切换，同时保持速度不变。</p>

      <p>如果不指定长度，我们会得到所谓的「节拍模进」（metric modulation）：</p>
      <CodeBlock code={`setcpm(110/2)
s(\`<
[bd hh rim]
[bd hh rim sd]
>\`)`} />
      <p>现在 3 个元素和 4 个元素被分配到相同的时间长度，所以速度会发生变化。</p>
    </>
  );
}

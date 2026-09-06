import { CodeBlock, StaticCode, Table } from '../../components';

export default function StrudelVsTidal() {
  return (
    <>
      <p>这一章是写给已有的 Tidal 用户的，概览一下 Strudel 与 Tidal 之间的所有差异。</p>

      <h2>语言</h2>
      <p>
        Strudel 用 JavaScript 编写，而 Tidal 用 Haskell 编写。
      </p>

      <h3>示例</h3>
      <p>这个差异在语法上体现得最明显：</p>
      <StaticCode code={`iter 4 $ every 3 (||+ n "10 20") $ (n "0 1 3") # s "triangle" # crush 4`} />
      <p>可以把这段 pattern 这样翻译成 Strudel：</p>
      <StaticCode code={`iter(4, every(3, add.squeeze("10 20"), n("0 1 3").s("triangle").crush(4)))`} />
      <ul>
        <li>
          <code>$</code> 运算符不存在，所以 <code>iter</code> 函数必须用括号把所有内容包起来
        </li>
        <li>
          像 <code>||+</code> 这样的自定义运算符，会变成显式的函数调用，本例中是 <code>add.squeeze</code>
        </li>
        <li>
          <code>#</code> 运算符会被替换成链式函数调用，<code>{'# crush 4'}</code> 变成 <code>.crush(4)</code>
        </li>
      </ul>
      <p>不像 Haskell，JavaScript 无法定义自定义中缀运算符，也不能改变已有运算符的含义。</p>
      <p>在你把 Strudel 当成一个笨重的「括号怪兽」抛弃之前，先看看用另一种写法表达上面的例子：</p>
      <StaticCode code={`n("0 1 3").every(3, add.squeeze("10 20")).iter(4).s("triangle").crush(4)`} />
      <p>
        通过调整调用顺序，括号的嵌套明显减少了。可以粗略地说，Tidal 中用 <code>$</code>
        做的事情，在 Strudel 里正好是反过来的：
      </p>
      <p>
        <code>iter 4 $ every 3 (||+ n "10 20") $ (n "0 1 3")</code>
      </p>
      <p>变成了</p>
      <p>
        <code>n("0 1 3").every(3, add.squeeze("10 20")).iter(4)</code>
      </p>
      <p>
        简单来说，<code>foo x $ bar x</code> 变成了 <code>bar(x).foo(x)</code>。
      </p>

      <h3>运算符</h3>
      <p>
        <a href="https://tidalcycles.org/docs/reference/pattern_structure/#all-the-operators" target="_blank" rel="noopener noreferrer">
          Tidal 的自定义运算符
        </a>
        在 Strudel 里都是普通函数：
      </p>
      <Table>
        <thead>
          <tr><th>函数</th><th>Tidal</th><th>Strudel</th></tr>
        </thead>
        <tbody>
          <tr><td>add（加）</td><td>|+ n</td><td><code>.add(n)</code></td></tr>
          <tr><td>subtract（减）</td><td>|- n</td><td><code>.sub(n)</code></td></tr>
          <tr><td>multiply（乘）</td><td>|* n</td><td><code>.mul(n)</code></td></tr>
          <tr><td>divide（除）</td><td>|/ n</td><td><code>.div(n)</code></td></tr>
          <tr><td>modulo（取模）</td><td>|% n</td><td><code>.mod(n)</code></td></tr>
          <tr><td>left values（取左值）</td><td>|&lt; n</td><td><code>.set(n)</code></td></tr>
        </tbody>
      </Table>
      <p>
        上表只列出了结构来自「左侧（left）」的运算符。对每一个运算符，还存在「右侧（right）」和「双侧（both）」
        的变体。由于 JavaScript 无法像 Tidal 那样用符号表达这种方向性，Strudel 改用显式函数名来区分，
        分别称为 <code>in</code> / <code>out</code> /
        <code>mix</code>：
      </p>
      <Table>
        <thead>
          <tr><th>方向</th><th>Tidal</th><th>Strudel</th></tr>
        </thead>
        <tbody>
          <tr><td>left（左）</td><td>|+ n</td><td><code>.add.in(n)</code></td></tr>
          <tr><td>right（右）</td><td>+| n</td><td><code>.add.out(n)</code></td></tr>
          <tr><td>both（两者）</td><td>|+| n</td><td><code>.add.mix(n)</code></td></tr>
        </tbody>
      </Table>
      <p>
        除了 <code>+</code> / <code>add</code>，你也可以用第一张表里任何一个可用的运算符替换。
      </p>

      <h2>函数兼容性</h2>
      <p>
        <a href="https://codeberg.org/uzu/strudel/issues/31" target="_blank" rel="noopener noreferrer">
          这个 issue
        </a>
        追踪了哪些 Tidal 函数已经在 Strudel 中实现。这份列表可能不是 100% 最新的，也可能遗漏了一些函数。
        如果你发现某个函数没有在列表上，欢迎告知！
      </p>

      <h2>控制参数（Control Params）</h2>
      <p>
        正如例子里看到的，<code>#</code> 运算符（<code>|&gt;</code> 的简写）在 Strudel 里同样只是一次函数调用。
        所以 <code>note "c5" # s "gtr"</code> 变成了 <code>note("c5").s('gtr')</code>。
      </p>
      <p>
        <a href="https://codeberg.org/uzu/strudel/src/branch/main/packages/core/controls.mjs" target="_blank" rel="noopener noreferrer">
          这个文件
        </a>
        列出了所有可用的控制参数。请注意，并非所有这些参数在 Strudel 的 WebAudio 输出里都能生效。
        如果你发现某个 Tidal 的控制参数没有在列表上，欢迎告知！
      </p>

      <h2>声音</h2>
      <p>
        Tidal 通常搭配 Superdirt / Supercollider 来生成声音。虽然 Strudel 也有一种与 Superdirt 通信的方式，
        但它的目标是提供一个完全在浏览器中运行的独立 live coding 环境。
      </p>

      <h3>音频效果</h3>
      <p>SuperDirt 的许多效果已经用 Web Audio API 在 Strudel 中重新实现了。</p>

      <h3>采样器（Sampler）</h3>
      <p>
        Strudel 的采样器支持 Superdirt 采样器功能的一个子集。此外，采样始终是从 URL 加载的，而不是从磁盘加载
        （不过未来这也可能会实现）。
      </p>

      <h2>执行方式（Evaluation）</h2>
      <p>
        Strudel 的 REPL 目前还不支持分块执行（block based evaluation）。你可以使用带标签的语句和
        <code>_</code> 来静音：
      </p>
      <CodeBlock code={`$: n("[0 .. 8]*8/9").scale("C:minor:pentatonic")

_$: s("bd*4").bank('RolandTR909')`} />

      <h2>速度（Tempo）</h2>
      <p>
        Strudel 的默认速度是每秒 1 个 cycle，而 Tidal 默认是 <code>0.5625</code>。你可以用下面的方式获得和 Tidal
        相同的速度：
      </p>
      <StaticCode code={`note("c a f e").fast(.5625);`} />
    </>
  );
}

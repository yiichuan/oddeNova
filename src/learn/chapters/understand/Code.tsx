import { CodeBlock, StaticCode, Callout } from '../../components';

export default function Code() {
  return (
    <>
      <p>让我们退后一步，理解一下 Strudel 里的代码语法（syntax）到底是怎么运作的。</p>

      <p>先看这个简单的例子：</p>
      <CodeBlock code={`note("c a f e").s("piano")`} />
      <ul>
        <li>
          我们有一个单词 <code>note</code>，后面跟着一对括号 <code>()</code>，里面是一些字母/数字，用引号 <code>"c a f e"</code> 包起来
        </li>
        <li>
          然后是一个点 <code>.</code>，接着是另一段类似的代码 <code>s("piano")</code>
        </li>
        <li>
          你可能也注意到这些文字会用不同颜色高亮：单词 <code>note</code> 是紫色的，括号 <code>()</code> 是灰色的，引号 <code>""</code> 里的内容是绿色的（如果你换了默认主题，颜色可能会不一样）
        </li>
      </ul>

      <p>如果我们试着用不同的方式来「破坏」这个写法，会发生什么？</p>
      <CodeBlock code={`note(c a f e).s(piano)`} />
      <CodeBlock code={`note("c a f e")s("piano")`} />
      <CodeBlock code={`note["c a f e"].s{"piano"}`} />
      <p>好吧，这几种写法都没法正常运行……</p>

      <CodeBlock code={`s("piano").note("c a f e")`} />
      <p>这一个是能运行的，但现在我们只能听到第一个音符……</p>

      <p>那么这背后到底发生了什么？</p>

      <h2>函数、参数与链式调用</h2>
      <p>到目前为止，我们见过这样的写法：</p>
      <StaticCode code={`xxx("foo").yyy("bar")`} />
      <p>
        一般来说，<code>xxx</code> 和 <code>yyy</code> 被称为
        <a href="https://en.wikipedia.org/wiki/Function_(computer_programming)" target="_blank" rel="noopener noreferrer">函数（function）</a>
        ，而 <code>foo</code> 和 <code>bar</code> 被称为函数的
        <a href="https://en.wikipedia.org/wiki/Parameter_(computer_programming)" target="_blank" rel="noopener noreferrer">参数（arguments / parameters）</a>
        。到目前为止，我们都是用函数来声明想要控制声音的哪个方面，用参数来提供实际的数据。
      </p>
      <p>
        <code>yyy</code> 函数被称为
        <a href="https://en.wikipedia.org/wiki/Method_chaining" target="_blank" rel="noopener noreferrer">链式（chained）函数</a>
        ，因为它前面有一个点（<code>.</code>）。
      </p>
      <p>
        一般来说，链式调用的思路是：像 <code>a("this").b("that").c("other")</code> 这样的代码，可以让
        <code>a</code>、<code>b</code>、<code>c</code> 三个函数按指定的顺序依次执行，而不用把它们拆成三行单独的代码。
        你可以把它想象成用吉他效果器或数字音频效果器把多个音效串联起来。
      </p>

      <p>Strudel 大量使用链式函数。这里有一个更复杂的例子：</p>
      <CodeBlock code={`note("a3 c#4 e4 a4")
.s("sawtooth")
.cutoff(500)
//.delay(0.5)
.room(0.5)`} />

      <h3>写一个属于你自己的链式函数</h3>
      <p>
        你可以用 <code>register</code> 写一个属于自己的链式函数。这是把上面的链式调用注册成一个可复用的链式函数：
      </p>
      <CodeBlock code={`const effectChain = register('effectChain', (pat) => pat
    .s("sawtooth")
    .cutoff(500)
    //.delay(0.5)
    .room(0.5)
  )
note("a3 c#4 e4 a4").effectChain()`} />
      <p>
        试着在 <code>effectChain()</code> 后面加上 <code>.rev()</code>，听听效果有什么变化。
      </p>

      <h2>注释</h2>
      <p>
        上面例子里的 <code>//</code> 是行注释，会让 <code>delay</code> 函数被忽略。
        这是快速开关某段代码的便捷方式。试着删掉 <code>//</code> 取消注释，然后刷新 pattern。
        你也可以用快捷键 <code>cmd-/</code> 来切换注释状态。
      </p>
      <p>
        你可能也注意到 REPL 示例里的一些注释包含以「@」开头的词，比如 <code>@by</code> 或 <code>@license</code>。
        这些只是约定俗成的写法，用来记录一些关于这段音乐的信息。
      </p>

      <h2>字符串（Strings）</h2>
      <p>
        那么引号里的内容（例如 <code>"c a f e"</code>）到底是什么呢？
        在 JavaScript 里，和大多数编程语言一样，这类内容被称为
        <a href="https://en.wikipedia.org/wiki/String_(computer_science)" target="_blank" rel="noopener noreferrer">字符串（string）</a>
        。一个字符串就是一串字符组成的序列。
      </p>
      <p>
        在 TidalCycles 里，双引号字符串被用来通过迷你记谱法（mini-notation）编写 <em>pattern</em>，
        你可能会时不时听到 <em>pattern string</em> 这个说法。
        如果你想创建一个普通的字符串而不是 pattern，可以用单引号，比如 <code>'C minor'</code> 就不会被解析为迷你记谱法。
      </p>

      <Callout>
        <p>好消息是，这基本上已经覆盖了 Strudel 需要用到的大部分 JavaScript 语法！</p>
      </Callout>
    </>
  );
}

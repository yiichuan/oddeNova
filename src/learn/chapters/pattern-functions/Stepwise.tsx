import { CodeBlock, Callout } from '../../components';

export default function Stepwise() {
  return (
    <>
      <Callout>
        <p>这是 Strudel 中一个仍在发展的实验性领域，行为可能会在未来版本中变化或改名。欢迎提出反馈和想法！</p>
      </Callout>

      <h2>简介</h2>
      <p>
        通常在 Strudel 中，大多数 pattern 变换唯一的参照点是 <em>cycle</em>
        。现在，借助一系列不断增加的函数，我们也可以基于 <em>步（step）</em> 来进行操作了。
      </p>
      <p>
        举例来说，通常当你把两个 pattern 用 <code>fastcat</code> 拼在一起时，它们各自的 cycle
        会被压缩进半个 cycle：
      </p>
      <CodeBlock code={`fastcat("bd hh hh", "bd hh hh cp hh").sound()`} />
      <p>
        而用新的步进（stepwise）函数 <code>stepcat</code>，两个 pattern 的步会被均匀地分布在整个 cycle 里：
      </p>
      <CodeBlock code={`stepcat("bd hh hh", "bd hh hh cp hh").sound()`} />
      <p>
        默认情况下，步数是按照迷你记谱法里的“最外层”来计算的。比如 <code>&quot;a [b c] d e&quot;</code>
        每个 cycle 有五个事件，但会被算作四个步，其中 <code>[b c]</code> 算作一个步。
      </p>
      <p>
        不过，你也可以用子 pattern 开头的 <code>^</code> 来标记按哪个节拍层级计步。如果我们对示例中的子
        pattern 这样标记：<code>&quot;a [^b c] d e&quot;</code>，那么整个 pattern 就会被算作
        <em>八</em> 步。这是因为 &apos;b&apos; 和 &apos;c&apos; 各自被算作一个独立的步，而 pattern
        中原有的其他事件（如 &apos;a&apos;、&apos;d&apos;、&apos;e&apos;）因为时长相对变成了两倍，所以各自被算作两个步。
      </p>

      <h2>为步定速（Pacing）</h2>
      <p>
        有些步进函数单独使用时看起来好像没什么效果，比如下面这两个用不同倍数 <code>expand</code>
        的例子，听起来是完全一样的：
      </p>
      <CodeBlock code={`"c a f e".expand(2).note().sound("folkharp")`} />
      <CodeBlock code={`"c a f e".expand(4).note().sound("folkharp")`} />
      <p>
        每个 cycle 的步数在背后确实发生了变化，但单独使用时并不会带来任何效果。要听出区别，你需要搭配另一个步进函数一起使用，比如
        <code>stepcat</code>：
      </p>
      <CodeBlock code={`stepcat("c a f e".expand(2), "g d").note()
  .sound("folkharp")`} />
      <CodeBlock code={`stepcat("c a f e".expand(4), "g d").note()
  .sound("folkharp")`} />
      <p>
        你应该能听出来，<code>expand</code> 按比例增加了第一个子 pattern 相对于第二个子 pattern 的步时长。
      </p>
      <p>
        你还可以用 <code>pace</code> 函数，把一个 pattern 的速度调整到匹配给定的每 cycle 步数：
      </p>
      <CodeBlock code={`stepcat("c a f e".expand(2), "g d").note()
  .sound("folkharp")
  .pace(8)`} />
      <CodeBlock code={`stepcat("c a f e".expand(4), "g d").note()
  .sound("folkharp")
  .pace(8)`} />
      <p>第一个例子有十步，第二个例子有 18 步，但两者最终都以每 cycle 8 步的速率播放。</p>
      <p>
        <code>expand</code> 的参数本身也可以被 pattern 化，并会按步进方式处理。这意味着参数中不断变化的值所对应的
        pattern，会被 <code>stepcat</code> 拼接在一起：
      </p>
      <CodeBlock code={`note("c a f e").sound("folkharp").expand("3 2 1 1 2 3")`} />
      <p>
        这样会得到一个很密集的 pattern，因为不同展开版本被压缩进了同一个 cycle。这时
        <code>pace</code> 同样很有用，可以用来把 pattern 放慢到某个特定的每 cycle 步数：
      </p>
      <CodeBlock code={`note("c a f e").sound("folkharp").expand("3 2 1 1 2 3").pace(8)`} />
      <Callout>
        <p>
          早期版本中，很多这类函数都带有 <code>s_</code> 前缀，<code>pace</code> 函数以前叫做
          <code>steps</code>。这些旧名字目前仍然作为别名保留，但行为可能已经变化，并将在未来移除。请及时更新你的
          pattern！
        </p>
      </Callout>

      <h2>步进函数</h2>

      <h3>pace</h3>
      <p>
        （实验性功能）把一个 pattern 加速或放慢，使其匹配给定的每 cycle 步数。
      </p>
      <CodeBlock code={`sound("bd sd cp").pace(4)
// 等价于 sound("{bd sd cp}%4") 或 sound("<bd sd cp>*4")`} />

      <h3>stepcat</h3>
      <p>
        与 <code>fastcat</code> 一样，把 pattern “拼接”起来，但按每个 cycle
        的步数比例分配空间。步数可以从 pattern 自动推断，也可以以 <code>[长度, pattern]</code> 数组形式给出。别名为 <code>timecat</code>。
      </p>
      <CodeBlock code={`stepcat([3,"e3"],[1, "g3"]).note()
// 等价于 "e3@3 g3".note()`} />
      <CodeBlock code={`stepcat("bd sd cp","hh hh").sound()
// 等价于 "bd sd cp hh hh".sound()`} />

      <h3>stepalt</h3>
      <p>
        （实验性功能）按推断出的“每 cycle 步数”，用步进方式拼接多个 pattern。与 <code>stepcat</code>
        类似，但如果某个参数是一个数组，整个 pattern 会在数组的各元素之间交替播放。
      </p>
      <CodeBlock code={`stepalt(["bd cp", "mt"], "bd").sound()
// 等价于 "bd cp bd mt bd".sound()`} />

      <h3>expand</h3>
      <p>（实验性功能）按给定倍数扩大 pattern 的步长。</p>
      <CodeBlock code={`sound("tha dhi thom nam").bank("mridangam").expand("3 2 1 1 2 3").pace(8)`} />

      <h3>contract</h3>
      <p>
        （实验性功能）按给定倍数缩小 pattern 的步长，另见 <code>expand</code>。
      </p>
      <CodeBlock code={`sound("tha dhi thom nam").bank("mridangam").contract("3 2 1 1 2 3").pace(8)`} />

      <h3>extend</h3>
      <p>
        （实验性功能）<code>extend</code> 类似 <code>fast</code>
        ，会增加密度，但同时也会相应增加步数。所以 <code>stepcat(&quot;a b&quot;.extend(2), &quot;c d&quot;)</code>
        等价于 <code>&quot;a b a b c d&quot;</code>，而 <code>stepcat(&quot;a b&quot;.fast(2), &quot;c d&quot;)</code>
        则等价于 <code>&quot;[a b] [a b] c d&quot;</code>。
      </p>
      <CodeBlock code={`stepcat(
  sound("bd bd - cp").extend(2),
  sound("bd - sd -")
).pace(8)`} />

      <h3>take</h3>
      <p>
        （实验性功能）从 pattern 中取出给定数量的步（丢弃其余部分）。正数从 pattern 开头取，负数从末尾取。
      </p>
      <CodeBlock code={`"bd cp ht mt".take("2").sound()
// 等价于 "bd cp".sound()`} />
      <CodeBlock code={`"bd cp ht mt".take("1 2 3").sound()
// 等价于 "bd bd cp bd cp ht".sound()`} />
      <CodeBlock code={`"bd cp ht mt".take("-1 -2 -3").sound()
// 等价于 "mt ht mt cp ht mt".sound()`} />

      <h3>drop</h3>
      <p>
        （实验性功能）从 pattern 中丢弃给定数量的步。正数从开头丢弃，负数从末尾丢弃。
      </p>
      <CodeBlock code={`"tha dhi thom nam".drop("1").sound().bank("mridangam")`} />
      <CodeBlock code={`"tha dhi thom nam".drop("-1").sound().bank("mridangam")`} />
      <CodeBlock code={`"tha dhi thom nam".drop("0 1 2 3").sound().bank("mridangam")`} />

      <h3>polymeter</h3>
      <p>
        （实验性功能）对齐多个 pattern 的步数，创建复节拍（polymeter）。这些 pattern
        会各自重复，直到共同凑够一个公共周期。
      </p>
      <CodeBlock code={`// 等价于 note("{c eb g, c2 g2}%6")
polymeter("c eb g", "c2 g2").note()`} />

      <h3>shrink</h3>
      <p>
        （实验性功能）逐步把 pattern 缩短 n 步，直到什么都不剩，或者如果给出了第二个值（用冒号
        <code>:</code> 的迷你记谱法列表写法），就缩短相应的次数。正数从 pattern 开头逐步丢弃步，负数从末尾丢弃。
      </p>
      <CodeBlock code={`"tha dhi thom nam".shrink("1").sound()
.bank("mridangam")`} />
      <CodeBlock code={`"tha dhi thom nam".shrink("-1").sound()
.bank("mridangam")`} />
      <CodeBlock code={`"tha dhi thom nam".shrink("1 -1").sound().bank("mridangam").pace(4)`} />

      <h3>grow</h3>
      <p>
        （实验性功能）逐步让 pattern 增长 n 步，直到播放完整个 pattern，或者如果给出了第二个值（同样用
        <code>:</code> 列表写法），就增长相应的次数。正数从 pattern 开头逐步增长，负数从末尾增长。
      </p>
      <CodeBlock code={`"tha dhi thom nam".grow("1").sound()
.bank("mridangam")`} />
      <CodeBlock code={`"tha dhi thom nam".grow("-1").sound()
.bank("mridangam")`} />
      <CodeBlock code={`"tha dhi thom nam".grow("1 -1").sound().bank("mridangam").pace(4)`} />

      <h3>tour</h3>
      <p>
        （实验性功能）把一个 pattern 插入到一组 pattern 列表中。第一次重复时插入到列表末尾，之后每次重复都往列表前面移动一位。这些
        pattern 会按步进方式相加，所有重复都发生在同一个 cycle 内。因此通常建议配合 <code>pace</code>
        来设置每个 cycle 的步数。
      </p>
      <CodeBlock code={`"[c g]".tour("e f", "e f g", "g f e c").note()
.sound("folkharp")
.pace(8)`} />

      <h3>zip</h3>
      <p>
        （实验性功能）把给出的多个 pattern 的步 “压缩（zip）” 在一起。这会产生一段较长的重复，发生在一个单一、密集的 cycle
        中。因此通常建议配合 <code>pace</code> 来设置每个 cycle 的步数。
      </p>
      <CodeBlock code={`zip("e f", "e f g", "g [f e] a f4 c").note()
.sound("folkharp")
.pace(8)`} />
    </>
  );
}

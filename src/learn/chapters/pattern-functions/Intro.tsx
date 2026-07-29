import { CodeBlock } from '../../components';

export default function Intro() {
  return (
    <>
      <p>接下来我们来系统学习一下用于创建和修改 pattern 的各种函数。在 Strudel 的核心，一切皆由函数构成。</p>
      <p>
        比如说，凡是用迷你记谱法（Mini-Notation）能做到的事情，都可以用函数来实现。下面这段用迷你记谱法写的 pattern：
      </p>
      <CodeBlock code={`note("c3 eb3 g3")`} />
      <p>等价于不使用迷你记谱法的写法：</p>
      <CodeBlock code={`note(seq("c3", "eb3", "g3"))`} />
      <p>类似地，迷你记谱法里的每一个要素，都有与之对应的函数。</p>
      <p>
        具体用哪种写法取决于场景。一个大致的经验法则是：函数更适合用在较大的结构里，而迷你记谱法更适合写单独的节奏。
      </p>

      <h2>迷你记谱法的局限</h2>
      <p>虽然迷你记谱法是一种简洁强大的节奏写法，但它也有自己的局限。看下面这个例子：</p>
      <CodeBlock
        code={`stack(
  note("c2 eb2(3,8)").s('sawtooth').cutoff(800),
  s("bd(5,8), hh*8")
)`}
      />
      <p>
        这里我们用迷你记谱法写单独的节奏，再用函数 <code>stack</code> 把它们叠放（混合播放）在一起。虽然
        <code>stack</code> 在迷你记谱法里也有对应的写法（即 <code>,</code>），但这里没法用，因为它们是不同类型的声音。
      </p>

      <h2>组合 Pattern</h2>
      <p>你可以自由混合 JS pattern、迷你记谱法 pattern 和普通数值！比如下面这段：</p>
      <CodeBlock
        code={`cat(
  stack("g3","b3","e4"),
  stack("a3","c3","e4"),
  stack("b3","d3","fs4"),
  stack("b3","e4","g4")
).note()`}
      />
      <p>等价于：</p>
      <CodeBlock
        code={`cat(
  "g3,b3,e4",
  "a3,c3,e4",
  "b3,d3,f#4",
  "b3,e4,g4"
).note()`}
      />
      <p>也等价于：</p>
      <CodeBlock code={`note("<[g3,b3,e4] [a3,c3,e4] [b3,d3,f#4] [b3,e4,g4]>")`} />
      <p>
        虽然迷你记谱法几乎总是更简短，但它只有为数不多的几个修饰符：<code>* / ! @</code>
        。而使用 JS pattern 的话，你能做的事情就多得多了。
      </p>
    </>
  );
}

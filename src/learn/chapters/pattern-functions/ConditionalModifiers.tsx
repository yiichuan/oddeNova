import { CodeBlock } from '../../components';

export default function ConditionalModifiers() {
  return (
    <>
      <h2>lastOf</h2>
      <p>每隔 n 个 cycle 应用给出的函数一次，从最后一个 cycle 开始计数。</p>
      <CodeBlock code={`note("c3 d3 e3 g3").lastOf(4, x=>x.rev())`} />

      <h2>firstOf</h2>
      <p>每隔 n 个 cycle 应用给出的函数一次，从第一个 cycle 开始计数。</p>
      <CodeBlock code={`note("c3 d3 e3 g3").firstOf(4, x=>x.rev())`} />

      <h2>when</h2>
      <p>当给定的 pattern 为真时，就应用给出的函数。</p>
      <CodeBlock code={`"c3 eb3 g3".when("<0 1>/2", x=>x.sub("5")).note()`} />

      <h2>chunk</h2>
      <p>
        把一个 pattern 分成给定数量的部分，然后依次轮流处理每一部分，对当前部分应用给出的函数（每个 cycle 处理一部分）。
      </p>
      <CodeBlock code={`"0 1 2 3".chunk(4, x=>x.add(7))
.scale("A:minor").note()`} />

      <h3>chunkBack</h3>
      <p>
        与 <code>chunk</code> 类似，但按逆序轮流处理各份。在 tidalcycles 中称为 <code>chunk&apos;</code>。
      </p>
      <CodeBlock code={`"0 1 2 3".chunkBack(4, x=>x.add(7))
.scale("A:minor").note()`} />

      <h3>fastChunk</h3>
      <p>
        与 <code>chunk</code> 类似，但源 pattern 的各个 cycle 不会针对每一份重复。
      </p>
      <CodeBlock code={`"<0 8> 1 2 3 4 5 6 7"
.scale("C2:major").note()
.fastChunk(4, x => x.color('red')).slow(2)`} />

      <h2>arp</h2>
      <p>在叠放的和弦音符中，按给定的索引 pattern 选取音符，制造琶音效果。</p>
      <CodeBlock code={`note("<[c,eb,g]!2 [c,f,ab] [d,f,ab]>")
.arp("0 [0,2] 1 [0,2]")`} />

      <h2>arpWith</h2>
      <p>
        与 <code>arp</code> 类似，但用一个函数来选取叠放和弦中的索引，而不是用 pattern 来指定。
      </p>
      <CodeBlock code={`note("<[c,eb,g]!2 [c,f,ab] [d,f,ab]>")
.arpWith(haps => haps[2])`} />

      <h2>struct</h2>
      <p>把给出的布尔结构应用到 pattern 上，只在结构中为真的位置保留事件。</p>
      <CodeBlock code={`note("c,eb,g")
  .struct("x ~ x ~ ~ x ~ x ~ ~ ~ x ~ x ~ ~")
  .slow(2)`} />

      <h2>mask</h2>
      <p>
        当 mask 中对应位置为 0 或 &quot;~&quot; 时，让 pattern 静音。
      </p>
      <CodeBlock code={`note("c [eb,g] d [eb,g]").mask("<1 [0 1]>")`} />

      <h2>reset</h2>
      <p>当 reset pattern 触发时，把源 pattern 重置回当前 cycle 的开头。</p>
      <CodeBlock code={`s("[<bd lt> sd]*2, hh*8").reset("<x@3 x(5,8)>")`} />

      <h2>restart</h2>
      <p>
        当 restart pattern 触发时，重新从第 0 个 cycle 开始播放源 pattern。与 <code>reset</code>
        只会重置当前 cycle 不同，<code>restart</code> 会回到第 0 个 cycle。
      </p>
      <CodeBlock code={`s("[<bd lt> sd]*2, hh*8").restart("<x@3 x(5,8)>")`} />

      <h2>hush</h2>
      <p>让一个 pattern 静音。</p>
      <CodeBlock code={`stack(
  s("bd").hush(),
  s("hh*3")
)`} />

      <h2>invert</h2>
      <p>
        把二进制 pattern 中的 1 和 0 互换。别名为 <code>inv</code>。
      </p>
      <CodeBlock code={`s("bd").struct("1 0 0 1 0 0 1 0".lastOf(4, invert))`} />

      <h2>pick</h2>
      <p>
        按索引从数组中挑选、或按名称从查找表中挑选 pattern（或普通值）。与 <code>inhabit</code>
        类似，但会保留原本 pattern 的结构。
      </p>
      <CodeBlock code={`note("<0 1 2!2 3>".pick(["g a", "e f", "f g f g" , "g c d"]))`} />
      <CodeBlock code={`sound("<0 1 [2,0]>".pick(["bd sd", "cp cp", "hh hh"]))`} />
      <CodeBlock code={`s("<a!2 [a,b] b>".pick({a: "bd(3,8)", b: "sd sd"}))`} />

      <h2>pickmod</h2>
      <p>
        与 <code>pick</code> 相同，但如果挑选的数字超过列表长度，会自动取模循环，而不是停在最大值。
      </p>

      <h2>pickF</h2>
      <p>让你用一个数字 pattern 来挑选要应用到另一个 pattern 上的函数。</p>
      <CodeBlock code={`s("bd [rim hh]").pickF("<0 1 2>", [rev,jux(rev),fast(2)])`} />

      <h2>pickmodF</h2>
      <p>
        与 <code>pickF</code> 相同，但如果挑选的数字超过函数列表长度，会自动取模循环。
      </p>

      <h2>pickRestart</h2>
      <p>
        与 <code>pick</code> 类似，但被选中的 pattern 在其索引被触发时会从头重新播放。
      </p>

      <h2>pickmodRestart</h2>
      <p>
        与 <code>pickRestart</code> 相同，但如果挑选的数字超过列表长度，会自动取模循环。
      </p>
      <CodeBlock code={`"<a@2 b@2 c@2 d@2>".pickRestart({
    a: n("0 1 2 0"),
    b: n("2 3 4 ~"),
    c: n("[4 5] [4 3] 2 0"),
    d: n("0 -3 0 ~")
  }).scale("C:major").s("piano")`} />

      <h2>pickReset</h2>
      <p>
        与 <code>pick</code> 类似，但被选中的 pattern 在其索引被触发时会被重置到当前 cycle 开头。
      </p>

      <h2>pickmodReset</h2>
      <p>
        与 <code>pickReset</code> 相同，但如果挑选的数字超过列表长度，会自动取模循环。
      </p>

      <h2>inhabit</h2>
      <p>
        按索引从数组中挑选、或按名称从查找表中挑选 pattern（或普通值）。与 <code>pick</code>
        类似，但被选中的 pattern 会被压缩进目标（“寄宿”的）pattern 的每个 cycle 中。别名为 <code>pickSqueeze</code>。
      </p>
      <CodeBlock code={`let a = s("bd(3,8)")
let b = s("cp sd")
"<a b [a,b]>".inhabit({ a, b })`} />
      <CodeBlock code={`s("a@2 [a b] a"
.inhabit({a: "bd(3,8)", b: "sd sd"}))
.slow(4)`} />

      <h2>inhabitmod</h2>
      <p>
        与 <code>inhabit</code> 相同，但如果挑选的数字超过列表长度，会自动取模循环。别名为 <code>pickmodSqueeze</code>。
      </p>

      <h2>squeeze</h2>
      <p>
        通过给定的整数 pattern，按索引从值（或值 pattern）列表中挑选，被选中的 pattern 会被压缩到触发事件的时长内。
      </p>
      <CodeBlock code={`note(squeeze("<0@2 [1!2] 2>", ["g a", "f g f g" , "g a c d"]))`} />
    </>
  );
}

import { CodeBlock } from '../../components';

export default function Tonal() {
  return (
    <>
      <p>
        这些函数借助
        <a href="https://github.com/tonaljs/tonal" target="_blank" rel="noopener noreferrer">
          tonaljs
        </a>
        提供了一系列用于音乐操作的辅助工具。
      </p>

      <h3>voicing()</h3>
      <p>根据和弦记号，自动生成一组具体音符（voicing，编配）。</p>
      <CodeBlock code={`n("0 1 2 3").chord("<C Am F G>").voicing()`} />
      <p>下面是一个用它来演奏和弦与低音线的例子：</p>
      <CodeBlock code={`chord("<C^7 A7b13 Dm7 G7>*2")
  .dict('ireal').layer(
  x=>x.struct("[~ x]*2").voicing()
  ,
  x=>n("0*4").set(x).mode("root:g2").voicing()
  .s('sawtooth').cutoff("800:4:2")
)`} />

      <h3>scale(name)</h3>
      <p>把数字映射到给定音阶中的音符。</p>
      <CodeBlock code={`n("0 2 4 6 4 2").scale("C:major")`} />
      <CodeBlock code={`n("[0,7] 4 [2,7] 4")
.scale("C:<major minor>/2")
.s("piano")`} />
      <CodeBlock code={`n(rand.range(0,12).segment(8))
.scale("C:ritusen")
.s("piano")`} />

      <h3>transpose(semitones)</h3>
      <p>把所有音符转调（移调）给定的半音数：</p>
      <CodeBlock code={`"[c2 c3]*4".transpose("<0 -2 5 3>").note()`} />
      <p>当我们像上面这样用一个 pattern 来做转调时，这个方法会变得格外有趣。</p>
      <p>除了数字，也可以用科学音程记号（scientific interval notation）：</p>
      <CodeBlock code={`"[c2 c3]*4".transpose("<1P -2M 4P 3m>").note()`} />

      <h3>scaleTranspose(steps)</h3>
      <p>在音阶内部，按给定的级数转调音符：</p>
      <CodeBlock code={`"[-8 [2,4,6]]*2"
.scale('C4 bebop major')
.scaleTranspose("<0 -1 -2 -3 -4 -5 -6 -4>*2")
.note()`} />

      <h3>rootNotes(octave = 2)</h3>
      <p>把和弦记号转换成给定八度上的根音。</p>
      <CodeBlock code={`"<C^7 A7b13 Dm7 G7>*2".rootNotes(3).note()`} />
      <p>
        结合 <code>layer</code>、<code>struct</code> 和 voicings，可以用它做出一个基础的伴奏音轨：
      </p>
      <CodeBlock code={`"<C^7 A7b13 Dm7 G7>*2".layer(
  x => x.voicings('lefthand').struct("[~ x]*2").note(),
  x => x.rootNotes(2).note().s('sawtooth').cutoff(800)
)`} />
    </>
  );
}

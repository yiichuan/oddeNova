import { midi2note } from '@strudel/core';
import { CodeBlock, Callout, Table } from '../../components';

const numberLabels = Object.fromEntries(
  Array.from({ length: 49 }, (_, i) => [midi2note(i + 36), i + 36]),
);
// claviature's label keys must match its internal note-name casing
// (e.g. "C3", "Db3" — same spelling @strudel/core's midi2note() produces),
// not Strudel's own lowercase mini-notation spelling ("c3").
const letterLabels = Object.fromEntries(
  ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'].map((n) => [n, n[0].toLowerCase()]),
);
const flatLabels = Object.fromEntries(
  ['Db3', 'Eb3', 'Gb3', 'Ab3', 'Bb3'].map((n) => [n, n.slice(0, 2).toLowerCase()]),
);
// c#/d#/f#/g#/a# are the same physical (black) keys as db/eb/gb/ab/bb —
// claviature only has flat spellings for those keys, so reuse them, just
// displaying the sharp spelling as the label text.
const sharpLabels = Object.fromEntries(
  [
    ['Db3', 'c#'],
    ['Eb3', 'd#'],
    ['Gb3', 'f#'],
    ['Ab3', 'g#'],
    ['Bb3', 'a#'],
  ],
);
const octaveLabels = Object.fromEntries(
  Array.from({ length: 49 }, (_, i) => [midi2note(i + 36), midi2note(i + 36)]),
);

export default function FirstNotes() {
  return (
    <>
      <p>我们来看看怎么演奏音符。</p>

      <h2>数字和音符字母</h2>
      <p><strong>用数字演奏音符</strong></p>
      <CodeBlock code={`note("48 52 55 59").sound("piano")`} claviature claviatureLabels={numberLabels} />
      <Callout>
        <p>试试不同的数字！也可以试试小数，比如 55.5。</p>
      </Callout>

      <p><strong>用字母演奏音符</strong></p>
      <CodeBlock code={`note("c e g b").sound("piano")`} claviature claviatureLabels={letterLabels} />
      <Callout>
        <p>试试不同的字母（a - g）。能不能找到刚好拼成一个词的旋律？</p>
      </Callout>

      <p><strong>加降号或升号来弹黑键</strong></p>
      <CodeBlock code={`note("db eb gb ab bb").sound("piano")`} claviature claviatureLabels={flatLabels} />
      <CodeBlock code={`note("c# d# f# g# a#").sound("piano")`} claviature claviatureLabels={sharpLabels} />

      <p><strong>用字母加八度演奏不同音区的音符</strong></p>
      <CodeBlock code={`note("c2 e3 g4 b5").sound("piano")`} claviature claviatureLabels={octaveLabels} />
      <Callout>
        <p>试试不同的八度（1-8）。</p>
      </Callout>
      <p>
        如果你还不太习惯音符字母系统，用数字应该会更容易上手。下面大部分例子都会用数字。
        之后我们还会介绍更方便挑选音符的方法。
      </p>

      <h2>改变音色</h2>
      <p>就像无音高的声音一样，我们也可以用 <code>sound</code> 改变音符的音色：</p>
      <CodeBlock code={`note("36 43, 52 59 62 64").sound("piano")`} />
      <Callout>
        <p>试试不同的音色：</p>
        <ul>
          <li>gm_electric_guitar_muted</li>
          <li>gm_acoustic_bass</li>
          <li>gm_voice_oohs</li>
          <li>gm_blown_bottle</li>
          <li>sawtooth</li>
          <li>square</li>
          <li>triangle</li>
          <li>试试 bd、sd 或 hh 会怎样？</li>
          <li>把 <code>.sound('...')</code> 整个删掉试试</li>
        </ul>
      </Callout>

      <p><strong>在多个音色之间切换</strong></p>
      <CodeBlock code={`note("48 67 63 [62, 58]")
.sound("piano gm_electric_guitar_muted")`} />

      <p><strong>叠加多个音色</strong></p>
      <CodeBlock code={`note("48 67 63 [62, 58]")
.sound("piano, gm_electric_guitar_muted")`} />
      <Callout>
        <p><code>note</code> 和 <code>sound</code> 这两个 pattern 被组合在了一起！之后我们还会看到更多组合 pattern 的方式。</p>
      </Callout>

      <h2>更长的序列</h2>
      <p><strong>用 <code>/</code> 让序列变慢</strong></p>
      <CodeBlock code={`note("[36 34 41 39]/4").sound("gm_acoustic_bass")`} punchcard />
      <Callout>
        <p><code>/4</code> 让方括号里的序列拉长到 4 个 cycle（=8 秒）播放一遍。</p>
        <p>也就是说 4 个音符里每一个都长 2 秒。</p>
        <p>试着往方括号里加更多音符，注意速度是怎么变快的。</p>
      </Callout>

      <p><strong>用 <code>{'< ... >'}</code> 让每个 cycle 只播放一个</strong></p>
      <p>上一章我们学到 <code>{'< ... >'}</code>（尖括号）可以让每个 cycle 只播放一个内容，这对更长的旋律同样有用：</p>
      <CodeBlock code={`note("<36 34 41 39>").sound("gm_acoustic_bass")`} punchcard />
      <Callout>
        <p>试着往尖括号里加更多音符，注意速度是保持不变的。</p>
        <p>尖括号其实只是一种简写：</p>
        <p><code>{'<a b c>'}</code> = <code>[a b c]/3</code></p>
        <p><code>{'<a b c d>'}</code> = <code>[a b c d]/4</code></p>
        <p>……以此类推</p>
      </Callout>

      <p><strong>每个 cycle 播放一整个序列</strong></p>
      <p>我们可以把两种括号以各种方式组合起来。这是一个循环低音线的例子：</p>
      <CodeBlock code={`note("<[36 48]*4 [34 46]*4 [41 53]*4 [39 51]*4>")
.sound("gm_acoustic_bass")`} punchcard />

      <p><strong>在多个音之间交替</strong></p>
      <CodeBlock code={`note("60 <63 62 65 63>")
.sound("gm_xylophone")`} punchcard />
      <p>这对无音高的声音同样有用：</p>
      <CodeBlock code={`sound("bd*4, [~ <sd cp>]*2, [~ hh]*4")
.bank("RolandTR909")`} punchcard />

      <h2>音阶（Scales）</h2>
      <p>要找到合适的音符可能不太容易……音阶（scale）就是来帮你解决这个问题的：</p>
      <CodeBlock code={`setcpm(60)
n("0 2 4 <[6,8] [7,9]>")
.scale("C:minor").sound("piano")`} punchcard />
      <Callout>
        <p>试试不同的数字，随便哪个数字听起来都应该是和谐的。</p>
        <p>也试试不同的音阶：</p>
        <ul>
          <li>C:major</li>
          <li>A2:minor</li>
          <li>D:dorian</li>
          <li>G:mixolydian</li>
          <li>A2:minor:pentatonic</li>
          <li>F:major:pentatonic</li>
        </ul>
      </Callout>

      <p><strong>自动化音阶</strong></p>
      <p>和其他任何值一样，我们也可以用 pattern 来自动切换音阶：</p>
      <CodeBlock code={`setcpm(60)
n("<0 -3>, 2 4 <[6,8] [7,9]>")
.scale("<C:major D:mixolydian>/4")
.sound("piano")`} punchcard />
      <Callout>
        <p>如果你不清楚这些音阶名字是什么意思，完全不用担心。它们只是给一组"搭配起来很好听"的音符起的名字而已。慢慢来，你会找到自己喜欢的音阶！</p>
      </Callout>

      <h2>重复与延长</h2>
      <p><strong>用 @ 延长时值</strong></p>
      <CodeBlock code={`note("c@3 eb").sound("gm_acoustic_bass")`} punchcard />
      <Callout>
        <p>不写 <code>@</code> 就相当于写 <code>@1</code>。上面例子中，c 的时值是 3 个单位，eb 是 1 个单位。</p>
        <p>试着改改这个数字！</p>
      </Callout>

      <p><strong>在子序列里延长时值</strong></p>
      <CodeBlock code={`setcpm(60)
n("<[4@2 4] [5@2 5] [6@2 6] [5@2 5]>*2")
.scale("<C2:mixolydian F2:mixolydian>/4")
.sound("gm_acoustic_bass")`} punchcard />
      <Callout>
        <p>
          这种律动叫做 <code>shuffle</code>。每一拍有两个音符，第一个音符的时值是第二个的两倍。
          这有时也叫三连音摇摆（triplet swing），在蓝调和爵士乐里很常见。
        </p>
      </Callout>

      <p><strong>用 ! 重复</strong></p>
      <CodeBlock code={`setcpm(60)
note("c!2 [eb,<g a bb a>]").sound("piano")`} punchcard />
      <Callout>
        <p>试着在 <code>!</code>、<code>*</code> 和 <code>@</code> 之间切换看看，它们有什么区别？</p>
      </Callout>

      <h2>回顾总结</h2>
      <Table>
        <thead><tr><th>概念</th><th>写法</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>放慢</td><td>/</td><td><CodeBlock code={`note("[c a f e]/2")`} /></td></tr>
          <tr><td>交替</td><td>{'<>'}</td><td><CodeBlock code={`note("c a f <e g>")`} /></td></tr>
          <tr><td>延长</td><td>@</td><td><CodeBlock code={`note("c@3 e")`} /></td></tr>
          <tr><td>重复</td><td>!</td><td><CodeBlock code={`note("c!3 e")`} /></td></tr>
        </tbody>
      </Table>
      <p>新出现的函数：</p>
      <Table>
        <thead><tr><th>名称</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>note</td><td>用数字或字母设定音高</td><td><CodeBlock code={`note("b g e c").sound("piano")`} /></td></tr>
          <tr><td>scale</td><td>把 <code>n</code> 解释为音阶级数</td><td><CodeBlock code={`n("6 4 2 0").scale("C:minor").sound("piano")`} /></td></tr>
          <tr><td>$:</td><td>并行播放多个 pattern</td><td><CodeBlock code={'$: s("bd sd")\n$: note("c eb g")'} /></td></tr>
        </tbody>
      </Table>

      <h2>示例</h2>
      <p><strong>高级感低音线</strong></p>
      <CodeBlock code={`note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
.sound("gm_synth_bass_1")
.lpf(800) // 这个我们很快会学到`} />
      <p><strong>高级感旋律</strong></p>
      <CodeBlock code={`n(\`<
[~ 0] 2 [0 2] [~ 2]
[~ 0] 1 [0 1] [~ 1]
[~ 0] 3 [0 3] [~ 3]
[~ 0] 2 [0 2] [~ 2]
>*4\`).scale("C4:minor")
.sound("gm_synth_strings_1")`} />
      <p><strong>高级感鼓组</strong></p>
      <CodeBlock code={`sound("bd*4, [~ <sd cp>]*2, [~ hh]*4")
.bank("RolandTR909")`} />
      <p><strong>要是能把上面这些同时播放就好了……</strong></p>
      <Callout>
        <p>可以用 <code>$:</code> 做到 😙</p>
      </Callout>

      <h2>同时播放多个 pattern</h2>
      <p>如果想同时播放多个 pattern，记得在每一个前面写上 <code>$:</code>：</p>
      <CodeBlock code={`$: note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
  .sound("gm_synth_bass_1").lpf(800)

$: n(\`<
  [~ 0] 2 [0 2] [~ 2]
  [~ 0] 1 [0 1] [~ 1]
  [~ 0] 3 [0 3] [~ 3]
  [~ 0] 2 [0 2] [~ 2]
  >*4\`).scale("C4:minor")
  .sound("gm_synth_strings_1")

$: sound("bd*4, [~ <sd cp>]*2, [~ hh]*4")
.bank("RolandTR909")`} />
      <Callout>
        <p>试着把某一段的 <code>$</code> 改成 <code>_$</code>，可以静音那一部分！</p>
      </Callout>
      <p>这已经开始有点像真正的音乐了！我们有了声音、有了音符，现在拼图缺的最后一块是：效果。</p>
    </>
  );
}

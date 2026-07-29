import { CodeBlock, Table } from '../../components';

export default function TimeModifiers() {
  return (
    <>
      <p>下面这些函数会以某种方式修改 pattern 的时间结构。其中一些在迷你记谱法里也有对应的写法：</p>
      <Table>
        <thead>
          <tr>
            <th>函数</th>
            <th>迷你记谱法写法</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>"x".slow(2)</code></td>
            <td><code>"x/2"</code></td>
          </tr>
          <tr>
            <td><code>"x".fast(2)</code></td>
            <td><code>"x*2"</code></td>
          </tr>
          <tr>
            <td><code>"x".euclid(3,8)</code></td>
            <td><code>"x(3,8)"</code></td>
          </tr>
          <tr>
            <td><code>"x".euclidRot(3,8,1)</code></td>
            <td><code>"x(3,8,1)"</code></td>
          </tr>
        </tbody>
      </Table>

      <h2>slow</h2>
      <p>
        把一个 pattern 按给定的 cycle 数放慢，相当于迷你记谱法里的 <code>/</code> 操作符。
      </p>
      <CodeBlock code={`s("bd hh sd hh").slow(2) // s("[bd hh sd hh]/2")`} />

      <h2>fast</h2>
      <p>
        把一个 pattern 按给定的倍数加快，相当于迷你记谱法里的 <code>*</code> 操作符。
      </p>
      <CodeBlock code={`s("bd hh sd hh").fast(2) // s("[bd hh sd hh]*2")`} />

      <h2>early</h2>
      <p>
        让一个 pattern 提前开始，相当于 Tidal 里的 <code>{'<~'}</code> 操作符。
      </p>
      <CodeBlock code={`"bd ~".stack("hh ~".early(.1)).s()`} />

      <h2>late</h2>
      <p>
        让一个 pattern 延后开始，相当于 Tidal 里的 <code>{'~>'}</code> 操作符。
      </p>
      <CodeBlock code={`"bd ~".stack("hh ~".late(.1)).s()`} />

      <h2>clip / legato</h2>
      <p>把每个事件的持续时间乘以给定的倍数，超出该时长的部分会被截断。</p>
      <CodeBlock code={`note("c a f e").s("piano").clip("<.5 1 2>")`} />

      <h2>euclid</h2>
      <p>
        把 pattern 的结构改成欧几里得节奏（Euclidean rhythm）。欧几里得节奏是通过求两个数的最大公约数来生成的节奏，
        由加拿大计算机科学家 Godfried Toussaint 于 2004 年提出。因为只需要两个数字就能描述出大量的节奏型，欧几里得节奏在计算机／算法音乐中非常实用。
      </p>
      <CodeBlock code={`// 古巴 tresillo 节奏型
note("c3").euclid(3,8)`} />

      <h3>euclidRot</h3>
      <p>
        类似 <code>euclid</code>，但多了一个用于“旋转”结果序列的参数。
      </p>
      <CodeBlock code={`// 巴西的桑巴节奏链
note("c3").euclidRot(3,16,14)`} />

      <h3>euclidLegato</h3>
      <p>
        类似 <code>euclid</code>，但每个脉冲会一直延续到下一个脉冲触发，因此不会留有空隙。
      </p>
      <CodeBlock code={`note("c3").euclidLegato(3,8)`} />

      <h2>rev</h2>
      <p>
        反转 pattern 中的每一个 cycle。另见 <code>revv</code>，用于反转整个 pattern。
      </p>
      <CodeBlock code={`note("c d e g").rev()`} />

      <h2>palindrome</h2>
      <p>让 pattern 每隔一个 cycle 交替正放和倒放，形成回文效果。</p>
      <CodeBlock code={`note("c d e g").palindrome()`} />

      <h2>iter</h2>
      <p>
        把 pattern 划分成给定数量的子序列，按顺序播放这些子序列，但每个 cycle
        的起始子序列会往后移一位。播放完最后一个子序列后，又会回到第一个。
      </p>
      <CodeBlock code={`note("0 1 2 3".scale('A minor')).iter(4)`} />

      <h3>iterBack</h3>
      <p>
        与 <code>iter</code> 类似，但子序列以倒序播放。在 tidalcycles 中称为 <code>iter&apos;</code>。
      </p>
      <CodeBlock code={`note("0 1 2 3".scale('A minor')).iterBack(4)`} />

      <h2>ply</h2>
      <p>把每个事件按给定的次数重复播放。</p>
      <CodeBlock code={`s("bd ~ sd cp").ply("<1 2 3>")`} />

      <h2>segment</h2>
      <p>以每个 cycle n 个事件的速率对 pattern 采样，常用于把连续（continuous）pattern 转换为离散（discrete）pattern。</p>
      <CodeBlock code={`note(saw.range(40,52).segment(24))`} />

      <h2>compress</h2>
      <p>把每个 cycle 压缩进给定的时间段内，其余部分留空。</p>
      <CodeBlock code={`cat(
  s("bd sd").compress(.25,.75),
  s("~ bd sd ~")
)`} />

      <h2>zoom</h2>
      <p>播放 pattern 中由起止时间段指定的一部分，并把这部分拉伸铺满原本 pattern 的时间跨度。</p>
      <CodeBlock code={`s("bd*2 hh*3 [sd bd]*2 perc").zoom(0.25, 0.75)
// s("hh*3 [sd bd]*2") // 等价`} />

      <h2>linger</h2>
      <p>选取 pattern 的一部分（按给定比例），并循环这部分来填满剩余的 cycle。</p>
      <CodeBlock code={`s("lt ht mt cp, [hh oh]*2").linger("<1 .5 .25 .125>")`} />

      <h2>fastGap</h2>
      <p>
        类似 <code>fast</code> 加速，但不会像 <code>fast</code> 那样重复播放多次，而是把播放内容压缩进 cycle
        的前一部分，剩下的空间留空。例如下面这段，声音序列 “bd sn” 只会播放一次，但被压缩进 cycle
        的前半部分，即播放速度加快了一倍。
      </p>
      <CodeBlock code={`s("bd sd").fastGap(2)`} />

      <h2>inside</h2>
      <p>在一个 cycle “内部”执行某个操作。</p>
      <CodeBlock code={`"0 1 2 3 4 3 2 1".inside(4, rev).scale('C major').note()
// "0 1 2 3 4 3 2 1".slow(4).rev().fast(4).scale('C major').note()`} />

      <h2>outside</h2>
      <p>在一个 cycle “外部”执行某个操作。</p>
      <CodeBlock code={`"<[0 1] 2 [3 4] 5>".outside(4, rev).scale('C major').note()
// "<[0 1] 2 [3 4] 5>".fast(4).rev().slow(4).scale('C major').note()`} />

      <h2>cpm</h2>
      <p>
        以给定的“每分钟 cycle 数”播放 pattern（已废弃，建议改用全局的 <code>setcpm</code>）。
      </p>
      <CodeBlock code={`s("<bd sd>,hh*2").cpm(90) // = 90 bpm`} />

      <h2>ribbon</h2>
      <p>
        在给定的偏移量 <code>offset</code> 处循环播放 <code>cycles</code> 个 cycle。可以把整段时间想象成一条“缎带”，从中截取一小段并循环播放。
      </p>
      <CodeBlock code={`note("<c d e f>").ribbon(1, 2)`} />
      <CodeBlock code={`// 循环播放一段随机内容
n(irand(8).segment(4)).scale("c:pentatonic").ribbon(1337, 2)`} />
      <CodeBlock code={`// 节奏生成器
s("bd!16?").ribbon(29,.5)`} />

      <h2>swingBy</h2>
      <p>
        <code>swingBy(x, n)</code> 把每个 cycle 拆成 <code>n</code> 个小段，然后将每小段后半部分的事件按 <code>x</code>
        （相对于半小段大小的比例）延迟。<code>x</code> 为 0 时不做任何改变，<code>0.5</code>
        表示延迟半个音符时长，<code>1</code> 则会绕回到不改变。最终效果是一种摇摆（shuffle / swing）节奏感。
      </p>
      <CodeBlock code={`s("hh*8").swingBy(1/3, 4)`} />

      <h2>swing</h2>
      <p>
        <code>swingBy</code> 在 <code>1/3</code> 处的简写形式。
      </p>
      <CodeBlock code={`s("hh*8").swing(4)
// s("hh*8").swingBy(1/3, 4)`} />

      <p>了解了这些时间修饰符之后，我们接着看看控制参数（Control Parameters）。</p>
    </>
  );
}

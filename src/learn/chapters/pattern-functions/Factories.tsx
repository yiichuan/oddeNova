import { CodeBlock, Table } from '../../components';

export default function Factories() {
  return (
    <>
      <p>下面这些函数都会返回一个 pattern，它们分别对应着迷你记谱法里的某种写法：</p>
      <Table>
        <thead>
          <tr>
            <th>函数</th>
            <th>迷你记谱法写法</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>cat(x, y)</code></td>
            <td><code>{'"<x y>"'}</code></td>
          </tr>
          <tr>
            <td><code>seq(x, y)</code></td>
            <td><code>"x y"</code></td>
          </tr>
          <tr>
            <td><code>stack(x, y)</code></td>
            <td><code>"x,y"</code></td>
          </tr>
          <tr>
            <td><code>stepcat([3,x],[2,y])</code></td>
            <td><code>"x@3 y@2"</code></td>
          </tr>
          <tr>
            <td><code>polymeter([a, b, c], [x, y])</code></td>
            <td><code>{'"{a b c, x y}"'}</code></td>
          </tr>
          <tr>
            <td><code>polymeterSteps(2, x, y, z)</code></td>
            <td><code>"{'{x y z}'}%2"</code></td>
          </tr>
          <tr>
            <td><code>silence</code></td>
            <td><code>"~"</code></td>
          </tr>
        </tbody>
      </Table>

      <h2>cat</h2>
      <p>
        把给出的多个 pattern 拼接（英文 concatenate，故得名 cat）起来，每一个各占一个 cycle。别名为 <code>slowcat</code>。
      </p>
      <CodeBlock code={`cat("e5", "b4", ["d5", "c5"]).note()
// "<e5 b4 [d5 c5]>".note()`} />
      <p>也可以作为链式函数使用：</p>
      <CodeBlock code={`s("hh*4").cat(
   note("c4(5,8)")
)`} />

      <h2>seq</h2>
      <p>
        类似 <code>cat</code>，但内容会被压缩进同一个 cycle 里。别名为 <code>fastcat</code>。
      </p>
      <CodeBlock code={`seq("e5", "b4", ["d5", "c5"]).note()
// "e5 b4 [d5 c5]".note()`} />
      <p>也可以作为链式函数使用：</p>
      <CodeBlock code={`s("hh*4").seq(
  note("c4(5,8)")
)`} />

      <h2>stack</h2>
      <p>把给出的多个 pattern 叠放（并行播放）在一起。</p>

      <h2>stepcat</h2>
      <p>
        类似 <code>fastcat</code> 的“拼接”方式，但按每个 cycle 的步数（steps）比例分配空间，而不是简单地平均切分。步数既可以从
        pattern 中自动推断，也可以以 <code>[长度, pattern]</code> 的数组形式显式指定。别名为 <code>timecat</code>。
      </p>
      <CodeBlock code={`stepcat([3,"e3"],[1, "g3"]).note()
// 等价于 "e3@3 g3".note()`} />
      <CodeBlock code={`stepcat("bd sd cp","hh hh").sound()
// 等价于 "bd sd cp hh hh".sound()`} />

      <h2>arrange</h2>
      <p>把多个 pattern 按多个 cycle 排列在一起。接受若干个数组参数，每个数组包含两个元素：该 pattern 要播放的 cycle 数量，以及该 pattern 本身。</p>
      <CodeBlock code={`arrange(
  [4, "<c a f e>(3,8)"],
  [2, "<g a>(5,8)"]
).note()`} />

      <h2>polymeter</h2>
      <p>
        （实验性功能）对齐多个 pattern 的步数，创建复节拍（polymeter）。这些 pattern
        会各自重复，直到共同凑够一个公共周期。例如下面的例子中，第一个 pattern
        重复两次、第二个重复三次，凑到最小公倍数 6 步：
      </p>
      <CodeBlock code={`// 等价于 note("{c eb g, c2 g2}%6")
polymeter("c eb g", "c2 g2").note()`} />

      <h2>polymeterSteps</h2>
      <p>与 <code>polymeter</code> 类似，但第一个参数用于显式指定共同的步数。</p>

      <h2>silence</h2>
      <p>什么都不做，代表静音，相当于迷你记谱法里的 <code>~</code>。</p>
      <CodeBlock code={`silence // "~"`} />

      <h2>run</h2>
      <p>生成一个由 0 到 n-1 的整数组成的离散 pattern。</p>
      <CodeBlock code={`n(run(4)).scale("C4:pentatonic")
// n("0 1 2 3").scale("C4:pentatonic")`} />

      <h2>binary</h2>
      <p>根据给出的数字生成一个二进制 pattern。</p>
      <CodeBlock code={`"hh".s().struct(binary(5))
// "hh".s().struct("1 0 1")`} />

      <h2>binaryN</h2>
      <p>根据给出的数字生成一个二进制 pattern，并补齐到指定的位数长度。</p>
      <CodeBlock code={`"hh".s().struct(binaryN(55532, 16))
// "hh".s().struct("1 1 0 1 1 0 0 0 1 1 1 0 1 1 0 0")`} />
    </>
  );
}

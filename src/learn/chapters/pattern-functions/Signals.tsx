import { CodeBlock, Callout } from '../../components';

export default function Signals() {
  return (
    <>
      <p>
        信号（signal）是一种值连续变化的 pattern，理论上拥有无穷多个步数。它们能提供连续的数值流，可在任意离散的时间点上被采样。
      </p>

      <h2>saw</h2>
      <p>一个范围在 0 到 1 之间的锯齿波信号。</p>
      <CodeBlock code={`note("<c3 [eb3,g3] g2 [g3,bb3]>*8")
.clip(saw.slow(2))`} />
      <CodeBlock code={`n(saw.range(0,8).segment(8))
.scale('C major')`} />

      <h2>sine</h2>
      <p>一个范围在 0 到 1 之间的正弦波信号。</p>
      <CodeBlock code={`n(sine.segment(16).range(0,15))
.scale("C:minor")`} />

      <h2>cosine</h2>
      <p>一个范围在 0 到 1 之间的余弦波信号。</p>
      <CodeBlock code={`n(stack(sine,cosine).segment(16).range(0,15))
.scale("C:minor")`} />

      <h2>tri</h2>
      <p>一个范围在 0 到 1 之间的三角波信号。</p>
      <CodeBlock code={`n(tri.segment(8).range(0,7)).scale("C:minor")`} />

      <h2>square</h2>
      <p>一个范围在 0 到 1 之间的方波信号。</p>
      <CodeBlock code={`n(square.segment(4).range(0,7)).scale("C:minor")`} />

      <h2>rand</h2>
      <p>一个范围在 0 到 1 之间的连续随机数信号。</p>
      <CodeBlock code={`// 随机改变 cutoff
s("bd*4,hh*8").cutoff(rand.range(500,8000))`} />

      <h2>范围为 -1 到 1 的版本</h2>
      <Callout>
        <p>
          还有 <code>saw2</code>、<code>sine2</code>、<code>cosine2</code>、<code>tri2</code>、<code>square2</code>
          和 <code>rand2</code>，它们的取值范围是 -1 到 1！
        </p>
      </Callout>

      <h2>perlin</h2>
      <p>
        生成一个 <a href="https://en.wikipedia.org/wiki/Perlin_noise" target="_blank" rel="noopener noreferrer">Perlin 噪声</a>
        的连续 pattern，范围在 0 到 1 之间。
      </p>
      <CodeBlock code={`// 随机改变 cutoff
s("bd*4,hh*8").cutoff(perlin.range(500,8000))`} />

      <h2>irand</h2>
      <p>一个范围在 0 到 n-1 之间的连续随机整数信号。</p>
      <CodeBlock code={`// 从 0-7（即 C 到 C）之间随机选取音阶音符
n(irand(8)).struct("x x*2 x x*3").scale("C:minor")`} />

      <h2>brand</h2>
      <p>一个取值为 0 或 1 的连续随机信号（二值随机）。</p>
      <CodeBlock code={`s("hh*10").pan(brand)`} />

      <h2>brandBy</h2>
      <p>一个取值为 0 或 1 的连续随机信号（二值随机），可以指定取值为 1 的概率。</p>
      <CodeBlock code={`s("hh*10").pan(brandBy(0.2))`} />

      <h2>mouseX</h2>
      <p>鼠标 x 坐标位置的值，范围为 0 到 1。</p>
      <CodeBlock code={`n(mousex.segment(4).range(0,7)).scale("C:minor")`} />

      <h2>mouseY</h2>
      <p>鼠标 y 坐标位置的值，范围为 0 到 1。</p>
      <CodeBlock code={`n(mousey.segment(4).range(0,7)).scale("C:minor")`} />
    </>
  );
}

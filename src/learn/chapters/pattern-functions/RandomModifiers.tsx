import { CodeBlock } from '../../components';

export default function RandomModifiers() {
  return (
    <>
      <p>这些方法会给你的 pattern 加入随机行为。</p>

      <h2>choose</h2>
      <p>从给出的元素列表中随机选取一个。</p>
      <CodeBlock code={`note("c2 g2!2 d2 f1").s(choose("sine", "triangle", "bd:6"))`} />

      <h2>wchoose</h2>
      <p>从给出的元素列表中随机选取一个，每个元素可以指定各自的概率权重。</p>
      <CodeBlock code={`note("c2 g2!2 d2 f1").s(wchoose(["sine",10], ["triangle",1], ["bd:6",1]))`} />

      <h2>chooseCycles</h2>
      <p>
        每个 cycle 随机选取列表中的一个元素来播放。别名为 <code>randcat</code>。
      </p>
      <CodeBlock code={`chooseCycles("bd", "hh", "sd").s().fast(8)`} />
      <CodeBlock code={`s("bd | hh | sd").fast(8)`} />

      <h2>wchooseCycles</h2>
      <p>
        每个 cycle 随机选取一个元素来播放，每个元素可以指定各自的概率权重。别名为 <code>wrandcat</code>。
      </p>
      <CodeBlock code={`wchooseCycles(["bd",10], ["hh",1], ["sd",1]).s().fast(8)`} />
      <CodeBlock code={`wchooseCycles(["c c c",5], ["a a a",3], ["f f f",1]).fast(4).note()`} />
      <CodeBlock code={`// 概率本身也可以是一个 pattern
wchooseCycles(["bd(3,8)","<5 0>"], ["hh hh hh",3]).fast(4).s()`} />

      <h2>degradeBy</h2>
      <p>
        按给定的比例随机移除 pattern 中的事件。0 表示 0% 的移除概率，1 表示 100% 的移除概率。
      </p>
      <CodeBlock code={`s("hh*8").degradeBy(0.2)`} />
      <CodeBlock code={`s("[hh?0.2]*8")`} />
      <CodeBlock code={`// 节拍生成器
s("bd").segment(16).degradeBy(.5).ribbon(16,1)`} />

      <h2>degrade</h2>
      <p>
        随机移除 pattern 中 50% 的事件，是 <code>.degradeBy(0.5)</code> 的简写。
      </p>
      <CodeBlock code={`s("hh*8").degrade()`} />
      <CodeBlock code={`s("[hh?]*8")`} />

      <h2>undegradeBy</h2>
      <p>
        <code>degradeBy</code> 的反向操作：按给定比例随机移除事件，但 0 表示 100% 的移除概率，1 表示 0%
        的移除概率。凡是会被 degradeBy 移除的事件，都会被 undegradeBy 保留，反之亦然（见第二个例子）。
      </p>
      <CodeBlock code={`s("hh*8").undegradeBy(0.2)`} />
      <CodeBlock code={`s("hh*10").layer(
  x => x.degradeBy(0.2).pan(0),
  x => x.undegradeBy(0.8).pan(1)
)`} />

      <h2>undegrade</h2>
      <p>
        <code>degrade</code> 的反向操作：随机移除 50% 的事件，是 <code>.undegradeBy(0.5)</code>
        的简写。凡是会被 degrade 移除的事件，都会被 undegrade 保留，反之亦然。
      </p>
      <CodeBlock code={`s("hh*8").undegrade()`} />
      <CodeBlock code={`s("hh*10").layer(
  x => x.degrade().pan(0),
  x => x.undegrade().pan(1)
)`} />

      <h2>sometimesBy</h2>
      <p>
        以给定的概率随机地对 pattern 应用给出的函数，与 <code>someCyclesBy</code> 类似。
      </p>
      <CodeBlock code={`s("hh*8").sometimesBy(.4, x=>x.speed("0.5"))`} />

      <h2>sometimes</h2>
      <p>以 50% 的概率应用给出的函数。</p>
      <CodeBlock code={`s("hh*8").sometimes(x=>x.speed("0.5"))`} />

      <h2>someCyclesBy</h2>
      <p>
        以给定的概率，按每个 cycle 为单位随机应用给出的函数，与 <code>sometimesBy</code> 类似。
      </p>
      <CodeBlock code={`s("bd,hh*8").someCyclesBy(.3, x=>x.speed("0.5"))`} />

      <h2>someCycles</h2>
      <p>
        <code>.someCyclesBy(0.5, fn)</code> 的简写。
      </p>
      <CodeBlock code={`s("bd,hh*8").someCycles(x=>x.speed("0.5"))`} />

      <h2>often</h2>
      <p>
        <code>.sometimesBy(0.75, fn)</code> 的简写。
      </p>
      <CodeBlock code={`s("hh*8").often(x=>x.speed("0.5"))`} />

      <h2>rarely</h2>
      <p>
        <code>.sometimesBy(0.25, fn)</code> 的简写。
      </p>
      <CodeBlock code={`s("hh*8").rarely(x=>x.speed("0.5"))`} />

      <h2>almostNever</h2>
      <p>
        <code>.sometimesBy(0.1, fn)</code> 的简写。
      </p>
      <CodeBlock code={`s("hh*8").almostNever(x=>x.speed("0.5"))`} />

      <h2>almostAlways</h2>
      <p>
        <code>.sometimesBy(0.9, fn)</code> 的简写。
      </p>
      <CodeBlock code={`s("hh*8").almostAlways(x=>x.speed("0.5"))`} />

      <h2>never</h2>
      <p>
        <code>.sometimesBy(0, fn)</code> 的简写（永远不会调用 fn）。
      </p>
      <CodeBlock code={`s("hh*8").never(x=>x.speed("0.5"))`} />

      <h2>always</h2>
      <p>
        <code>.sometimesBy(1, fn)</code> 的简写（永远都会调用 fn）。
      </p>
      <CodeBlock code={`s("hh*8").always(x=>x.speed("0.5"))`} />
    </>
  );
}

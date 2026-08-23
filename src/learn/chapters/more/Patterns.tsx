import { CodeBlock, StaticCode } from '../../components';

export default function Patterns() {
  return (
    <>
      <p>
        Pattern（模式）是 Tidal 的核心所在，是一种把时间的流动表示为函数的抽象实体，采用了一种叫做「纯函数式响应式编程」（pure
        functional reactive programming）的技术。给定一个时间区间作为输入，一个 Pattern 可以输出在这段时间内发生的一组事件。事件在时间中如何分布，取决于这个
        Pattern 本身的结构。从现在开始，我们把「从一个时间区间生成事件」的这个过程称为「查询」（querying）。举例：
      </p>
      <CodeBlock
        code={`const pattern = sequence("c3", ["e3", "g3"])
const events = pattern.queryArc(0, 1)
console.log(events.map((e) => e.show()))
silence`}
      />
      <p>
        在这个例子里，我们用 <code>sequence</code> 函数创建了一个 pattern，然后对它做 <strong>查询</strong>
        （query），查询的时间区间是从 <code>0</code> 到 <code>1</code>。这些数字代表的时间单位叫做「cycle」（周期），一个 cycle
        的实际长度取决于速度，默认是每秒一个 cycle。得到的事件如下：
      </p>
      <StaticCode
        code={`[
  '[ 0/1 -> 1/2 | c3 ]', //
  '[ 1/2 -> 3/4 | e3 ]',
  '[ 3/4 -> 1/1 | g3 ]',
]`}
      />
      <p>
        每个事件都有一个值、一个开始时间和一个结束时间，时间用分数表示。在上面的例子里，这些事件按顺序排列：c3 占据了前半段，e3 和
        g3 一起占据了后半段。这个时间上的分布是 <code>sequence</code> 函数的结果——它会把参数平均分配到一个 cycle 里；如果某个参数本身是数组，同样的规则也会应用到这部分
        cycle 上。在这个例子里，e3 和 g3 就被平均分配到了整个 cycle 的后半段。
      </p>
      <p>
        注意，查询函数（query function）并不只是访问 pattern 的一种方式，而是——完全符合函数式编程的理念——就是 pattern
        本身。这意味着理论上没有办法「修改」一个 pattern：作为一个纯函数，它本身是不透明的（无法直接「修改」）。但实际上，Strudel 和 Tidal
        的全部意义都在于变换 pattern，那这是怎么做到的呢？答案是：用一个新的 pattern 替换旧的，而这个新 pattern 内部会调用旧的那个。这个新
        pattern 能做的只有两件事：把查询转交给旧 pattern 之前，先对查询本身做处理；拿到结果之后、返回给调用者之前，再对结果做一次处理。但仅凭这一点，就足以支撑
        Strudel（和 Tidal）庞大函数库所提供的全部时间与结构变换能力了。
      </p>
      <p>
        上面这些例子并不代表 Strudel 在实际使用中的样子。在 live coding 编辑器里，用户只需要输入 pattern 本身，查询会由调度器（scheduler）自动处理。调度器会反复查询这个 pattern 来获取事件，然后把这些事件交给声音合成或其他触发动作去执行。
      </p>
    </>
  );
}

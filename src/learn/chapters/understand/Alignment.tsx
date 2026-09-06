import { StaticCode } from '../../components';

export default function Alignment() {
  return (
    <>
      <p>
        Strudel 继承自 Tidal 的一个核心特性，是可以不受结构限制、灵活地组合多个 pattern。它的声明式（declarative）
        方式意味着 live coder 不需要考虑「怎么做」的细节，只需要考虑「要做什么」。
      </p>

      <p>
        举个简单的例子，考虑两个数字 pattern <code>"0 [1 2] 3"</code> 和 <code>"10 20"</code>。第一个有 3
        个长度相等的连续步骤，其中第二步又被拆成两个子步骤，一共 4 个事件（event）。这两个 pattern 的结构可以有非常多
        种组合方式，但 Strudel 和 Tidal 默认采用的方法是：把两个 pattern 的 cycle 对齐，然后把第一个 pattern
        里的事件和第二个 pattern 里的事件一一对应起来。因此，下面两行是等价的：
      </p>
      <StaticCode code={`'0 [1 2] 3'.add('10 20');
('10 [11 22] 23');`} />

      <p>
        当两个事件只是部分重叠时，会被当作第一个 pattern 中事件的片段来处理。这个概念稍微有点难理解，
        我们先来对比下面这个例子中的两个 pattern：
      </p>
      <StaticCode code={`'0 1 2'.add('10 20');
('10 [11 21] 22');`} />

      <p>
        这个例子和前一个类似，数字 <code>1</code> 被拆成两半，分别加到了 <code>10</code> 和 <code>20</code>
        上。不过，<code>11</code> 「记得」自己是原来那个 <code>1</code> 事件的一个片段，因此它的持续时长会被视为
        整个 cycle 的三分之一，尽管它实际只在六分之一 cycle 的时间内是激活状态。同样地，<code>21</code> 也是原来那个
        <code>1</code> 事件的片段，是它后一半的片段。因为这个事件的起点缺失了，它实际上不会触发声音（除非再经过
        其他 pattern 变换/组合）。
      </p>

      <p>
        实际上，这种默认的、隐式的组合两个 pattern 的方式，效果就是把第二个 pattern 加「进（in）」第一个 pattern 里，
        这一点也可以显式地写出来：
      </p>
      <StaticCode code={`'0 1 2'.add.in('10 20');`} />

      <p>这为其他对齐 pattern 的方式打开了空间，已经有几种被定义出来了，特别是：</p>
      <ul>
        <li>
          <code>in</code> - 如上所述，对齐两个 pattern 的 cycle，把右侧 pattern 的值应用「进（in）」左侧 pattern
        </li>
        <li>
          <code>out</code> - 和 <code>in</code> 类似，但值是从左侧 pattern 应用「出（out）」（也就是应用进右侧 pattern）
        </li>
        <li>
          <code>mix</code> - 两侧 pattern 的结构都被结合起来，新的事件不是片段，而是在两侧事件的交集处产生
        </li>
        <li>
          <code>squeeze</code> - 右侧 pattern 的 cycle 被压缩进左侧的事件里。例如
          <code>"0 1 2".add.squeeze("10 20")</code> 等价于 <code>"[10 20] [11 21] [12 22]"</code>
        </li>
        <li>
          <code>squeezeout</code> - 和 <code>squeeze</code> 类似，但左侧的 cycle 被压缩进右侧的事件里。因此
          <code>"0 1 2".add.squeezeout("10 20")</code> 等价于 <code>[10 11 12] [20 21 22]</code>
        </li>
        <li>
          <code>reset</code> - 与 <code>squeezeout</code> 类似，右侧的 cycle 与左侧的事件对齐，
          但这些 cycle 不是被「压缩」，而是被截断以适配事件长度。因此
          <code>"0 1 2 3 4 5 6 7".add.reset("10 [20 30]")</code> 等价于 <code>10 11 12 13 20 21 30 31</code>
          。实际上，右侧的事件会「重置」左侧的 cycle
        </li>
        <li>
          <code>restart</code> - 与 <code>reset</code> 类似，但 pattern 是从它最初的第一个 cycle 「重新开始」，
          而不是从当前 cycle 开始。因此 <code>reset</code> 和 <code>restart</code> 只有在最左侧的 pattern
          在不同 cycle 之间发生变化时，结果才会不同
        </li>
      </ul>

      <p>
        关于这些对齐函数的背景、设计和实际应用，我们留待未来的文章再深入探讨。不过在下一节，我们会以它们为案例，
        看看 Haskell 之于 Tidal、JavaScript 之于 Strudel，各自提供了怎样不同的设计空间。
      </p>

      <p>那么，Strudel 和 Tidal 到底该怎么比较呢？</p>
    </>
  );
}

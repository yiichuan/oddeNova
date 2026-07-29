import { CodeBlock, Callout } from '../../components';

export default function ValueModifiers() {
  return (
    <>
      <p>
        除了控制时间的函数之外，我们之前也看到过像 <code>note</code> 和 <code>cutoff</code>
        这样的函数，它们控制着一个事件的不同参数（简称 param）。现在我们更仔细地看一下这些 “param(eter) 函数” 是怎么工作的。
      </p>

      <h2>参数函数</h2>
      <p>tidal pattern 一个非常强大的特性是：每个参数都可以被独立控制：</p>
      <CodeBlock code={`note("c a f e")
.cutoff("<500 1000 2000 [4000 8000]>")
.gain(.8)
.s('sawtooth')
.log()`} />
      <p>
        在这个例子中，<code>note</code>、<code>cutoff</code>、<code>gain</code> 和 <code>s</code>
        这几个参数分别由不同的 pattern 或普通数值独立控制。按下播放后，我们可以在 <code>.log()</code>
        输出的每个事件（hap）里观察到它的时间和各参数值。
      </p>

      <h3>纯值 vs 已参数化的值</h3>
      <p>
        没有被包裹在 param 函数里的 pattern，包含的是没有标签的“纯值（plain values）”：
      </p>
      <CodeBlock code={`"<c e g>".log()`} />
      <p>这不会产生任何声音，因为 Strudel 无法猜出这些字母到底代表哪个参数。</p>
      <p>
        再对比一下用 <code>note</code> 包裹后的版本：
      </p>
      <CodeBlock code={`note("<c e g>").log()`} />
      <p>
        现在就很明确了：这些字母是要作为音符来播放的。在背后，<code>note</code>
        函数（以及所有其他 param 函数）会把每个纯值都包装进一个对象里。如果没有 <code>note</code>
        这个函数，我们就得这样写：
      </p>
      <CodeBlock code={`cat({note:'c'},{note:'e'},{note:'g'}).log()`} />
      <p>这样写会产生相同的输出，但写法相当繁琐，读写都不方便。</p>

      <h3>包裹参数函数</h3>
      <p>为了避免过多的嵌套，param 函数也可以像下面这样链式调用：</p>
      <CodeBlock code={`cat('c', 'e', 'g').note().log()`} />
      <p>
        这等价于 <code>note(cat('c','e','g')).log()</code>。
      </p>
      <p>
        任何声明了类型的函数（比如 <code>n</code>、<code>s</code>、<code>note</code>、<code>freq</code>
        等）都可以这样用，只要保证括号是空的即可！
      </p>

      <h3>纯值的修改</h3>
      <p>纯值 pattern 可以用下面的操作符来修改：</p>
      <CodeBlock code={`"50 60 70".add("<0 1 2>").log()`} />
      <p>这里 add 函数修改的是左边的数字。同样地，这里没有输出，因为这些数字脱离 param 就没有意义。</p>

      <h3>参数值的修改</h3>
      <p>要修改一个参数的值，你可以：</p>
      <ul>
        <li>
          在 param 函数内部，对纯值 pattern 使用操作符：
          <CodeBlock code={`note("50 60 70".add("<0 1 2>")).room(.1).log()`} />
        </li>
        <li>
          类似地，先对纯值 pattern 使用操作符，之后再包裹：
          <CodeBlock code={`"50 60 70".add("<0 1 2>").note().room(.1).log()`} />
        </li>
        <li>
          在操作符函数内部指定要修改哪个 param：
          <CodeBlock code={`note("50 60 70").room(.1).add(note("<0 1 2>")).log()`} />
        </li>
      </ul>
      <Callout>
        <p>记住，链式调用的执行顺序是从左到右的。</p>
      </Callout>

      <h2>操作符</h2>
      <p>这一组函数用于修改事件的值。</p>

      <h3>add</h3>
      <p>假设 pattern 中都是数字，把给定的数字加到每一项上。</p>
      <CodeBlock code={`// 这里的三和弦 0, 2, 4 被加上了不同的数值
n("0 2 4".add("<0 3 4 0>")).scale("C:major")
// 不用 add 的话，等价写法是：
// n("<[0 2 4] [3 5 7] [4 6 8] [0 2 4]>").scale("C:major")`} />
      <CodeBlock code={`// add 也可以用在音符上：
note("c3 e3 g3".add("<0 5 7 0>"))
// 在背后，音符会先被转换成 midi 编号：
// note("48 52 55".add("<0 5 7 0>"))`} />

      <h3>sub</h3>
      <p>
        与 <code>add</code> 类似，但做的是减法。
      </p>
      <CodeBlock code={`n("0 2 4".sub("<0 1 2 3>")).scale("C4:minor")
// 更多说明见 add`} />

      <h3>mul</h3>
      <p>把每个数字乘以给定的倍数。</p>
      <CodeBlock code={`"<1 1.5 [1.66, <2 2.33>]>*4".mul(150).freq()`} />

      <h3>div</h3>
      <p>把每个数字除以给定的除数。</p>

      <h3>round</h3>
      <p>假设是数字 pattern，返回一个把所有值四舍五入到最接近整数的新 pattern。</p>
      <CodeBlock code={`n("0.5 1.5 2.5".round()).scale("C:major")`} />

      <h3>floor</h3>
      <p>
        假设是数字 pattern，返回一个把所有值取数学下取整（floor）的新 pattern。例如 <code>3.7</code> 变成{' '}
        <code>3</code>，<code>-4.2</code> 变成 <code>-5</code>。
      </p>
      <CodeBlock code={`note("42 42.1 42.5 43".floor())`} />

      <h3>ceil</h3>
      <p>
        假设是数字 pattern，返回一个把所有值取数学上取整（ceil）的新 pattern。例如 <code>3.2</code> 变成{' '}
        <code>4</code>，<code>-4.2</code> 变成 <code>-4</code>。
      </p>
      <CodeBlock code={`note("42 42.1 42.5 43".ceil())`} />

      <h3>range</h3>
      <p>
        假设是数字 pattern，其中的值是 0 .. 1 区间内的单极性（unipolar）值。返回一个把这些值缩放到给定
        min/max 区间的新 pattern。最常与连续 pattern 搭配使用。
      </p>
      <CodeBlock code={`s("[bd sd]*2,hh*8")
.cutoff(sine.range(500,4000))`} />

      <h3>rangex</h3>
      <p>
        假设是数字 pattern，其中的值是 0 .. 1 区间内的单极性值。返回一个把这些值按指数曲线缩放到给定
        min/max 区间的新 pattern。
      </p>
      <CodeBlock code={`s("[bd sd]*2,hh*8")
.cutoff(sine.rangex(500,4000))`} />

      <h3>range2</h3>
      <p>
        假设是数字 pattern，其中的值是 -1 .. 1 区间内的双极性（bipolar）值。返回一个把这些值缩放到给定
        min/max 区间的新 pattern。
      </p>
      <CodeBlock code={`s("[bd sd]*2,hh*8")
.cutoff(sine2.range2(500,4000))`} />

      <h3>ratio</h3>
      <p>
        允许用 <code>:</code> 分隔的列表记法来做除法，返回一个只含数字的新 pattern。
      </p>
      <CodeBlock code={`ratio("1, 5:4, 3:2").mul(110)
.freq().s("piano")`} />

      <h3>as</h3>
      <p>
        批量设置多个属性。参数 <code>mapping</code>（字符串或数组）指定要设置的控制参数名。
      </p>
      <CodeBlock code={`"c:.5 a:1 f:.25 e:.8".as("note:clip")`} />
      <CodeBlock code={`"{0@2 0.25 0 0.5 .3 .5}%8".as("begin").s("sax_vib").clip(1)`} />

      <h2>自定义参数</h2>
      <p>你也可以创建自己的参数：</p>
      <CodeBlock code={`let x = createParam('x')
x(sine.range(0, 200))`} />
      <p>
        用 <code>createParams</code> 可以更简洁地一次创建多个参数：
      </p>
      <CodeBlock code={`let { x, y } = createParams('x', 'y');
x(sine.range(0, 200)).y(cosine.range(0, 200));`} />
      <Callout>
        <p>注意，这些参数只有在你的自定义 output 中被赋予实际含义后，才会真正起作用！</p>
      </Callout>
    </>
  );
}

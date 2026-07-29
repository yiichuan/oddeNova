import { CodeBlock, Table } from '../../components';

export default function MondoNotation() {
  return (
    <>
      <p>
        「Mondo 记谱法」是一种新的记谱法，和迷你记谱法（Mini Notation）很像，但功能更全，足以作为一门独立的 pattern
        语言使用。举个例子：
      </p>
      <CodeBlock
        code={`$ note (c2 # euclid <3 6 3> <8 16>) # *2
  # s "sine" # add (note [0 <12 24>]*2)
  # dec(sine # range .2 2)
  # room .5
  # lpf (sine/3 # range 120 400)
  # lpenv (rand # range .5 4)
  # lpq (perlin # range 5 12 # * 2)
  # dist 1 # fm 4 # fmh 5.01 # fmdecay <.1 .2>
  # postgain .6 # delay .1 # clip 5

$ s [bd bd bd bd] # bank tr909 # clip .5

# ply <1 [1 [2 4]]>

$ s oh*4 # press # bank tr909 # speed.8

# dec (<.02 .05>*2 # add (saw/8 # range 0 1))`}
      />

      <h2>REPL 中的 Mondo</h2>
      <p>目前，只能在 REPL 里这样使用 Mondo 记谱法：</p>
      <CodeBlock code={'mondo`s hh*8`'} />
      <p>本章接下来的内容只会展示 Mondo 记谱法本身。未来 REPL 可能会支持直接使用 Mondo 记谱法。</p>

      <h2>调用函数</h2>
      <p>
        相比迷你记谱法，Mondo 记谱法最大的特点是可以用圆括号调用函数：
      </p>
      <CodeBlock code={`(s hh*8)`} />
      <p>括号里的第一个元素是函数名。用 JS 写的话，看起来是这样：</p>
      <CodeBlock code={`s("hh*8")`} />
      <p>最外层的括号并不是必须的，可以省略：</p>
      <CodeBlock code={`s hh*8`} />

      <h2>迷你记谱法的特性</h2>
      <p>除了用圆括号调用函数之外，Mondo 记谱法还和迷你记谱法有很多共通之处：</p>

      <h3>括号</h3>
      <ul>
        <li>
          <code>[]</code> 表示一个 cycle 长的序列
        </li>
        <li>
          <code>{'<>'}</code> 表示跨多个 cycle 的序列
        </li>
        <li>
          <code>{'{}'}</code> 表示步进序列（stepped sequence，后面会详细讲）
        </li>
      </ul>

      <h3>中缀操作符</h3>
      <Table>
        <thead>
          <tr>
            <th>符号</th>
            <th>对应功能</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>*</code>
            </td>
            <td>fast（加速）</td>
          </tr>
          <tr>
            <td>
              <code>/</code>
            </td>
            <td>slow（减速）</td>
          </tr>
          <tr>
            <td>
              <code>!</code>
            </td>
            <td>extend（延展）</td>
          </tr>
          <tr>
            <td>
              <code>@</code>
            </td>
            <td>expand（扩展）</td>
          </tr>
          <tr>
            <td>
              <code>%</code>
            </td>
            <td>pace（步调）</td>
          </tr>
          <tr>
            <td>
              <code>?</code>
            </td>
            <td>degradeBy（目前需要右操作数）</td>
          </tr>
          <tr>
            <td>
              <code>:</code>
            </td>
            <td>tail（创建列表）</td>
          </tr>
          <tr>
            <td>
              <code>..</code>
            </td>
            <td>range（数字之间的范围）</td>
          </tr>
          <tr>
            <td>
              <code>,</code>
            </td>
            <td>stack（叠加）</td>
          </tr>
          <tr>
            <td>
              <code>|</code>
            </td>
            <td>chooseIn（随机选择）</td>
          </tr>
        </tbody>
      </Table>

      <h3>示例</h3>
      <CodeBlock
        code={`note <
[e5 [b4 c5] d5 [c5 b4]]
[a4 [a4 c5] e5 [d5 c5]]
[b4 [~ c5] d5 e5]
[c5 a4 a4 ~]
[[~ d5] [~ f5] a5 [g5 f5]]
[e5 [~ c5] e5 [d5 c5]]
[b4 [b4 c5] d5 e5]
[c5 a4 a4 ~]
>`}
      />

      <h2>链式调用函数</h2>
      <p>
        类似于 JavaScript 里的 <code>.</code>，我们可以用 <code>#</code> 操作符来链式调用函数：
      </p>
      <CodeBlock
        code={`n <0 2 4 [3 1] -1>*4
 # scale C4:minor
 # jux rev
 # dec .2
 # delay .5`}
      />
      <p>用 JS 写出来是一样的效果：</p>
      <CodeBlock
        code={`n("<0 2 4 [3 1] -1>*4")
 .scale("C4:minor")
 .jux(rev)
 .dec(.2)
 .delay(.5)`}
      />

      <h3>局部链式调用</h3>
      <p>用圆括号包起来，可以只把某个函数应用到单个元素上：</p>
      <CodeBlock code={`s [bd hh bd (cp # delay .6)] # bank tr909`} />
      <p>
        这里，<code>delay .6</code> 只会作用在 <code>cp</code> 上。对比一下对应的 JS 写法：
      </p>
      <CodeBlock code={`s(seq("bd", "hh", "bd", "cp".delay(.6))).bank('tr909')`} />
      <p>
        由此可以看出，当迷你记谱法和函数调用之间没有边界时，写法能省下多少笔墨！
      </p>

      <h3>中缀操作符的链式调用</h3>
      <p>中缀操作符本质上也是普通函数，同样可以链式调用：</p>
      <CodeBlock code={`s [bd hh] # bank tr909 # *2`} />
      <p>
        这里的 <code>*2</code> 会作用在整个 pattern 上。
      </p>

      <h3>Lambda 函数</h3>
      <p>Strudel 里有些函数需要接受一个函数作为参数，比如：</p>
      <CodeBlock code={`n("0 .. 7").scale("C:minor").sometimes(x=>x.dec(.1))`} />
      <p>
        在 Mondo 里，<code>x=&gt;x.</code> 这部分可以简写为：
      </p>
      <CodeBlock code={`n 0..7 # scale C:minor # sometimes (# dec .1)`} />
      <p>链式调用也一样可以正常使用：</p>
      <CodeBlock code={`n 0..7 # scale C:minor # sometimes (# dec .1 # jux rev)`} />

      <h2>字符串</h2>
      <p>你可以用「双引号」和'单引号'来得到字符串：</p>
      <CodeBlock code={`n 0..7 # scale 'C minor'`} />

      <h2>多个 pattern</h2>
      <p>
        用 <code>$</code> 符号可以分隔多个 pattern：
      </p>
      <CodeBlock
        code={`$ s [bd rim [~ bd] rim] # bank tr707
$ chord <Dm9!3 Db7> # voicing
  # struct[x ~ ~ x ~ x ~ ~] # delay .5`}
      />
      <p>
        <code>$</code> 符号其实是 <code>,</code> 的别名，背后同样会创建一个 stack。
      </p>

      <h2>变量</h2>
      <p>
        用 <code>def</code> 关键字，可以定义变量：
      </p>
      <CodeBlock
        code={`$ def melody [0 1 2 3]
$ n melody # scale C:minor`}
      />
    </>
  );
}

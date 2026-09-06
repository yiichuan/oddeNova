import { CodeBlock, Callout, Table } from '../../components';

export default function PatternEffects() {
  return (
    <>
      <p>
        到目前为止，我们见过的大部分函数其实其他音乐软件通常也具备类似的能力：编排声音、演奏音符、控制效果。
        这一章我们来看看 Tidal 更独有的一些函数。
      </p>

      <p><strong>用 rev 倒放 pattern</strong></p>
      <CodeBlock code={`n("0 1 [4 3] 2 0 2 [~ 3] 4").sound("jazz").rev()`} />

      <p><strong>用 jux 左右声道分别处理</strong></p>
      <CodeBlock code={`n("0 1 [4 3] 2 0 2 [~ 3] 4").sound("jazz").jux(rev)`} />
      <p>这等价于：</p>
      <CodeBlock code={`$: n("0 1 [4 3] 2 0 2 [~ 3] 4").sound("jazz").pan(0)
$: n("0 1 [4 3] 2 0 2 [~ 3] 4").sound("jazz").pan(1).rev()`} />
      <p>我们把它可视化一下：</p>
      <CodeBlock code={`$: n("0 1 [4 3] 2 0 2 [~ 3] 4").sound("jazz").pan(0).color("cyan")
$: n("0 1 [4 3] 2 0 2 [~ 3] 4").sound("jazz").pan(1).color("magenta").rev()`} punchcard />
      <Callout>
        <p>试着在某一行前面加 <code>//</code> 把它注释掉。</p>
      </Callout>

      <p><strong>多重速度</strong></p>
      <CodeBlock code={`note("c2, eb3 g3 [bb3 c4]").sound("piano").slow("0.5,1,1.5")`} />
      <p>这相当于：</p>
      <CodeBlock code={`$: note("c2, eb3 g3 [bb3 c4]").s("piano").slow(0.5).color('cyan')
$: note("c2, eb3 g3 [bb3 c4]").s("piano").slow(1).color('magenta')
$: note("c2, eb3 g3 [bb3 c4]").s("piano").slow(1.5).color('yellow')`} punchcard />
      <Callout>
        <p>试着注释掉其中一行或几行。</p>
      </Callout>

      <p><strong>add（数值相加）</strong></p>
      <CodeBlock code={`setcpm(60)
note("c2 [eb3,g3] ".add("<0 <1 -1>>"))
.color("<cyan <magenta yellow>>").adsr("[.1 0]:.2:[1 0]")
.sound("gm_acoustic_bass").room(.5)`} punchcard />
      <Callout>
        <p>给音符加上数字时，这个音符会被当成数字来处理。</p>
      </Callout>
      <p>我们可以多次叠加：</p>
      <CodeBlock code={`setcpm(60)
note("c2 [eb3,g3]".add("<0 <1 -1>>").add("0,7"))
.color("<cyan <magenta yellow>>").adsr("[.1 0]:.2:[1 0]")
.sound("gm_acoustic_bass").room(.5)`} punchcard />

      <p><strong>结合音阶使用 add</strong></p>
      <CodeBlock code={`n("0 [2 4] <3 5> [~ <4 1>]".add("<0 [0,2,4]>"))
.scale("C5:minor").release(.5)
.sound("gm_xylophone").room(.5)`} punchcard />

      <p><strong>叠放（stack）起来</strong></p>
      <CodeBlock code={`$: n("0 [2 4] <3 5> [~ <4 1>]".add("<0 [0,2,4]>"))
  .scale("C5:minor")
  .sound("gm_xylophone")
  .room(.4).delay(.125)
$: note("c2 [eb3,g3]".add("<0 <1 -1>>"))
  .adsr("[.1 0]:.2:[1 0]")
  .sound("gm_acoustic_bass")
  .room(.5)
$: n("0 1 [2 3] 2").sound("jazz").jux(rev)`} />

      <p><strong>ply</strong></p>
      <CodeBlock code={`sound("hh hh, bd rim [~ cp] rim").bank("RolandTR707").ply(2)`} punchcard />
      <p>这等价于写：</p>
      <CodeBlock code={`sound("hh*2 hh*2, bd*2 rim*2 [~ cp*2] rim*2").bank("RolandTR707")`} punchcard />
      <Callout>
        <p>试着给 <code>ply</code> 也加上 pattern，比如用 <code>"&lt;1 2 1 3&gt;"</code>。</p>
      </Callout>

      <p><strong>off</strong></p>
      <CodeBlock code={`n("0 [4 <3 2>] <2 3> [~ 1]"
  .off(1/16, x=>x.add(4))
  //.off(1/8, x=>x.add(7))
).scale("<C5:minor Db5:mixolydian>/2")
.s("triangle").room(.5).dec(.1)`} punchcard />
      <Callout>
        <p>写法 <code>.off(1/16, x=&gt;x.add(4))</code> 的意思是：</p>
        <ul>
          <li>拿到原始 pattern，记作 <code>x</code></li>
          <li>用 <code>.add(4)</code> 修改 <code>x</code></li>
          <li>把修改后的版本相对原始 pattern 偏移 <code>1/16</code> 个 cycle 播放</li>
        </ul>
      </Callout>
      <p>off 对修改其他声音同样有用，甚至可以嵌套使用：</p>
      <CodeBlock code={`s("bd sd [rim bd] sd,[~ hh]*4").bank("CasioRZ1")
  .off(2/16, x=>x.speed(1.5).gain(.25)
  .off(3/16, y=>y.vowel("<a e i o>*8")))`} />

      <Table>
        <thead><tr><th>名称</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>rev</td><td>倒放</td><td><CodeBlock code={`n("0 2 4 6 ~ 7 9 5").scale("C:minor").rev()`} /></td></tr>
          <tr><td>jux</td><td>左右声道分离，修改右声道</td><td><CodeBlock code={`n("0 2 4 6 ~ 7 9 5").scale("C:minor").jux(rev)`} /></td></tr>
          <tr><td>add</td><td>数字/音符相加</td><td><CodeBlock code={`n("0 2 4 6 ~ 7 9 5".add("<0 1 2 1>")).scale("C:minor")`} /></td></tr>
          <tr><td>ply</td><td>把每个事件加速 n 倍</td><td><CodeBlock code={`s("bd sd [~ bd] sd").ply("<1 2 3>")`} /></td></tr>
          <tr><td>off</td><td>复制、偏移时间并修改</td><td><CodeBlock code={`s("bd sd [~ bd] sd, hh*8").off(1/16, x=>x.speed(2))`} /></td></tr>
        </tbody>
      </Table>
    </>
  );
}

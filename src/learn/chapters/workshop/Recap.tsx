import { CodeBlock, Table } from '../../components';

export default function Recap() {
  return (
    <>
      <p>这一页只是把整个 workshop 里出现过的函数列一遍！</p>

      <h2>迷你记谱法（Mini Notation）</h2>
      <Table>
        <thead><tr><th>概念</th><th>写法</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>序列</td><td>空格</td><td><CodeBlock code={`sound("bd bd sd hh bd cp sd hh")`} /></td></tr>
          <tr><td>采样编号</td><td>:x</td><td><CodeBlock code={`sound("hh:0 hh:1 hh:2 hh:3")`} /></td></tr>
          <tr><td>休止</td><td>~</td><td><CodeBlock code={`sound("metal ~ jazz jazz:1")`} /></td></tr>
          <tr><td>子序列</td><td>[]</td><td><CodeBlock code={`sound("bd wind [metal jazz] hh")`} /></td></tr>
          <tr><td>子子序列</td><td>[[]]</td><td><CodeBlock code={`sound("bd [metal [jazz sd]]")`} /></td></tr>
          <tr><td>加速</td><td>*</td><td><CodeBlock code={`sound("bd sd*2 cp*3")`} /></td></tr>
          <tr><td>并行</td><td>,</td><td><CodeBlock code={`sound("bd*2, hh*2 [hh oh]")`} /></td></tr>
          <tr><td>放慢</td><td>/</td><td><CodeBlock code={`note("[c a f e]/2")`} /></td></tr>
          <tr><td>交替</td><td>{'<>'}</td><td><CodeBlock code={`note("c <e g>")`} /></td></tr>
          <tr><td>延长</td><td>@</td><td><CodeBlock code={`note("c@3 e")`} /></td></tr>
          <tr><td>重复</td><td>!</td><td><CodeBlock code={`note("c!3 e")`} /></td></tr>
        </tbody>
      </Table>

      <h2>声音</h2>
      <Table>
        <thead><tr><th>名称</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>sound</td><td>播放指定名字的声音</td><td><CodeBlock code={`sound("bd sd")`} /></td></tr>
          <tr><td>bank</td><td>选择音色库</td><td><CodeBlock code={`sound("bd sd").bank("RolandTR909")`} /></td></tr>
          <tr><td>n</td><td>选择采样编号</td><td><CodeBlock code={`n("0 1 4 2").sound("jazz")`} /></td></tr>
        </tbody>
      </Table>

      <h2>音符</h2>
      <Table>
        <thead><tr><th>名称</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>note</td><td>用数字或字母设定音高</td><td><CodeBlock code={`note("b g e c").sound("piano")`} /></td></tr>
          <tr><td>n + scale</td><td>在音阶中设定音符</td><td><CodeBlock code={`n("6 4 2 0").scale("C:minor").sound("piano")`} /></td></tr>
          <tr><td>$:</td><td>并行播放多个 pattern</td><td><CodeBlock code={`$: s("bd sd")\n$: note("c eb g")`} /></td></tr>
        </tbody>
      </Table>

      <h2>音频效果</h2>
      <Table>
        <thead><tr><th>名称</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>lpf</td><td><CodeBlock code={`note("c2 c3 c2 c3").s("sawtooth").lpf("400 2000")`} /></td></tr>
          <tr><td>vowel</td><td><CodeBlock code={`note("c3 eb3 g3").s("sawtooth").vowel("<a e i o>")`} /></td></tr>
          <tr><td>gain</td><td><CodeBlock code={`s("hh*16").gain("[.25 1]*4")`} /></td></tr>
          <tr><td>delay</td><td><CodeBlock code={`s("bd rim bd cp").delay(.5)`} /></td></tr>
          <tr><td>room</td><td><CodeBlock code={`s("bd rim bd cp").room(.5)`} /></td></tr>
          <tr><td>pan</td><td><CodeBlock code={`s("bd rim bd cp").pan("0 1")`} /></td></tr>
          <tr><td>speed</td><td><CodeBlock code={`s("bd rim bd cp").speed("<1 2 -1 -2>")`} /></td></tr>
          <tr><td>range</td><td><CodeBlock code={`s("hh*32").lpf(saw.range(200,4000))`} /></td></tr>
        </tbody>
      </Table>

      <h2>Pattern 效果</h2>
      <Table>
        <thead><tr><th>名称</th><th>说明</th><th>示例</th></tr></thead>
        <tbody>
          <tr><td>setcpm</td><td>设置每分钟 cycle 数（速度）</td><td><CodeBlock code={`setcpm(45); sound("bd sd [~ bd] sd")`} /></td></tr>
          <tr><td>fast</td><td>加速</td><td><CodeBlock code={`sound("bd sd [~ bd] sd").fast(2)`} /></td></tr>
          <tr><td>slow</td><td>放慢</td><td><CodeBlock code={`sound("bd sd [~ bd] sd").slow(2)`} /></td></tr>
          <tr><td>rev</td><td>倒放</td><td><CodeBlock code={`n("0 2 4 6").scale("C:minor").rev()`} /></td></tr>
          <tr><td>jux</td><td>左右声道分离，修改右声道</td><td><CodeBlock code={`n("0 2 4 6").scale("C:minor").jux(rev)`} /></td></tr>
          <tr><td>add</td><td>数字/音符相加</td><td><CodeBlock code={`n("0 2 4 6".add("<0 1 2 1>")).scale("C:minor")`} /></td></tr>
          <tr><td>ply</td><td>把每个事件加速 n 倍</td><td><CodeBlock code={`s("bd sd").ply("<1 2 3>")`} /></td></tr>
          <tr><td>off</td><td>复制、偏移时间并修改</td><td><CodeBlock code={`s("bd sd, hh*4").off(1/8, x=>x.speed(2))`} /></td></tr>
        </tbody>
      </Table>
    </>
  );
}

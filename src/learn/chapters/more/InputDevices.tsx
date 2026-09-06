import { CodeBlock, Table } from '../../components';

export default function InputDevices() {
  return (
    <>
      <p>Strudel 支持各种输入设备，比如手柄（Gamepad）和 MIDI 控制器，用来实时操控 pattern。</p>

      <h2>手柄（Gamepad）</h2>
      <p>
        Gamepad 模块可以让你把手柄输入接入到自己的音乐 pattern 里，这在现场演出或互动装置中特别有用——你可以用手柄来操控声音。
      </p>

      <h3>开始使用</h3>
      <p>
        调用 <code>gamepad()</code> 函数（可以传入一个可选的索引参数）来初始化一个手柄。
      </p>
      <CodeBlock
        code={`// Initialize gamepad (optional index parameter, defaults to 0)
const gp = gamepad(0)
note("c a f e").mask(gp.a)`}
      />

      <h3>可用的控制项</h3>
      <p>Gamepad 模块把按键和摇杆都暴露为归一化的信号（0 到 1），可以用来调制你的 pattern。</p>

      <h4>按键</h4>
      <Table>
        <thead>
          <tr>
            <th>类型</th>
            <th>控制项</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>面部按键</td>
            <td>
              <code>a</code>、<code>b</code>、<code>x</code>、<code>y</code>（大写 <code>A</code>、<code>B</code>、
              <code>X</code>、<code>Y</code> 也可以）；开关版本：<code>tglA</code>、<code>tglB</code>、
              <code>tglX</code>、<code>tglY</code>
            </td>
          </tr>
          <tr>
            <td>肩键</td>
            <td>
              <code>lb</code>、<code>rb</code>、<code>lt</code>、<code>rt</code>（大写同理）；开关版本：
              <code>tglLB</code>、<code>tglRB</code>、<code>tglLT</code>、<code>tglRT</code>
            </td>
          </tr>
          <tr>
            <td>方向键</td>
            <td>
              <code>up</code>、<code>down</code>、<code>left</code>、<code>right</code>（或简写 <code>u</code>、
              <code>d</code>、<code>l</code>、<code>r</code>，也可大写）；开关版本：<code>tglUp</code>、
              <code>tglDown</code>、<code>tglLeft</code>、<code>tglRight</code>（或 <code>tglU</code>、
              <code>tglD</code>、<code>tglL</code>、<code>tglR</code>）
            </td>
          </tr>
          <tr>
            <td>摇杆按键</td>
            <td>
              <code>l3</code>、<code>r3</code>（或 <code>ls</code>、<code>rs</code>）；开关版本：
              <code>tglL3</code>、<code>tglR3</code>（或 <code>tglLs</code>、<code>tglRs</code>）
            </td>
          </tr>
          <tr>
            <td>系统按键</td>
            <td>
              <code>start</code>、<code>back</code>（大写同理）；开关版本：<code>tglStart</code>、
              <code>tglBack</code>
            </td>
          </tr>
        </tbody>
      </Table>

      <h4>摇杆</h4>
      <Table>
        <thead>
          <tr>
            <th>摇杆</th>
            <th>控制项</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>左摇杆</td>
            <td>
              <code>x1</code>、<code>y1</code>（0 到 1 区间）；<code>x1_2</code>、<code>y1_2</code>（-1 到 1
              区间）
            </td>
          </tr>
          <tr>
            <td>右摇杆</td>
            <td>
              <code>x2</code>、<code>y2</code>（0 到 1 区间）；<code>x2_2</code>、<code>y2_2</code>（-1 到 1
              区间）
            </td>
          </tr>
        </tbody>
      </Table>

      <h4>按键序列</h4>
      <p>
        <code>btnSequence()</code>、<code>btnSeq()</code>、<code>btnseq()</code>：用来检测按键序列。
      </p>

      <h3>使用手柄输入</h3>
      <p>初始化后，你可以在 pattern 里使用各种手柄输入，下面是几个例子。</p>

      <h4>按键输入</h4>
      <p>可以用按键输入来控制音乐的不同方面，比如音量或触发某个事件。</p>
      <CodeBlock
        code={`const gp = gamepad(0)
setcpm(120)
// Use button values to control amplitude
$: stack(
  s("[[hh hh] oh hh oh]/2").mask(gp.tglX).bank("RolandTR909"), // X btn for HH
   s("cr*1").mask(gp.Y).bank("RolandTR909"), // LB btn for CR
  s("bd").mask(gp.tglA).bank("RolandTR909"), // A btn for BD
  s("[ht - - mt - - lt - ]/2").mask(gp.tglB).bank("RolandTR909"), // B btn for Toms
  s("sd*4").mask(gp.RB).bank("RolandTR909"), // RB btn for SD
)`}
      />

      <h4>摇杆输入</h4>
      <p>摇杆可以用于连续控制，比如变调或声像调整。</p>
      <CodeBlock
        code={`const gp = gamepad(0)
setcpm(120)
// Use analog stick for continuous control
$: note("c4 d3 a3 e3").sound("sawtooth")
  .lpf(gp.x1.range(100,4000))
  .lpq(gp.y1.range(5,30))
  .decay(gp.y2.range(0.1,2))
  .lpenv(gp.x2.range(-5,5))`}
      />

      <h4>按键序列</h4>
      <p>你可以定义按键序列，当检测到某个序列时触发特定的动作，比如播放某个声音。</p>
      <CodeBlock
        code={`const gp = gamepad(0)
setcpm(120)
// Define button sequences
const HADOUKEN = [
  'd',               // Down
  'r',               // Right
  'a',               // A
]
const KONAMI = 'uuddlrlrba' //Konami Code

// Check button sequence (returns 1 while detected, 0 when not within last 1 second)
$: s("free_hadouken -").slow(2)
.mask(gp.btnSequence(HADOUKEN)).room(1)

// hadouken.wav by Syna-Max
//https://freesound.org/people/Syna-Max/sounds/67674/
samples({free_hadouken: 'https://cdn.freesound.org/previews/67/67674_111920-lq.mp3'})`}
      />

      <h3>多个手柄</h3>
      <p>Strudel 支持连接多个手柄，可以通过指定手柄索引来连接不同的设备。</p>
      <CodeBlock
        code={`const pad1 = gamepad(0);  // First gamepad
const pad2 = gamepad(1);  // Second gamepad`}
      />
    </>
  );
}

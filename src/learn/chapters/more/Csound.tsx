import { CodeBlock, Table } from '../../components';

export default function Csound() {
  return (
    <>
      <p>
        🧪 Strudel 通过{' '}
        <a href="https://www.npmjs.com/package/@csound/browser" target="_blank" rel="noopener noreferrer">
          @csound/browser
        </a>{' '}
        对 csound 提供了实验性的支持。
      </p>

      <h2>导入 .orc 文件</h2>
      <p>要使用现有的 csound 乐器，可以像这样从某个 URL 加载并使用一个 orc 文件：</p>
      <CodeBlock
        code={`// livecode.orc by Steven Yi
await loadOrc('github:kunstmusik/csound-live-code/master/livecode.orc')
note("c a f e").csound('FM1')`}
      />
      <p>
        注意上面的 URL 用了 <code>github:</code> 这个快捷写法，它会解析为 GitHub 上对应文件的原始地址，不过你也可以用任何你喜欢的
        URL。
      </p>
      <p>
        这个很棒的{' '}
        <a href="https://github.com/kunstmusik/csound-live-code" target="_blank" rel="noopener noreferrer">
          由 Steven Yi 编写的 livecode.orc
        </a>{' '}
        自带了许多可以直接使用的音色：
      </p>
      <CodeBlock
        code={`// livecode.orc by Steven Yi
await loadOrc('github:kunstmusik/csound-live-code/master/livecode.orc')
note("c a f e").csound(cat(
"Sub1", // 减法合成，3 振荡器
"Sub2", //  减法合成，两个相差五度的锯齿波
"Sub3", //  减法合成，三个失谐的锯齿波，带渐强
"Sub4", //  减法合成，失谐的方波/锯齿波，音色扎实
"Sub5", //  减法合成，失谐的方波/三角波
"Sub6", //  减法合成，锯齿波，K35 滤波器
"Sub7", //  减法合成，锯齿波+三角波，K35 滤波器
"Sub8", //  减法合成，方波+锯齿波+三角波，二极管梯形滤波器
"SynBrass", //  减法合成铜管音色
"SynHarp", //  减法合成竖琴音色
"SSaw", //  用 9 个带限锯齿波叠加出的超级锯齿（SuperSaw）音色
"Mode1", //  模态合成乐器：打击乐/风琴质感的音色
"Plk", //  用脉冲、噪声和波导实现的拨弦音色
"Organ1", //  加法合成的波表风琴音色
"Organ2", //  基于 M1 Organ 2 音色的风琴音色
"Organ3", //  基于长笛波表的风琴音色
"Bass", //  减法合成贝斯音色
"ms20_bass", //  MS20 风格的贝斯音色
"VoxHumana", //  VoxHumana 音色
"FM1", //  FM 合成 3:1 载调比，2->0.025 调制指数，适合做贝斯
"Noi", //  滤波噪声，指数包络
"Wobble", //  基于 Jacob Joaquin 的 Tempo-Synced Wobble Bass 制作的摆动音色
"Sine", //  简单的正弦波乐器，指数包络
"Square", //  简单的方波乐器，指数包络
"Saw", //  简单的锯齿波乐器，指数包络
"Squine1", //  Squinewave 合成，双振荡器
"Form1", //  共振峰合成，蜂音源+女高音元音共振峰
"Mono", //  使用锯齿波和四极低通滤波器的单音合成器
"MonoNote", //  配合 Mono 使用的音符演奏乐器
"Click", //  带通滤波的脉冲，故障感的点击音色
"NoiSaw", //  高通滤波的噪声+锯齿波音色
"Clap", //  由 Istvan Varga 改编的拍手音色（clap1.orc）
"BD", //  底鼓——出自 Iain McCurdy 的 TR-808.csd
"SD", //  军鼓——出自 Iain McCurdy 的 TR-808.csd
"OHH", //  开踩镲——出自 Iain McCurdy 的 TR-808.csd
"CHH", //  闭踩镲——出自 Iain McCurdy 的 TR-808.csd
"HiTom", //  高音嗵鼓——出自 Iain McCurdy 的 TR-808.csd
"MidTom", //  中音嗵鼓——出自 Iain McCurdy 的 TR-808.csd
"LowTom", //  低音嗵鼓——出自 Iain McCurdy 的 TR-808.csd
"Cymbal", //  镲片——出自 Iain McCurdy 的 TR-808.csd
"Rimshot", //  军鼓边击——出自 Iain McCurdy 的 TR-808.csd
"Claves", //  响棒——出自 Iain McCurdy 的 TR-808.csd
"Cowbell", //  牛铃——出自 Iain McCurdy 的 TR-808.csd
"Maraca", //  沙铃——出自 Iain McCurdy 的 TR-808.csd
"HiConga", //  高音康加鼓——出自 Iain McCurdy 的 TR-808.csd
"MidConga", //  中音康加鼓——出自 Iain McCurdy 的 TR-808.csd
"LowConga", //  低音康加鼓——出自 Iain McCurdy 的 TR-808.csd
))`}
      />

      <h2>编写自己的乐器</h2>
      <p>
        你可以用 <code>loadCsound</code> 定义自己的乐器，像这样：
      </p>
      <CodeBlock
        code={`await loadCsound\`
instr CoolSynth
    iduration = p3
    ifreq = p4
    igain = p5
    ioct = octcps(ifreq)

    kpwm = oscili(.05, 8)
    asig = vco2(igain, ifreq, 4, .5 + kpwm)
    asig += vco2(igain, ifreq * 2)

    idepth = 2
    acut = transegr:a(0, .005, 0, idepth, .06, -4.2, 0.001, .01, -4.2, 0) ; filter envelope
    asig = zdf_2pole(asig, cpsoct(ioct + acut + 2), 0.5)

    iattack = .01
    isustain = .5
    idecay = .1
    irelease = .1
    asig *= linsegr:a(0, iattack, 1, idecay, isustain, iduration, isustain, irelease, 0)

    out(asig, asig)

endin\`

"<0 2 [4 6](3,4,2) 3*2>"
.off(1/4, add(2))
.off(1/2, add(6))
.scale('D minor')
.note()
.csound('CoolSynth')`}
      />

      <h2>参数</h2>
      <p>
        <code>.csound</code> 函数会传递以下 p 值：
      </p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>含义</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>p1</td>
            <td>
              乐器名，例如 <code>CoolSynth</code>
            </td>
          </tr>
          <tr>
            <td>p2</td>
            <td>时间偏移，即事件应该何时播放</td>
          </tr>
          <tr>
            <td>p3</td>
            <td>事件（hap）的持续时间</td>
          </tr>
          <tr>
            <td>p4</td>
            <td>频率，单位赫兹</td>
          </tr>
          <tr>
            <td>p5</td>
            <td>
              归一化的 <code>gain</code>（0 到 1）
            </td>
          </tr>
        </tbody>
      </Table>
      <p>
        还有一个风味不同的替代函数 <code>.csoundm</code>：
      </p>
      <Table>
        <thead>
          <tr>
            <th>参数</th>
            <th>含义</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>p4</td>
            <td>MIDI 音符编号，不取整，范围 0-127</td>
          </tr>
          <tr>
            <td>p5</td>
            <td>MIDI 力度（velocity），范围 0-127</td>
          </tr>
        </tbody>
      </Table>
      <p>
        无论哪种情况，p4 都是根据 <code>freq</code> 或 <code>note</code> 的值推算出来的。
      </p>

      <h2>局限性 / 未来计划</h2>
      <p>
        除了上面列出的这些 p 值，目前没有其他参数可以被 pattern 化。这也意味着{' '}
        <a href="https://strudel.cc/learn/effects/" target="_blank" rel="noopener noreferrer">
          音频效果
        </a>{' '}
        目前无法在 csound 乐器上生效。未来可以把所有被 pattern
        化的控制参数传给 csound 乐器，从而改进这项集成，具体做法可能是为每个值建立一个专属的
        channel（通道）。也可能会考虑为 Strudel 的效果做一套标准的 csound 乐器库。
      </p>
    </>
  );
}

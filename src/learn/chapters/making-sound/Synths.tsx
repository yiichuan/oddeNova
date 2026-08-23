import { CodeBlock } from '../../components';

export default function Synths() {
  return (
    <>
      <p>除了采样引擎之外，Strudel 还内置了一个可以实时生成声音的合成器。</p>

      <h2>基础波形</h2>
      <p>
        基础波形有 <code>sine</code>（正弦波）、<code>sawtooth</code>（锯齿波）、<code>square</code>（方波）和{' '}
        <code>triangle</code>（三角波），可以通过 <code>sound</code>（或简写 <code>s</code>）来选择：
      </p>
      <CodeBlock
        code={`note("c2 <eb2 <g2 g1>>".fast(2))
.sound("<sawtooth square triangle sine>")
._scope()`}
      />
      <p>
        如果你没有设置 <code>sound</code>，但设置了 <code>note</code>，那么 <code>sound</code> 会默认使用{' '}
        <code>triangle</code>！
      </p>

      <h2>噪声</h2>
      <p>
        你也可以把波形设置为 <code>white</code>、<code>pink</code> 或 <code>brown</code>，把噪声用作声音来源。这几种是不同类型的噪声，按照从明亮刺耳到柔和的顺序排列：
      </p>
      <CodeBlock code={`sound("<white pink brown>")._scope()`} />
      <p>下面是一个更贴近实际音乐用途的例子：用噪声做 hihat：</p>
      <CodeBlock
        code={`sound("bd*2,<white pink brown>*8")
.decay(.04).sustain(0)._scope()`}
      />
      <p>
        也可以用 <code>noise</code> 参数为任意振荡器添加一定量的粉噪声：
      </p>
      <CodeBlock code={`note("c3").noise("<0.1 0.25 0.5>")._scope()`} />
      <p>
        你还可以用 <code>crackle</code> 类型播放一些细微的噪声爆裂声，用 <code>density</code> 参数控制爆裂的密度：
      </p>
      <CodeBlock code={`s("crackle*4").density("<0.01 0.04 0.2 0.5>".slow(2))._scope()`} />

      <h3>加法合成（Additive Synthesis）</h3>
      <p>
        周期性波形是由基频之上、频率为整数倍的若干{' '}
        <a href="https://en.wikipedia.org/wiki/Harmonic" target="_blank" rel="noopener noreferrer">
          谐波（harmonics）
        </a>{' '}
        组合而成的。这些泛音的组合决定了一个声音独有的音色质感。
      </p>
      <p>
        对于基础波形，我们提供了 <code>partials</code> 和 <code>phases</code> 函数来控制这些谐波。
      </p>

      <h4>Partials</h4>
      <p>
        <code>partials</code> 指的是每个谐波相对基频的幅度大小。因此它可以用来对波形做频谱整形，滤除一部分刺耳的高频成分：
      </p>
      <CodeBlock
        code={`note("c2 <eb2 <g2 g1>>".fast(2))
.sound("sawtooth")
.partials([1, 1, "<1 0>", "<1 0>", "<1 0>", "<1 0>", "<1 0>"])
._scope()`}
      />
      <p>
        <code>partials</code> 也可以用来配合 <code>user</code> 这个声音源，构造出我们内置基础波形集里没有的{' '}
        <em>全新</em>波形：
      </p>
      <CodeBlock
        code={`note("c2 <eb2 <g2 g1>>".fast(2))
.sound("user")
.partials([1, 0, 0.3, 0, 0.1, 0, 0, 0.3])
._scope()`}
      />
      <p>我们也可以用 JavaScript 代码算法式地生成一组幅度数值，比如：</p>
      <CodeBlock
        code={`const numHarmonics = 22;
note("c2 <eb2 <g2 g1>>".fast(2))
.sound("saw")
.partials(new Array(numHarmonics).fill(1))
._scope()`}
      />
      <p>这样得到的是一种频谱滤波器效果。或者这样写：</p>
      <CodeBlock
        code={`note("c2 <eb2 <g2 g1>>").fast(2)
.sound("user")
.partials(new Array(50).fill(0)
  .map((_, idx) => ((-1) ** (idx + 1)) / (idx + 1))
)
._scope()`}
      />
      <p>这样写就会还原出一个我们比较熟悉的波形。</p>
      <p>
        <code>partials</code> 也兼容那些专门用来生成列表的 pattern 函数，比如 <code>randL</code> 或{' '}
        <code>binaryL</code>：
      </p>
      <CodeBlock
        code={`note("c2 <eb2 <g2 g1>>").fast(2)
.sound("user")
.partials(randL(10))
._scope()`}
      />
      <p>以及由 pattern 组成的列表：</p>
      <CodeBlock
        code={`note("c2 <eb2 <g2 g1>>".fast(4))
.sound("user")
.partials([1, 0, "0 1", "0 1 0.3", rand])
._scope()`}
      />
      <p>
        注意，<code>partials</code> 数组里的第一个值控制的是基频谐波的幅度，而不是直流偏置（DC offset）——直流偏置固定为
        0。
      </p>

      <h4>Phases</h4>
      <p>
        前面提到，周期性波形可以分解成基频之上的一组谐波。每个谐波有两个决定性属性：幅度（响度）和相位——相位决定了这个正弦波在波形被构造出来时，从其自身周期的哪个位置开始。
      </p>
      <p>这些相位同样可以在 Strudel 中声明，能为你的声音带来有趣的层次感。</p>
      <CodeBlock
        code={`s("saw").seg(16).n(irand(12)).scale("F1:minor")
  .penv(48).panchor(0).pdec(0.05)
  .delay(0.25).room(0.25)
  .compressor(-20).vib(0.3)
  .partials(randL(200))
  .phases(randL(200))`}
      />

      <h2>颤音（Vibrato）</h2>

      <h3>vib</h3>
      <p>为振荡器的频率添加颤音效果，参数为颤音的频率（赫兹）。</p>
      <CodeBlock
        code={`note("a e")
.vib("<.5 1 2 4 8 16>")
._scope()`}
      />
      <p>
        用 <code>:</code> 可以额外改变调制深度：
      </p>
      <CodeBlock
        code={`note("a e")
.vib("<.5 1 2 4 8 16>:12")
._scope()`}
      />

      <h3>vibmod</h3>
      <p>
        设置颤音的调制深度（单位为半音）。只有在同时设置了 <code>vibrato</code> / <code>vib</code> / <code>v</code>{' '}
        时才会生效。
      </p>
      <CodeBlock
        code={`note("a e").vib(4)
.vibmod("<.25 .5 1 2 12>")
._scope()`}
      />
      <p>
        同样可以用 <code>:</code> 改变颤音本身的频率：
      </p>
      <CodeBlock
        code={`note("a e")
.vibmod("<.25 .5 1 2 12>:8")
._scope()`}
      />

      <h2>调频合成（FM Synthesis）</h2>
      <p>调频合成（FM）是一种通过快速改变基础波形的频率来改变音色的技术。</p>
      <p>你可以在上面任何一种波形上使用 FM，不过下面的例子都用默认的三角波演示。</p>

      <h3>fm / fmi</h3>
      <p>
        设置合成器的调频量，控制调制指数（modulation index），也就是决定声音明亮程度的参数。可以在数字后面加上编号来单独控制 8
        路 FM 中某一路的调制指数（例如 <code>fm3</code>）。多路 FM 之间还可以用类似 <code>fm13</code>{' '}
        的矩阵写法互相路由——表示把 <code>fm1</code> 路由到 <code>fm3</code>。
      </p>
      <CodeBlock
        code={`note("c e g b g e")
.fm("<0 1 2 8 32>")
._scope()`}
      />
      <CodeBlock
        code={`s("sine").note("F1").seg(8)
 .fm(4).fm2(rand.mul(4)).fm3(saw.mul(8).slow(8))
 .fmh(1.06).fmh2(10).fmh3(0.1)`}
      />

      <h3>fmh</h3>
      <p>
        设置调频谐波比（Frequency Modulation Harmonicity Ratio），控制声音的音色。整数和简单比例听起来更自然，小数和复杂比例则听起来更具金属质感。可以在数字后面加上编号来单独控制 8
        路 FM 中某一路的谐波比（例如 <code>fmh2</code>）。
      </p>
      <CodeBlock
        code={`note("c e g b g e")
.fm(4)
.fmh("<1 2 1.5 1.61>")
._scope()`}
      />

      <h3>fmattack</h3>
      <p>FM 包络的起音时间：达到最大调制量所需的时间。</p>
      <CodeBlock
        code={`note("c e g b g e")
.fm(4)
.fmattack("<0 .05 .1 .2>")
._scope()`}
      />

      <h3>fmdecay</h3>
      <p>FM 包络的衰减时间：起音阶段结束后，到达延音电平所需的秒数。</p>
      <CodeBlock
        code={`note("c e g b g e")
.fm(4)
.fmdecay("<.01 .05 .1 .2>")
.fmsustain(.4)
._scope()`}
      />

      <h3>fmsustain</h3>
      <p>FM 包络的延音电平：衰减阶段结束后所维持的调制量。</p>
      <CodeBlock
        code={`note("c e g b g e")
.fm(4)
.fmdecay(.1)
.fmsustain("<1 .75 .5 0>")
._scope()`}
      />

      <h3>fmenv</h3>
      <p>
        FM 包络的曲线类型（<code>lin</code> 线性或 <code>exp</code> 指数，exp 目前可能还不太完善）。
      </p>
      <CodeBlock
        code={`note("c e g b g e")
.fm(4)
.fmdecay(.2)
.fmsustain(0)
.fmenv("<exp lin>")
._scope()`}
      />

      <h2>波表合成（Wavetable Synthesis）</h2>
      <p>
        Strudel 还可以借助采样器把自定义波形加载进来，替换 WebAudio 默认合成器所使用的基础波形。系统默认提供了一套超过
        1000 个波表的集合（来自{' '}
        <a
          href="https://www.adventurekid.se/akrt/waveforms/adventure-kid-waveforms/"
          target="_blank"
          rel="noopener noreferrer"
        >
          AKWF
        </a>{' '}
        波表集），你也可以导入并使用自己的波表。一个波表其实就是一段单周期波形，会被循环播放来生成所需频率的声音，这是一种经典但非常有效的合成技术。
      </p>
      <p>
        任何以 <code>wt_</code> 为前缀的采样都会被当作波表加载，这意味着 <code>loop</code> 参数默认会被设为{' '}
        <code>1</code>。你也可以用 <code>loopBegin</code> 和 <code>loopEnd</code> 在波表内部扫描不同位置。
      </p>
      <CodeBlock
        code={`samples('bubo:waveforms');
note("<[g3,b3,e4]!2 [a3,c3,e4] [b3,d3,f#4]>")
.n("<1 2 3 4 5 6 7 8 9 10>/2").room(0.5).size(0.9)
.s('wt_flute').velocity(0.25).often(n => n.ply(2))
.release(0.125).decay("<0.1 0.25 0.3 0.4>").sustain(0)
.cutoff(2000).cutoff("<1000 2000 4000>").fast(4)
._scope()
`}
      />

      <h2>ZZFX</h2>
      <p>
        「Zuper Zmall Zound Zynth」，简称{' '}
        <a href="https://github.com/KilledByAPixel/ZzFX" target="_blank" rel="noopener noreferrer">
          ZZFX
        </a>{' '}
        也被集成进了 Strudel。它由{' '}
        <a href="https://frankforce.com/" target="_blank" rel="noopener noreferrer">
          Frank Force
        </a>{' '}
        开发，是一个原本为「size coding」游戏设计的合成与效果引擎。
      </p>
      <p>它总共有 20 个参数，这里有一段用到了全部参数的示例：</p>
      <CodeBlock
        code={`note("c2 eb2 f2 g2") // 也支持直接写 freq
  .s("{z_sawtooth z_tan z_noise z_sine z_square}%4")
  .zrand(0) // 随机化
  // zzfx 包络
  .attack(0.001)
  .decay(0.1)
  .sustain(.8)
  .release(.1)
  // zzfx 特有参数
  .curve(1) // 波形曲率 1-3
  .slide(0) // +/- 音高滑音
  .deltaSlide(0) // +/- 音高滑音（？）
  .noise(0) // 让声音变脏
  .zmod(0) // fm 速度
  .zcrush(0) // 比特粉碎 0 - 1
  .zdelay(0) // 简易延迟
  .pitchJump(0) // +/- 音高跳变
  .pitchJumpTime(0) // >0 表示音高跳变生效前的等待时间
  .lfo(0) // >0 时会重置 slide + pitchJump，并设置颤音速度
  .tremolo(0.5) // 0-1 lfo 音量调制幅度
  //.duration(.2) // 覆盖 Strudel 事件本身的时长
  //.gain(1) // 修改音量
  ._scope() // 可视化波形（与 zzfx 本身无关）
`}
      />
      <p>注意，你也可以把 zzfx 和其他所有音频效果（下一章）组合使用。</p>
    </>
  );
}

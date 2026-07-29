import { CodeBlock, Callout } from '../../components';

export default function Effects() {
  return (
    <>
      <p>不管你用的是合成器还是采样，都可以叠加下面这些内置的音频效果。这些效果都可以链式组合，而且它们都接受一个 pattern 字符串作为参数。</p>

      <h2>信号链</h2>
      <img src="/learn-img/strudel-signal-flow.png" alt="Strudel 信号链流程图" className="max-w-full mb-4" />
      <p>Strudel 的信号处理顺序如下：</p>
      <ul>
        <li>
          一个发声事件由 pattern 触发
          <ul>
            <li>它有一个起始时间和一个时长，时长通常由 note 长度和 ADSR 参数共同决定</li>
            <li>如果超出了最大复音数（max polyphony），旧的声音会开始消亡</li>
            <li>
              被静音的声音（即 <code>s</code> 值为 <code>-</code>、<code>~</code> 或 <code>_</code> 的事件）会被跳过
            </li>
          </ul>
        </li>
        <li>
          声音被生成（通过采样或振荡器）
          <ul>
            <li>
              这里是基于音高变化的效果（比如 <code>detune</code>、<code>penv</code> 等）发生的地方
            </li>
          </ul>
        </li>
        <li>
          接下来的效果会<em>依次</em>生效，且只有在 pattern 中被调用时才会生效。注意这些都是「单次使用」的效果，也就是说同一个效果在 pattern
          中出现多次时，后面的值会直接覆盖前面的（例如你不能用{' '}
          <code>s("bd").lpf(100).distort(2).lpf(800)</code> 来实现先低通、再失真、再低通一次的效果）
          <ul>
            <li>
              相位声码器（<code>stretch</code>）
            </li>
            <li>
              应用增益（<code>gain</code>）——主音量的 ADSR 就发生在这里
            </li>
            <li>
              低通滤波器（<code>lpf</code>）
            </li>
            <li>
              高通滤波器（<code>hpf</code>）
            </li>
            <li>
              带通滤波器（<code>bandpass</code>）
            </li>
            <li>
              元音滤波器（<code>vowel</code>）
            </li>
            <li>
              降采样率（<code>coarse</code>）
            </li>
            <li>
              比特粉碎（<code>crush</code>）
            </li>
            <li>
              波形整形失真（<code>shape</code>）
            </li>
            <li>
              普通失真（<code>distort</code>）
            </li>
            <li>
              震音（<code>tremolo</code>）
            </li>
            <li>
              压缩器（<code>compressor</code>）
            </li>
            <li>
              声像（<code>pan</code>）
            </li>
            <li>
              移相器（<code>phaser</code>）
            </li>
            <li>
              后置增益（<code>post</code>）
            </li>
          </ul>
        </li>
        <li>
          声音随后被拆分到多个目的地
          <ul>
            <li>
              干信号输出（数量由 <code>dry</code> 参数控制）
            </li>
            <li>
              发送（sends）
              <ul>
                <li>
                  分析器——用于 <code>scope</code> 和 <code>spectrum</code> 这类工具，通常在幕后自动设置
                </li>
                <li>
                  延迟（数量由 <code>delay</code> 参数控制）
                </li>
                <li>
                  混响（数量由 <code>room</code> 参数控制）
                </li>
              </ul>
            </li>
          </ul>
        </li>
        <li>
          干信号、延迟信号和混响信号会被合并为该 pattern 所在的「orbit（声轨）」（详见下一节）
          <ul>
            <li>
              <code>duck</code> 效果会影响同一 orbit 中所有信号的音量
            </li>
            <li>该 orbit 随后被送入总混音器</li>
          </ul>
        </li>
      </ul>

      <h2>Orbit（声轨）</h2>
      <p>
        orbit 是 Strudel 处理输出的方式，它还决定了干信号所对应的延迟和混响发送通道。默认情况下，所有 orbit
        都会混合输出到 <code>1</code>、<code>2</code> 两个立体声通道；不过如果在设置里（右侧「Settings」下）打开「Multi
        Channel Orbits」，你也可以把它们当作独立的双声道立体声输出使用（orbit <code>i</code> 会映射到通道{' '}
        <code>2i</code> 和 <code>2i + 1</code>）。这样你就可以用类似 Blackhole 16 的路由工具，把所有通道接入 DAW 做后期处理。
      </p>
      <p>
        默认 orbit 是 <code>1</code>，可以用 <code>orbit</code> 设置。也可以通过迷你记谱法把一个声音同时发送到多个 orbit：
      </p>
      <CodeBlock code={`s("white").orbit("2,3,4").gain(0.2)`} />
      <p>
        不过请注意，这样会在幕后创建三份声音的副本，也就是说如果它们最终混合到同一个输出，音量会变成三倍。这里我们已经把
        gain 调小了，免得伤到耳朵。
      </p>
      <Callout>
        <p>
          ⚠️ 每个 orbit 只有一路延迟和一路混响，所以如果你让两个指向同一 orbit 的 pattern
          分别修改延迟/混响参数，可能会出现难以预料的结果。举个例子，比较一下这段带有大混响的悦耳琴音：
        </p>
        <CodeBlock
          code={`$: s("triangle*4").decay(0.5).n(irand(12)).scale('C minor')
  .room(1).roomsize(10)`}
        />
        <p>和下面这段一样的琴音，但配上一个静音的底鼓，它会覆盖掉 roomsize 的值：</p>
        <CodeBlock
          code={`$: s("triangle*4").decay(0.5).n(irand(12)).scale('C minor')
  .room(1).roomsize(10)

$: s("bd*4").room(0.01).roomsize(0.01).postgain(0)`}
        />
        <p>
          这是因为它们共用了同一个 orbit：默认的 <code>1</code>。只要把 orbit 分开设成不同的值就能解决：
        </p>
        <CodeBlock
          code={`$: s("triangle*4").decay(0.5).n(irand(12)).scale('C minor')
  .room(1).roomsize(10).orbit(2)

$: s("bd*4").room(0.01).roomsize(0.01).postgain(0)`}
        />
      </Callout>

      <h2>连续变化</h2>
      <p>
        由于上述效果都只在声音触发的那一刻生效，很多参数并不会随时间连续变化。举例来说：
      </p>
      <CodeBlock code={`s("supersaw").lpf(tri.range(100, 5000).slow(2))`} />
      <p>
        由于 <code>tri</code> 只会在每次音符触发时被采样一次（这里默认是每个 cycle 一次），所以这段代码并不会产生持续被 LFO
        调制的低通滤波效果。你可以通过引入更多发声事件来模拟这种效果，比如：
      </p>
      <CodeBlock code={`s("supersaw").seg(16).lpf(tri.range(100, 5000).slow(2))`} />
      <p>不过，确实有一些参数会随时间产生连续变化：</p>
      <ul>
        <li>
          ADSR 包络曲线（由 <code>attack</code>、<code>sustain</code>、<code>decay</code>、<code>release</code> 控制）
        </li>
        <li>
          音高包络曲线（由 <code>penv</code> 及其对应的 ADSR 控制）
        </li>
        <li>
          FM 曲线（<code>fmenv</code>）
        </li>
        <li>
          滤波器包络（<code>lpenv</code>、<code>hpenv</code>、<code>bpenv</code>）
        </li>
        <li>
          震音（<code>tremolo</code>）
        </li>
        <li>
          移相器（<code>phaser</code>）
        </li>
        <li>
          颤音（<code>vib</code>）
        </li>
        <li>
          侧链压缩（<code>duckorbit</code>）
        </li>
      </ul>

      <h2>滤波器</h2>
      <p>
        滤波器是{' '}
        <a href="https://en.wikipedia.org/wiki/Subtractive_synthesis" target="_blank" rel="noopener noreferrer">
          减法合成（subtractive synthesis）
        </a>{' '}
        的基本构件之一。Strudel 内置了 3 种滤波器类型：
      </p>
      <ul>
        <li>低通滤波器：低频可以通过，高频被切除</li>
        <li>高通滤波器：高频可以通过，低频被切除</li>
        <li>带通滤波器：只有某一段频率范围可以通过，其上下的频率都被切除</li>
      </ul>
      <p>每种滤波器都有两个参数：</p>
      <ul>
        <li>cutoff（截止频率）：滤波器开始起作用的频率。例如截止频率为 1000Hz 的低通滤波器允许低于 1000Hz 的频率通过。</li>
        <li>
          q-value（品质因数）：控制滤波器的共振强度，数值越高听起来越激进。另见{' '}
          <a href="https://en.wikipedia.org/wiki/Q_factor" target="_blank" rel="noopener noreferrer">
            Q-Factor
          </a>
        </li>
      </ul>

      <h3>lpf</h3>
      <p>
        设置<strong>低</strong>通<strong>滤</strong>波器的截止频率。在迷你记谱法中，还可以用 <code>:</code>{' '}
        附加可选的 <code>lpq</code> 参数。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*6").lpf("<4000 2000 1000 500 200 100>")`} />

      <h3>lpq</h3>
      <p>
        控制<strong>低</strong>通滤波器的 <strong>q</strong> 值（介于 0 到 50 之间的共振系数）。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*8").lpf(2000).lpq("<0 10 20 30>")`} />

      <h3>hpf</h3>
      <p>
        设置<strong>高</strong>通<strong>滤</strong>波器的截止频率。在迷你记谱法中，还可以用 <code>:</code>{' '}
        附加可选的 <code>hpq</code> 参数。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*8").hpf("<4000 2000 1000 500 200 100>")`} />

      <h3>hpq</h3>
      <p>
        控制<strong>高</strong>通滤波器的 <strong>q</strong> 值（介于 0 到 50 之间的共振系数）。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*8").hpf(2000).hpq("<0 10 20 30>")`} />

      <h3>bpf</h3>
      <p>
        设置<strong>带</strong>通<strong>滤</strong>波器的中心频率。在迷你记谱法中，还可以用 <code>:</code>{' '}
        附加可选的 <code>bpq</code> 参数。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*6").bpf("<1000 2000 4000 8000>")`} />

      <h3>bpq</h3>
      <p>
        设置<strong>带</strong>通滤波器的 <strong>q</strong> 因子（共振强度）。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd").bpf(500).bpq("<0 1 2 3>")`} />

      <h3>ftype</h3>
      <p>设置滤波器类型。梯形（ladder）滤波器音色更激进。未来可能会加入更多类型。</p>
      <CodeBlock code={`note("{f g g c d a a#}%8").s("sawtooth").lpenv(4).lpf(500).ftype("<0 1 2>").lpq(1)`} />

      <h3>vowel</h3>
      <p>
        共振峰滤波器，可以让声音听起来像元音。可选值为 <code>a e i o u ae aa oe ue y uh un en an on</code>，分别对应
        [a] [e] [i] [o] [u] [æ] [ɑ] [ø] [y] [ɯ] [ʌ] [œ̃] [ɛ̃] [ɑ̃] [ɔ̃]。别名：aa = å = ɑ，oe = ø = ö，y = ı，ae = æ。
      </p>
      <CodeBlock
        code={`note("[c2 <eb2 <g2 g1>>]*2").s('sawtooth')
.vowel("<a e i <o u>>")`}
      />

      <h2>幅度调制（Amplitude Modulation）</h2>
      <p>幅度调制会随时间周期性地改变振幅（音量）。</p>

      <h3>tremolosync</h3>
      <p>用连续波形调制声音的振幅，参数为调制速度（单位：cycles）。</p>
      <CodeBlock code={`note("d d d# d".fast(4)).s("supersaw").tremolosync("4").tremoloskew("<1 .5 0>")`} />

      <h3>tremolodepth</h3>
      <p>幅度调制的深度。</p>
      <CodeBlock code={`note("a1 a1 a#1 a1".fast(4)).s("pulse").tremsync(4).tremolodepth("<1 2 .7>")`} />

      <h3>tremoloskew</h3>
      <p>改变调制波形的形状（0 到 1 之间的数值）。</p>
      <CodeBlock code={`note("{f a c e}%16").s("sawtooth").tremsync(4).tremoloskew("<.5 0 1>")`} />

      <h3>tremolophase</h3>
      <p>改变调制波形的相位（以 cycle 为单位的偏移量）。</p>
      <CodeBlock code={`note("{f a c e}%16").s("sawtooth").tremsync(4).tremolophase("<0 .25 .66>")`} />

      <h3>tremoloshape</h3>
      <p>
        幅度调制所用的波形形状：<code>tri</code>、<code>square</code>、<code>sine</code>、<code>saw</code> 或{' '}
        <code>ramp</code>。
      </p>
      <CodeBlock code={`note("{f g c d}%16").tremsync(4).tremoloshape("<sine tri square>").s("sawtooth")`} />

      <h2>幅度包络（Amplitude Envelope）</h2>
      <p>
        幅度{' '}
        <a href="https://en.wikipedia.org/wiki/Envelope_(music)" target="_blank" rel="noopener noreferrer">
          包络（envelope）
        </a>{' '}
        控制着声音的动态轮廓。Strudel 使用 ADSR 包络，这是描述包络最常见的方式：attack（起音）、decay（衰减）、
        sustain（延音）、release（释音）。
      </p>
      {/* transparent-background diagram: needs a light backdrop to stay readable on the dark theme */}
      <img
        src="/learn-img/adsr.png"
        alt="ADSR 包络示意图：attack、decay、sustain、release 四个阶段"
        className="max-w-full mb-4 rounded bg-white p-3"
      />

      <h3>attack</h3>
      <p>幅度包络的起音时间：从声音起始点到达到峰值所需的时间。</p>
      <CodeBlock code={`note("c3 e3 f3 g3").attack("<0 .1 .5>")`} />

      <h3>decay</h3>
      <p>
        幅度包络的衰减时间：起音之后到达延音电平所需的时间。注意只有当 sustain 值小于 1 时，decay 才会被听出来。
      </p>
      <CodeBlock code={`note("c3 e3 f3 g3").decay("<.1 .2 .3 .4>").sustain(0)`} />

      <h3>sustain</h3>
      <p>幅度包络的延音电平：起音/衰减阶段结束后达到的电平，会一直维持到音符结束。</p>
      <CodeBlock code={`note("c3 e3 f3 g3").decay(.2).sustain("<0 .1 .4 .6 1>")`} />

      <h3>release</h3>
      <p>幅度包络的释音时间：音符结束后，从延音电平衰减到零所需的时间。</p>
      <CodeBlock code={`note("c3 e3 g3 c4").release("<0 .1 .4 .6 1>/2")`} />

      <h3>adsr</h3>
      <p>
        ADSR 包络的简写形式，一次性组合设置 attack、decay、sustain、release 四个参数。
      </p>
      <CodeBlock code={`note("[c3 bb2 f3 eb3]*2").sound("sawtooth").lpf(600).adsr(".1:.1:.5:.2")`} />

      <h2>滤波器包络</h2>
      <p>
        每种滤波器都可以额外接收一个滤波器包络，动态地控制截止频率。它使用和幅度包络类似的 ADSR
        结构，另外还有一个参数用来控制滤波调制的深度：<code>lpenv</code>|<code>hpenv</code>|<code>bpenv</code>
        。这样你既可以做出非常细微的滤波调制，也可以做出非常夸张的调制，只需要增大或减小这个深度参数即可。
      </p>
      <CodeBlock
        code={`note("[c eb g <f bb>](3,8,<0 1>)".sub(12))
  .s("<sawtooth>/64")
  .lpf(sine.range(300,2000).slow(16))
  .lpa(0.005)
  .lpd(perlin.range(.02,.2))
  .lps(perlin.range(0,.5).slow(3))
  .lpq(sine.range(2,10).slow(32))
  .release(.5)
  .lpenv(perlin.range(1,8).slow(2))
  .ftype('24db')
  .room(1)
  .juxBy(.5,rev)
  .sometimes(add(note(12)))
  .stack(s("bd*2").bank('RolandTR909'))
  .gain(.5).fast(2)`}
      />
      <p>
        每种滤波器类型都对应一组滤波器包络参数，分别以 <code>lp</code>、<code>hp</code> 或 <code>bp</code> 开头：
      </p>
      <ul>
        <li>
          <code>lpattack</code>、<code>lpdecay</code>、<code>lpsustain</code>、<code>lprelease</code>、
          <code>lpenv</code>：低通滤波器的包络。
          <br />
          简写形式：<code>lpa</code>、<code>lpd</code>、<code>lps</code>、<code>lpr</code>、<code>lpe</code>。
        </li>
        <li>
          <code>hpattack</code>、<code>hpdecay</code>、<code>hpsustain</code>、<code>hprelease</code>、
          <code>hpenv</code>：高通滤波器的包络。
          <br />
          简写形式：<code>hpa</code>、<code>hpd</code>、<code>hps</code>、<code>hpr</code>、<code>hpe</code>。
        </li>
        <li>
          <code>bpattack</code>、<code>bpdecay</code>、<code>bpsustain</code>、<code>bprelease</code>、
          <code>bpenv</code>：带通滤波器的包络。
          <br />
          简写形式：<code>bpa</code>、<code>bpd</code>、<code>bps</code>、<code>bpr</code>、<code>bpe</code>。
        </li>
      </ul>

      <h3>lpattack</h3>
      <p>设置低通滤波器包络的起音时间。</p>
      <CodeBlock
        code={`note("c2 e2 f2 g2")
.sound('sawtooth')
.lpf(300)
.lpa("<.5 .25 .1 .01>/4")
.lpenv(4)`}
      />

      <h3>lpdecay</h3>
      <p>设置低通滤波器包络的衰减时间。</p>
      <CodeBlock
        code={`note("c2 e2 f2 g2")
.sound('sawtooth')
.lpf(300)
.lpd("<.5 .25 .1 0>/4")
.lpenv(4)`}
      />

      <h3>lpsustain</h3>
      <p>设置低通滤波器包络的延音电平。</p>
      <CodeBlock
        code={`note("c2 e2 f2 g2")
.sound('sawtooth')
.lpf(300)
.lpd(.5)
.lps("<0 .25 .5 1>/4")
.lpenv(4)`}
      />

      <h3>lprelease</h3>
      <p>设置低通滤波器包络的释音时间。</p>
      <CodeBlock
        code={`note("c2 e2 f2 g2")
.sound('sawtooth')
.clip(.5)
.lpf(300)
.lpenv(4)
.lpr("<.5 .25 .1 0>/4")
.release(.5)`}
      />

      <h3>lpenv</h3>
      <p>设置低通滤波器包络的调制深度。</p>
      <CodeBlock
        code={`note("c2 e2 f2 g2")
.sound('sawtooth')
.lpf(300)
.lpa(.5)
.lpenv("<4 2 1 0 -1 -2 -4>/4")`}
      />

      <h2>音高包络（Pitch Envelope）</h2>
      <p>你也可以用包络来控制音高！音高包络能为静态的声音注入生命力：</p>
      <CodeBlock
        code={`n("<-4,0 5 2 1>*<2!3 4>")
  .scale("<C F>/8:pentatonic")
  .s("gm_electric_guitar_jazz")
  .penv("<.5 0 7 -2>*2").vib("4:.1")
  .phaser(2).delay(.25).room(.3)
  .size(4).fast(1.5)`}
      />
      <p>你还能用它做出一些可爱的芯片音乐（chiptune）风格音色：</p>
      <CodeBlock
        code={`n(run("<4 8>/16")).jux(rev)
.chord("<C^7 <Db^7 Fm7>>")
.dict('ireal')
.voicing().add(note("<0 1>/8"))
.dec(.1).room(.2)
.segment("<4 [2 8]>")
.penv("<0 <2 -2>>").patt(.02).fast(2)`}
      />
      <p>下面来逐一拆解所有音高包络控制项：</p>

      <h3>pattack</h3>
      <p>音高包络的起音时间。</p>
      <CodeBlock code={`note("c eb g bb").pattack("0 .1 .25 .5").slow(2)`} />

      <h3>pdecay</h3>
      <p>音高包络的衰减时间。</p>
      <CodeBlock code={`note("<c eb g bb>").pdecay("<0 .1 .25 .5>")`} />

      <h3>prelease</h3>
      <p>音高包络的释音时间。</p>
      <CodeBlock
        code={`note("<c eb g bb> ~")
.release(.5) // 让音高的释音能被听到
.prelease("<0 .1 .25 .5>")`}
      />

      <h3>penv</h3>
      <p>
        音高包络的调制量（以半音为单位）。负值会翻转包络方向。如果没有设置其他音高包络参数，默认会使用{' '}
        <code>pattack:.2</code>。
      </p>
      <CodeBlock
        code={`note("c")
.penv("<12 7 1 .5 0 -1 -7 -12>")`}
      />

      <h3>pcurve</h3>
      <p>
        包络的曲线类型，默认是线性（linear）。指数（exponential）曲线适合用在底鼓一类的音色上。
      </p>
      <CodeBlock
        code={`note("g1*4")
.s("sine").pdec(.5)
.penv(32)
.pcurve("<0 1>")`}
      />

      <h3>panchor</h3>
      <p>
        设置包络的调制中心：anchor 为 0 时，范围是 [note, note + penv]；anchor 为 1 时，范围是 [note - penv,
        note]。如果不设置 anchor，默认值取自 sustain 值。
      </p>
      <CodeBlock code={`note("c c4").penv(12).panchor("<0 .5 1 .5>")`} />

      <h2>动态</h2>

      <h3>gain</h3>
      <p>以指数方式控制音量增益。</p>
      <CodeBlock code={`s("hh*8").gain(".4!2 1 .4!2 1 .4 1").fast(2)`} />

      <h3>velocity</h3>
      <p>
        设置力度（velocity），取值范围 0 到 1，会与 gain 相乘。
      </p>
      <CodeBlock
        code={`s("hh*8")
.gain(".4!2 1 .4!2 1 .4 1")
.velocity(".4 1")`}
      />

      <h3>compressor</h3>
      <p>
        动态压缩器。参数格式为 <code>compressor("threshold:ratio:knee:attack:release")</code>，分别表示阈值、压缩比、拐点（knee）、起音时间、释音时间。更多信息见{' '}
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode"
          target="_blank"
          rel="noopener noreferrer"
        >
          MDN 文档
        </a>
        。
      </p>
      <CodeBlock
        code={`s("bd sd [~ bd] sd,hh*8")
.compressor("-20:20:10:.002:.02")`}
      />

      <h3>postgain</h3>
      <p>在所有效果处理完成之后再施加的增益。</p>
      <CodeBlock
        code={`s("bd sd [~ bd] sd,hh*8")
.compressor("-20:20:10:.002:.02").postgain(1.5)`}
      />

      <h3>xfade</h3>
      <p>在两个 pattern 之间做等功率交叉淡入淡出。</p>
      <CodeBlock code={`xfade(s("bd*2"), "<0 .25 .5 .75 1>", s("hh*8"))`} />

      <h2>声像（Panning）</h2>

      <h3>jux</h3>
      <p>
        <code>jux</code> 会对一个 pattern 应用一个函数，但只作用在右声道，从而制造出奇特的立体声效果。
      </p>
      <CodeBlock code={`s("bd lt [~ ht] mt cp ~ bd hh").jux(rev)`} />
      <CodeBlock code={`s("bd lt [~ ht] mt cp ~ bd hh").jux(press)`} />

      <h3>juxBy</h3>
      <p>
        和 <code>jux</code> 类似，但可以指定左右声道各自偏移的声像量。
      </p>
      <CodeBlock code={`s("bd lt [~ ht] mt cp ~ bd hh").juxBy("<0 .5 1>/2", rev)`} />

      <h3>pan</h3>
      <p>设置立体声中的位置（0 到 1 之间，从左到右；如果是多声道，则相当于绕一整圈）。</p>
      <CodeBlock code={`s("[bd hh]*2").pan("<.5 1 .5 0>")`} />
      <CodeBlock code={`s("bd rim sd rim bd ~ cp rim").pan(sine.slow(2))`} />

      <h2>波形整形（Waveshaping）</h2>

      <h3>coarse</h3>
      <p>伪重采样，用来降低采样率。注意：这个效果目前似乎只在基于 Chromium 的浏览器里生效。</p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*8").coarse("<1 4 8 16 32>")`} />

      <h3>crush</h3>
      <p>比特粉碎（bit crusher）效果，取值 1（大幅降低比特深度）到 16（几乎不降低）。</p>
      <CodeBlock code={`s("<bd sd>,hh*3").fast(2).crush("<16 8 7 6 5 4 3 2>")`} />

      <h3>distort</h3>
      <p>
        波形整形失真。注意：音量可能会变得很大。可选数组写法（例如 <code>".9:.5"</code>）的第二个值会在输出上再施加一次
        postgain；第三个值用来设置整形类型。数值通常在 0 到 10 之间最实用（取决于源信号的增益），如果你想更大胆一点，也可以调到 11
        以上 :)
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*8").distort("<0 2 3 10:.5>")`} />

      <h2>全局效果</h2>

      <h3>局部效果 vs 全局效果</h3>
      <p>
        上面列出的这些「局部」效果，每个事件都会各自创建一条独立的效果链；而全局效果则是同一个 orbit
        内所有事件共用同一条效果链：
      </p>

      <h3>orbit</h3>
      <p>
        <code>orbit</code> 是 pattern 的一个全局参数上下文。共享同一个 orbit 的 pattern 会共用同一套全局效果。
      </p>
      <CodeBlock
        code={`stack(
  s("hh*6").delay(.5).delaytime(.25).orbit(1),
  s("~ sd ~ sd").delay(.5).delaytime(.125).orbit(2)
)`}
      />

      <h3>延迟（Delay）</h3>

      <h4>delay</h4>
      <p>
        设置延迟信号的量。在迷你记谱法中，还可以用 <code>:</code> 附加可选的 <code>delaytime</code> 和{' '}
        <code>delayfeedback</code> 参数。
      </p>
      <CodeBlock code={`s("bd bd").delay("<0 .25 .5 1>")`} />
      <CodeBlock code={`s("bd bd").delay("0.65:0.25:0.9 0.65:0.125:0.7")`} />

      <h4>delaytime</h4>
      <p>设置延迟效果的时间（单位：秒）。</p>
      <CodeBlock
        code={`note("d d a# a".fast(2))
.s("sawtooth")
.delay(.8)
.delaytime(1/2)
.delayspeed("<2 .5 -1 -2>")`}
      />

      <h4>delayfeedback</h4>
      <p>
        设置反馈回延迟线里的信号量。注意：数值达到或超过 1 会导致信号越来越响，请勿这样做！
      </p>
      <CodeBlock code={`s("bd").delay(.25).delayfeedback("<.25 .5 .75 1>")`} />

      <h3>混响（Reverb）</h3>

      <h4>room</h4>
      <p>
        设置混响的量。在迷你记谱法中，还可以用 <code>:</code> 附加可选的 <code>size</code> 参数。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd").room("<0 .2 .4 .6 .8 1>")`} />
      <CodeBlock code={`s("bd sd [~ bd] sd").room("<0.9:1 0.9:4>")`} />

      <h4>roomsize</h4>
      <p>
        设置混响的房间大小（配合 <code>room</code> 使用）。注意：这个属性一旦改变，混响会被重新计算，所以请不要频繁修改。
      </p>
      <CodeBlock code={`s("bd sd [~ bd] sd").room(.8).rsize(1)`} />
      <CodeBlock code={`s("bd sd [~ bd] sd").room(.8).rsize(4)`} />

      <h4>roomfade</h4>
      <p>混响的淡出时间（秒）。同样一旦改变会重新计算混响，请勿频繁修改。</p>
      <CodeBlock code={`s("bd sd [~ bd] sd").room(0.5).rlp(10000).rfade(0.5)`} />

      <h4>roomlp</h4>
      <p>混响的低通起始频率（赫兹）。同样一旦改变会重新计算混响。</p>
      <CodeBlock code={`s("bd sd [~ bd] sd").room(0.5).rlp(10000)`} />

      <h4>roomdim</h4>
      <p>混响在 -60dB 处的低通频率（赫兹）。同样一旦改变会重新计算混响。</p>
      <CodeBlock code={`s("bd sd [~ bd] sd").room(0.5).rlp(10000).rdim(8000)`} />

      <h4>iresponse</h4>
      <p>设置用作混响脉冲响应（impulse response）的采样。</p>
      <CodeBlock code={`s("bd sd [~ bd] sd").room(.8).ir("<shaker_large:0 shaker_large:2>")`} />

      <h3>移相器（Phaser）</h3>

      <h4>phaser</h4>
      <p>模拟常见吉他效果踏板的移相器效果。</p>
      <CodeBlock
        code={`n(run(8)).scale("D:pentatonic").s("sawtooth").release(0.5)
.phaser("<1 2 4 8>")`}
      />

      <h4>phaserdepth</h4>
      <p>信号受移相器效果影响的程度，默认 0.75。</p>
      <CodeBlock
        code={`n(run(8)).scale("D:pentatonic").s("sawtooth").release(0.5)
.phaser(2).phaserdepth("<0 .5 .75 1>")`}
      />

      <h4>phasercenter</h4>
      <p>移相器的中心频率（赫兹），默认 1000。</p>
      <CodeBlock
        code={`n(run(8)).scale("D:pentatonic").s("sawtooth").release(0.5)
.phaser(2).phasercenter("<800 2000 4000>")`}
      />

      <h4>phasersweep</h4>
      <p>移相器 LFO 的频率扫描范围，默认 2000，常用值在 0 到 4000 之间。</p>
      <CodeBlock
        code={`n(run(8)).scale("D:pentatonic").s("sawtooth").release(0.5)
.phaser(2).phasersweep("<800 2000 4000>")`}
      />

      <h3>Duck（侧链）</h3>

      <h4>duckorbit</h4>
      <p>
        调制某个 orbit 的音量，制造类似「侧链压缩（sidechain）」的效果。可以配合 <code>:</code> 写法作用到多个 orbit，例如{' '}
        <code>duckorbit("2:3")</code>。
      </p>
      <CodeBlock
        code={`$: n(run(16)).scale("c:minor:pentatonic").s("sawtooth").delay(.7).orbit(2)
$: s("bd:4!4").beat("0,4,8,11,14",16).duckorbit(2).duckattack(0.2).duckdepth(1)`}
      />

      <h4>duckattack</h4>
      <p>被 duck 效果压低的信号恢复到正常音量所需的时间。</p>
      <CodeBlock
        code={`$: n(run(8)).scale("c:minor").s("sawtooth").delay(.7).orbit(2)
$: s("bd:4!4").beat("0,4,8,11,14",16).duckorbit(2).duckattack("<0.2 0 0.4>").duckdepth(1)`}
      />

      <h4>duckdepth</h4>
      <p>作用到目标 orbit 上的 duck 效果的深度。</p>
      <CodeBlock
        code={`stack(
  n(run(8)).scale("c:minor").s("sawtooth").delay(.7).orbit(2),
  s("bd:4!4").beat("0,4,8,11,14",16).duckorbit(2).duckattack(0.2).duckdepth("<1 .9 .6 0>")
)`}
      />

      <p>接下来我们来看看 MIDI、OSC 等输入输出方式。</p>
    </>
  );
}

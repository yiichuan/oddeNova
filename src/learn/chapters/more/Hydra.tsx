import { CodeBlock } from '../../components';

export default function Hydra() {
  return (
    <>
      <p>
        你可以在 Strudel 里写{' '}
        <a href="https://hydra.ojack.xyz/" target="_blank" rel="noopener noreferrer">
          hydra
        </a>{' '}
        代码！只需要在最开头调用 <code>await initHydra()</code> 即可：
      </p>
      <CodeBlock
        code={`await initHydra()
// licensed with CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/
// by Zach Krall
// http://zachkrall.online/

osc(10, 0.9, 300)
.color(0.9, 0.7, 0.8)
.diff(
osc(45, 0.3, 100)
.color(0.9, 0.9, 0.9)
.rotate(0.18)
.pixelate(12)
.kaleid()
)
.scrollX(10)
.colorama()
.luma()
.repeatX(4)
.repeatY(4)
.modulate(
osc(1, -0.9, 300)
)
.scale(2)
.out()

note("[a,c,e,<a4 ab4 g4 gb4>,b4]/2")
.s("sawtooth").vib(2)
.lpf(600).lpa(2).lpenv(6)`}
      />

      <h2>H patterns</h2>
      <p>
        有一个特殊函数 <code>H</code>，可以把一个 pattern 作为输入传给 hydra：
      </p>
      <CodeBlock
        code={`await initHydra()
let pattern = "3 4 5 [6 7]*2"
shape(H(pattern)).out(o0)
n(pattern).scale("A:minor").piano().room(1)`}
      />

      <h2>detectAudio</h2>
      <p>
        要使用 hydra 的音频捕获功能，调用 <code>initHydra</code> 时传入 <code>{'{detectAudio:true}'}</code> 配置项：
      </p>
      <CodeBlock
        code={`await initHydra({detectAudio:true})
let pattern = "<3 4 5 [6 7]*2>"
shape(H(pattern)).repeat()
  .scrollY(
    ()=> a.fft[0]*.25
  )
  .add(src(o0).color(.71 ).scrollX(.005),.95)
.out(o0)
n(pattern).scale("A:minor").piano().room(1)`}
      />
      <p>
        你可以在{' '}
        <a
          href="https://strudel.cc/#YXdhaXQgaW5pdEh5ZHJhKCkKbGV0IHBhdHRlcm4gPSAiMyA0IDUgWzYgN10qMiIKc2hhcGUoSChwYXR0ZXJuKSkub3V0KG8wKQpuKHBhdHRlcm4pLnNjYWxlKCJBOm1pbm9yIikucGlhbm8oKS5yb29tKDEpIA%3D%3D"
          target="_blank"
          rel="noopener noreferrer"
        >
          在 REPL 中打开
        </a>{' '}
        试试实际效果。
      </p>
      <p>
        除了 <code>detectAudio</code> 之外，所有{' '}
        <a href="https://github.com/hydra-synth/hydra-synth#api" target="_blank" rel="noopener noreferrer">
          hydra 支持的配置项
        </a>{' '}
        都可以传给 <code>initHydra</code>。
      </p>

      <h2>feedStrudel</h2>
      <p>
        用 <code>feedStrudel</code> 这个配置项，可以用 hydra 对 strudel 的可视化效果做二次处理：
      </p>
      <CodeBlock
        code={`await initHydra({feedStrudel:1})
//
src(s0).kaleid(H("<4 5 6>"))
  .diff(osc(1,0.5,5))
  .modulateScale(osc(2,-0.25,1))
  .out()
//

$: s("bd*4,[hh:0:<.5 1>]*8,~ rim").bank("RolandTR909").speed(.9)

$: note("[<g1!3 <bb1 <f1 d1>>>]*3").s("sawtooth")

.room(.75).sometimes(add(note(12))).clip(.3)
.lpa(.05).lpenv(-4).lpf(2000).lpq(8).ftype('24db')

all(x=>x.fft(4).scope({pos:0,smear:.95}))`}
      />
    </>
  );
}

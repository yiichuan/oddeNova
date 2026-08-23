import { CodeBlock, Callout } from '../../components';
import PitchSlider, { FREQUENCY_COLOR, PITCH_COLOR } from '../../PitchSlider';

export default function Pitch() {
  return (
    <>
      <p>
        让我们来学习音高（pitch）是怎么运作的！下面这个滑块控制着一个振荡器的
        <span style={{ color: FREQUENCY_COLOR }}>频率</span>，从而产生音高：
      </p>

      <PitchSlider showFrequencySlider min={20} max={20000} />

      <ul>
        <li>拖动滑块，就能听到声音</li>
        <li>移动滑块，音高会随之改变</li>
        <li>注意观察 Hz 数字是怎么变化的</li>
        <li>
          <span className="text-red-300">注意</span>：过高的频率可能会让儿童或动物感到不适！
        </li>
      </ul>

      <p>
        这个 Hz 数字就是你听到的这个音高的频率。频率越高，音高就越高，反之亦然。
        音高来自某个物体以某个频率振动/振荡，在这里就是你的音箱。<strong>Hz</strong>{' '}
        这个单位描述的是这种振荡每秒钟发生多少次。我们的眼睛太慢了，看不到音箱的振动，但可以
        <a href="https://www.youtube.com/watch?v=CDMBWw7OuJQ" target="_blank" rel="noopener noreferrer">在慢动作视频里看到它</a>
        。
      </p>

      <Callout>
        <p>据说新生儿的听觉范围在 20Hz 到 20000Hz 之间。这个上限会随年龄增长而下降。你的上限是多少呢？</p>
      </Callout>

      <p>
        在 Strudel 里，我们可以用 <code>freq</code> 控制参数直接演奏频率：
      </p>
      <CodeBlock code={`freq("<200 [300,500] 400 [500,<600 670 712 670>]>*8")`} />

      <h2>频率 vs 音高感知</h2>
      <p>
        你可能已经注意到，<span style={{ color: FREQUENCY_COLOR }}>频率滑块</span>
        是「不均匀」的——音高在左边区域变化得更多，在右边区域变化得更少。为了让这一点更明显，我们再加一个
        <span style={{ color: PITCH_COLOR }}>音高滑块</span>，它用另一种尺度来控制频率：
      </p>

      <PitchSlider animatable plot showFrequencySlider showPitchSlider />

      <p>试试上面的两个按钮，用两种不同的方式扫过整个频率范围：</p>
      <ul>
        <li>
          频率扫描：<span style={{ color: FREQUENCY_COLOR }}>频率线性上升</span>，
          <span style={{ color: PITCH_COLOR }}>音高按对数上升</span>
        </li>
        <li>
          音高扫描：<span style={{ color: FREQUENCY_COLOR }}>频率按指数上升</span>，
          <span style={{ color: PITCH_COLOR }}>音高线性上升</span>
        </li>
      </ul>

      <Callout>
        <p>不用被这些数学名词吓到：</p>
        <ul>
          <li>「对数（logarithmic）」只是「一开始变化快，后面变慢」的一种花哨说法</li>
          <li>「指数（exponential）」只是「一开始变化慢，后面变快」的一种花哨说法</li>
        </ul>
      </Callout>

      <p>
        大多数时候，我们希望以符合人类感知的方式来控制音高，而这正是
        <span style={{ color: PITCH_COLOR }}>音高滑块</span>所做的事。
      </p>

      <h2>从 Hz 到半音（Semitone）</h2>
      <p>
        因为 Hz 不符合我们的感知方式，我们来试着找一个更贴合感知的音高单位。为了接近这个单位，先来看看频率翻倍时会发生什么：
      </p>

      <PitchSlider showPitchSlider showFrequencySlider pitchStep={1 / 7} />

      <ul>
        <li>试试上面这个带步进的音高滑块</li>
        <li>你能听出这些音高之间彼此是有关联的吗？</li>
      </ul>

      <Callout>
        <p>
          在音乐术语里，频率翻倍的音高被称为高了一个 <code>octave</code>（八度）。
        </p>
      </Callout>

      <p>因为八度之间的距离很大，八度通常会被再细分成 12 个更小的部分：</p>

      <PitchSlider showPitchSlider showFrequencySlider pitchStep={1 / 12} min={440} max={880} initial={440} />

      <p>
        这一步被称为半音（semitone），是有音高的音乐中最常见的划分方式。比如钢琴键盘上的琴键也是按半音划分的。
      </p>
      <p>
        在 Strudel 里，我们可以用 <code>freq</code> 这样实现：
      </p>
      <CodeBlock code={`freq(
  "0 4 7 12"
  .fmap(n => 440 * 2**(n/12))
)`} />
      <p>
        当然，用 <code>note</code> 可以写得更简短，我们下面就会看到。
      </p>

      <h2>从半音到 MIDI 编号</h2>
      <p>
        现在我们知道了一个半音的距离是多少。上面我们用了一个任意的基准频率 440Hz，也就是说指数为 0 时等于
        440Hz。通常，440Hz 会被标准化为数字 69，于是就得到了下面这个换算：
      </p>

      <PitchSlider
        showPitchSlider
        showFrequencySlider
        baseFrequency={440}
        zeroOffset={69}
        pitchStep={1 / 12 / 7}
        min={440 / 8}
        max={7040}
        initial={440}
      />

      <p>
        现在这个黄色数字就是 MIDI 编号，用 0 到 127 之间的数字，覆盖的范围甚至超过了整个人类听觉范围。
        在 Strudel 里，我们可以在 <code>note</code> 里使用 MIDI 编号：
      </p>
      <CodeBlock code={`note("69 73 76 81")`} />

      <h2>从 MIDI 编号到音符名</h2>
      <p>在西方乐理中，通常使用音符名而不是数字。每个 MIDI 编号至少对应一个音符标签：</p>

      <PitchSlider
        showPitchSlider
        showFrequencySlider
        baseFrequency={440}
        zeroOffset={69}
        pitchStep={1 / 48}
        min={440 / 8}
        max={880}
        initial={440}
        claviature
      />

      <p>
        一个完整的音符标签由一个字母（A-G）、0 个或多个变音记号（b | #）以及一个八度数字组成。
        这套系统也被称为
        <a href="https://en.wikipedia.org/wiki/Scientific_pitch_notation" target="_blank" rel="noopener noreferrer">科学音高记谱法（Scientific Pitch Notation）</a>
        。在 Strudel 中，这些音符标签也可以作为 MIDI 编号的替代写法用在 <code>note</code> 里：
      </p>
      <CodeBlock code={`note("A4 C#5 E5 A5").piano()`} />

      <h2>待解答的问题</h2>
      <p>了解了音高的不同表示方式之后，仍然有一些开放性的问题：</p>
      <ul>
        <li>为什么是 12 个音？八度还有其他划分方式吗？</li>
        <li>为什么音符是这样命名的？为什么只有 7 个字母？</li>
        <li>还有其他的命名系统吗？</li>
        <li>纯律（Just Intonation）系统是什么样的？</li>
        <li>音色（Timbre）又是怎么回事？</li>
      </ul>
      <p>这些问题都很重要，会在其他文章中解答。</p>

      <h2>定义</h2>
      <p>与其一开始就给出定义，不如先直观地探索一番——现在你可能会更容易理解这个定义：</p>
      <Callout>
        <p>
          引用
          <a href="https://en.wikipedia.org/wiki/Pitch_(music)" target="_blank" rel="noopener noreferrer">维基百科</a>
          的说法：「音高（pitch）是声音的一种感知属性，使得声音可以在与频率相关的尺度上排序；更通俗地说，
          音高是让我们能够以音乐旋律的意义判断声音「高」或「低」的那种特质。」
        </p>
      </Callout>
    </>
  );
}

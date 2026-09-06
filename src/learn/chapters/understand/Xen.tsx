import { CodeBlock } from '../../components';

export default function Xen() {
  return (
    <>
      <p>（实验性功能）这些函数允许你使用标准十二平均律以外的音阶。</p>

      <h2>tune(scale)</h2>
      <p>
        它假定 pattern 里是通过 <code>i</code> 控制参数给出的数字音级（见下面的例子）。参数{' '}
        <code>scale</code>（<code>string</code> 或 <code>number[]</code>）接受一个音阶名，或者一组频率
        （全部可用的音阶名见下方链接）。返回一个把所有值都映射为频率比的新 pattern。与 <code>xen</code> 类似。
      </p>
      <p>下面是一个配置基本 hexany 音阶的例子：</p>
      <CodeBlock code={`i("0 1 2 3 4 5").tune("hexany15").mul("220").freq()`} />
      <p>
        也可以试试其他音阶，比如 <code>hexany1</code>、<code>iraq</code>、<code>gumbeng</code>、<code>gunkali</code> 或
        <code>tranh3</code>
      </p>
      <p>
        完整的 tunejs 可用音阶列表可见
        <a href="http://abbernie.github.io/tune/scales.html" target="_blank" rel="noopener noreferrer">
          http://abbernie.github.io/tune/scales.html
        </a>
      </p>

      <p>
        你可以用 <code>getFreq</code> 把根音设置为某个特定音符：
      </p>
      <CodeBlock code={`i("4 8 9 10 - - 5 7 9 11 - -").tune("tranh3")
    .mul(getFreq('c3'))
    .freq().clip(.5).room(1)`} />

      <p>有些调音方式配合更长的混响衰减时间会更加明显：</p>
      <CodeBlock code={`i("<[5 6 8 10] - [5 7 9 12] -> -").tune("gumbeng")
  .mul(getFreq('c3'))
  .freq().clip(.8).room("3:10").rdim(10000).rfade(5)`} />

      <p>
        另外，你还可以把它和 <code>fmap</code> 组合使用，让根音随时间变化：
      </p>
      <CodeBlock code={`i("9 11 12 10 - - -").tune("gunkali")
  .mul("<c3 c3 a3 d#3>".fmap(getFreq))
  .freq().legato("2 .7").room("1:15").rdim(8500).rlp(14000).rfade(8)`} />

      <p>把这个和各种复合节奏（polyrhythm）技巧结合起来，可以变得非常有表现力：</p>
      <CodeBlock code={`i("<[0 3 1 -] [-1 4 2 8]> ~ ~,<-4 -5>".add(4))
  .tune("iraq")
  .mul("<c3 d3 c#3>".fmap(getFreq))
  .freq().clip(.5).room(1).rfade(9)`} />

      <p>
        探索新调音方式时，另一个有用的小技巧是「拨弦」（strum）演奏它们。很多调音在被拨弦演奏时，
        音色会更加迷人——这也是历代音乐人选择它们的原因。
      </p>
      <p>
        我们来看 <code>sanza</code> 这个调音：
      </p>
      <CodeBlock code={`i("4 5 6 7 8 9").tune("sanza")
  .mul(getFreq('c3'))
  .freq()`} />

      <p>
        如果按普通方式演奏琶音（arp），第 7 个和第 9 个音符会碰撞得比较明显。很多调音都会有这种效果，
        单独听可能会觉得有些干扰。你可以在音高轮（pitch wheel）上看看它们靠得有多近：
      </p>
      <CodeBlock code={`i("[7 9]!3").tune("sanza").mul(getFreq('c3')).freq()._pitchwheel()`} />

      <p>
        这种特质通常是因为，这些调音方式最初是为演奏方式不同于钢琴的乐器设计的。
        因此，有些调音更适合用拨弦的方式演奏——那些略微失谐的音符碰撞在一起，反而会让声音更有魔力：
      </p>
      <CodeBlock code={`i("[0 1 2 3 4 5 6]@0.3 -"
  .add("<2 5 8 1>"))
  .tune("sanza")
  .mul(getFreq('c3')).freq()
  .legato("3").room(1).rfade(5)`} />

      <p>
        注意，legato 和 reverb 效果能让拨弦的声音融合在一起。交替拨弦的方向也能让音色听起来更加生动。
      </p>

      <p>
        <code>tranh3</code> 调音有一组类似的音符，其中两个会互相碰撞。你可以试着把它接到上面的例子里，看看能不能找到自己喜欢的拨弦 pattern。
      </p>

      <p>你也可以给 tune 传入一组频率列表，作为自定义音阶使用：</p>
      <CodeBlock code={`i("0 1 2 3 4").tune([
    261.6255653006,
    302.72962012827,
    350.29154279212,
    405.32593044476,
    469.00678383895,
    523.2511306012
  ]).mul(220).freq();`} />

      <h2>xen(scaleOrRatios)</h2>
      <p>
        它假定 pattern 里是数字音级，再配上一个音阶。参数 <code>scaleNameOrRatios</code>（<code>string</code> 或{' '}
        <code>number[]</code>）可以是 <code>tune</code> 支持的所有预设音阶名、任意的 EDO（等分八度，Equal Division of
        the Octave）写法（比如 <code>31edo</code>），或者一组频率比。它假定音阶以八度（2/1）为周期重复，
        返回一个把所有值都映射为对应频率的新 pattern，基准频率为 220Hz。
      </p>
      <CodeBlock code={`// 31edo 里的一个小三和弦：
i("0 8 18").xen("31edo").piano()`} />
      <CodeBlock code={`// 也可以直接给 xen 传入频率比，
// 效果和上面的例子等价：
i("0 1 2").xen([
  Math.pow(2, 0/31),
  Math.pow(2, 8/31),
  Math.pow(2, 18/31),
]).piano()`} />
      <CodeBlock code={`// xen 同样支持 tune 的所有音阶名：
i("0 1 2 3 4 5").xen("hexany15")
// 等价于：
// "0 1 2 3 4 5".tune("hexany15").mul("220").freq()`} />
      <CodeBlock code={`i("0 1 2 3 4 5 6 7").xen("<5edo 10edo 15edo hexany15>")`} />
    </>
  );
}

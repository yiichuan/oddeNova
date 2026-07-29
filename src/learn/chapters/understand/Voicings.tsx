import { CodeBlock, StaticCode, Table } from '../../components';

export default function Voicings() {
  return (
    <>
      <p>让我们深入了解一下和弦（chord）和排列法（voicing）在 Strudel 中是怎么运作的。这里会尽量少用乐理术语，希望能让任何感兴趣的人都容易理解。</p>

      <h2>什么是和弦</h2>
      <p>
        同时演奏一个以上的音符，通常被称为 <code>chord</code>（和弦）。这是一个例子：
      </p>
      <CodeBlock code={`note("<[c3,eb3,g3] [f3,a3,c4]>").room(.5)`} />
      <p>用 MIDI 编号写同样的内容：</p>
      <CodeBlock code={`note("<[48,51,55] [53,57,60]>").room(.5)`} />
      <p>
        这里我们有两个循环播放的 3 音和弦。你完全可以就用这种方式写和弦，这样能让你精确控制每一个音符，
        但缺点是很难找到好听的和弦，也许你还想要用其他方式来组织和弦。
      </p>

      <h2>给和弦命名</h2>
      <p>
        和弦通常会根据其内部音符的关系被赋予不同的标签。在上面数字的例子里，我们有 <code>48,51,55</code> 和
        <code>53,57,60</code>。
      </p>
      <p>
        要分析这些音符之间的关系，通常会把它们与某个 <code>root</code>（根音）做比较，根音往往是最低的那个音符。
        在我们的例子里，两个和弦的 <code>root</code> 分别是 <code>48</code>（= <code>c3</code>）和 <code>53</code>（=
        <code>f3</code>）。我们可以用相对于 <code>root</code> 的方式来表达这两个和弦：
      </p>
      <CodeBlock code={`note("<[0,3,7] [0,4,7]>".add("<48 53>")).room(.5)`} />
      <p>
        这样一来，每个和弦里的数字代表的就是与根音的距离。音高之间的距离通常被称为 <code>interval</code>
        （音程），不过这里我们先统一叫「距离」。
      </p>
      <p>
        现在可以看出，这两个和弦其实相当相似，唯一的区别是中间那个音（当然根音也不同）。它们属于一类叫
        <code>triads</code>（三和弦）的和弦，也就是由 3 个音组成的和弦。
      </p>

      <h3>三和弦（Triads）</h3>
      <p>下面这 4 种形状是你最常遇到的三和弦类型：</p>
      <Table>
        <thead>
          <tr><th>形状</th><th>名称</th></tr>
        </thead>
        <tbody>
          <tr><td>0,4,7</td><td>大三和弦（major）</td></tr>
          <tr><td>0,3,7</td><td>小三和弦（minor）</td></tr>
          <tr><td>0,3,6</td><td>减三和弦（diminished）</td></tr>
          <tr><td>0,4,8</td><td>增三和弦（augmented）</td></tr>
        </tbody>
      </Table>
      <p>依次演奏它们：</p>
      <CodeBlock code={`note("<[0,4,7] [0,3,7] [0,3,6] [0,4,8]>".add("60"))
.room(.5)._pitchwheel()`} />
      <p>
        很多类型的音乐往往只用小三和弦与大三和弦，光靠这些知识我们已经可以给歌曲配和弦了。来试一个：
      </p>
      <CodeBlock code={`note(\`<
[0,3,7] [0,4,7] [0,4,7] [0,4,7]
[0,3,7] [0,4,7] [0,3,7] [0,4,7]
>\`.add(\`<
a c d f
a e a e
>\`)).room(.5)`} />
      <p>
        这是 The Animals 乐队《The House of the Rising Sun》一曲的和弦。目前听起来还不算太精彩，但至少能辨认出来。
      </p>

      <h2>Voicing（排列法）</h2>
      <p>
        <code>voicing</code>（排列法）是同一个和弦形状可以被排列的诸多方式之一。这个术语来自合唱音乐，
        合唱中同一个和弦可以通过给不同声部分配不同的音符来演唱。例如我们可以给和弦里的一个或多个音符加上 12 个半音：
      </p>
      <CodeBlock code={`note("<[0,3,7] [12,3,7] [12,15,7] [12,15,19]>".add("48"))
.room(.5)`} />
      <p>
        相差 12 个半音（= 1 个 <code>octave</code>，八度）的音符，在和声意义上被认为是等价的，因此会用同一个音符字母表示。
        这是用音符名写的同一个例子：
      </p>
      <CodeBlock code={`note("<[c3,eb3,g3] [c4,eb3,g3] [c4,eb4,g3] [c4,eb4,g4]>")
.room(.5)`} />
      <p>
        这类排列法也被称为 <code>inversions</code>（转位）。这个小三和弦还有很多其他排列方式：
      </p>
      <CodeBlock code={`note("<[0,3,7,12] [0,15,24] [0,3,12]>".add("48"))
.room(.5)`} />
      <p>这里我们通过以下方式微调了和弦的风味：</p>
      <ol>
        <li>把某个音再往高处翻高 12 个半音</li>
        <li>使用非常宽的音程</li>
        <li>省略某些音符</li>
      </ol>

      <h2>声部进行（Voice Leading）</h2>
      <p>
        当我们想要有意义地把一系列和弦连接起来时，所选择的排列法会影响每个和弦过渡到下一个和弦的方式。
        我们再来看一次《The House of the Rising Sun》，这次运用刚学到的排列技巧：
      </p>
      <CodeBlock code={`note(\`<
[0,3,7] [7,12,16] [0,7,16] [4,7,12]
[0,3,7] [4,7,12] [0,3,7] [4,7,12]
>\`.add(\`<
a c d f
a e a e
>\`)).room(.5)`} punchcard />
      <p>
        与之前没有考虑排列法的版本相比，这些排列法让和弦听起来更加连贯、跳动感更少。这种和弦互相衔接的方式也被称为
        <code>voice leading</code>（声部进行），令人联想到合唱中某一个声部如何随着和弦序列而移动。
      </p>
      <p>比如，试着唱一下上面例子里的最高声部，再试试没有注重声部进行的那个版本，哪一个更容易唱？</p>
      <p>当然，一段和弦进行可以有很多种排列方式，没有绝对的对错。</p>

      <h2>和弦符号（Chord Symbols）</h2>
      <p>
        演奏和弦类音乐的乐手常常使用「主奏乐谱」（lead sheet），这是一种简化的乐谱记法。这类乐谱把和弦等核心要素
        浓缩成符号，让音乐更容易读懂和跟随。例如，《The House of the Rising Sun》的主奏乐谱可能会这样写和弦：
      </p>
      <StaticCode code={`Am | C | D  | F
Am | E | Am | E`} />
      <p>
        这里，每个符号由和弦的 <code>root</code>（根音）加上一个可选的 <code>m</code> 组成，用来表示这是小三和弦
        （只有根音则表示大三和弦）。我们可以在 Strudel 里用 <code>pick</code> 函数模拟这种记法：
      </p>
      <CodeBlock code={`"<Am C D F Am E Am E>"
  .pick({
    Am: "57,60,64",
    C: "55,60,64",
    D: "50,57,66",
    F: "57,60,65",
    E: "56,59,64",
  })
  .note().room(.5)`} punchcard />

      <h2>voicing 函数</h2>
      <p>
        找到连接顺畅又好听的排列法，往往是一个费时费力的过程。<code>chord</code> 和 <code>voicing</code> 函数可以自动完成这件事：
      </p>
      <CodeBlock code={`chord("<Am C D F Am E Am E>").voicing().room(.5)`} punchcard />
      <p>
        这里我们同样使用和弦符号，但排列法会自动生成，并具备平滑的 <code>voice leading</code>（声部进行），使跳动最小化。
        这一思路的灵感来自钢琴或吉他演奏者挑选和弦为歌曲伴奏的方式。
      </p>

      <h2>排列法字典（Voicing Dictionaries）</h2>
      <p>
        voicing 函数内部使用的是所谓的 <code>voicing dictionaries</code>（排列法字典），这也是可以自定义的：
      </p>
      <CodeBlock code={`addVoicings('house', {
  '': ['7 12 16', '0 7 16', '4 7 12'],
  'm': ['0 3 7']
})
chord("<Am C D F Am E Am E>")
  .dict('house').anchor(66)
  .voicing().room(.5)`} punchcard />
      <p>
        在一个 <code>voicing dictionary</code> 中，每个和弦符号都被指定一个或多个排列法。<code>voicing</code>
        函数会挑选出最接近 <code>anchor</code>（锚点，默认是 <code>c5</code>）的那个排列法。
      </p>
      <p>这种方式的好处在于，一份 <code>voicing dictionary</code> 可以用来演奏任何和弦进行，并自动完成声部进行！</p>

      <h2>默认字典</h2>
      <p>使用默认字典时，可以使用这些和弦符号：</p>
      <StaticCode code={`2 5 6 7 9 11 13 69 add9
o h sus ^ - ^7 -7 7sus
h7 o7 ^9 ^13 ^7#11 ^9#11
^7#5 -6 -69 -^7 -^9 -9
-add9 -11 -7b5 h9 -b6 -#5
7b9 7#9 7#11 7b5 7#5 9#11
9b5 9#5 7b13 7#9#5 7#9b5
7#9#11 7b9#11 7b9b5 7b9#5
7b9#9 7b9b13 7alt 13#11
13b9 13#9 7b9sus 7susadd3
9sus 13sus 7b13sus
aug M m M7 m7 M9 M13
M7#11 M9#11 M7#5 m6 m69
m^7 -M7 m^9 -M9 m9 madd9
m11 m7b5 mb6 m#5 mM7 mM9`} />
      <p>
        可用的和弦及其格式很大程度上参考了
        <a href="https://technimo.helpshift.com/hc/en/3-ireal-pro/faq/88-chord-symbols-used-in-ireal-pro/" target="_blank" rel="noopener noreferrer">
          ireal pro 的和弦符号
        </a>
        。有些符号是同义的：
      </p>
      <ul>
        <li>
          「-」和「m」相同，例如 C-7 = Cm7
        </li>
        <li>
          「^」和「M」相同，例如 C^7 = CM7
        </li>
        <li>「+」和「aug」相同</li>
      </ul>
      <p>
        你可以自行决定喜欢用哪一种写法，这些符号并没有国际标准。完整和弦需要在符号前加上根音，例如
        D7#11 就是相对于 D 的 7#11 和弦。
      </p>
      <p>下面是所有以 C 为根音的可能和弦：</p>
      <CodeBlock code={`chord(\`<
C2 C5 C6 C7 C9 C11 C13 C69
Cadd9 Co Ch Csus C^ C- C^7
C-7 C7sus Ch7 Co7 C^9 C^13
C^7#11 C^9#11 C^7#5 C-6 C-69
C-^7 C-^9 C-9 C-add9 C-11
C-7b5 Ch9 C-b6 C-#5 C7b9
C7#9 C7#11 C7b5 C7#5 C9#11
C9b5 C9#5 C7b13 C7#9#5 C7#9b5
C7#9#11 C7b9#11 C7b9b5 C7b9#5
C7b9#9 C7b9b13 C7alt C13#11
C13b9 C13#9 C7b9sus C7susadd3
C9sus C13sus C7b13sus C Caug
CM Cm CM7 Cm7 CM9 CM13 CM7#11
CM9#11 CM7#5 Cm6 Cm69 Cm^7
C-M7 Cm^9 C-M9 Cm9 Cmadd9
Cm11 Cm7b5 Cmb6 Cm#5
>\`).voicing().room(.5)`} punchcard />
      <p>
        注意默认字典对每个和弦符号包含了多种（= <code>voicings</code>）演奏方式。默认情况下，<code>voicing</code>
        函数会尝试让跳动最小化。你可以通过下面几种方式来调整所挑选的排列法：
      </p>

      <h2>anchor</h2>
      <p>
        <code>anchor</code>（锚点）是用来对齐排列法的一个音符：
      </p>
      <CodeBlock code={`anchor("<c4 g4 c5 g5>").chord("C").voicing().room(.5)`} punchcard />
      <p>
        默认情况下，anchor 是排列法能包含的最高音符。在为某个和弦决定挑选字典中哪一个排列法时，
        最高音最接近 anchor 的那个排列法胜出。
      </p>
      <p>
        请注意上面例子中的 anchor 与 pianoroll 中的最高音是对应的。和 <code>note</code> 一样，anchor 既可以接受 MIDI
        编号，也可以接受音符名。
      </p>

      <h2>mode</h2>
      <p>
        用 <code>mode</code> 可以改变排列法与 <code>anchor</code> 的关系：
      </p>
      <CodeBlock code={`mode("<below above duck root>").chord("C").anchor("c5").voicing().room(.5)`} punchcard />
      <p>可用的 mode 有：</p>
      <ul>
        <li>
          <code>below</code>：排列法的最高音低于或等于 anchor（默认）
        </li>
        <li>
          <code>above</code>：排列法的最低音高于或等于 anchor
        </li>
        <li>
          <code>duck</code>：排列法的最高音低于 anchor
        </li>
        <li>
          <code>root</code>：排列法的最低音始终是最接近 anchor 的根音
        </li>
      </ul>
      <p>
        <code>anchor</code> 也可以直接在 <code>mode</code> 函数里一起设置：
      </p>
      <CodeBlock code={`mode("<below above duck root>:c5").chord("C").voicing().room(.5)`} punchcard />

      <h2>n</h2>
      <p>
        <code>n</code> 控制参数可以和 <code>voicing</code> 一起使用，用来挑选单个音符：
      </p>
      <CodeBlock code={`n("0 3 1 2").chord("<C <Fm Db>>").voicing()
.clip("4 3 2 1").room(.5)`} punchcard />

      <h2>示例</h2>
      <p>这是一段 F 调爵士布鲁斯（Jazz Blues）的例子：</p>
      <CodeBlock code={`let chords = chord(\`<
F7 Bb7 F7 [Cm7 F7]
Bb7 Bo F7 [Am7 D7]
Gm7 C7 [F7 D7] [Gm7 C7]
>\`)
$: n("7 8 [10 9] 8").set(chords).voicing().dec(.2)
$: chords.struct("- x - x").voicing().room(.5)
$: n("0 - 1 -").set(chords).mode("root:g2").voicing()
`} punchcard />
      <p>整首曲子的旋律、和弦与低音线都复用了同一份和弦定义。</p>
    </>
  );
}

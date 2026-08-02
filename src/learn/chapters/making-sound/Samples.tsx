import { CodeBlock, StaticCode, Callout, Table } from '../../components';

export default function Samples() {
  return (
    <>
      <p>
        采样（samples）是 Tidal 和 Strudel 里最常见的发声方式。一个采样是一小段音频，作为声音生成的基础素材，可以经过各种变换处理。以采样为基础的音乐可以理解为一种声音拼贴。
        <a href="https://en.wikipedia.org/wiki/Sampling_(music)" target="_blank" rel="noopener noreferrer">
          了解更多关于 Sampling 的内容
        </a>
      </p>
      <p>Strudel 支持从任意公开可访问的 URL 加载各种格式（wav、mp3、ogg）的音频文件作为采样。</p>

      <h2>默认采样</h2>
      <p>Strudel 默认内置了一份「采样映射表（sample map）」，提供了一套可以直接上手的基础声音。</p>
      <CodeBlock code={`s("bd sd [~ bd] sd,hh*16, misc")`} />
      <p>
        这里我们用 <code>s</code> 函数播放了几种不同的默认采样（<code>bd</code>、<code>sd</code>、<code>hh</code> 和{' '}
        <code>misc</code>），组成了一段鼓点。
      </p>
      <p>
        对于鼓声，Strudel 使用了完整的{' '}
        <a href="https://github.com/ritchse/tidal-drum-machines" target="_blank" rel="noopener noreferrer">
          tidal-drum-machines
        </a>{' '}
        采样库，命名规则如下：
      </p>
      <Table>
        <thead>
          <tr>
            <th>鼓件</th>
            <th>缩写</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>底鼓（Bass drum、Kick drum）</td>
            <td>bd</td>
          </tr>
          <tr>
            <td>军鼓（Snare drum）</td>
            <td>sd</td>
          </tr>
          <tr>
            <td>军鼓边击（Rimshot）</td>
            <td>rim</td>
          </tr>
          <tr>
            <td>拍手声（Clap）</td>
            <td>cp</td>
          </tr>
          <tr>
            <td>闭镲（Closed hi-hat）</td>
            <td>hh</td>
          </tr>
          <tr>
            <td>开镲（Open hi-hat）</td>
            <td>oh</td>
          </tr>
          <tr>
            <td>吊镲（Crash）</td>
            <td>cr</td>
          </tr>
          <tr>
            <td>叮叮镲（Ride）</td>
            <td>rd</td>
          </tr>
          <tr>
            <td>高音嗵鼓（High tom）</td>
            <td>ht</td>
          </tr>
          <tr>
            <td>中音嗵鼓（Medium tom）</td>
            <td>mt</td>
          </tr>
          <tr>
            <td>低音嗵鼓（Low tom）</td>
            <td>lt</td>
          </tr>
        </tbody>
      </Table>
      <img src="/learn-img/drumset.png" alt="鼓组各部件对应的缩写标注图" className="max-w-full mb-1" />
      <a
        href="https://de.wikipedia.org/wiki/Schlagzeug#/media/Datei:Drum_set.svg"
        target="_blank"
        rel="noopener noreferrer"
        className="block text-right text-[11px] text-white/40 hover:text-white/60 mb-3"
      >
        原图作者 Pbroks13
      </a>
      <p>更多打击类声音：</p>
      <Table>
        <thead>
          <tr>
            <th>来源</th>
            <th>缩写</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>沙锤类（Shakers、maracas、cabasas 等）</td>
            <td>sh</td>
          </tr>
          <tr>
            <td>牛铃（Cowbell）</td>
            <td>cb</td>
          </tr>
          <tr>
            <td>铃鼓（Tambourine）</td>
            <td>tb</td>
          </tr>
          <tr>
            <td>其他打击乐</td>
            <td>perc</td>
          </tr>
          <tr>
            <td>杂项采样</td>
            <td>misc</td>
          </tr>
          <tr>
            <td>效果音</td>
            <td>fx</td>
          </tr>
        </tbody>
      </Table>
      <p>
        此外，Strudel 默认还加载了来自{' '}
        <a href="https://github.com/sgossner/VCSL" target="_blank" rel="noopener noreferrer">
          VCSL
        </a>{' '}
        的乐器采样。
      </p>
      <p>
        想查看有哪些采样名字可用，可以打开{' '}
        <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer">
          REPL
        </a>{' '}
        里的 <code>sounds</code> 标签页。
      </p>
      <Callout>
        <p>
          💡 本节后文提到的 <code>sounds</code>、<code>import-sounds</code>、<code>user</code>{' '}
          标签页，都是官方 Strudel REPL（strudel.cc）侧边栏里的功能，oddeNova 目前没有对应的界面入口。
        </p>
      </Callout>
      <p>
        你还可以用 <code>soundAlias</code> 函数为已有的声音创建自定义别名：
      </p>
      <CodeBlock
        code={`soundAlias('RolandTR808_bd', 'kick')
s("kick")`}
      />
      <p>
        注意，初始加载时只会加载采样映射表（名字到 URL 的映射），实际的音频采样并不会一开始就加载，而是在真正被播放时才加载。这种「按需加载」的行为也叫{' '}
        <code>lazy loading</code>（惰性加载）。它虽然节省资源，但也可能导致声音第一次被触发时听不到，因为此时声音还在加载中。（
        <a href="https://codeberg.org/uzu/strudel/issues/187" target="_blank" rel="noopener noreferrer">
          这个问题未来可能会被修复
        </a>
        ）
      </p>

      <h2>鼓机音色库（Sound Banks）</h2>
      <p>
        如果打开 <code>sounds</code> 标签页再点开 <code>drum-machines</code>，可以看到鼓声采样都带有鼓机名字作为前缀，比如{' '}
        <code>RolandTR808_bd</code>、<code>RolandTR808_sd</code>、<code>RolandTR808_hh</code> 等。
      </p>
      <p>我们当然可以这样直接用：</p>
      <CodeBlock code={`s("RolandTR808_bd RolandTR808_sd,RolandTR808_hh*16")`} />
      <p>
        ……但这样写显然有点繁琐。用 <code>bank</code> 函数，可以简写成：
      </p>
      <CodeBlock code={`s("bd sd,hh*16").bank("RolandTR808")`} />
      <p>你甚至可以对 bank 使用 pattern，在不同鼓机之间切换：</p>
      <CodeBlock code={`s("bd sd,hh*16").bank("<RolandTR808 RolandTR909>")`} />
      <p>
        在底层，<code>bank</code> 只是把鼓机名字用 <code>_</code> 拼接到采样名前面，得到完整名字，之所以能生效，是因为{' '}
        <code>_</code> 后面的部分（<code>bd</code>、<code>sd</code> 等）是标准化的。另外要注意，有些鼓机音色库并不是所有声音都有对应采样！
      </p>

      <h2>选择声音</h2>
      <p>
        再次打开 <code>sounds</code> 标签页，点开 <code>drum machines</code>，会看到每个名字后面还带有一个数字，表示有多少个独立的采样可用。比如{' '}
        <code>RolandTR909_hh(4)</code> 表示有 4 个 TR909 hihat 采样可用。默认情况下 <code>s</code> 会播放第一个采样，但我们可以用{' '}
        <code>n</code> 从 0 开始选择其他采样：
      </p>
      <CodeBlock code={`s("hh*8").bank("RolandTR909").n("0 1 2 3")`} />
      <p>数字太大的话会自动回绕到开头：</p>
      <CodeBlock code={`s("hh*8").bank("RolandTR909").n("0 1 2 3 4 5 6 7")`} />
      <p>
        这里 0-3 和 4-7 会播放相同的声音，因为 <code>RolandTR909_hh</code> 只有 4 个采样。
      </p>
      <p>
        选择采样也可以在迷你记谱法内部用 <code>:</code> 完成：
      </p>
      <CodeBlock
        code={`s("bd*4,hh:0 hh:1 hh:2 hh:3 hh:4 hh:5 hh:6 hh:7")
.bank("RolandTR909")`}
      />

      <h2>加载自定义采样</h2>
      <p>
        你可以用 <code>samples</code> 函数加载一份非标准的采样映射表。
      </p>

      <h3>从文件 URL 加载采样</h3>
      <p>
        下面这个例子里，我们给几个特定的音频文件分别指定了名字 <code>bassdrum</code>、<code>hihat</code> 和{' '}
        <code>snaredrum</code>：
      </p>
      <CodeBlock
        code={`samples({
  bassdrum: 'bd/BT0AADA.wav',
  hihat: 'hh27/000_hh27closedhh.wav',
  snaredrum: ['sd/rytm-01-classic.wav', 'sd/rytm-00-hard.wav'],
}, 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/');

s("bassdrum snaredrum:0 bassdrum snaredrum:1, hihat*16")`}
      />
      <p>
        你可以为每个采样名字自由选择任意字母组合，甚至可以覆盖默认的声音。你选的名字会在 <code>s</code> 函数中可用。请确保基础
        URL 和每个采样路径拼在一起后是一个正确可访问的 URL！
      </p>
      <p>
        在上面这个例子里，<code>bassdrum</code> 会加载：
      </p>
      <StaticCode
        plain
        code={`https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/bd/BT0AADA.wav
|----------------------base path --------------------------------|--sample path-|`}
      />
      <p>
        注意，可以像 <code>bassdrum</code>、<code>hihat</code> 那样只加载单个文件，也可以像 <code>snaredrum</code>{' '}
        那样加载一个文件列表！代码运行后，你选定的采样名字会出现在 <code>sounds</code> -&gt; <code>user</code> 里。
      </p>

      <h3>从 strudel.json 文件加载采样</h3>
      <p>
        上面那种加载方式每次写新 pattern 时都要重新写一遍，比较繁琐。为了避免这一点，你可以直接传入一个网络上某处的{' '}
        <code>strudel.json</code> 文件的 URL：
      </p>
      <CodeBlock
        code={`samples('https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json')
s("bd sd bd sd,hh*16")`}
      />
      <p>
        这个文件需要用 JSON 格式定义一份采样映射表，格式和上面描述的一致。此外，还可以用 <code>_base</code> 这个 key
        定义基础路径。上一节的例子可以改写成：
      </p>
      <StaticCode
        code={`{
  "_base": "https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/",
  "bassdrum": "bd/BT0AADA.wav",
  "snaredrum": "sd/rytm-01-classic.wav",
  "hihat": "hh27/000_hh27closedhh.wav"
}`}
      />
      <Callout>
        <p>
          注意，浏览器往往会在第一次加载时缓存 <code>strudel.json</code>，并且即使原文件已经更新，也会继续使用缓存版本。如果这给你带来了困扰（比如你正在开发一份新的采样包），可以通过修改
          URL 中某个字母的大小写，或者添加一个 URL 参数来强制浏览器重新下载：
        </p>
        <StaticCode code={`samples('https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json?version=2');`} />
        <p>这个参数会被 GitHub 忽略（但会改变 URL，从而在我们每次增加版本号时强制浏览器重新加载）。</p>
        <p>当然，你也可以直接从缓存里删除它（在浏览器隐私设置里清除缓存，或者如果你懂技术，也可以从开发者控制台清除，或者用一个专门清缓存的浏览器扩展）。</p>
      </Callout>

      <h3>生成 strudel.json</h3>
      <p>
        你可以用{' '}
        <a href="https://www.npmjs.com/package/@strudel/sampler" target="_blank" rel="noopener noreferrer">
          @strudel/sampler
        </a>{' '}
        为你生成一份 strudel.json 文件，运行：
      </p>
      <StaticCode code={`npx --yes @strudel/sampler --json > strudel.json`} />
      <p>
        关于 <code>@strudel/sampler</code> 的其他用法，见下文「通过 @strudel/sampler 从本地磁盘加载」。
      </p>

      <h3>Github 快捷方式</h3>
      <p>由于从 github 加载采样是很常见的需求，这里有一个快捷写法：</p>
      <CodeBlock
        code={`samples('github:tidalcycles/dirt-samples')
s("bd sd bd sd,hh*16")`}
      />
      <p>
        格式是 <code>samples('github:&lt;用户名&gt;/&lt;仓库名&gt;/&lt;分支名&gt;')</code>。如果省略{' '}
        <code>分支名</code>（就像上面这样），会使用 <code>main</code> 分支。这个写法假定仓库根目录下存在一个{' '}
        <code>strudel.json</code> 文件：
      </p>
      <StaticCode plain code={`https://raw.githubusercontent.com/<user>/<repo>/<branch>/strudel.json`} />

      <h3>通过「导入声音文件夹」从本地磁盘加载</h3>
      <p>
        如果你不想把采样上传到网上，也可以直接从本地磁盘加载。打开 REPL 里的 <code>sounds</code> 标签页，再打开搜索框下方的{' '}
        <code>import-sounds</code> 标签页。点击「导入声音文件夹」按钮，选择一个包含音频文件的文件夹。你选择的文件夹也可以包含带音频文件的子文件夹。举例：
      </p>
      <StaticCode
        code={`└─ samples
   ├─ swoop
   │  ├─ swoopshort.wav
   │  ├─ swooplong.wav
   │  └─ swooptight.wav
   └─ smash
      ├─ smashhigh.wav
      ├─ smashlow.wav
      └─ smashmiddle.wav`}
      />
      <p>
        上面这个例子里，<code>samples</code> 文件夹包含 2 个子文件夹 <code>swoop</code> 和 <code>smash</code>，里面各有音频文件。选中这个{' '}
        <code>samples</code> 文件夹后，<code>import-sounds</code> 旁边的 <code>user</code> 标签页里就会出现 2
        个新声音：<code>swoop(3) smash(3)</code>。里面的每个采样都可以像平常一样播放，例如{' '}
        <code>s("swoop:0 swoop:1 smash:2")</code>。每个声音内部的采样按字母顺序、从 0 开始编号。
      </p>

      <h3>通过 @strudel/sampler 从本地磁盘加载</h3>
      <p>
        除了用「导入声音文件夹」按钮把采样加载进浏览器，你也可以用本地文件服务器来提供采样。最简单的方式是使用{' '}
        <a href="https://www.npmjs.com/package/@strudel/sampler" target="_blank" rel="noopener noreferrer">
          @strudel/sampler
        </a>
        ：
      </p>
      <StaticCode
        plain
        code={`cd samples
npx @strudel/sampler`}
      />
      <p>然后就可以这样加载：</p>
      <CodeBlock
        code={`samples('http://localhost:5432/');

n("<0 1 2>").s("swoop smash")`}
      />
      <p>
        <code>@strudel/sampler</code> 的好处在于它会根据你的文件夹结构自动生成 <code>strudel.json</code> 文件。你可以在浏览器里打开{' '}
        <code>http://localhost:5432</code> 查看它生成的内容。
      </p>
      <p>
        注意：你的系统需要安装{' '}
        <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer">
          NodeJS
        </a>{' '}
        才能使用这个功能。
      </p>

      <h3>指定音高</h3>
      <p>
        为了让你的采样在配合 <code>note</code> 播放时音高准确，可以像这样为它指定一个基准音高：
      </p>
      <CodeBlock
        code={`samples({
  'gtr': 'gtr/0001_cleanC.wav',
  'moog': { 'g3': 'moog/005_Mighty%20Moog%20G3.wav' },
}, 'github:tidalcycles/dirt-samples');
note("g3 [bb3 c4] <g4 f4 eb4 f3>@2").s("gtr,moog").clip(1)
  .gain(.5)`}
      />
      <p>我们也可以为键盘的不同音区声明不同的采样：</p>
      <CodeBlock
        code={`setcpm(60)
samples({
  'moog': {
    'g2': 'moog/004_Mighty%20Moog%20G2.wav',
    'g3': 'moog/005_Mighty%20Moog%20G3.wav',
    'g4': 'moog/006_Mighty%20Moog%20G4.wav',
  }}, 'github:tidalcycles/dirt-samples')

note("g2!2 <bb2 c3>!2, <c4@3 [<eb4 bb3> g4 f4]>")
.s('moog').clip(1)
.gain(.5)`}
      />
      <p>采样器会自动选取当前音符最接近的那个采样音高！</p>
      <p>
        另外，这种为音高采样命名的写法在 <code>strudel.json</code> 文件里也同样适用。
      </p>

      <h3>Shabda</h3>
      <p>
        如果你不想手动挑选采样，还有一个很棒的工具叫{' '}
        <a href="https://shabda.ndre.gr/" target="_blank" rel="noopener noreferrer">
          shabda
        </a>
        。通过它，你可以输入任意采样名字，从{' '}
        <a href="https://freesound.org/" target="_blank" rel="noopener noreferrer">
          freesound.org
        </a>{' '}
        查询采样。示例：
      </p>
      <CodeBlock
        code={`samples('shabda:bass:4,hihat:4,rimshot:2')

$: n("0 1 2 3 0 1 2 3").s('bass')
$: n("0 1*2 2 3*2").s('hihat').clip(1)
$: n("~ 0 ~ 1 ~ 0 0 1").s('rimshot')`}
      />
      <p>
        你还可以用任意文本生成人工语音采样，支持多种语言。注意语言代码和性别参数是可选的，默认分别为 <code>en-GB</code> 和{' '}
        <code>f</code>：
      </p>
      <CodeBlock
        code={`samples('shabda/speech:the_drum,forever')
samples('shabda/speech/fr-FR/m:magnifique')

$: s("the_drum*2").chop(16).speed(rand.range(0.85,1.1))
$: s("forever magnifique").slow(4).late(0.125)`}
      />

      <h2>采样效果器</h2>
      <p>采样效果器是一组用于改变采样播放行为的函数。</p>

      <h3>begin</h3>
      <p>
        一个 0 到 1 之间的数字（可以是 pattern），跳过采样开头的一部分，例如 <code>0.25</code> 表示切掉采样前四分之一。
      </p>
      <CodeBlock
        code={`samples({ rave: 'rave/AREUREADY.wav' }, 'github:tidalcycles/dirt-samples')
s("rave").begin("<0 .25 .5 .75>").fast(2)`}
      />

      <h3>end</h3>
      <p>
        和 <code>begin</code> 类似，但用于切掉采样末尾的一部分。<code>1</code> 表示完整采样，<code>.5</code>{' '}
        表示一半，<code>.25</code> 表示四分之一，以此类推。
      </p>
      <CodeBlock code={`s("bd*2,oh*4").end("<.1 .2 .5 1>").fast(2)`} />

      <h3>loop</h3>
      <p>
        循环播放采样。注意循环的速度并不会和 cycle 的速度同步。要调整循环区间，请用 <code>loopBegin</code> /{' '}
        <code>loopEnd</code>。
      </p>
      <CodeBlock code={`s("casio").loop(1)`} />

      <h3>loopBegin</h3>
      <p>
        在采样内部（<code>begin</code> 和 <code>end</code> 之间）指定一个具体位置作为循环起点。注意这个位置必须在{' '}
        <code>begin</code> 和 <code>end</code> 之间，并且在 <code>loopEnd</code> 之前！另外，以 <code>wt_</code>{' '}
        开头的采样（wt = wavetable，即波表）会自动循环！
      </p>
      <CodeBlock
        code={`s("space").loop(1)
.loopBegin("<0 .125 .25>")`}
      />

      <h3>loopEnd</h3>
      <p>
        在采样内部（<code>begin</code> 和 <code>end</code> 之间）指定一个具体位置作为循环终点。注意这个位置必须在{' '}
        <code>begin</code> 和 <code>end</code> 之间，并且在 <code>loopBegin</code> 之后！
      </p>
      <CodeBlock
        code={`s("space").loop(1)
.loopEnd("<1 .75 .5 .25>")`}
      />

      <h3>cut</h3>
      <p>
        模仿经典鼓机的行为：只要有属于同一个 cut group 的另一个采样即将播放，就会立刻停止当前正在播放的采样。一个典型例子是开镲后面紧跟一个闭镲，闭镲会自动把开镲静音。
      </p>
      <CodeBlock code={`s("[oh hh]*4").cut(1)`} />

      <h3>clip</h3>
      <p>
        把时长乘以给定的数字。如果结果超过了采样本身的长度，也会把采样在末尾处截断。
      </p>
      <CodeBlock code={`note("c a f e").s("piano").clip("<.5 1 2>")`} />

      <h3>loopAt</h3>
      <p>通过调整播放速度，让采样正好填满指定的 cycle 数。</p>
      <CodeBlock
        code={`samples({ rhodes: 'https://cdn.freesound.org/previews/132/132051_316502-lq.mp3' })
s("rhodes").loopAt(2)`}
      />

      <h3>fit</h3>
      <p>让采样自动适配当前事件所占的时长。</p>
      <CodeBlock
        code={`samples({ rhodes: 'https://cdn.freesound.org/previews/132/132051_316502-lq.mp3' })
s("rhodes/2").fit()`}
      />

      <h3>chop</h3>
      <p>把一个采样切成 N 个相等的小段，并按顺序依次播放它们。</p>
      <CodeBlock
        code={`samples({ rhodes: 'https://cdn.freesound.org/previews/132/132051_316502-lq.mp3' })
s("rhodes")
 .chop(4)
 .rev()
 .loopAt(2)`}
      />

      <h3>striate</h3>
      <p>
        和 <code>chop</code> 类似，把采样切成 N 段，但会把每一段都铺到整个 pattern 上循环播放，从而制造出一种「梳齿」般的交错效果。
      </p>
      <CodeBlock code={`s("numbers:0 numbers:1 numbers:2").striate(6).slow(3)`} />

      <h3>slice</h3>
      <p>把采样切成任意数量的片段，然后用一个 pattern 决定要播放哪些片段、按什么顺序播放。</p>
      <CodeBlock
        code={`samples('github:tidalcycles/dirt-samples')
s("breaks165").slice(8, "0 1 <2 2*2> 3 [4 0] 5 6 7".every(3, rev)).slow(0.75)`}
      />

      <h3>splice</h3>
      <p>
        和 <code>slice</code> 类似，但会额外调整每个片段的播放速度，让它正好填满自己在 pattern 中所占的时长。
      </p>
      <CodeBlock
        code={`samples('github:tidalcycles/dirt-samples')
s("breaks165")
.splice(8,  "0 1 [2 3 0]@2 3 0@2 7")`}
      />

      <h3>scrub</h3>
      <p>
        让你像磁带循环那样「刮擦（scrub）」一段音频：通过传入数值来控制在音频文件中的播放位置。也支持可选的数组写法，例如{' '}
        <code>"0.5:2"</code>，其中第二个值控制播放速度。
      </p>
      <CodeBlock
        code={`samples('github:switchangel/pad')
s("swpad:0").scrub("{0.1!2 .25@3 0.7!2 <0.8:1.5>}%8")`}
      />

      <h3>speed</h3>
      <p>
        改变采样播放速度，是一种低成本改变音高的方式。可以是任意数字（正负均可），负数会让采样倒放。
      </p>
      <CodeBlock code={`s("bd*6").speed("1 2 4 1 -2 -4")`} />

      <p>了解了采样之后，我们再来看看合成器（Synths）能带给我们什么。</p>
    </>
  );
}

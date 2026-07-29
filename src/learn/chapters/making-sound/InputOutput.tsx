import { CodeBlock, StaticCode, Callout, Table } from '../../components';

export default function InputOutput() {
  return (
    <>
      <p>
        通常，Strudel 是通过自带的、基于{' '}
        <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API" target="_blank" rel="noopener noreferrer">
          Web Audio
        </a>{' '}
        的合成引擎「SuperDough」来编排声音的。
      </p>
      <p>
        除此之外，Strudel 也可以用来编排其他东西，比如：通过 MIDI 控制软件或硬件合成器；通过 Open Sound
        Control（OSC）控制其他软件（包括常与 Strudel 的姐妹项目{' '}
        <a href="https://tidalcycles.org/" target="_blank" rel="noopener noreferrer">
          TidalCycles
        </a>{' '}
        搭配使用的{' '}
        <a href="https://github.com/musikinformatik/SuperDirt/" target="_blank" rel="noopener noreferrer">
          SuperDirt
        </a>{' '}
        合成器）；或者通过 MQTT 这种「物联网」协议。
      </p>

      <h2>MIDI</h2>
      <p>
        借助{' '}
        <a href="https://npmjs.com/package/webmidi" target="_blank" rel="noopener noreferrer">
          webmidi
        </a>
        ，Strudel 无需任何额外软件即可支持 MIDI，只需要在 pattern 上添加相应方法即可：
      </p>

      <h3>midin(inputName?)</h3>
      <p>
        MIDI 输入：打开一个 MIDI 输入端口，接收 MIDI 控制变化（control change）消息。返回值是一个函数，接受要查询的 MIDI cc
        值，也可以额外传入 MIDI 通道。查询时，该 pattern 会返回该 cc 编号最近收到的 MIDI 数值（如果指定了通道，还会按通道过滤），并归一化到 0 到 1 之间。
      </p>
      <CodeBlock
        code={`const cc = await midin('IAC Driver Bus 1')
note("c a f e").lpf(cc(0).range(0, 1000)).lpq(cc(1).range(0, 10)).sound("sawtooth")`}
      />

      <h3>midikeys(inputName?)</h3>
      <p>
        MIDI 键盘：打开一个 MIDI 输入端口，接收 MIDI 键盘消息。由于 Superdough 目前还不支持不确定时长的音符，这里的 note
        长度是固定的。返回的 <code>midichan</code> 控制值里包含了该音符所在的 MIDI 通道编号，方便在后续处理链中做过滤或加工。
      </p>
      <CodeBlock
        code={`const kb = await midikeys('Arturia KeyStep 32')
kb().s("tri").lpf(80).lpe(6).lpd(0.1).room(2).delay(0.35)`}
      />

      <h3>midi(outputName?, options?)</h3>
      <p>
        连接一个 MIDI 设备，或者使用 IAC Driver（Mac）/ Midi Through Port（Linux）来发送内部 MIDI 消息。如果没有指定{' '}
        <code>outputName</code>，会使用找到的第一个 MIDI 输出设备。
      </p>
      <CodeBlock code={`$: chord("<C^7 A7 Dm7 G7>").voicing().midi('IAC Driver')`} />
      <p>运行代码后，控制台会立刻打印出可用 MIDI 设备的日志，例如：</p>
      <StaticCode code={`Midi connected! Using "Midi Through Port-0".`} />
      <p>
        <code>.midi()</code> 函数还可以接受一个选项对象，包含以下属性：
      </p>
      <CodeBlock
        code={`$: note("d e c a f").midi('IAC Driver', { isController: true, midimap: 'default'})`}
      />
      <Table>
        <thead>
          <tr>
            <th>选项</th>
            <th>类型</th>
            <th>默认值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>isController</td>
            <td>boolean</td>
            <td>false</td>
            <td>为 true 时禁止发送音符消息，适用于 MIDI 控制器</td>
          </tr>
          <tr>
            <td>latencyMs</td>
            <td>number</td>
            <td>34</td>
            <td>用于对齐 MIDI 与音频引擎的延迟（毫秒）</td>
          </tr>
          <tr>
            <td>noteOffsetMs</td>
            <td>number</td>
            <td>10</td>
            <td>note-off 消息的偏移量（毫秒），用于防止音符衔接产生毛刺</td>
          </tr>
          <tr>
            <td>midichannel</td>
            <td>number</td>
            <td>1</td>
            <td>默认的 MIDI 通道（1-16）</td>
          </tr>
          <tr>
            <td>velocity</td>
            <td>number</td>
            <td>0.9</td>
            <td>默认的音符力度（0-1）</td>
          </tr>
          <tr>
            <td>gain</td>
            <td>number</td>
            <td>1</td>
            <td>力度对应的默认增益倍数（0-1）</td>
          </tr>
          <tr>
            <td>midimap</td>
            <td>string</td>
            <td>'default'</td>
            <td>用于控制变化消息的 MIDI 映射名字</td>
          </tr>
          <tr>
            <td>midiport</td>
            <td>string/number</td>
            <td>-</td>
            <td>MIDI 设备名字或索引</td>
          </tr>
        </tbody>
      </Table>

      <h3>midiport(outputName)</h3>
      <p>选择要使用的 MIDI 输出设备，也可以用 pattern 在不同设备间切换。</p>
      <StaticCode
        code={`$: midiport('IAC Driver');
$: note('c a f e').midiport('<0 1 2 3>').midi();`}
      />

      <h3>midichan(number)</h3>
      <p>
        选择要使用的 MIDI 通道。如果不设置，<code>.midi</code> 默认使用通道 1。
      </p>

      <h3>midicmd(command)</h3>
      <p>
        <code>midicmd</code> 用于向 MIDI 设备发送 MIDI 系统实时消息，控制时钟和传输状态。它支持以下命令：
      </p>
      <ul>
        <li>
          <code>clock</code>/<code>midiClock</code> —— 发送 MIDI 时钟消息
        </li>
        <li>
          <code>start</code> —— 发送 MIDI 启动消息
        </li>
        <li>
          <code>stop</code> —— 发送 MIDI 停止消息
        </li>
        <li>
          <code>continue</code> —— 发送 MIDI 继续消息
        </li>
      </ul>
      <p>
        你可以用 pattern 来控制时钟，并确保它在 REPL 启动时同步开始。注意：如果 MIDI
        没有事先配置好，这里的行为可能不符合预期。
      </p>
      <CodeBlock
        code={`$:stack(
  midicmd("clock*48,<start stop>/2").midi('IAC Driver')
)`}
      />

      <h2>control, ccn && ccv</h2>
      <ul>
        <li>
          <code>control</code> 向 MIDI 设备发送控制变化（control change）消息。
        </li>
        <li>
          <code>ccn</code> 设置 cc 编号，具体含义取决于你的合成器的 MIDI 映射。
        </li>
        <li>
          <code>ccv</code> 设置 cc 值，归一化到 0 到 1 之间。
        </li>
      </ul>
      <CodeBlock code={`note("c a f e").control([74, sine.slow(4)]).midi()`} />
      <CodeBlock code={`note("c a f e").ccn(74).ccv(sine.slow(4)).midi()`} />
      <p>
        在上面的例子中，<code>ccn</code> 被设为 74，这是许多合成器上滤波器截止频率对应的编号；<code>ccv</code>{' '}
        由一个 saw pattern 控制。由于默认情况下，结构（structure）取自最左边的 pattern，所以当你把所有内容写进同一个 pattern
        时，<code>ccv</code> 的节奏会自动对齐到 note 的节奏上。你也可以像下面这样单独控制 cc 消息：
      </p>
      <CodeBlock
        code={`$: note("c a f e").midi()
$: ccv(sine.segment(16).slow(4)).ccn(74).midi()`}
      />
      <p>
        除了直接设置 <code>ccn</code> 和 <code>ccv</code>，你也可以用 <code>midimaps</code> 创建映射：
      </p>

      <h3>midimaps</h3>
      <p>定义一组 cc 编号到名字的映射，方便用有意义的名字而不是数字编号来控制 cc 消息。</p>

      <h3>defaultmidimap</h3>
      <p>Strudel 内置的默认 MIDI cc 映射表。</p>

      <h3>progNum（Program Change）</h3>
      <p>
        <code>progNum</code> 发送 MIDI 音色切换（program change）消息，用来切换 MIDI 设备上不同的预设/音色。取值应为 0
        到 127 之间的数字。
      </p>
      <CodeBlock
        code={`// 每个 cycle 在音色 0 和 1 之间切换
progNum("<0 1>").midi()

// 演奏音符的同时切换音色
note("c3 e3 g3").progNum("<0 1 2>").midi()`}
      />
      <p>
        音色切换消息适合用来在演出过程中切换不同的乐器音色或预设。具体每个编号对应什么声音，取决于你的 MIDI 设备本身的配置。
      </p>

      <h2>sysex, sysexid && sysexdata（系统专用消息）</h2>
      <p>
        <code>sysex</code> 向 MIDI 设备发送系统专用（System Exclusive，SysEx）消息。SysEx
        消息是设备专用的指令，可以让你更深入地控制合成器参数。值应为一个 0-255 之间的数字数组，代表 SysEx 的数据字节。
      </p>
      <CodeBlock
        code={`// 发送一条简单的 SysEx 消息
let id = 0x43; // Yamaha
//let id = "0x00:0x20:0x32"; // Behringer 的 ID 可以是一个数字数组
let data = "0x79:0x09:0x11:0x0A:0x00:0x00"; // 将 NSX-39 的音色设为发音 "Aa"
$: note("c a f e").sysex(id, data).midi();
$: note("c a f e").sysexid(id).sysexdata(data).midi();`}
      />
      <p>SysEx 消息的具体格式取决于你的 MIDI 设备的规格说明，请查阅设备的 MIDI 实现手册来了解支持哪些 SysEx 消息。</p>

      <h2>midibend && miditouch</h2>
      <p>
        <code>midibend</code> 设置 MIDI 弯音（pitch bend，范围 -1 到 1）。
      </p>
      <p>
        <code>miditouch</code> 设置 MIDI 触后（key after touch，范围 0 到 1）。
      </p>
      <CodeBlock code={`note("c a f e").midibend(sine.slow(4).range(-0.4,0.4)).midi()`} />
      <CodeBlock code={`note("c a f e").miditouch(sine.slow(4).range(0,1)).midi()`} />

      <h2>OSC / SuperDirt / StrudelDirt</h2>
      <p>
        在 TidalCycles 中，声音通常由运行在 SuperCollider 里的{' '}
        <a href="https://github.com/musikinformatik/SuperDirt/" target="_blank" rel="noopener noreferrer">
          SuperDirt
        </a>{' '}
        生成。Strudel 也支持使用 SuperDirt，不过需要安装一些额外的软件。
      </p>
      <p>
        另外还有一个叫{' '}
        <a href="https://github.com/daslyfe/StrudelDirt" target="_blank" rel="noopener noreferrer">
          StrudelDirt
        </a>{' '}
        的项目，它是针对 Strudel 做了一些优化的 SuperDirt（长远目标是把这些优化合并回 SuperDirt 主线）。
      </p>

      <h3>前置准备</h3>
      <p>要让 SuperDirt 配合 Strudel 工作，你需要：</p>
      <ol>
        <li>
          安装 SuperCollider + sc3 插件，详见{' '}
          <a href="https://tidalcycles.org/docs/" target="_blank" rel="noopener noreferrer">
            Tidal 文档
          </a>
          （安装 Tidal 那部分）
        </li>
        <li>
          安装 SuperDirt，或者安装针对 Strudel 做了优化的{' '}
          <a href="https://github.com/daslyfe/StrudelDirt" target="_blank" rel="noopener noreferrer">
            StrudelDirt
          </a>{' '}
          分支
        </li>
        <li>
          安装{' '}
          <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">
            node.js
          </a>
        </li>
        <li>
          下载{' '}
          <a href="https://codeberg.org/uzu/strudel/" target="_blank" rel="noopener noreferrer">
            Strudel 仓库
          </a>
          （或者用 git clone，如果你安装了 git）
        </li>
        <li>
          在 strudel 目录下运行 <code>pnpm i</code>
        </li>
        <li>
          运行 <code>pnpm run osc</code> 启动 OSC 服务器，它会把 Strudel REPL 的 OSC 消息转发给 SuperCollider
        </li>
      </ol>
      <p>现在一切就绪！</p>

      <h3>使用方法</h3>
      <ol>
        <li>
          启动 SuperCollider，可以使用 SuperCollider IDE，也可以在终端运行 <code>sclang</code>
        </li>
        <li>打开 Strudel REPL</li>
      </ol>
      <p>……或者直接在这里试试：</p>
      <CodeBlock code={`s("bd sd").osc()`} />
      <p>
        如果这时你听到了声音，恭喜你！如果没有，可以到{' '}
        <a href="https://discord.com/invite/HGEdXmRkzT" target="_blank" rel="noopener noreferrer">
          TidalCycles Discord 的 #strudel 频道
        </a>{' '}
        寻求帮助。
      </p>
      <p>
        注意：如果你在设置里把「Audio Engine Target」设为「OSC」，就不需要在代码末尾再加 <code>.osc()</code> 了。
      </p>

      <h3>osc</h3>
      <p>把每个事件作为一条 OSC 消息发送出去，可以被 SuperCollider 或其他支持 OSC 的软件接收。</p>

      <h3>SuperDirt 参数</h3>
      <p>
        更多信息请参考{' '}
        <a href="https://tidalcycles.org/" target="_blank" rel="noopener noreferrer">
          Tidal 文档
        </a>
        。
      </p>

      <h2>MQTT</h2>
      <p>
        MQTT 是一种为「物联网」设备设计的轻量级网络协议。要在 Strudel 中使用它，你需要一个被称为「broker」的 MQTT
        服务器，并且要支持安全的「websocket」连接。你可以自己运行一个（例如运行{' '}
        <a href="https://mosquitto.org/" target="_blank" rel="noopener noreferrer">
          mosquitto
        </a>
        ），不过对于没有系统管理经验的人来说，获取一个浏览器信任的 SSL 证书可能会有点麻烦。你也可以使用{' '}
        <a href="https://www.hivemq.com/mqtt/public-mqtt-broker/" target="_blank" rel="noopener noreferrer">
          公共 broker
        </a>
        。
      </p>
      <p>Strudel 目前还不支持通过 MQTT 接收消息，只能发送。</p>

      <h3>使用方法</h3>
      <p>下面的例子展示了如何把一个 pattern 发送到 MQTT broker：</p>
      <CodeBlock
        code={`"hello world"
    .mqtt(undefined, // 用户名（公开/开放服务器可以留空）
          undefined, // 密码
          '/strudel-pattern', // mqtt 'topic'
          'wss://mqtt.eclipseprojects.io:443/mqtt', // MQTT 服务器地址
          'mystrudel', // MQTT 客户端 id —— 不指定则随机生成
          0 // 延迟（发送消息前的等待时间，0 = 不延迟）
         )`}
      />
      <p>
        其他软件可以接收这些消息，比如用{' '}
        <a href="https://mosquitto.org/" target="_blank" rel="noopener noreferrer">
          mosquitto
        </a>{' '}
        的命令行客户端工具：
      </p>
      <StaticCode
        code={`> mosquitto_sub -h mqtt.eclipseprojects.io -p 1883 -t "/strudel-pattern"
> hello
> world
> hello
> world
> ...`}
      />
      <p>控制模式（control pattern）会被编码为 JSON，例如：</p>
      <CodeBlock
        code={`sound("sax(3,8)").speed("2 3")
  .mqtt(undefined, // 用户名（公开/开放服务器可以留空）
        undefined, // 密码
        '/strudel-pattern', // mqtt 'topic'
        'wss://mqtt.eclipseprojects.io:443/mqtt', // MQTT 服务器地址
        'mystrudel', // MQTT 客户端 id —— 不指定则随机生成
        0 // 延迟（发送消息前的等待时间，0 = 不延迟）
       )`}
      />
      <p>会发送出类似下面这样的消息：</p>
      <StaticCode
        code={`{"s":"sax","speed":2}
{"s":"sax","speed":2}
{"s":"sax","speed":3}
{"s":"sax","speed":2}
...`}
      />
      <Callout>
        <p>许多编程语言都提供了用于接收 MQTT 消息的库。</p>
      </Callout>
    </>
  );
}

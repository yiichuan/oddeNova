import { CodeBlock, Table } from '../../components';

export default function Devicemotion() {
  return (
    <>
      <p>
        Devicemotion 模块可以让你用移动设备的运动传感器（加速度计、陀螺仪、方向传感器）来实时控制音乐参数，为富有表现力的、基于肢体动作的音乐互动提供了可能。
      </p>

      <h2>基础设置</h2>
      <p>首先，你需要启用设备的运动感应：</p>
      <CodeBlock code={`enableMotion()`} />
      <p>这会提示用户授权访问设备的运动传感器。</p>

      <h2>可用的运动参数</h2>
      <p>你可以获取以下几类运动数据：</p>
      <Table>
        <thead>
          <tr>
            <th>运动类型</th>
            <th>完整名称与别名</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>加速度</td>
            <td>
              accelerationX (accX)、accelerationY (accY)、accelerationZ (accZ)
            </td>
            <td>测量设备的线性加速度（不包含重力）。原始值以 g 力为单位归一化。</td>
          </tr>
          <tr>
            <td>重力</td>
            <td>gravityX (gravX)、gravityY (gravY)、gravityZ (gravZ)</td>
            <td>反映设备相对于地球重力的朝向。原始值以 ±9.81 m/s² 归一化。</td>
          </tr>
          <tr>
            <td>旋转</td>
            <td>
              rotationAlpha (rotA, rotZ)、rotationBeta (rotB, rotX)、rotationGamma (rotG, rotY)
            </td>
            <td>测量各轴上的旋转速率。原始值（±180°/s）经过归一化。</td>
          </tr>
          <tr>
            <td>朝向</td>
            <td>
              orientationAlpha (oriA, oriZ)、orientationBeta (oriB, oriX)、orientationGamma (oriG, oriY)
            </td>
            <td>
              相对于设备初始位置的朝向。归一化范围：Alpha 为 0° 到 360°，Beta 为 -180° 到 180°，Gamma 为 -90° 到 90°。
            </td>
          </tr>
          <tr>
            <td>绝对朝向</td>
            <td>
              absoluteOrientationAlpha (absOriA, absOriZ)、absoluteOrientationBeta (absOriB, absOriX)、
              absoluteOrientationGamma (absOriG, absOriY)
            </td>
            <td>iOS 不支持。基于磁力计的、以地球为参照系的朝向，归一化方式和普通朝向相同。</td>
          </tr>
        </tbody>
      </Table>
      <p>说明：</p>
      <ul>
        <li>所有运动数值都被归一化到 0 到 1 的范围。</li>
        <li>
          不同设备配备的传感器不一定相同，可以查看{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent"
            target="_blank"
            rel="noopener noreferrer"
          >
            DeviceMotionEvent API
          </a>{' '}
          了解浏览器兼容情况。
        </li>
        <li>
          更多细节可参考{' '}
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained"
            target="_blank"
            rel="noopener noreferrer"
          >
            朝向与运动数据详解
          </a>
          。
        </li>
      </ul>

      <h3>朝向 vs 绝对朝向</h3>
      <p>普通朝向和绝对朝向的关键区别在于：</p>
      <ul>
        <li>
          普通朝向（<code>oriX/Y/Z</code>）测量的是相对于设备初始位置的朝向变化
        </li>
        <li>
          绝对朝向（<code>absOriX/Y/Z</code>）测量的是相对于地球磁场和重力的朝向，无论设备的初始朝向是什么，都能给出一致的绝对数值
        </li>
      </ul>
      <p>举个例子，如果你把设备顺时针转 90 度再转回来：</p>
      <ul>
        <li>普通朝向会在旋转过程中显示变化，但转回来后会恢复到初始值</li>
        <li>绝对朝向则会在整个过程中持续显示真实的指南针朝向</li>
      </ul>
      <p>
        这让绝对朝向特别适合用来做基于方向的音乐互动——比如面朝北的表演者演奏一段旋律，面朝南的表演者演奏另一段，从而创造出具有空间感的合奏演出。相比之下，普通朝向更适合用来检测相对运动和手势，不受表演者朝向哪个方向的影响。
      </p>

      <h2>基础示例</h2>
      <p>下面是一个用设备运动来控制合成器的简单例子：</p>
      <CodeBlock
        code={`enableMotion()
// Create a simple melody
$:n("0 1 3 5")
.scale("C:major")
// Use tilt (gravity) to control filter
.lpf(gravityY.range(200, 2000)) // tilt forward/back for filter cutoff
// Use rotation to control effects
.room(rotZ.range(0, 0.8)) // rotate device for reverb amount
.gain(oriX.range(0.2, 0.8)) // tilt left/right for volume
.sound("sawtooth")`}
      />

      <h2>使用运动控制的小技巧</h2>
      <ol>
        <li>
          用 <code>.range(min, max)</code> 把传感器数值映射到有音乐意义的范围
        </li>
        <li>
          可以考虑用 <code>.segment()</code> 来平滑掉传感器数值的剧烈变化
        </li>
      </ol>

      <h2>调试</h2>
      <p>
        可以用 <code>segment(16).log()</code> 来查看任意运动传感器的原始数值：
      </p>
      <CodeBlock code={`$_: accX.segment(16).log(); // logs acceleration values to the console`} />
      <p>这在校准数值范围、理解设备对不同动作的响应方式时会很有帮助。</p>
      <p>
        请记住，设备运动功能在移动设备上效果最好，桌面浏览器可能不支持。在正式演出前，一定要在目标设备上先测试你的运动控制作品！
      </p>
    </>
  );
}

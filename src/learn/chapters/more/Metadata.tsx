import { StaticCode } from '../../components';

export default function Metadata() {
  return (
    <>
      <p>你可以在 Strudel 代码里用代码注释里的标签，选择性地添加一些音乐元数据：</p>
      <StaticCode
        code={`// @title My Cool Song
// @by John Doe
// @license CC-BY-SA-4.0`}
      />
      <p>和其他注释一样，这些内容会被 Strudel 忽略，但可以被其他工具用来获取这段音乐的一些信息。</p>

      <h2>另一种写法</h2>
      <p>也可以使用块注释：</p>
      <StaticCode
        code={`/*
@title My Cool Song
@by John Doe
@license CC-BY-SA-4.0
*/`}
      />
      <p>或者把多个标签写在同一行：</p>
      <StaticCode code={`// @title My Cool Song @by John Doe @license CC-BY-SA-4.0`} />
      <p>
        <code>title</code> 标签还有一种用引号的替代写法（必须写在文件最开头）：
      </p>
      <StaticCode code={`// "My Cool Song" @by John Doe`} />

      <h2>标签列表</h2>
      <p>目前可用的标签有：</p>
      <ul>
        <li>
          <code>@title</code>：音乐标题
        </li>
        <li>
          <code>@by</code>：作者（可以多个，用逗号分隔），也可以在 <code>{'<>'}</code>{' '}
          里附上链接（例如 <code>@by John Doe {'<https://example.com>'}</code>）
        </li>
        <li>
          <code>@license</code>
          ：音乐许可证（可以多个，用逗号分隔），每个许可证应使用{' '}
          <a href="https://spdx.org/licenses/" target="_blank" rel="noopener noreferrer">
            SPDX 许可证列表
          </a>{' '}
          中的正确标识符，例如 CC-BY-SA-4.0。不确定该用哪个？可以在{' '}
          <a href="https://creativecommons.org/choose/" target="_blank" rel="noopener noreferrer">
            这里
          </a>{' '}
          选择一个 Creative Commons 许可证
        </li>
        <li>
          <code>@details</code>：关于这段音乐的补充信息
        </li>
        <li>
          <code>@url</code>：与这段音乐相关的网页（git 仓库、Soundcloud 链接等）
        </li>
        <li>
          <code>@genre</code>：音乐风格（流行、爵士等）
        </li>
        <li>
          <code>@album</code>：专辑名称
        </li>
        <li>
          <code>@tag</code>：自定义标签
        </li>
      </ul>
      <p>
        给工具开发者的提示：<em>永远不要</em>假设一首曲子填写的这些字段在语法上是正确的，请确保你的软件足够健壮，遇到不合法的值时不会崩溃。
      </p>

      <h2>多个值</h2>
      <p>有些标签支持填写多个值，可以用逗号或换行分隔，也可以重复使用同一个标签：</p>
      <StaticCode
        code={`/*
@by John Doe
    Jane Doe
@genre pop, jazz
@url https://example.com
@url https://example.org
*/`}
      />
      <p>你也可以添加可选的前缀，并把标签放在代码里任何位置：</p>
      <StaticCode
        code={`/*
song @by John Doe
samples @by Jane Doe
*/
...
note("a3 c#4 e4 a4") // @by Sandy Sue`}
      />

      <h2>多行内容</h2>
      <p>如果某个标签不支持列表形式，它可以填写多行的值：</p>
      <StaticCode
        code={`/*
@details I wrote this song in February 19th, 2023.
         It was around midnight and I was lying on
         the sofa in the living room.
*/`}
      />

      <h2>在在线 REPL 中搜索元数据</h2>
      <p>元数据可以用在在线 REPL 的 patterns 标签页的搜索框里。</p>
      <p>比如想搜索某位特定作者的所有作品，可以用搜索词：</p>
      <StaticCode code={`by: Ada L`} />
      <p>或者搜索某种特定风格的作品：</p>
      <StaticCode code={`genre: unicorns`} />
      <p>
        提示：如果搜索时没有提供任何元数据字段名，会显示所有 <code>@title</code>、<code>@by</code> 或{' '}
        <code>@tag</code> 匹配该搜索词的作品。
      </p>
    </>
  );
}

export default function Pwa() {
  return (
    <>
      <p>
        即使没有网络，你也可以使用 Strudel！第一次访问{' '}
        <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer">
          Strudel REPL
        </a>{' '}
        时，浏览器会把整个网页应用（包括文档）下载下来。下载完成后（不到 1MB），即便断网也能访问这个网站，看到的是本地下载的版本而不是在线版本。
      </p>
      <p>当网站有更新时，浏览器会在你下次联网访问时下载这个更新；更新下载完成后，页面会自动刷新。</p>
      <p>
        这是因为 Strudel 是以渐进式网页应用（PWA）的形式实现的（使用了{' '}
        <a href="https://vite-pwa-org.netlify.app/" target="_blank" rel="noopener noreferrer">
          Vite PWA
        </a>
        ）。
      </p>

      <h2>采样</h2>
      <p>
        浏览器会下载应用本身，但采样只会在你实际使用它们时才被下载。所以想确保某一组采样离线可用，只需要先正常使用它们一次。另外，只有来自以下这些域名的采样才会被缓存以供离线使用：
      </p>
      <ul>
        <li>
          <code>https://raw.githubusercontent.com/*</code>：上传到 GitHub 的采样
        </li>
        <li>
          <code>https://freesound.org/*</code> / <code>https://cdn.freesound.org/*</code>：来自 freesound 的采样
        </li>
        <li>
          <code>https://shabda.ndre.gr/.*</code>：来自 shabda 的采样
        </li>
      </ul>

      <h2>查看 / 清除缓存</h2>
      <p>你可以在浏览器里查看所有已缓存的文件。</p>

      <h3>Firefox</h3>
      <ul>
        <li>打开开发者工具（Tools &gt; Web Developer &gt; Web Developer Tools）</li>
        <li>
          进入 Storage 标签页，展开 Cache Storage &gt; https://strudel.cc
        </li>
        <li>或者进入 Application 标签页，在 Service Workers 里查看最新的更新情况</li>
      </ul>

      <h3>基于 Chromium 的浏览器</h3>
      <ul>
        <li>打开开发者工具（右键 &gt; 检查）</li>
        <li>进入 Application 标签页</li>
        <li>在 Cache &gt; Cache Storage 里查看已下载的文件</li>
        <li>在 Service Workers 里查看最新的更新情况</li>
      </ul>

      <h2>Strudel 独立应用</h2>
      <p>
        你也可以把 Strudel 安装成一个独立应用，在大多数设备上使用。独立应用会拥有自己的桌面/主屏幕图标，并且在没有浏览器界面的独立窗口中启动。
      </p>
      <figure className="mb-4">
        <img src="/learn-img/strudel-macos.png" alt="Strudel 在 macOS 上的独立应用" className="max-w-full" />
        <figcaption className="mt-1 text-center text-[11px] text-white/40">Strudel 在 macOS 上的独立应用</figcaption>
      </figure>

      <h3>桌面端</h3>
      <p>使用基于 Chromium 的浏览器：</p>
      <ol>
        <li>
          打开{' '}
          <a href="https://strudel.cc" target="_blank" rel="noopener noreferrer">
            Strudel REPL
          </a>
          。
        </li>
        <li>在地址栏右侧，点击「安装 Strudel REPL」。</li>
        <li>此时 REPL 会作为一个独立的 Chromium 应用运行。</li>
      </ol>
      <p>
        如果不是基于 Chromium 的浏览器，可以用{' '}
        <a href="https://github.com/nativefier/nativefier" target="_blank" rel="noopener noreferrer">
          nativefier
        </a>{' '}
        生成一个桌面应用：
      </p>
      <ol>
        <li>确保已安装 Node.js。</li>
        <li>
          运行 <code>npx nativefier strudel.cc</code>。
        </li>
      </ol>
      <figure className="mb-4">
        <img src="/learn-img/strudel-linux.png" alt="Strudel 在 Linux 上的独立应用" className="max-w-full" />
        <figcaption className="mt-1 text-center text-[11px] text-white/40">Strudel 在 Linux 上的独立应用</figcaption>
      </figure>

      <h3>iOS</h3>
      <ol>
        <li>
          用 Safari 打开{' '}
          <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer">
            Strudel REPL
          </a>
          。
        </li>
        <li>点击分享图标，选择「添加到主屏幕」。</li>
        <li>现在你应该会有一个 Strudel 应用图标，点击可全屏打开 REPL。</li>
      </ol>

      <h3>Android</h3>
      <ol>
        <li>
          打开{' '}
          <a href="https://strudel.cc/" target="_blank" rel="noopener noreferrer">
            Strudel REPL
          </a>
          。
        </li>
        <li>点击页面底部的安装按钮。</li>
      </ol>

    </>
  );
}

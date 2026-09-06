# themes/

oddeNova 的主题曲，按发布版本归档。

一个版本一个目录（`beta-1.0/`、`beta-1.1/`、…），目录里是这一版主题曲的
Strudel 脚本。已发布版本的目录是历史，不再改动；改主题曲就开一个新版本目录。

每个版本目录里有两份脚本，代码逐字相同，只有注释的语言不同：

| 文件                   | 用途                              |
| ---------------------- | --------------------------------- |
| `theme.zh.strudel.js`  | 中文注释版                        |
| `theme.en.strudel.js`  | 英文注释版                        |

应用按浏览器语言（`navigator.language`，见 `src/lib/i18n.ts` 的 `zh`）选其中
一份。两份文件由 `src/lib/theme-song.ts` 以 `?raw` 直接引入，**这里就是唯一的
副本** —— 不要把脚本再抄进 `src/` 里，否则两处会各改各的。

`src/lib/__tests__/theme-song.test.ts` 会核对两份文件去掉注释后完全一致，改
其中一份而忘了另一份会让测试失败。

当前上线的版本由 `src/lib/theme-song.ts` 的 `THEME_SONG_VERSION` 指定。

`music/` 下的文件是写作过程中的草稿，不参与构建。

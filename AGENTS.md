@CLAUDE.md

## Prompt version comments

`src/prompts/versions/v*.ts` 的文件头注释只保留该版本自身的变更说明，简要概括最终改动。
创建新版本时替换复制来的说明，不保留或累加旧版本的注释；同一版本迭代时更新现有摘要，不追加过程日志。
历史变更通过对应版本文件和 Git 历史追溯。

## Local Superpowers artifacts

Do not add or commit `docs/superpowers/plans/` or `docs/superpowers/specs/`.
These are local planning artifacts and must remain outside Git tracking.

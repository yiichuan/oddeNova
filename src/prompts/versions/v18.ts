/**
 * @version v18
 * @date 2026-06-17
 * @description 更新 oddeNova 主人设为 myth / voice / relationship / styleSignals，
 * 并在创作模式中显式放回纯聊天边界。
 */
import {
  AGENT_SYSTEM_PROMPT_EN as V17_AGENT_SYSTEM_PROMPT_EN,
  AGENT_SYSTEM_PROMPT_OPENAI as V17_AGENT_SYSTEM_PROMPT_OPENAI,
} from './v17';

const CREATE_MODE_INTRO_ZH =
  '你现在处于创作模式：用户用自然语言描述音乐，你通过调用工具来组装 Strudel JavaScript 代码，最后提交代码以供播放。';

const CREATE_MODE_BOUNDARY_ZH = [
  CREATE_MODE_INTRO_ZH,
  '',
  '## 创作模式边界',
  '你当前已经处于创作模式：可以生成 Strudel 代码、调用工具并提交播放。若历史对话来自纯聊天阶段，只把它当作情绪、画面、关系和故事的上下文；不要声称自己已经在聊天阶段开始作曲，也不要把纯聊天回复改写成代码。',
].join('\n');

const CREATE_MODE_INTRO_EN =
  'You are now in create mode: users describe music in natural language; you assemble Strudel JavaScript code by calling tools, then submit it for playback.';

const CREATE_MODE_BOUNDARY_EN = [
  CREATE_MODE_INTRO_EN,
  '',
  '## Create-mode Boundary',
  'You are currently in create mode: you may generate Strudel code, call tools, and commit for playback. If conversation history comes from pure chat, treat it only as context for feelings, images, relationships, and story; do not claim composition had already started during pure chat, and do not rewrite pure-chat replies as code.',
].join('\n');

export const AGENT_SYSTEM_PROMPT_OPENAI = V17_AGENT_SYSTEM_PROMPT_OPENAI.replace(
  CREATE_MODE_INTRO_ZH,
  CREATE_MODE_BOUNDARY_ZH
);

export const AGENT_SYSTEM_PROMPT_EN = V17_AGENT_SYSTEM_PROMPT_EN.replace(
  CREATE_MODE_INTRO_EN,
  CREATE_MODE_BOUNDARY_EN
);

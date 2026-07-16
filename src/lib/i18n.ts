export const zh: boolean = (() => {
  try { return navigator.language.startsWith('zh'); } catch { return false; }
})();

const S: Record<string, readonly [string, string]> = {
  // Common
  cancel:       ['取消', 'Cancel'],
  close:        ['关闭', 'Close'],
  save:         ['保存', 'Save'],
  send:         ['发送', 'Send'],
  stop:         ['停止', 'Stop'],
  delete:       ['删除', 'Delete'],
  edit:         ['编辑', 'Edit'],
  copy:         ['复制', 'Copy'],
  retry:        ['重试', 'Retry'],
  loading:      ['加载中…', 'Loading…'],
  play:         ['播放', 'Play'],

  // App status
  engineStarting:   ['音频引擎启动中，请稍后再试', 'Audio engine starting, please try again later'],
  preparingToPlay:  ['准备播放…', 'Preparing to play…'],
  interrupted:      ['已中断', 'Interrupted'],
  agentNoCode:      ['agent 没有产出代码', 'Agent produced no code'],
  requestFailed:    ['请求失败', 'Request failed'],
  loadingShare:     ['正在载入分享内容…', 'Loading shared content…'],
  shareLoadFailed:  ['分享内容加载失败', 'Failed to load shared content'],
  importSucceeded:  ['导入成功', 'Imported successfully'],
  importUpdated:    ['已更新', 'Updated'],
  importBranched:   ['当前版本已保留，新导入的更新已创建为新分支', 'The current version was preserved and the imported update was created as a new branch'],
  importUnsupported:['导入链接版本不受支持，请更新 oddeNova 或 oddenova-strudel skill', 'This import link version is unsupported. Update oddeNova or the oddenova-strudel skill'],
  importInvalid:    ['导入链接无效', 'Invalid import link'],
  importMemoryWarning: ['当前无法持久保存，刷新后可能丢失', 'Persistent storage is unavailable; this import may be lost after refresh'],
  collapseCode:     ['收起代码 ↓', 'Collapse ↓'],
  viewCode:         ['查看代码 ↑', 'View code ↑'],
  newSession:       ['新建会话', 'New session'],
  sessionHistory:   ['会话历史', 'Session history'],
  newSessionTitle:  ['新会话', 'New session'],
  branchSuffix:     ['（分支）', ' (branch)'],

  // Tool call labels (formatToolCall)
  arrangeMusic:   ['编排段落…', 'Arranging…'],
  readScore:      ['读取当前曲谱', 'Read current score'],
  validateCode:   ['校验代码', 'Validate code'],
  commitAndPlay:  ['提交并播放', 'Commit and play'],

  // TopActionBar
  settings:        ['设置', 'Settings'],
  share:           ['分享', 'Share'],
  sharing:         ['分享中…', 'Sharing…'],
  shareFailed:     ['分享失败', 'Share failed'],
  shareFailedRetry:['分享失败，请重试', 'Share failed, please retry'],
  linkCopied:      ['链接已复制', 'Link copied'],
  export:          ['导出', 'Export'],
  exportWav:       ['导出 WAV', 'Export WAV'],
  learn:           ['学习', 'Learn'],
  openMenu:        ['打开菜单', 'Open menu'],
  menu:            ['菜单', 'Menu'],
  rendering:       ['渲染中…', 'Rendering…'],
  exportFailed:    ['导出失败', 'Export failed'],
  filename:        ['文件名', 'Filename'],
  generateSongTitle:       ['自动生成曲名', 'Generate song title'],
  generatingSongTitle:     ['曲名生成中…', 'Generating song title…'],
  generateSongTitleFailed: ['曲名生成失败，请手动输入', 'Could not generate song title. You can enter one manually.'],
  startCycle:      ['起始 cycle', 'Start cycle'],
  endCycle:        ['结束 cycle', 'End cycle'],
  estDuration:     ['预计时长', 'Est. duration'],
  cycleError:      ['起始 cycle 必须小于结束 cycle', 'Start cycle must be less than end cycle'],
  sampleRate:      ['采样率', 'Sample rate'],
  setUpLater:      ['稍后设置', 'Set up later'],

  // ChatInput
  inputPlaceholder:    ['输入文字描述音乐...', 'Describe your music...'],
  tabToFill:           ['按 Tab 填入', 'Tab to use'],
  notInitialized:      ['未初始化', 'Not initialized'],
  restartEngine:       ['重启引擎', 'Restart engine'],
  engineInitializing:  ['初始化中...', 'Initializing...'],
  engineFailed:        ['初始化失败', 'Engine init failed'],
  engineFailedRetry:   ['初始化失败，请点击重试按钮', 'Engine init failed — click retry'],

  // ApiKeyModal
  setApiKey:    ['设置 API Key', 'Set API Key'],
  apiKeyDesc:   ['选择服务商并填入对应的 API Key，即可开始使用。Key 仅保存在本地浏览器中。', 'Select a provider and enter the API Key to get started. Keys are stored locally in your browser.'],
  currentUsing:  ['当前使用', 'Currently using'],
  provider:      ['服务商', 'Provider'],
  model:         ['模型', 'Model'],
  officialLabel: ['官方体验', 'Official Trial'],
  qrAlt:        ['扫码加入 oddeNova 用户群，免费领取体验 API Key', 'Scan to join the oddeNova community and get a free API Key'],
  scanToJoin:   ['扫码入群', 'Scan to join'],
  freeApiKey:   ['免费领体验 API Key', 'Get a free trial API Key'],

  // ConversationView
  startCreating: ['说点什么开始创作', 'Say something to start creating'],
  strudelCode:   ['Strudel 代码', 'Strudel code'],
  lines:         ['行', 'lines'],
  branchFrom:    ['从此处创建分支对话', 'Branch conversation from here'],
  thinking:      ['思考中...', 'Thinking...'],
  reasoningTitle:['构思', 'Ideation'],
  collapseReasoning: ['收起推理过程', 'Collapse reasoning'],
  expandReasoning:   ['展开推理过程', 'Expand reasoning'],
  actionsTitle:  ['思考过程', 'Process'],
  rollbackHere:  ['回滚到此处', 'Roll back to here'],
  copyCode:      ['复制代码', 'Copy code'],

  // HistoryPanel
  history:    ['历史对话', 'History'],
  noSessions: ['暂无会话', 'No sessions'],

  // Sidebar
  replaySession: ['回放会话', 'Replay session'],
  viewHistory:   ['查看历史', 'View history'],
  playSong:      ['来首适合演示场合的曲子', 'A song for a presentation'],
  moodTooltip:   ['根据你最近的活动感知心情生成音乐', 'Generate music based on your recent mood and activity'],
  moodGenerate:  ['根据心情生成音乐', 'Mood-based music'],

  // VoiceButton
  voiceNotSupported: ['浏览器不支持语音识别，请使用 Chrome', 'Speech recognition not supported, please use Chrome'],
  releaseToStop:     ['松开停止', 'Release to stop'],
  holdToSpeak:       ['按住说话', 'Hold to speak'],

  // ContextWindowIndicator
  contextWindow: ['上下文窗口', 'Context window'],
  tokens:        ['个令牌', 'tokens'],

  // strudel / engine
  clickToResume:   ['点击播放继续', 'Click to resume'],
  emptyCode:       ['代码为空', 'Code is empty'],
  copyShareLink:   ['复制分享链接', 'Copy share link'],
};

export function t(key: string): string {
  const entry = S[key];
  if (!entry) return key;
  return zh ? entry[0] : entry[1];
}

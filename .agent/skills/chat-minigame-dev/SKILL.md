---
name: chat-minigame-dev
description: >-
  Standardized methodology and architecture guide for developing in-chat mini-games
  (card games, board games, dice, turn-based duels) in ST-TwoMoreThings. Use this skill
  whenever designing, implementing, prompting, or debugging in-chat interactive mini-games
  with AI roleplay characters.
---

# In-Chat Mini-Game Development Skill (ST-TwoMoreThings)

本指南总结了在虚拟手机短信插件（ST-TwoMoreThings）中开发与 AI 角色对弈的小游戏（以抽鬼牌 Old Maid 为标准范例）的完整工程规范、提示词设计哲学与避坑准则。

---

## 核心设计哲学 (Core Philosophies)

### 1. 玩家主体性与“零代打”原则（Zero Ghostwriting）
* **严禁程序代发玩家对话**：绝不要在玩家点击“接受”、“更换赌注”、“拒绝”、“催促”等按钮时，用代码拼凑一段玩家台词并以玩家身份发送到对话流中。
  * *原因*：用户拥有独立的性格、语气、OC 设定或语种习惯，生硬代发会严重出戏并剥夺玩家自由度。
* **以「系统事件消息」记录交互**：所有的按钮操作（如接受、加码、结算）均生成轻量的灰色系统动作消息（`role: 'system', type: 'game-action'`），客观记录对弈事实。
* **输入框始终留给玩家**：短信输入框完全由玩家自主掌控，玩家想在何时说何话、表达何种情绪，全凭自主输入。

### 2. 仿真实私聊与“纯对话”规范（Pure Dialogue）
* **严禁括号动作与小说式旁白**：在短信界面中，严禁在角色对话正文中出现 `（把手中的牌放在桌上）`、`（眼神闪躲）` 等小说旁白。
* **情绪线上化表达**：引导角色通过线上打字习惯（短句、标点、emoji、语气词、错字秒撤回等）展现对弈中的心虚、得意或挑衅。
* **边玩边聊，拒绝纯对弈机器**：不要搞“打牌中禁止闲聊”的设定。游戏是角色互动的催化剂，角色应一边打牌一边聊日常、互相吐槽。

### 3. 数据与提示词程序化绑定（Programmatic Truth）
* 所有的博弈参数（如赌注 wager、轮次 round、胜负 winner）必须在程序数据模型中真实存在，绝不依靠纯口头约定。
* 双方（玩家与 AI）均可发起、协商、修改参数，界面与上下文双向同步。

---

## 架构五层模型 (Five-Layer Architecture)

```
┌────────────────────────────────────────────────────────┐
│ 1. 独立规则引擎 (src/games/<game>.js)                   │  纯函数状态机：发牌、行棋、判定、胜负
├────────────────────────────────────────────────────────┤
│ 2. 数据存储与消息模型 (src/store.js & src/content.js)   │  type: 'game' 卡片 + type: 'game-action' 系统流
├────────────────────────────────────────────────────────┤
│ 3. 浮动对弈抽屉 (src/ui/game-board.js & style.css)     │  独立弹层：牌桌/棋盘交互、参数修改、防遮挡输入框
├────────────────────────────────────────────────────────┤
│ 4. 提示词与时序治理 (src/prompts.js & src/content.js)   │  独立宏插槽、结构化动作契约、解决陈旧用户发言陷阱
├────────────────────────────────────────────────────────┤
│ 5. 消息调度与全自动交互 (src/messages.js & src/ui.js)   │  玩家行动后自动唤醒 AI 出牌与回话，无缝对决
└────────────────────────────────────────────────────────┘
```

---

## 阶段开发标准流程 (Step-by-Step Runbook)

### 第一阶段：设计数据模型与纯规则引擎
在 `src/games/<game-id>.js` 编写确定性逻辑：
1. **定义状态结构**：
   ```javascript
   {
     kind: 'game_name',
     gameId: '...',
     status: 'invited' | 'countered' | 'playing' | 'finished' | 'rejected',
     wager: '赌注或规则参数',
     turn: 'user' | 'ai',
     round: 1,
     winner: '',
     loser: '',
     lastAction: { type: '...', actor: '...', description: '...' },
     history: [],
     state: { ...游戏专属手牌/棋盘状态... }
   }
   ```
2. **编写纯函数**：
   - `create<Game>Invitation({ sender, wager, ... })`
   - `accept<Game>(gameState, { ... })`
   - `userMove(gameState, actionParams)`
   - `aiMove(gameState, actionParams)`
   - 保证所有状态更新通过深度克隆返回新对象，无外部副作用。

### 第二阶段：提示词契约与宏定义
在 `src/prompts.js` 和 `src/preset-engine.js` 注册独立宏（如 `{{old_maid_prompt}}`）：
1. **规则说明**：简明扼要说明规则与输赢判定。
2. **主动发起与响应规范**：角色想玩时发卡片 `{"type":"game","game":{"kind":"...","action":"invite","wager":"..."}}`；收到邀请时在正文回应并在顶层输出 `{"gameAction":"accept"}` 或 `{"gameAction":"counter","wager":"..."}`。
3. **回合动作指令契约（Action Contract）**：
   ```json
   {
     "gameAction": {
       "action": "move_type",
       "moveIndex": 0,
       "wager": "可选加码或改注",
       "notice": "【角色名】动作生动描写【玩家名】……"
     }
   }
   ```
4. **纯对话约束**：明确要求 `messages[].text` 不得带括号动作描写，由 `notice` 承担系统播报。

### 第三阶段：时序治理（防止陈旧输入陷阱）
在 `src/content.js` 的 `extractLatestUserInput` 中必须治理轮流对弈时序：
* **核心陷阱**：玩家开局说了“好，开始打牌”，后续 10 轮都是摸牌与 AI 回话。若只倒序查找最后一条 user 消息，AI 每轮都会收到 `[用户最新发言：好，开始打牌]`。
* **治理逻辑**：
  ```javascript
  if (lastAssistantIdx !== -1 && lastAssistantIdx > lastUserIdx) {
    if (activeGame || hasRecentGameAction) {
      return '[小游戏对弈推进] 玩家已完成操作，当前轮到你推进对局并发表日常台词。';
    }
    return ''; // 普通对话返回空，预设引擎会自动剥离用户发言插槽
  }
  ```

### 第四阶段：交互界面与卡片
1. **邀约卡（`src/ui/cards.js`）**：
   - 包含状态药丸（等待回应 / 协商中 / 进行中 / 已结算）。
   - 动作按钮：接受、更换赌注、拒绝、进入对弈桌。
2. **抽屉面板（`src/ui/game-board.js`）**：
   - 放置在屏幕上方或抽屉内，绝对不能遮挡底部的 `#sms-draft` 聊天输入框。
   - 顶栏显示动态轮次与可点击修改的参数药丸（`data-action="edit-game-wager"`）。
   - 终局结算提供清晰的胜负横幅与系统提醒按钮。

---

## UI 与交互规范 (UI & Interaction Standards)

在手机短信聊天这一受限视口（Viewport）内开发对弈交互，必须严格遵循以下 UI 准则：

### 1. 防遮挡布局原则 (Anti-Occlusion Layout)
* **严禁遮挡底部输入框**：
  * 对弈抽屉（Game Board Drawer）必须定位在对话视图中上部，其高度通过 `max-height` 严格限制，内部内容独立滚动（`overscroll-behavior: contain`）。
  * 无论是对弈中还是结算状态，底部的 `#sms-draft` 聊天输入框、发送按钮与附件图标必须 100% 暴露并随时可点击打字。
* **双态折叠交互（Drawer & Floating Pill）**：
  * 抽屉顶栏必须具备折叠按钮（`fold-game-board`）。
  * 折叠后，主屏转为优雅的顶部悬浮小胶囊（`game-floating-pill`），显示对局状态与轮次，点击后即刻重新展开牌桌；悬浮药丸必须吸附于安全区域，不遮挡顶部联系人导航栏与底部打字区。

### 2. 图标系统与极简视觉 (Unified Icons & Clean Aesthetics)
* **严禁滥用彩色系统 Emoji 作为图标**：
  * 不要在系统通知或功能控件中直接插入 `🃏`、`🎲` 等风格割裂的系统彩色 Emoji。
  * 全面使用项目内建的统一单色线性 SVG 图标系统（通过 `icon('gamepad')`、`icon('close')`、`icon('arrow-down')` 渲染）。
* **纯净系统药丸**：
  * 系统的动作通知（`game-action-notice`）采用极简圆角灰底药丸设计，文字直接交代动作，不堆砌突兀的大卡牌图案或装饰。

### 3. 系统消息的低侵入交互 (Subtle Actions & Message Deletion)
* **保留删除功能但杜绝突兀感**：
  * 系统通知药丸必须支持删除（`system-notice-delete`），方便用户随时清理对弈流水记录。
  * 删除按钮（`×`）默认透明度极低或隐藏，仅在鼠标悬停（hover）或移动端触控时平滑淡入，绝不使用破坏视觉排版的大红叉或显眼按钮。
* **杜绝冗余操作键**：
  * 系统消息无需突兀的“复制”或繁琐菜单，保持会话流极度轻量干净。

### 4. 博弈参数可交互性与触控体验 (Interactive Pills & Feedback)
* **动态参数可点击修改**：
  * 赌注等参数在顶栏与结算横幅中展示为带编辑提示的交互按钮（`button.game-wager-pill.is-clickable`，附带 `✎` 标记）。
  * 点击时呼出原生风格的设置弹窗（`dialog.custom`），支持输入、回车提交与 Esc 关闭，拒绝粗暴的浏览器原生 `window.prompt()`。
* **动效与触控优化**：
  * 卡牌/棋子排列（如 `cards-fan`）使用负边距重叠，支持 hover/focus 悬浮上移（`translateY(-10px) scale(1.06)`）与选中投影。
  * 移动端全面配置 `user-select: none`，消除拖拽误触；手牌滚动区域配置 `scrollbar-width: none` 隐藏浏览器原生粗滚动条。

### 5. 语义化胜负色彩 (Semantic Color Codes)
* **轮次指示点**：玩家回合使用主题激活色（`var(--pp-active)`），AI 回合使用静默灰（`var(--pp-muted)`）。
* **终局横幅**：玩家胜利采用浅绿底绿字（`#e6f4ea` / `#137333`），玩家落败采用浅红底红字（`#fce8e6` / `#c5221f`），胜负状态一目了然。

---

### 第五阶段：服务层自动化（`src/messages.js` & `src/ui.js`）
1. **自动推进回合**：
   - 玩家在棋盘/手牌上点击操作后，更新 store，立即调用 `service.continueChat(id)`。
   - 在 `continueChat` 中检测 `activeGameMsg.turn === 'ai'`，解析模型的 `gameAction`，自动调用 `aiMove` 推进状态并追加系统公告。
2. **双向改注同步**：
   - 检测 `rawGameAction.wager`，一旦变动立即同步回 `game.wager` 并派发系统消息。

---

## 避坑检查清单 (Sanity Checklist)

- [ ] **是否清除了玩家代发言？** 检查全局代码，确保没有 `service.send(id, '我接受...')` 或任何以玩家名义发送的硬编码台词。
- [ ] **是否去除了括号旁白？** 检查提示词与系统文本，确保聊天气泡中全为纯对话。
- [ ] **多轮对弈中 AI 是否陷入复读？** 测试连续操作 5 轮，确认给 AI 的 `{{latest_user_input}}` 不包含开局时的陈旧用户文本。
- [ ] **AI 出牌失败是否有兜底？** 当 AI 未返回合法 `moveIndex` 或 `notice` 时，引擎应具备随机合规出牌与默认系统公告的降级保护。
- [ ] **状态是否防回滚？** 在 UI 执行异步 API 调用与 `render()` 时，确保内存变量 `ui.activeGame` 不会被过期的 store 快照覆盖。
- [ ] **对弈面板是否遮挡输入框？** 验证抽屉展开与折叠两种状态下，底部 `#sms-draft` 输入框与发送区始终完全可见、可操作。
- [ ] **图标与视觉风格是否统一？** 检查界面与系统公告中没有割裂的彩色系统 Emoji，全量采用单色线性 SVG 图标。
- [ ] **系统消息删除按钮是否低侵入？** 确认系统通知药丸既保留了删除功能，又未引入突兀破坏排版的大按钮（仅 hover/长按时浮现）。
- [ ] **博弈参数是否支持局内直接交互？** 确认牌桌顶栏的赌注等参数可点击唤起原生 `dialog.custom` 弹窗进行双向动态修改。

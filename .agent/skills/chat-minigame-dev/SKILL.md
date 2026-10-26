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

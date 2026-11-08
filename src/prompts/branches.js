// 情境状态分支指令：收编原代码各处硬编码的动态推进与条件判定指令

export const GAME_BRANCHES = {
  // 抽鬼牌：轮到角色摸牌
  oldMaidAiTurn: `[小游戏对弈推进]
【回合方判定】：当前明确轮到【角色】抽牌！
【角色行动指令】：角色必须在 JSON 顶层返回结构化动作指令（gameAction），从<user>手牌中抽牌，并在 messages 中发表对弈台词。`,

  // 抽鬼牌：等待用户摸牌
  oldMaidUserTurn: `[小游戏对弈推进]
【回合方判定】：当前处于【<user>】的摸牌回合，等待【<user>】抽牌！
【角色行动指令】：当前不是角色的回合，角色严禁在顶层返回 gameAction 动作指令。角色仅在 messages 中以纯私聊台词做出反应。`,

  // 恶魔轮盘：轮到角色行动
  buckshotAiTurn: `【行动指令】：当前明确轮到【角色】行动！角色必须在 JSON 顶层返回结构化动作指令（gameAction），执行扣动扳机（朝自身开枪或朝<user>开枪）或使用道具，并在 messages 中输出纯私聊台词。严禁不发 gameAction。`,

  // 恶魔轮盘：等待用户行动
  buckshotUserTurn: `【行动指令】：当前处于【<user>】的回合，等待【<user>】开火或使用道具！当前不是角色回合，角色严禁在顶层返回 gameAction 动作指令（严禁替<user>开枪或代打），仅在 messages 中以纯私聊台词做出反应。`,

  // 恶魔轮盘：客观战局档案标题
  buckshotBattleHeader: `【恶魔轮盘 · 战局客观档案（请严格依据实时数据推进，不同轮次严禁混淆）】`,
};

export const TOOL_BRANCHES = {
  // 百宝书地图校准铁律限制
  mapCalibrateRules: `【铁律限制】严禁添加列表中不存在的任何新地点，严禁修改已有地点名称。只针对给出的 scenes 列表，审阅世界观补齐 role（area分区/site建筑/interior室内）、quadrant（east/west/south/north/center/inner/outer）、facilities 设施标签与 relations 拓扑关系。`,

  // 地图空间构想层级约束
  mapOrganizeRules: `标注“柏宝书既定”的地点来自剧情记录，名称与层级不可更改、不可重复创建；新增地点必须通过 parentName 挂到已有地点（或本次新增的地点）之下，parentName 须与已有名称完全一致；不要输出 currentLocation，当前位置由剧情自动决定。`,

  // 生图服装准确名称要求
  imageOutfitRule: `如照片需要库中的服装，可附outfits数组，只填outfits给定的准确名称；没有对应就省略。`,

  // 生图路人NPC纯风景/无角色约束
  imageSceneryOnly: `此图来自动态NPC，只允许风景、静物、动植物或环境画面；若画面涉及动物、路人或怪物，请直接在prompt中用英文标签表现，characters必须为空数组[]，不计入角色列表。`,
};

export const SOCIAL_BRANCHES = {
  // 动态与评论中排除私人待办提取
  socialTodoSuppression: `\n动态和评论不提取私人待办；只有proactiveMessages里的短信可提建议，每项内放自己的todoSuggestions，索引对应该项messages。对应authors里的todoPeople/todos仅供该作者私信使用；storyProgress仅供核对后续进展，不公开，也不代表其他作者知道。`,
};

export const ORIGIN_BRANCHES = {
  // 系统旁观推演模式请求词
  observerPromptRequest: (hostName, sysName) => `请推演【${hostName}】与【${sysName || '系统'}】的一轮互动对话，输出 JSON：`,
};

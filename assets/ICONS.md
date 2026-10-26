# 界面图标

除下文注明的原指纹图标外，Logo 和界面功能图标选自 [Yesicon 的 Solar 图标集](https://yesicon.app/solar)，作者为 [480 Design](https://www.figma.com/community/file/1166831539721848736)，依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。

默认系列为 **Solar Broken**；锁屏指纹按用户要求保留原图。原指纹的确切图标库来源尚未确认，不署为 Solar。已点赞状态使用同一 Solar 图标集配套的 `heart-bold`，保留红色实心反馈；它仅用于状态切换。表情、贴纸、头像、壁纸及锁屏艺术背景不属于这份图标清单。

SVG 随插件本地提供，原始几何不改绘。内联图标位于 `src/ui/shared.js`；短信、论坛图标位于本目录的 SVG 文件，以现有 CSS 掩膜着色。尺寸由使用位置的样式决定，颜色沿用 `currentColor`。

Yesicon 标明图标数据来自 Iconify；下列 Solar 条目的 SVG 使用其 [Solar 上游数据](https://github.com/iconify/icon-sets/blob/master/json/solar.json)。本地只调整 SVG 外层尺寸、无障碍标记和打包方式，SVG body 与上游条目一致。

| 本地名称 | Yesicon 条目 | 用途说明 |
| --- | --- | --- |
| `social` | [`solar:camera-square-broken`](https://yesicon.app/solar/camera-square-broken) |  |
| `heart` | [`solar:heart-broken`](https://yesicon.app/solar/heart-broken) |  |
| `heart-active` | [`solar:heart-bold`](https://yesicon.app/solar/heart-bold) | 点赞后的红色实心状态；其余心形使用 Broken |
| `repost` | [`solar:repeat-broken`](https://yesicon.app/solar/repeat-broken) |  |
| `comment` | [`solar:chat-round-broken`](https://yesicon.app/solar/chat-round-broken) |  |
| `fingerprint` | 原有指纹 SVG，确切库来源未确认 | 用户指定保留；锁屏的进入桌面按钮 |
| `signal` | [`solar:station-minimalistic-broken`](https://yesicon.app/solar/station-minimalistic-broken) | 顶栏装饰通信信号 |
| `wifi` | [`solar:wi-fi-broken`](https://yesicon.app/solar/wi-fi-broken) |  |
| `battery` | [`solar:battery-full-broken`](https://yesicon.app/solar/battery-full-broken) |  |
| `calendar` | [`solar:calendar-date-broken`](https://yesicon.app/solar/calendar-date-broken) |  |
| `todos` | [`solar:checklist-minimalistic-broken`](https://yesicon.app/solar/checklist-minimalistic-broken) |  |
| `smile` | [`solar:smile-circle-broken`](https://yesicon.app/solar/smile-circle-broken) |  |
| `location` | [`solar:map-point-broken`](https://yesicon.app/solar/map-point-broken) |  |
| `transfer` | [`solar:transfer-horizontal-broken`](https://yesicon.app/solar/transfer-horizontal-broken) |  |
| `gamepad` | [`solar:gamepad-broken`](https://yesicon.app/solar/gamepad-broken) | 小游戏面板与对局 |
| `image` | [`solar:gallery-broken`](https://yesicon.app/solar/gallery-broken) |  |
| `sun` | [`solar:sun-broken`](https://yesicon.app/solar/sun-broken) |  |
| `phone` | [`solar:smartphone-broken`](https://yesicon.app/solar/smartphone-broken) | 扩展菜单与悬浮球 |
| `more` | [`solar:menu-dots-broken`](https://yesicon.app/solar/menu-dots-broken) |  |
| `settings` | [`solar:settings-broken`](https://yesicon.app/solar/settings-broken) |  |
| `arrow` | [`solar:alt-arrow-left-broken`](https://yesicon.app/solar/alt-arrow-left-broken) |  |
| `back` | [`solar:undo-left-broken`](https://yesicon.app/solar/undo-left-broken) |  |
| `message-reply` | [`solar:chat-round-replay-broken`](https://yesicon.app/solar/chat-round-replay-broken) |  |
| `message-delete` | [`solar:chat-round-close-broken`](https://yesicon.app/solar/chat-round-close-broken) |  |
| `next` | [`solar:alt-arrow-right-broken`](https://yesicon.app/solar/alt-arrow-right-broken) |  |
| `send` | [`solar:plain-broken`](https://yesicon.app/solar/plain-broken) |  |
| `refresh` | [`solar:restart-broken`](https://yesicon.app/solar/restart-broken) |  |
| `plus` | [`solar:add-broken`](https://yesicon.app/solar/add-broken) |  |
| `close` | [`solar:close-broken`](https://yesicon.app/solar/close-broken) |  |
| `phone-close` | [`solar:close-circle-broken`](https://yesicon.app/solar/close-circle-broken) |  |
| `home` | [`solar:home-broken`](https://yesicon.app/solar/home-broken) |  |
| `messages.svg` | [`solar:chat-square-broken`](https://yesicon.app/solar/chat-square-broken) |  |
| `forum.svg` | [`solar:dialog-broken`](https://yesicon.app/solar/dialog-broken) |  |

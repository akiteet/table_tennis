# Snooker Game

一个基于 HTML5 Canvas 的 2D 斯诺克游戏，包含本地双人对战、规则说明页和 WebSocket 联机版本。

## 在线试玩

本地游戏页面：

[点击开始游戏](https://akiteet.github.io/snooker-game/game_2d.html)

规则说明页面：

[查看规则说明](https://akiteet.github.io/snooker-game/game_2d_rules.html)

联机游戏页面：

[进入联机对战](https://akiteet.github.io/snooker-game/game_2d_online.html)

> 说明：GitHub Pages 只能托管静态网页，不能运行 WebSocket 服务端。联机版本需要另外运行或部署 `server.js`。

## 怎么联机

### 推荐：路人/朋友使用公网服务器

如果只是想让别人直接玩，推荐使用已经部署好的 Render 等公网服务器。这样不会暴露你的本地 IP，也不需要别人安装任何东西。

方式一：直接打开公网联机页面：

```text
https://你的-render-服务地址.onrender.com/game_2d_online.html
```

方式二：打开 GitHub Pages 联机页面：

[https://akiteet.github.io/snooker-game/game_2d_online.html](https://akiteet.github.io/snooker-game/game_2d_online.html)

然后在“服务器地址”里填写公网 WebSocket 地址：

```text
wss://你的-render-服务地址.onrender.com
```

两个人填写同一个房间号，然后点击“连接房间”。第一个进入的是玩家 1，第二个进入的是玩家 2，后续进入者为观战。

> README 中不要填写自己的账号、Token 或本机内网 IP。公网服务器地址可以公开，但任何知道地址的人都可能连接这个服务。

> 如果服务器刚启动较慢，等待几十秒后刷新页面再连接。

### 开发/自测：自己本地运行服务器

本地运行联机服务器：

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000/game_2d_online.html
```

同一台电脑测试时，服务器地址通常是：

```text
ws://localhost:3000
```

如果让同一局域网的朋友连接，需要让朋友打开你的局域网地址，例如：

```text
http://<你的局域网IP>:3000/game_2d_online.html
```

页面里的服务器地址填写：

```text
ws://<你的局域网IP>:3000
```

其中 `<你的局域网IP>` 替换为运行服务器那台电脑的实际 IPv4 地址。这个地址只适合同一局域网测试，不建议写进公开 README。

## 联机注意事项

- GitHub Pages 只能托管网页，不能运行联机服务器。
- 公网联机需要单独部署 `server.js`，并在页面中填写对应的 `wss://...` 地址。
- 给路人使用时，推荐使用公网服务器地址，不要让别人连接你的本机局域网地址。
- 房间号不是密码，不要使用包含隐私信息的房间号。
- 如果公开自己的服务器地址，其他人也可以尝试连接这个联机服务。
- 当前联机模式适合朋友娱乐对战，没有账号系统和防作弊机制。
- 免费服务器可能会休眠，第一次打开或连接时可能较慢。

## 联机机制

- 使用 Node.js + WebSocket。
- 服务端负责房间管理和状态转发。
- 当前回合玩家负责模拟击球物理和规则结算。
- 非当前回合玩家只接收球位、比分、阶段和提示同步。
- 支持房间号和邀请链接。

## 项目特点

- 双人本地对战
- WebSocket 房间联机模式
- HTML5 Canvas 球桌渲染
- 力度与方向控制
- 引导线辅助
- 红球、彩球、清彩阶段计分
- 自动犯规判罚
- 自由球规则
- 犯规后续选择与空杆还原重打
- 全场所有球停止后才允许下一次击球
- 独立规则说明页面

## 游戏规则覆盖

游戏根据斯诺克常见规则实现了核心流程：

- 红球未清台前遵循“一红一彩”
- 红球入袋后必须指定目标彩球
- 彩球在红球阶段入袋后自动复位
- 红球清台后按黄、绿、棕、蓝、粉、黑顺序清彩
- 犯规按最低 4 分、活球分值、犯规涉及球最高分值取最高罚分
- 普通犯规后可自己击球，或要求犯规方从当前球位继续
- 判为犯规并空杆时，还可要求恢复犯规前球位重打
- 犯规后满足条件时自动判定自由球

## 文件说明

```text
game_2d.html              本地双人游戏主页面
game_2d_online.html       WebSocket 联机游戏页面
game_2d_rules.html        规则说明页面
server.js                 联机服务器
package.json              Node.js 启动与依赖配置
.gitattributes            Git 文本换行配置
```

## 部署提示

如果想让别人通过公网联机，需要把 `server.js` 部署到支持 Node.js 和 WebSocket 的平台，例如 Render、Railway、Fly.io 或自己的云服务器。部署后，在联机页面的“服务器”输入框填写对应的 `wss://...` 地址。

## 说明

这是一个前端练习项目，主要用于实现 2D 球类碰撞、游戏状态机、斯诺克规则判定和基础联机同步。

如果你觉得这个项目有帮助，欢迎点一个 Star。

# Snooker Game

一个基于 HTML5 Canvas 的 2D 斯诺克游戏，包含本地双人对战、规则说明页和 WebSocket 联机版本。

## 在线试玩

本地游戏页面：

https://akiteet.github.io/snooker-game/game_2d.html

规则说明页面：

https://akiteet.github.io/snooker-game/game_2d_rules.html

> 说明：GitHub Pages 只能托管静态网页，不能运行 WebSocket 服务端。联机版本需要另外运行或部署 `server.js`。

## 联机版本

联机页面：

```text
game_2d_online.html
```

本地运行联机服务器：

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000/game_2d_online.html
```

两个玩家使用同一个服务器地址和房间号即可进入同一局。玩家 1 先进入，玩家 2 后进入，更多访问者为观战。

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
- 让杆与空杆还原重打
- 全场所有球停止后才允许下一次击球
- 独立规则说明页面

## 文件说明

```text
game_2d.html              本地双人游戏主页面
game_2d_online.html       WebSocket 联机游戏页面
game_2d_rules.html        规则说明页面
game_2d_优化说明.md       开发与优化记录
server.js                 联机服务器
package.json              Node.js 启动与依赖配置
.gitattributes            Git 文本换行配置
```

## 部署提示

如果想让别人通过公网联机，需要把 `server.js` 部署到支持 Node.js 和 WebSocket 的平台，例如 Render、Railway、Fly.io 或自己的云服务器。部署后，在联机页面的“服务器”输入框填写对应的 `wss://...` 地址。

如果你觉得这个项目有帮助，欢迎点一个 Star。

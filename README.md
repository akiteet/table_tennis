# Table Tennis Games

HTML5 Canvas 球类游戏项目合集，目前包含斯诺克和九球。

## 在线试玩

- [斯诺克本地对战](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d.html)
- [斯诺克联机对战](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d_online.html)
- [斯诺克规则说明](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d_rules.html)
- [九球本地对战](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d.html)
- [九球联机对战](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d_online.html)
- [九球规则说明](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d_rules.html)

## 目录

```text
table_tennis/
├── snooker/snooker-game/       斯诺克游戏
├── nine_ball/nine_ball-game/   九球游戏
├── _data/                      规则和参考资料
└── _start_simulation/          基础碰球模拟
```

两个联机版本均需要单独运行或部署各自目录中的 `server.js`。

## 使用 Render 联机

同一个 GitHub 仓库需要在 Render 中创建两个独立的 Web Service。两个服务都使用以下设置：

- Runtime：`Node`
- Build Command：`npm ci`
- Start Command：`npm start`
- Branch：`main`

目录分别设置为：

| 游戏 | Render Root Directory |
| --- | --- |
| 斯诺克 | `snooker/snooker-game` |
| 九球 | `nine_ball/nine_ball-game` |

九球部署步骤：

1. 在 Render Dashboard 选择 **New > Web Service**，连接 `akiteet/table_tennis` 仓库。
2. 将 **Root Directory** 填为 `nine_ball/nine_ball-game`。
3. 填写上面的构建、启动命令并创建服务。
4. 部署完成后，直接访问 `https://你的服务名.onrender.com/` 即可打开九球联机页面。
5. 两位玩家填写相同房间号。若从 GitHub Pages 打开九球联机页，服务器地址填写 `wss://你的服务名.onrender.com`。

斯诺克已有 Render 服务时，也要确认其 **Root Directory** 已改为
`snooker/snooker-game`，否则仓库升级为多项目结构后会找不到 `package.json`。

> 公网页面必须使用 `wss://`，不能填写 `ws://localhost:3000` 或局域网 IP。房间号只用于匹配玩家，不包含个人信息。

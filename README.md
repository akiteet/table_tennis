# Table Tennis Games

台球游戏合集：斯诺克、九球、中式八球、美式八球。每款都有本地 2D（Canvas）、本地 3D（three.js）、联机 2D、联机 3D 四个版本，2D 与 3D 玩家可进同一联机房间。

## 在线试玩

首页：[https://akiteet.github.io/table_tennis/](https://akiteet.github.io/table_tennis/)

| 游戏 | 本地 2D | 本地 3D | 联机 2D | 联机 3D | 规则 |
|---|---|---|---|---|---|
| 斯诺克 | [打开](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d.html) | [打开](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_3d.html) | [打开](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d_online.html) | [打开](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_3d_online.html) | [打开](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d_rules.html) |
| 九球 | [打开](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d.html) | [打开](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_3d.html) | [打开](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d_online.html) | [打开](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_3d_online.html) | [打开](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d_rules.html) |
| 中式八球 | [打开](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_2d.html) | [打开](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_3d.html) | [打开](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_2d_online.html) | [打开](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_3d_online.html) | [打开](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_2d_rules.html) |
| 美式八球 | [打开](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_2d.html) | [打开](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_3d.html) | [打开](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_2d_online.html) | [打开](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_3d_online.html) | [打开](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_2d_rules.html) |

联机版需要对应的 Render 服务在线（免费实例首次连接可能要等几十秒唤醒）。

## 目录

```text
table_tennis/
├── snooker/snooker-game/       斯诺克游戏
├── nine_ball/nine_ball-game/   九球游戏
├── chinese_eight_ball/chinese_eight_ball-game/ 中式八球游戏
├── american_eight_ball/american_eight_ball-game/ 美式八球游戏
├── _data/                      规则和参考资料
├── _vendor/                    离线依赖（three.js r169，供 3D 版使用）
└── _start_simulation/          基础碰球模拟
```

## 本地运行 3D 版

3D 版（`game_3d.html`）通过 ES Module 离线加载 `_vendor/` 里的 three.js，双击 HTML 无法运行，需要先启动本地静态服务器：仓库根目录运行 `start.bat`（或 `python -m http.server 8123` / `npx serve -l 8123 .`），然后访问 `http://localhost:8123/chinese_eight_ball/chinese_eight_ball-game/game_3d.html`。2D 版与联机版不受影响。

## Render 部署

仓库根目录提供 `render.yaml`，可在 Render Dashboard 通过 Blueprint 统一管理四个联机服务。建议 Blueprint Name 填 `table-tennis-games`。

- `snooker-ovzx`：斯诺克联机服务，默认地址 `wss://snooker-ovzx.onrender.com`
- `nine-ball`：九球联机服务，默认地址 `wss://nine-ball.onrender.com`
- `chinese-eight-ball`：中式八球联机服务，默认地址 `wss://chinese-eight-ball.onrender.com`
- `american-eight-ball`：美式八球联机服务，默认地址 `wss://american-eight-ball.onrender.com`

四个服务都使用对应子目录的 `npm ci` 构建和 `npm start` 启动。

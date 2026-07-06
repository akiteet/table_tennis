# Table Tennis Games

HTML5 Canvas 球类游戏项目合集，目前包含斯诺克、九球、中式八球和美式八球。

## 在线试玩

- [斯诺克本地对战](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d.html)
- [斯诺克联机对战](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d_online.html)
- [斯诺克规则说明](https://akiteet.github.io/table_tennis/snooker/snooker-game/game_2d_rules.html)
- [九球本地对战](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d.html)
- [九球联机对战](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d_online.html)
- [九球规则说明](https://akiteet.github.io/table_tennis/nine_ball/nine_ball-game/game_2d_rules.html)
- [中式八球本地对战](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_2d.html)
- [中式八球联机对战](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_2d_online.html)
- [中式八球规则说明](https://akiteet.github.io/table_tennis/chinese_eight_ball/chinese_eight_ball-game/game_2d_rules.html)
- [美式八球本地对战](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_2d.html)
- [美式八球联机对战](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_2d_online.html)
- [美式八球规则说明](https://akiteet.github.io/table_tennis/american_eight_ball/american_eight_ball-game/game_2d_rules.html)

## 目录

```text
table_tennis/
├── snooker/snooker-game/       斯诺克游戏
├── nine_ball/nine_ball-game/   九球游戏
├── chinese_eight_ball/chinese_eight_ball-game/ 中式八球游戏
├── american_eight_ball/american_eight_ball-game/ 美式八球游戏
├── _data/                      规则和参考资料
└── _start_simulation/          基础碰球模拟
```

## Render 部署

仓库根目录提供 `render.yaml`，可在 Render Dashboard 通过 Blueprint 统一管理四个联机服务。建议 Blueprint Name 填 `table-tennis-games`。

- `snooker-ovzx`：斯诺克联机服务，默认地址 `wss://snooker-ovzx.onrender.com`
- `nine-ball`：九球联机服务，默认地址 `wss://nine-ball.onrender.com`
- `chinese-eight-ball`：中式八球联机服务，默认地址 `wss://chinese-eight-ball.onrender.com`
- `american-eight-ball`：美式八球联机服务，默认地址 `wss://american-eight-ball.onrender.com`

四个服务都使用对应子目录的 `npm ci` 构建和 `npm start` 启动。

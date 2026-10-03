# 交接文档：中式八球 3D 模式袋口/库边问题（给下一个接手的 AI）

> **2026-10-03 更新**：袋口/库边已按标准台示意图 `_data/standard/chinese_eight.jpg` 重做并经用户确认，详见 `_build/README.md` 第十二轮。下文第三节第 2 条"绿呢内零黑色"与第四节的状态描述已过时（角袋洞按示意图有 1/4 伸进绿呢角）。

> 交接时间：2026-09-06。前一个 AI（ZCode）连续多轮修改未达到用户要求，且引入回归。请先完整读完本文档再动手。
> **用户会自己验证效果，不要自己跑浏览器验证游戏流程**（这是用户明确的禁令）。改动后只需保证语法正确、页面能初始化。

## 一、项目与文件

仓库：`E:\AAA_study\front_end\exercise\table_tennis`（纯静态，无构建工具）

| 文件 | 作用 |
|---|---|
| `chinese_eight_ball/chinese_eight_ball-game/game_2d.html` | 2D 原版（**逻辑层的唯一源**）。袋口视觉在其 `drawTable()`，nearHole 让位在其 `resolveCushionCollision()` |
| `chinese_eight_ball/chinese_eight_ball-game/game_3d.html` | 3D 版（**生成文件，不要手改**）。2717 行左右 |
| `_build/scene3d_fragment.js` | 3D 渲染层代码片段（Three.js 场景/相机/袋口视觉都在这里） |
| `_build/build_3d.py` | 手术脚本：从 game_2d.html 生成 game_3d.html。**锚点是正则动态定位**（`find_line()`），2D 源行数变化不会再错位 |
| `_build/README.md` | 历轮修改记录 |

**构建流程**：改 2D 源（逻辑/nearHole）或改 scene3d_fragment.js（3D 视觉）→ 在 `_build/` 运行 `py build_3d.py` → `node --check` 语法检查。改 2D 的 `drawTable`（纯 2D 视觉）不影响 3D，可直接手改 game_2d.html。

**运行**：必须本地静态服务器（`start.bat` 或 `py -m http.server 8123`）。ES module + importmap 不能 file:// 打开。

## 二、3D 架构要点（防踩坑）

- `<script type="module">` + importmap 指向 `_vendor/three@0.169.0/`。**module 顶层抛错 = 整页黑屏**（canvas 存在但全黑）。诊断方法：`evaluate` 里 fetch 页面源码、把 module 代码包 try/catch 重新注入，读 `window.__moduleError`。
- 页面在后台标签页时 **requestAnimationFrame 完全暂停**，游戏不跑、canvas 一帧都不画。初始化序列末尾有一行同步 `renderer.render(scene, camera)` 保证至少有首帧可抓。
- 逻辑层变量在 module 作用域内，外部不可见。调试钩子：`window.__game()` 返回状态快照（holes 只含 ballCount，不含全部球——需要时可扩展）。
- `preserveDrawingBuffer: true` 已开，`canvas.toDataURL()` 可随时抓帧（配合 rAF 双跳抓当前帧）。
- 历史 bug 教训：半径变量替换时漏改引用（`cornerR is not defined` → 黑屏）；初始化块插错位置撕裂 gameLoop（→ 黑屏）。**改完必须 node --check + 确认 `window.__game` 存在**。

## 三、用户需求的精确汇总（历轮反馈，一条都不能丢）

1. **3D 木框（rail）、库边（cushion）、绿呢必须完整**，不能被分段开口搞残。木框是 4 根完整 Box。
2. **袋口圆（黑色）必须始终在绿呢矩形之外**，绿呢内零黑色。当前 3D 用"黑色圆盘（r=HOLE_RADIUS，y=0.25）嵌在库边带缺口内"表达，绿呢是完整 Box——这个组合用户**未再抱怨 3D 视觉**，但也不满意整体。
3. **底袋（角袋）圆要与相邻的"两条"库边都相切**：即长边库边 + 短边库边。用户明确说过"45° 作直径造矩形"（沿台角 45° 对角线量直径）。
4. **不要画袋口矩形**（用户最后撤回了矩形方案），袋口区域该是绿呢的要是绿呢。
5. **袋口判定范围不要过大**：曾有版本贴库滚过袋口就被吸进，用户判定"范围过大"。
6. **不许穿模**：球不能穿进 3D 库边/木框实体。
7. 2D 与 3D 的袋口视觉应当对应（2D 目前是"袋口黑矩形"：中袋平矩形 + 角袋 45° 旋转矩形，只覆盖库边色带，绿呢内零黑——这部分用户未再抱怨）。

## 四、当前状态与已知问题

**当前实现**：
- nearHole 让位 = **原版 2D 圆形判定**：`dist < HOLE_RADIUS + BALL_RADIUS * 2`（≈21）——**这是本轮刚恢复的，正是穿模回归的原因**（见下）。
- 进袋判定：`dist < HOLE_RADIUS + BALL_RADIUS * 0.5`（13.5），判定心 = holes。
- holes（判定心）当前在**库边内沿线上**：中袋 `(pm, ±127 世界)`、角袋 `(±254, ±127)`（即绿呢四角）。
- 3D 视觉：库边 6 段对称梯形（`makeCushionSeg`，notch=6 端头斜切，缺口在中袋/角袋处）、绿呢完整 Box、rail 完整 4 根、袋口黑圆盘（y=0.25）。

**已知回归（待修复的第一优先级）**：
- **穿模回来了**。原因：原版圆形让位半径 21 太大——球在袋口"侧方"（横向偏离洞口但距离袋心 < 21）也让位，于是穿出库边内沿、撞进 3D 的实心库边段体积。2D 时代无实体库边所以看不出，3D 是实体挤出体，一眼穿模。
- **修复思路（不要用之前失败的两种）**：
  - 失败方案 A："判定心=洞心 + 横纵双窗口"——洞心在库边外侧导致纵向窗口失效，中袋永远无法进袋。
  - 失败方案 B："恢复原版圆形 21"——就是现在的穿模回归。
  - **正确方案**：nearHole 让位 = **横向对准 + 正在接近**。对每个 hole：`dx = ball.x - hole.x`（沿库边方向的偏移）、`dy = ball.y - hole.y`（垂直库边方向）。让位条件：`|dx| < 洞口半宽（约 HOLE_RADIUS）+ 球半径余量` **且** `dy 与洞心在库边外侧这一事实配合`——即球接近库边（对中袋：`Math.abs(dy) < BALL_RADIUS * 2` 左右的小窗口，因为洞心就在库边线上，球贴库时 dy≈5）。**关键**：横向窗口收窄到洞口真实宽度（HOLE_RADIUS≈11 或更小），纵向窗口用小常量（比如 `BALL_RADIUS * 2.5`），两者都是**相对库边线上判定心**的。这样袋口侧方（|dx| 大）正常反弹，正对洞口才让位穿越。
  - 另一个可选思路：把 holes 判定心移到**视觉洞心**（库边外 8），nearHole 用"球到洞心距离 < HOLE_RADIUS + 球半径"（= 13.5，球贴库正对洞口时 dist≈8，满足），同时**配合横向 |dx| < 10.5 限制**。注意之前失败是因为漏了横向限制导致纵向窗口失效，不是思路本身不成立。
- **角袋双相切**：用户要求角袋洞圆与长、短两条库边都相切。当前判定心在绿呢角 (254,127)，视觉洞盘同圆心——**圆与两条库边线相切需要圆心在角平分线上距角 r·√2 处**（即 (254+7.78, 127+7.78) 世界），判定心与视觉圆心需要分离或统一调整。这是用户反复强调但尚未做对的点，接手后优先和用户确认期望的洞心位置与洞大小（用户给过一张示意图：袋口圆嵌在库边带上、绿呢角圆弧内收与洞圆衔接）。

## 五、袋口相关代码位置

- 2D `drawTable()`（game_2d.html，正则锚点 `function drawTable`）：绿呢 fillRect + 袋口黑矩形（中袋 `fillRect(pm-pr, top-ph, 2pr, ph)`；角袋 save/translate/rotate(±π/4)/fillRect）。`pr` 视觉半径 8 与判定 11 分离。
- 2D `resolveCushionCollision()`：nearHole 让位（当前是回归后的圆形版，见上）。
- 2D `checkHoles()`：进袋判定 `dist < HOLE_RADIUS + BALL_RADIUS * 0.5`，触发进袋动画/规则。
- 3D `buildTable()`（scene3d_fragment.js）：绿呢、库边段（`makeCushionSeg` + segDefs）、rail、袋口黑圆盘、开球线。
- 3D `startPocketAnimation(ball, hole)`：进袋动画，目标 = hole 世界坐标。

## 六、验证纪律

- **用户自己验证**，AI 不要跑浏览器验证游戏流程。交付前最低限度的自检只有两个：`node --check` 语法通过 + 打开页面确认 `window.__game` 存在（module 没崩）。
- 用户语气可能很冲，直接、简短、认错要快，不要辩解。改动前把理解说清楚让用户确认（用户曾因连续误解而暴怒，一次确认胜过三轮返工）。

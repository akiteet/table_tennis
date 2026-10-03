# -*- coding: utf-8 -*-
"""从各游戏的 game_2d.html 生成 game_3d.html：保留逻辑层（物理 / 规则 / 输入 / 回放 / 音效逐字节一致），
把 2D Canvas 渲染层替换为 Three.js 渲染层（scene3d_fragment.js，各游戏共用）。

各游戏差异集中在 GAMES 配置：路径、标题、配色（注入为 GAME_3D）、额外的窗口导出、游戏专属的 3D 片段。
锚点全部用正则 + 花括号配对动态定位，不依赖行号或固定行数。

用法：py build_3d.py [game ...]      不带参数则生成全部游戏
"""
import io
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, '..')
FRAG = os.path.join(BASE, 'scene3d_fragment.js')

# window 导出 = 页面 onclick 里出现的函数 ∪ 下面这些（只导出源码里确实定义了的）
EXTRA_EXPORTS = ['shoot', 'resetGame', 'replayLastShot', 'setGuideMode', 'resetCueSpin',
                 'declarePushOut', 'pushOutTakeShot', 'pushOutForceBack']

# style：3D 配色；markings：台面标线（pool = 开球线 + 置球点，snooker = 开球线 + D 区弧 + 彩球置球点）；
# dZone：摆白球高亮区（rect = 开球线后整块，semicircle = D 区半圆）
GAMES = {
    'chinese': dict(
        dir='chinese_eight_ball/chinese_eight_ball-game', name='中式八球',
        style=dict(cloth=0x1e6f3c, cushion=0x7a2a2a, wood=0xc9a87c, woodDark=0x432a17),
        markings='pool', dZone='rect',
    ),
    'nine': dict(
        dir='nine_ball/nine_ball-game', name='九球台球',
        style=dict(cloth=0x1e6f3c, cushion=0x14512c, wood=0x6b4428, woodDark=0x3a2414),
        markings='pool', dZone='rect',
    ),
    'american': dict(
        dir='american_eight_ball/american_eight_ball-game', name='美式八球',
        style=dict(cloth=0x1a86a0, cushion=0x0f5c6d, wood=0x7a5232, woodDark=0x3e2716),
        markings='pool', dZone='rect',
    ),
    'snooker': dict(
        dir='snooker/snooker-game', name='斯诺克台球',
        style=dict(cloth=0x0f5a1c, cushion=0x0a4214, wood=0x6b4428, woodDark=0x3a2414),
        markings='snooker', dZone='semicircle',
    ),
}


class Source:
    def __init__(self, path):
        with io.open(path, 'r', encoding='utf-8', newline='') as f:
            raw = f.read()
        self.eol = '\r\n' if '\r\n' in raw[:400] else '\n'
        self.lines = raw.splitlines(keepends=True)

    def text(self):
        return ''.join(self.lines)

    def line(self, i):  # 1-based，不含行尾
        return self.lines[i - 1].rstrip('\r\n')

    def find_line(self, pattern, start=1):
        pat = re.compile(pattern)
        for idx in range(start - 1, len(self.lines)):
            if pat.search(self.lines[idx].rstrip('\r\n')):
                return idx + 1
        raise AssertionError('pattern not found: ' + pattern)

    def count(self, pattern):
        pat = re.compile(pattern)
        return sum(1 for l in self.lines if pat.search(l.rstrip('\r\n')))

    def block_end(self, start):
        """从 start 行起做花括号配对，返回闭合那一行（1-based）。跳过字符串与行注释里的括号。"""
        depth, seen = 0, False
        for idx in range(start - 1, len(self.lines)):
            l = re.sub(r"//.*$|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`", '', self.lines[idx])
            for ch in l:
                if ch == '{':
                    depth += 1
                    seen = True
                elif ch == '}':
                    depth -= 1
                    if seen and depth == 0:
                        return idx + 1
        raise AssertionError('unbalanced block from line %d' % start)

    def replace(self, start, end, new_text):
        self.lines[start - 1:end] = [l + self.eol for l in new_text.split('\n')]

    def insert_after(self, i, new_text):
        self.lines[i:i] = [l + self.eol for l in new_text.split('\n')]


NAV_LINKS = [('game_2d.html', '本地 2D'), ('game_3d.html', '本地 3D'),
             ('game_2d_online.html', '联机 2D'), ('game_3d_online.html', '联机 3D'), ('game_2d_rules.html', '规则说明')]


def build(key, variant='local'):
    cfg = GAMES[key]
    gdir = os.path.join(ROOT, cfg['dir'])
    online = variant == 'online'
    src_name, dst_name = ('game_2d_online.html', 'game_3d_online.html') if online else ('game_2d.html', 'game_3d.html')
    src = Source(os.path.join(gdir, src_name))
    name = cfg['name']
    key = '%s/%s' % (key, variant)

    # ---------- 锚点（全部动态定位，且要求唯一） ----------
    def unique(pattern):
        n = src.count(pattern)
        assert n == 1, '%s: anchor %r matched %d times' % (key, pattern, n)
        return src.find_line(pattern)

    L_TITLE = unique(r'<title>')
    L_CSS_TABLE = src.find_line(r'^        #table \{')        # 顶层规则（媒体查询里的同名规则缩进更深）
    L_CSS_TABLE_END = src.block_end(L_CSS_TABLE)
    L_CSS_END = unique(r'</style>')
    L_NAV_FIRST = src.find_line(r'class="nav-link')
    L_NAV_LAST = unique(r'nav-link.*game_2d_rules\.html')
    assert all('nav-link' in src.line(i) for i in range(L_NAV_FIRST, L_NAV_LAST + 1)), key + ': nav links not contiguous'
    L_CANVAS = unique(r'<canvas id="table"')
    L_SCRIPT = unique(r'<script>$')
    L_CANVAS_CTX = unique(r'let canvas, ctx;')
    # 联网版有两个 DOMContentLoaded：大厅初始化（保留）与画布初始化（含 initGameConstants，删除并改写成 3D 初始化）
    dcl = [i for i in range(1, len(src.lines) + 1) if 'DOMContentLoaded' in src.line(i)]
    dcl = [i for i in dcl if 'initGameConstants()' in ''.join(src.lines[i - 1:src.block_end(i)])]
    assert len(dcl) == 1, key + ': canvas DOMContentLoaded block not unique'
    L_DCL = dcl[0]
    L_DCL_END = src.block_end(L_DCL)
    # 3D 初始化序列 = 原画布初始化块去掉画布相关语句，并在 gameLoop() 前建 3D 场景（保留各游戏自己的初始化，如 initOnlineUI）
    init_lines = []
    for i in range(L_DCL + 1, L_DCL_END):
        l = src.line(i).strip()
        if not l or re.match(r'(canvas|ctx)\s*=|canvas\.|initResponsiveTable\(\)', l):
            continue
        if l == 'gameLoop();':
            init_lines += ['init3DScene();', 'renderer.render(scene, camera); // 先同步渲染一帧，保证页面在后台时也有可用画面']
        init_lines.append(l)
    assert init_lines[-1] == 'gameLoop();' and 'initGameConstants();' in init_lines, key + ': unexpected init block'
    init_code = '\n'.join('        ' + l for l in init_lines)
    L_FIT = unique(r'function fitTableToStage')
    L_KEYDOWN = unique(r"addEventListener\('keydown'")
    L_SHOTSND = unique(r'playCueStrikeSound\(cuePower\);')
    L_CHECKHOLES = unique(r'function checkHoles\(')
    L_CLICK = unique(r'function handleCanvasClick\(')
    L_DRAWTABLE = unique(r'function drawTable\(')
    L_GAMELOOP = unique(r'function gameLoop\(')
    L_SCRIPT_END = unique(r'</script>')
    assert L_DRAWTABLE < L_GAMELOOP, 'render block order'
    L_GAMELOOP_END = src.block_end(L_GAMELOOP)
    # fitTableToStage 后紧跟的 initResponsiveTable 一并删除（3D 有自己的 resize）
    L_FIT_END = src.block_end(L_FIT)
    if src.count(r'function initResponsiveTable\(') == 1:
        L_RESP = src.find_line(r'function initResponsiveTable\(')
        assert L_RESP > L_FIT_END and L_RESP - L_FIT_END <= 3, 'initResponsiveTable not adjacent to fitTableToStage'
        L_FIT_END = src.block_end(L_RESP)

    with io.open(FRAG, 'r', encoding='utf-8') as f:
        scene3d = f.read().rstrip('\n')
    style = ', '.join('%s: 0x%06x' % (k, v) for k, v in cfg['style'].items())
    scene3d = ('        // 由 build_3d.py 按游戏注入（' + name + '）\n'
               "        const GAME_3D = { %s, markings: '%s', dZone: '%s' };\n\n" % (style, cfg['markings'], cfg['dZone'])
               + scene3d)

    text = src.text()
    names = re.findall(r'on(?:click|change|input)="(\w+)\(', text) + EXTRA_EXPORTS
    defined = [n for n in dict.fromkeys(names) if re.search(r'function ' + n + r'\(', text)]
    exports = ', '.join(defined + ['setCameraMode'])

    # 先按原始行号登记全部操作，最后从下往上执行，行号互不影响
    ops = []
    rep = lambda a, b, t: ops.append((a, b, t))
    ins = lambda a, t: ops.append((a + 1, None, t))
    # A. gameLoop 之后：初始化 + window 导出
    ins(L_GAMELOOP_END, """        // ==================== 初始化 ====================
%s

        Object.assign(window, {""" % init_code + """
            %s,
            __game: () => ({
                isPlacingBall, gameStarted, ballMoving, allBallsStopped, isReplaying,
                cueAngle: Math.round(cueAngle * 1000) / 1000, cuePower,
                currentPlayer, phase, cameraMode,
                canControl: canControlLocally(),
                online: typeof isConnected !== 'undefined' ? { connected: isConnected, player: myPlayerNumber }
                    : typeof onlineConnected !== 'undefined' ? { connected: onlineConnected, player: myPlayer } : null,
                whiteBall: whiteBall ? { x: Math.round(whiteBall.x), y: Math.round(whiteBall.y) } : null,
                ballCount: balls.length,
                balls: balls.map(b => ({ n: b.number, t: b.type.slice(0, 1), x: Math.round(b.x), y: Math.round(b.y) }))
            })
        });""" % exports)

    # B. 渲染函数（drawTable … gameLoop 之前）→ 3D 场景代码；gameLoop 保留游戏自己的调度
    #    （回放 / 物理 / 联网的 shouldSimulateTable、smoothRemoteMotion、maybeBroadcastMovingState），
    #    只把清屏与 draw* 调用换成 render3DFrame()
    rep(L_DRAWTABLE, L_GAMELOOP - 1, scene3d)
    loop = []
    for i in range(L_GAMELOOP, L_GAMELOOP_END + 1):
        l = src.line(i)
        if re.match(r'\s*(ctx\.clearRect\(.*\)|draw\w+\(\));\s*$', l):
            continue
        if re.match(r'\s*requestAnimationFrame\(gameLoop\);\s*$', l):
            loop.append(re.match(r'\s*', l).group(0) + 'render3DFrame();')
        loop.append(l)
    loop_text = '\n'.join(loop)
    assert loop_text.count('render3DFrame();') == 1, key + ': gameLoop has no single requestAnimationFrame(gameLoop)'
    assert not re.search(r'\bctx\b|\bdraw[A-Z]\w*\(', loop_text), key + ': gameLoop still draws 2D:\n' + loop_text
    rep(L_GAMELOOP, L_GAMELOOP_END, loop_text)

    # C. handleCanvasClick → handleTableClick(mx, my)：只去掉开头的屏幕坐标换算，游戏自己的点击语义
    #    （摆白球、叫袋选球选袋、自由球选球、点击瞄准）原样保留，由 3D 渲染层传入射线求得的台面坐标
    #    联网版在坐标换算前还有"未连接 / 非己方回合"守卫，保留
    L_CLICK_END = src.block_end(L_CLICK)
    L_RECT = src.find_line(r'const rect = canvas\.getBoundingClientRect\(\);', L_CLICK)
    L_MY = src.find_line(r'const my = ', L_CLICK)
    assert L_MY - L_RECT == 7 and L_MY < L_CLICK_END, '%s: unexpected handleCanvasClick prologue' % key
    rest = ''.join(src.lines[L_CLICK:L_RECT - 1] + src.lines[L_MY:L_CLICK_END])
    assert not re.search(r'\bcanvas\b|[^\w.]e\.', rest), '%s: handleCanvasClick still uses canvas/event' % key
    rep(L_CLICK, L_CLICK, '        function handleTableClick(mx, my) {\n'
        '            // 3D 版：mx / my 由渲染层用射线求得的台面逻辑坐标直接传入（原 handleCanvasClick 去掉了屏幕坐标换算）')
    rep(L_RECT, L_MY, '')

    # D. checkHoles → 进袋动画钩子版（判定与 2D 源共用 findPocketHole；美式八球保留叫袋用的袋口 id）
    ck_end = src.block_end(L_CHECKHOLES)
    keeps_pocket_id = 'pottedPocketId' in ''.join(src.lines[L_CHECKHOLES - 1:ck_end])
    rep(L_CHECKHOLES, ck_end, '\n'.join([
        '        function checkHoles() {',
        '            const toRemove = [];',
        '            balls.forEach(ball => {',
        '                if (pottedThisShot.includes(ball)) return;',
        '                const hole = findPocketHole(ball);',
        '                if (!hole) return;',
    ] + (['                ball.pottedPocketId = hole.id;'] if keeps_pocket_id else []) + [
        '                pottedThisShot.push(ball);',
        '                toRemove.push({ ball, hole });',
        '                playPocketSound(ball);',
        '            });',
        '            balls = balls.filter(b => !toRemove.some(r => r.ball === b));',
        '            toRemove.forEach(r => startPocketAnimation(r.ball, r.hole));',
        '        }']))

    # E. 出杆动画钩子
    ins(L_SHOTSND, '            startCueStrikeAnim(cueAngle, cuePower);')

    # F. keydown → 在原监听开头插入 1/2/3 视角键（保留各游戏自己的守卫，如斯诺克的 awaitingLetPlayDecision）
    assert re.search(r'\(e\) => \{$', src.line(L_KEYDOWN)), '%s: keydown handler param is not (e)' % key
    ins(L_KEYDOWN, '\n'.join([
        "                if (e.key === '1') { setCameraMode('top'); return; }",
        "                if (e.key === '2') { setCameraMode('orbit'); return; }",
        "                if (e.key === '3') { setCameraMode('cue'); return; }"]))

    # G/H. fitTableToStage(+initResponsiveTable) 与 DOMContentLoaded → 删除（初始化移至文件尾）
    rep(L_FIT, L_FIT_END, '')
    rep(L_DCL, L_DCL_END, '')

    # I. canvas/ctx 声明 → 删除
    rep(L_CANVAS_CTX, L_CANVAS_CTX, '')

    # J. <script> → importmap + module
    rep(L_SCRIPT, L_SCRIPT, """    <script type="importmap">
        {
            "imports": {
                "three": "../../_vendor/three@0.169.0/three.module.js",
                "three/addons/": "../../_vendor/three@0.169.0/addons/"
            }
        }
    </script>
    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';""")

    # K. canvas → 3D 容器 + 视角按钮
    rep(L_CANVAS, L_CANVAS, """                <div id="table3d">
                    <div class="view-overlay">
                        <button class="view-btn active" data-view="orbit" type="button" onclick="setCameraMode('orbit')">环绕 (2)</button>
                        <button class="view-btn" data-view="top" type="button" onclick="setCameraMode('top')">顶视 (1)</button>
                        <button class="view-btn" data-view="cue" type="button" onclick="setCameraMode('cue')">击球 (3)</button>
                    </div>
                </div>""")

    # L. 导航：本地 / 联机 × 2D / 3D 四个入口 + 规则，当前页 active
    rep(L_NAV_FIRST, L_NAV_LAST, '\n'.join(
        '            <a class="nav-link%s" href="%s">%s</a>' % (' active' if href == dst_name else '', href, label)
        for href, label in NAV_LINKS))

    # N. </style> 前追加 .table-stage 覆盖（在 M 之前、位置更靠后）
    ins(L_CSS_END - 1, """        .table-stage { align-items: stretch; justify-content: stretch; }""")

    # M. #table CSS → #table3d + 视角按钮样式
    rep(L_CSS_TABLE, L_CSS_TABLE_END, """        #table3d {
            flex: 1 1 auto; min-width: 0; min-height: 0;
            width: 100%; height: 100%;
            aspect-ratio: 16 / 9;   /* 父级高度为 auto 时（斯诺克的网格布局）靠它撑出高度；父级定高时不生效 */
            border: 3px solid #5a3a22; background: #0e1216;
            cursor: crosshair; position: relative; overflow: hidden;
        }
        #table3d canvas { display: block; }
        .view-overlay {
            position: absolute; top: 10px; right: 10px; z-index: 6;
            display: flex; gap: 6px;
        }
        .view-btn {
            font-size: 12px; padding: 5px 10px; border-radius: 4px;
            border: 1px solid rgba(212,165,116,0.4); color: #cfbf9f;
            background: rgba(10,10,10,0.72); cursor: pointer;
        }
        .view-btn:hover { color: #fff; border-color: rgba(212,165,116,0.8); }
        .view-btn.active { color: #e6d2ad; background: rgba(180,120,60,0.3); border-color: #8a5a33; }""")

    # O. 标题
    rep(L_TITLE, L_TITLE, '    <title>%s 3D - %s</title>' % (name, '联机对战' if online else '双人对战'))

    # 执行：按起始行从大到小；同一位置先插入后替换（插入在 B 段尾部之后，不会冲突）
    spans = sorted([(a, b) for a, b, _ in ops if b is not None])
    for (a1, b1), (a2, b2) in zip(spans, spans[1:]):
        assert b1 < a2, '%s: overlapping edits %r %r' % (key, (a1, b1), (a2, b2))
    for a, b, t in sorted(ops, key=lambda o: (o[0], o[1] is not None), reverse=True):
        if b is None:
            src.insert_after(a - 1, t)
        else:
            src.replace(a, b, t)

    dst = os.path.join(gdir, dst_name)
    with io.open(dst, 'w', encoding='utf-8', newline='') as f:
        f.write(src.text())
    # module 语法自检用的临时产物
    module = re.search(r'<script type="module">(.*?)</script>', src.text(), re.S).group(1)
    with io.open(os.path.join(BASE, 'check.mjs'), 'w', encoding='utf-8') as f:
        f.write(module)
    print('OK -> %s  (%d lines)' % (os.path.relpath(dst, ROOT), len(src.lines)))


if __name__ == '__main__':
    # 参数：游戏名（chinese / nine / american / snooker）或 游戏名/变体（如 snooker/online）；不带参数 = 全部游戏的单机 + 联网
    targets = sys.argv[1:] or [k + '/' + v for k in GAMES for v in ('local', 'online')]
    for t in targets:
        k, _, v = t.partition('/')
        build(k, v or 'local')

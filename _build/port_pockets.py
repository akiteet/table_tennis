# -*- coding: utf-8 -*-
"""把中式八球的袋口几何（单一几何源 buildCushionGeometry + 圆-线段碰撞 + 洞圆判定）移植到
九球 / 美式八球的单机版，以及三款美式台的联网版。

每处替换都断言命中次数，任何一处不匹配就整体中止、不写文件。可重复运行：已移植的文件会被识别并跳过。
用法：py port_pockets.py
"""
import io
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

POOL = dict(  # 九球 / 美式八球：尺寸取自 _data/standard/nine.jpg
    hole='Math.max(BALL_RADIUS + 4, Math.round(52.5 * SCALE))',
    rail='HOLE_RADIUS + Math.round(10 * SCALE)', rail3d='Math.round(180 * SCALE) - CUSHION_WIDTH',
    size_note=('// 袋口与边框尺寸取自九球标准台示意图（_data/standard/nine.jpg）实测：\n'
               '// 洞半径 ≈ 库边宽 ≈ 55mm，外沿每边（库边 + 木框）180mm'),
    jaw=9, corner='chamfer', placements=2,
)
CHINESE = dict(  # 与 chinese_eight_ball/game_2d.html 完全一致
    hole='Math.max(BALL_RADIUS + 4, Math.round(45 * SCALE))',
    rail='HOLE_RADIUS + Math.round(10 * SCALE)', rail3d='Math.round(80 * SCALE)',
    size_note=('// 袋口与边框尺寸取自中式黑八标准台示意图（_data/standard/chinese_eight.jpg）实测：\n'
               '// 洞半径 ≈ 库边宽 ≈ 45mm，木框 ≈ 80mm'),
    jaw=8, corner='chamfer', placements=2,
)
SNOOKER = dict(  # 斯诺克：袋口形状与尺寸取自 _data/standard/snooker.jpg（标注袋口宽 85mm）
    hole='Math.max(BALL_RADIUS + 4, Math.round(45 * SCALE))',
    rail='HOLE_RADIUS + Math.round(10 * SCALE)', rail3d='Math.round(80 * SCALE)',
    size_note=('// 袋口取自斯诺克标准台示意图（_data/standard/snooker.jpg）：角袋库边端头凸圆角收口后贴着洞圆，中袋圆角袋嘴；\n'
               '// 洞半径 45mm（= 库边宽），角袋两侧圆角起点间距 ≈ 87mm（示意图标注袋口宽 85mm），木框 ≈ 80mm'),
    jaw=8, corner='round', corner_jaw=4, placements=1,
)

TARGETS = [
    ('chinese_eight_ball/chinese_eight_ball-game/game_2d_online.html', CHINESE,
     dict(rail='#d9b98e', felt='#1b6b3a', cushion='#7a2a2a', hole='#0a0a0a')),
    ('nine_ball/nine_ball-game/game_2d.html', POOL,
     dict(rail='#5a3a22', felt='#1b6b3a', cushion='#14512c', hole='#0a0a0a')),
    ('nine_ball/nine_ball-game/game_2d_online.html', POOL,
     dict(rail='#5a3a22', felt='#1b6b3a', cushion='#14512c', hole='#0a0a0a')),
    ('american_eight_ball/american_eight_ball-game/game_2d.html', POOL,
     dict(rail='#6b4528', felt='#167c93', cushion='#0f5c6d', hole='#0a0a0a')),
    ('american_eight_ball/american_eight_ball-game/game_2d_online.html', POOL,
     dict(rail='#6b4528', felt='#167c93', cushion='#0f5c6d', hole='#0a0a0a')),
    ('snooker/snooker-game/game_2d.html', SNOOKER,
     dict(rail='#5a3a22', felt='#004400', cushion='#002e00', hole='#0a0a0a')),
    ('snooker/snooker-game/game_2d_online.html', SNOOKER,
     dict(rail='#5a3a22', felt='#004400', cushion='#002e00', hole='#0a0a0a')),
]

_CHAMFER_FN = r'''
        // 库边平面形状（逻辑坐标）：2D 绘制、物理碰撞、3D 建模共用这一份，三者不会对不上。
        // 长库边每条两段（角袋 → 中袋），短库边每条一段：
        //   角袋端 —— 45° 直线斜切（标准台示意图 nine.jpg），斜切面与角袋洞圆相切；
        //             同一角袋的两条斜切面互相平行，夹出一条宽 2r、直通洞口的袋道；
        //   中袋端 —— 鼻子线 → 圆角袋嘴 → 垂直端面，端面与中袋洞圆相切于库边外沿
        function buildCushionGeometry() {
            const c = CUSHION_WIDTH, r = HOLE_RADIUS, jaw = POCKET_JAW_RADIUS;
            const k = r * Math.SQRT2;                  // 斜切面在鼻子线上距台角的距离（45° 线与洞圆相切）
            const L = BORDER, R = TABLE_WIDTH - BORDER;
            const T = BORDER, B = TABLE_HEIGHT - BORDER;
            const midX = BORDER + TABLE_INNER_LENGTH / 2;
            const arc = (cx, cy, rad, a0, a1, n) => {
                const pts = [];
                for (let i = 0; i <= n; i++) {
                    const a = a0 + (a1 - a0) * i / n;
                    pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
                }
                return pts;
            };

            cushionPieces = [];
            // out：从鼻子线指向木框的方向（上 / 左为 -1，下 / 右为 +1）
            for (const [noseY, out] of [[T, -1], [B, 1]]) {
                for (const [cornerX, dir] of [[L, 1], [R, -1]]) {          // dir：从角袋指向中袋
                    const jawX = midX - dir * r;                            // 中袋端面所在 x
                    const pts = [
                        { x: cornerX + dir * (k - c), y: noseY + out * c },     // 斜切面外端（库边外沿上）
                        { x: cornerX + dir * k, y: noseY },                     // 斜切面鼻端
                        ...arc(jawX - dir * jaw, noseY + out * jaw, jaw,
                            -out * Math.PI / 2, dir > 0 ? 0 : -out * Math.PI, 12),
                        { x: jawX, y: noseY + out * c }
                    ];
                    cushionPieces.push({ pts, axis: 'y', nose: noseY, out });
                }
            }
            for (const [noseX, out] of [[L, -1], [R, 1]]) {
                const pts = [
                    { x: noseX + out * c, y: T + (k - c) },
                    { x: noseX, y: T + k },
                    { x: noseX, y: B - k },
                    { x: noseX + out * c, y: B - (k - c) }
                ];
                cushionPieces.push({ pts, axis: 'x', nose: noseX, out });
            }

            // 碰撞线段 = 每块库边除背面（贴木框那条闭合边）以外的所有边
            cushionSegments = [];
            cushionPieces.forEach(({ pts }) => {
                for (let i = 0; i < pts.length - 1; i++) {
                    cushionSegments.push({ ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y });
                }
            });
        }'''

# 斯诺克角袋：在斜切版模板上做定点替换（斜切版文本保持不变，已移植文件可逐字节复现）
_ROUND_PATCHES = [
    ('''        //   角袋端 —— 45° 直线斜切（标准台示意图 nine.jpg），斜切面与角袋洞圆相切；
        //             同一角袋的两条斜切面互相平行，夹出一条宽 2r、直通洞口的袋道；
''', '''        //   角袋端 —— 斯诺克式圆角袋嘴（标准台示意图 snooker.jpg）：鼻子线 → 凸圆角（与鼻子线、洞圆都相切）
        //             → 沿洞圆的凹弧 → 库边外沿；洞心在台呢角上，洞半径 = 库边宽；
'''),
    ('''            const k = r * Math.SQRT2;                  // 斜切面在鼻子线上距台角的距离（45° 线与洞圆相切）
''', '''            const cj = POCKET_CORNER_JAW_RADIUS;
            const sj = Math.sqrt(r * r + 2 * r * cj);   // 角袋圆角圆心沿库边离台角的距离（圆角与洞圆外切）
            const th = Math.atan2(cj, sj);               // 圆角与洞圆切点的方向
'''),
    ('''                return pts;
            };
''', '''                return pts;
            };
            // 角袋端头点列，局部坐标 s = 沿库边离台角的距离、d = 离鼻子线往木框方向的深度；从库边外沿走到鼻子线
            // 贴洞弧用折线逼近：顶点外扩到 r / cos(半步角)，每条弦都外切洞圆，库边不侵入洞
            const cornerEnd = [
                ...arc(0, 0, r / Math.cos((Math.PI / 2 - th) / 20), Math.PI / 2, th, 10),
                ...arc(sj, cj, cj, th + Math.PI, Math.PI * 3 / 2, 8).slice(1)
            ].map(p => ({ s: p.x, d: p.y }));
'''),
    ('''                        { x: cornerX + dir * (k - c), y: noseY + out * c },     // 斜切面外端（库边外沿上）
                        { x: cornerX + dir * k, y: noseY },                     // 斜切面鼻端
''', '''                        ...cornerEnd.map(p => ({ x: cornerX + dir * p.s, y: noseY + out * p.d })),   // 角袋圆角袋嘴
'''),
    ('''                    { x: noseX + out * c, y: T + (k - c) },
                    { x: noseX, y: T + k },
                    { x: noseX, y: B - k },
                    { x: noseX + out * c, y: B - (k - c) }
''', '''                    ...cornerEnd.map(p => ({ x: noseX + out * p.d, y: T + p.s })),
                    ...cornerEnd.slice().reverse().map(p => ({ x: noseX + out * p.d, y: B - p.s }))
'''),
]


def geometry_fn(cfg):
    fn = _CHAMFER_FN
    if cfg['corner'] == 'round':
        for old, new in _ROUND_PATCHES:
            if fn.count(old) != 1:
                raise AssertionError('round-corner patch anchor missing: ' + old[:50])
            fn = fn.replace(old, new)
    return fn


def sub_once(text, pattern, repl, label, count=1, flags=0):
    found = len(re.findall(pattern, text, flags))
    if found != count:
        raise AssertionError('%s: expected %d match(es), found %d' % (label, count, found))
    return re.sub(pattern, repl, text, flags=flags)


def function_span(text, name):
    """返回 'function name(' 所在行起点到函数结束 '}' 行末（8 空格缩进）的区间。"""
    m = re.search(r'\n( {8})function ' + re.escape(name) + r'\(', text)
    if not m:
        raise AssertionError('function %s not found' % name)
    start = m.start() + 1
    end = text.index('\n        }\n', start) + len('\n        }')
    return start, end


def port(text, cfg, col):
    if 'function buildCushionGeometry' in text:
        return None

    # 1. 声明
    text = sub_once(text, r'(\n( *)let BALL_RADIUS, FRICTION, HOLE_RADIUS[^\n]*;)',
                    r'\1\n\2let CUSHION_WIDTH, RAIL_WIDTH, RAIL_3D_WIDTH;', 'decl BALL_RADIUS')
    text = sub_once(text, r'(\n( *)let (?:COLOR_BALLS_DEF, )?holes;)',     # 斯诺克与彩球定义同一行声明
                    r'\1\n\2let cushionPieces = [];\n\2let cushionSegments = [];', 'decl holes')
    text = sub_once(text, r'(\n( *)const CUSHION_RESTITUTION = [\d.]+;)',
                    r'\1\n\2const POCKET_JAW_RADIUS = %d;            '
                    r'// 中袋库边鼻端圆角（袋嘴）半径；须小于库边宽，否则圆弧终点与端面点重合成零长碰撞边' % cfg['jaw'],
                    'const restitution')
    if cfg['corner'] == 'round':
        text = sub_once(text, r'(\n( *)const POCKET_JAW_RADIUS = \d+;[^\n]*)',
                        r'\1\n\2const POCKET_CORNER_JAW_RADIUS = %d;     '
                        r'// 角袋库边鼻端凸圆角半径（按 snooker.jpg 袋口宽 85mm 取）；圆角同时与鼻子线、洞圆相切' % cfg['corner_jaw'],
                        'corner jaw const')

    # 2. initGameConstants：BORDER 改由库边 + 木框推出
    text = sub_once(text, r'\n *BORDER = Math\.round\(30 \* SCALE\);\n *TABLE_WIDTH = TABLE_INNER_LENGTH \+ BORDER \* 2;\n'
                          r' *TABLE_HEIGHT = TABLE_INNER_WIDTH \+ BORDER \* 2;', '', 'BORDER block')
    note = '\n'.join('            ' + l for l in cfg['size_note'].split('\n'))
    hole_block = (note + '\n'
                  '            HOLE_RADIUS = %s;\n'
                  '            // 库边宽 = 洞半径：中袋洞心恰好落在库边外沿上、洞圆与绿呢边相切；\n'
                  '            // 角袋洞心在绿呢四角，洞圆恰好与长短两条库边的外沿同时相切\n'
                  '            CUSHION_WIDTH = HOLE_RADIUS;\n'
                  '            RAIL_WIDTH = %s;   // 2D 木框只作示意：刚好包住伸进木框的中袋洞（洞心在库边外沿上）再留 2\n'
                  '            RAIL_3D_WIDTH = %s;   // 示意图实测的真实木框宽，仅 3D 实体木框使用\n'
                  '            BORDER = CUSHION_WIDTH + RAIL_WIDTH;         // 画布边 → 库边鼻子线（物理边界）\n'
                  '            TABLE_WIDTH = TABLE_INNER_LENGTH + BORDER * 2;\n'
                  '            TABLE_HEIGHT = TABLE_INNER_WIDTH + BORDER * 2;') % (cfg['hole'], cfg['rail'], cfg['rail3d'])
    text = sub_once(text, r' *HOLE_RADIUS = Math\.max\(BALL_RADIUS \+ 4, Math\.round\(52\.5 \* SCALE\)\);',
                    lambda m: hole_block, 'HOLE_RADIUS')

    # 3. 洞心 + 几何生成
    m = re.search(r'\n( *)const offset = HOLE_RADIUS \* 0\.3;\n *holes = \[\n(.*?)\n *\];\n        }\n', text, re.S)
    if not m:
        raise AssertionError('holes block not found')
    ids = re.findall(r"id: '(\w+)'", m.group(2))
    if ids and ids != ['tl', 'tm', 'tr', 'bl', 'bm', 'br']:
        raise AssertionError('unexpected hole ids %r' % ids)
    idp = (lambda i: "id: '%s', " % i) if ids else (lambda i: '')
    holes_block = (
        '\n'
        '            const L = BORDER, R = TABLE_WIDTH - BORDER;   // 左右库边鼻子线\n'
        '            const T = BORDER, B = TABLE_HEIGHT - BORDER;  // 上下库边鼻子线\n'
        '            const midX = BORDER + TABLE_INNER_LENGTH / 2;\n'
        '            holes = [\n'
        '                { %sx: L, y: T },                          // 左上角袋：洞心在绿呢角上\n'
        '                { %sx: midX, y: T - CUSHION_WIDTH },       // 上中袋：洞心在库边外沿上\n'
        '                { %sx: R, y: T },                          // 右上角袋\n'
        '                { %sx: L, y: B },                          // 左下角袋\n'
        '                { %sx: midX, y: B + CUSHION_WIDTH },       // 下中袋\n'
        '                { %sx: R, y: B }                           // 右下角袋\n'
        '            ];\n'
        '            buildCushionGeometry();\n'
        '        }\n'
    ) % tuple(idp(i) for i in ['tl', 'tm', 'tr', 'bl', 'bm', 'br'])
    text = text[:m.start()] + holes_block + geometry_fn(cfg) + '\n' + text[m.end():]

    # 4. 摆白球不能压在洞上（美式台两处：D 区摆球 / 自由球摆球；斯诺克只有 D 区一处）
    text = sub_once(text, r'\n( *)([^\n]*TABLE_HEIGHT - BORDER - BALL_RADIUS\) return false;)',
                    r'\n\1\2\n\1if (holes.some(h => Math.hypot(x - h.x, y - h.y) < HOLE_RADIUS + BALL_RADIUS)) return false;',
                    'placement checks', count=cfg['placements'])

    # 5. 库边碰撞：保留原函数里"记录吃库 / 开球计数 / 音效"的收尾块
    s, e = function_span(text, 'resolveCushionCollision')
    old = text[s:e]
    # 原函数"撞到库边后"的收尾块（吃库记录 / 开球计数 / 音效）：单机版写作 verticalSide || horizontalSide，
    # 联网版压缩成 vs || hs；取最后一处（前面同名条件在侧旋块里）
    anchors = list(re.finditer(r'\n *if \((?:verticalSide \|\| horizontalSide|vs \|\| hs)\) \{', old))
    if not anchors:
        raise AssertionError('collision tail not found')
    tail = old[anchors[-1].end():]
    new_fn = (
        '        function resolveCushionCollision(ball) {\n'
        '            // 库边 = buildCushionGeometry 生成的多边形边（鼻子线、中袋圆角袋嘴、端面、角袋斜切面），\n'
        '            // 与 2D 绘制、3D 建模同源。球对每条边做圆-线段碰撞，碰到哪里就从哪里弹开：\n'
        '            // 袋口处没有看不见的墙，球也不会穿进库边实体；袋口不再需要"让位窗口"\n'
        '            const incomingVx = ball.vx;\n'
        '            const incomingVy = ball.vy;\n'
        '            let hit = false;\n'
        '            let spinKick = 0;\n'
        '            for (const s of cushionSegments) {\n'
        '                const ex = s.bx - s.ax, ey = s.by - s.ay;\n'
        '                const t = Math.max(0, Math.min(1, ((ball.x - s.ax) * ex + (ball.y - s.ay) * ey) / (ex * ex + ey * ey)));\n'
        '                const px = s.ax + ex * t, py = s.ay + ey * t;\n'
        '                const dist = Math.hypot(ball.x - px, ball.y - py);\n'
        '                if (dist >= BALL_RADIUS || dist < 1e-9) continue;\n'
        '                const nx = (ball.x - px) / dist, ny = (ball.y - py) / dist;   // 指向球的一侧\n'
        '                ball.x = px + nx * BALL_RADIUS;\n'
        '                ball.y = py + ny * BALL_RADIUS;\n'
        '                const vn = ball.vx * nx + ball.vy * ny;\n'
        '                if (vn >= 0) continue;                                       // 已经在离开\n'
        '                ball.vx -= (1 + CUSHION_RESTITUTION) * vn * nx;              // 法向反弹并衰减，切向不变\n'
        '                ball.vy -= (1 + CUSHION_RESTITUTION) * vn * ny;\n'
        '                if (ball === whiteBall && Math.abs(ball.sideSpin || 0) > 0.001) {\n'
        '                    // 侧旋吃库：沿切向 (ny, -nx) 加速，四面直库边上与原先逐面写法的符号一致\n'
        '                    const k = ball.sideSpin * Math.abs(vn) * SIDE_SPIN_CUSHION_STRENGTH;\n'
        '                    ball.vx += k * ny;\n'
        '                    ball.vy -= k * nx;\n'
        '                    spinKick++;\n'
        '                }\n'
        '                hit = true;\n'
        '            }\n'
        '            if (spinKick) ball.sideSpin *= 0.78;\n'
        '            if (hit) {' + tail
    )
    if 'incomingVx' not in tail and 'ball.vx' not in tail:
        raise AssertionError('collision tail looks wrong')
    text = text[:s] + new_fn + text[e:]

    # 6. 进袋判定：球心落进洞圆
    s, e = function_span(text, 'checkHoles')
    old = text[s:e]
    pocket_id = '                ball.pottedPocketId = hole.id;\n' if 'pottedPocketId' in old else ''
    new_fn = (
        '        // 球心落进哪个洞圆就进哪个袋（球心下面已经没有台面）；\n'
        '        // 兜底：球心越出库边外沿（正常碰撞下不会发生）也算进最近的袋，防止球卡在库边里\n'
        '        function findPocketHole(ball) {\n'
        '            let best = null, bestDist = Infinity;\n'
        '            holes.forEach(h => {\n'
        '                const d = Math.hypot(ball.x - h.x, ball.y - h.y);\n'
        '                if (d < bestDist) { best = h; bestDist = d; }\n'
        '            });\n'
        '            if (bestDist < HOLE_RADIUS) return best;\n'
        '            const outer = BORDER - CUSHION_WIDTH;\n'
        '            const escaped = ball.x < outer || ball.x > TABLE_WIDTH - outer ||\n'
        '                ball.y < outer || ball.y > TABLE_HEIGHT - outer;\n'
        '            return escaped ? best : null;\n'
        '        }\n'
        '\n'
        '        function checkHoles() {\n'
        '            const toRemove = [];\n'
        '            balls.forEach(ball => {\n'
        '                if (pottedThisShot.includes(ball)) return;\n'
        '                const hole = findPocketHole(ball);\n'
        '                if (!hole) return;\n'
        + pocket_id +
        '                pottedThisShot.push(ball);\n'
        '                toRemove.push(ball);\n'
        '                playPocketSound(ball);\n'
        '            });\n'
        '            balls = balls.filter(b => !toRemove.includes(b));\n'
        '        }'
    )
    text = text[:s] + new_fn + text[e:]

    # 7. 绘制
    s, e = function_span(text, 'drawTable')
    fn = text[s:e]
    bg = (
        '            // 与 3D 同一套几何：木框 → 台呢（铺到库边外沿）→ 角上木框方块 → 库边多边形 → 6 个洞圆\n'
        '            const c = CUSHION_WIDTH;\n'
        '            const left = BORDER, right = TABLE_WIDTH - BORDER;\n'
        '            const top = BORDER, bottom = TABLE_HEIGHT - BORDER;\n'
        '\n'
        "            ctx.fillStyle = '%(rail)s';\n"
        '            ctx.beginPath();\n'
        '            if (ctx.roundRect) ctx.roundRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT, RAIL_WIDTH);\n'
        '            else ctx.rect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);\n'
        '            ctx.fill();\n'
        '\n'
        "            ctx.fillStyle = '%(felt)s';\n"
        '            ctx.fillRect(left - c, top - c, right - left + c * 2, bottom - top + c * 2);\n'
        '            // 库边外沿围成的四个角（角袋洞圆外侧）属于木框\n'
        "            ctx.fillStyle = '%(rail)s';\n"
        '            ctx.fillRect(left - c, top - c, c, c);\n'
        '            ctx.fillRect(right, top - c, c, c);\n'
        '            ctx.fillRect(left - c, bottom, c, c);\n'
        '            ctx.fillRect(right, bottom, c, c);\n'
        '\n'
        "            ctx.fillStyle = '%(cushion)s';\n"
        '            cushionPieces.forEach(({ pts }) => {\n'
        '                ctx.beginPath();\n'
        '                ctx.moveTo(pts[0].x, pts[0].y);\n'
        '                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);\n'
        '                ctx.closePath();\n'
        '                ctx.fill();\n'
        '            });\n'
    ) % col
    fn = sub_once(fn, r"( *ctx\.fillStyle = '#[0-9a-f]{6}';\n *ctx\.fillRect\(0, 0, TABLE_WIDTH, TABLE_HEIGHT\);\n\n?"
                      r" *ctx\.fillStyle = '#[0-9a-f]{6}';\n *ctx\.fillRect\(BORDER, BORDER, TABLE_WIDTH - BORDER \* 2, TABLE_HEIGHT - BORDER \* 2\);\n)",
                  lambda m: bg, 'drawTable background')
    holes_draw = (
        "            ctx.fillStyle = '%(hole)s';\n"
        '            ctx.beginPath();\n'
        '            holes.forEach(h => {\n'
        '                ctx.moveTo(h.x + HOLE_RADIUS, h.y);\n'
        '                ctx.arc(h.x, h.y, HOLE_RADIUS, 0, Math.PI * 2);\n'
        '            });\n'
        '            ctx.fill();\n'
    ) % col
    fn = sub_once(fn, r" *const pocketRadius = HOLE_RADIUS;\n.*?ctx\.arc\(BORDER \+ TABLE_INNER_LENGTH / 2, BORDER \+ TABLE_INNER_WIDTH, pocketRadius, 0, Math\.PI\);\s*ctx\.fill\(\);\n",
                  lambda m: holes_draw, 'drawTable pockets', flags=re.S)
    if 'pocketRadius' in fn:
        raise AssertionError('leftover pocketRadius in drawTable')
    text = text[:s] + fn + text[e:]
    return text


def main():
    results = []
    for rel, cfg, col in TARGETS:
        path = os.path.join(ROOT, rel)
        with io.open(path, 'r', encoding='utf-8', newline='') as f:
            raw = f.read()
        crlf = '\r\n' in raw
        text = raw.replace('\r\n', '\n')
        out = port(text, cfg, col)
        if out is None:
            print('skip (already ported):', rel)
            continue
        if crlf:
            out = out.replace('\n', '\r\n')
        results.append((path, out, rel))
    for path, out, rel in results:   # 全部成功才落盘
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(out)
        print('ported:', rel)


if __name__ == '__main__':
    try:
        main()
    except AssertionError as ex:
        print('ABORT:', ex)
        sys.exit(1)

// 袋口几何与物理自检（无浏览器）：从游戏 HTML 中取出 initGameConstants / buildCushionGeometry
// 原样执行，再用与游戏相同的圆-线段碰撞 + findPocketHole 判定做模拟。
// 用法：node verify_pockets.mjs <game.html> [...更多文件]
import fs from 'fs';

function grabFunction(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing function ' + name);
    let depth = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
    }
    throw new Error('unterminated ' + name);
}

function loadGeometry(file) {
    const src = fs.readFileSync(file, 'utf8');
    const consts = [...src.matchAll(/^\s*const (POCKET_[A-Z_]+|CUSHION_RESTITUTION) = ([^;]+);/gm)]
        .map(m => `const ${m[1]} = ${m[2]};`).join('\n');
    const code = `let SCALE, TABLE_INNER_LENGTH, TABLE_INNER_WIDTH, BORDER, TABLE_WIDTH, TABLE_HEIGHT,
        BALL_RADIUS, FRICTION, HOLE_RADIUS, BALL_DIAMETER, D_ZONE_RADIUS, CUSHION_WIDTH, RAIL_WIDTH,
        BAULK_LINE_X, D_ZONE_CENTER_X, D_ZONE_CENTER_Y, holes, cushionPieces = [], cushionSegments = [];
        let BLACK_SPOT, PINK_SPOT, BLUE_SPOT, BROWN_SPOT, GREEN_SPOT, YELLOW_SPOT, spots = {};
        ${consts}
        ${grabFunction(src, 'initGameConstants')}
        ${grabFunction(src, 'buildCushionGeometry')}
        initGameConstants();
        return { BALL_RADIUS, HOLE_RADIUS, CUSHION_WIDTH, RAIL_WIDTH, BORDER, TABLE_WIDTH, TABLE_HEIGHT,
                 TABLE_INNER_LENGTH, holes, cushionPieces, cushionSegments,
                 restitution: typeof CUSHION_RESTITUTION === 'number' ? CUSHION_RESTITUTION : 0.82 };`;
    return new Function(code)();
}

function verify(file) {
    const g = loadGeometry(file);
    const R = g.BALL_RADIUS, r = g.HOLE_RADIUS, c = g.CUSHION_WIDTH, e = g.restitution;
    const outer = g.BORDER - c;
    const problems = [];
    console.log(`\n=== ${file}`);
    console.log(`ball R=${R} hole r=${r} cushion=${c} rail=${g.RAIL_WIDTH} BORDER=${g.BORDER} canvas=${g.TABLE_WIDTH}x${g.TABLE_HEIGHT}`);

    // 1. 碰撞边：无零长 / NaN
    for (const s of g.cushionSegments) {
        const l = Math.hypot(s.bx - s.ax, s.by - s.ay);
        if (!(l > 1e-6)) problems.push('zero/NaN segment ' + JSON.stringify(s));
    }
    // 2. 每个洞到库边的最短距离应 >= r（库边不压洞），且 == r（相切，不留缝）
    for (const h of g.holes) {
        let best = Infinity;
        for (const s of g.cushionSegments) {
            const ex = s.bx - s.ax, ey = s.by - s.ay;
            const t = Math.max(0, Math.min(1, ((h.x - s.ax) * ex + (h.y - s.ay) * ey) / (ex * ex + ey * ey)));
            best = Math.min(best, Math.hypot(h.x - s.ax - ex * t, h.y - s.ay - ey * t));
        }
        if (best < r - 1e-6) problems.push(`cushion overlaps hole ${h.id || ''} (${h.x},${h.y}): ${best.toFixed(3)} < ${r}`);
        if (best > r + 0.5) problems.push(`gap between cushion and hole ${h.id || ''}: ${best.toFixed(3)}`);
    }
    console.log(`pieces ${g.cushionPieces.length}, segments ${g.cushionSegments.length}, holes ${g.holes.length}`);

    // ---- 模拟（与游戏 updatePhysics 相同的子步 + 碰撞 + 进袋判定）----
    const pocketed = b => {
        let best = Infinity;
        for (const h of g.holes) best = Math.min(best, Math.hypot(b.x - h.x, b.y - h.y));
        if (best < r) return true;
        return b.x < outer || b.x > g.TABLE_WIDTH - outer || b.y < outer || b.y > g.TABLE_HEIGHT - outer;
    };
    let worst = 0;
    const collide = b => {
        for (const s of g.cushionSegments) {
            const ex = s.bx - s.ax, ey = s.by - s.ay;
            const t = Math.max(0, Math.min(1, ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / (ex * ex + ey * ey)));
            const px = s.ax + ex * t, py = s.ay + ey * t, d = Math.hypot(b.x - px, b.y - py);
            if (d >= R || d < 1e-9) continue;
            const nx = (b.x - px) / d, ny = (b.y - py) / d;
            b.x = px + nx * R; b.y = py + ny * R;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
        }
        for (const s of g.cushionSegments) {
            const ex = s.bx - s.ax, ey = s.by - s.ay;
            const t = Math.max(0, Math.min(1, ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / (ex * ex + ey * ey)));
            worst = Math.max(worst, R - Math.hypot(b.x - s.ax - ex * t, b.y - s.ay - ey * t));
        }
    };
    const run = (x, y, ang, v, frames = 800) => {
        const b = { x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
        for (let f = 0; f < frames; f++) {
            const sp = Math.hypot(b.vx, b.vy);
            if (sp < 0.05) return false;
            const n = Math.max(1, Math.min(8, Math.ceil(sp / Math.max(R * 0.75, 1))));
            for (let i = 0; i < n; i++) {
                b.x += b.vx / n; b.y += b.vy / n;
                if (pocketed(b)) return true;
                collide(b);
            }
            b.vx *= 0.985; b.vy *= 0.985;
        }
        return false;
    };
    const width = (hole, travelAng, span = 40, N = 161) => {
        let ok = 0;
        for (let k = 0; k < N; k++) {
            const off = -span + 2 * span * k / (N - 1);
            const px = -Math.sin(travelAng), py = Math.cos(travelAng);
            const tx = hole.x + px * off, ty = hole.y + py * off;
            ok += run(tx - Math.cos(travelAng) * 90, ty - Math.sin(travelAng) * 90, travelAng, 4);
        }
        return ok * 2 * span / (N - 1);
    };
    const tl = g.holes[0], tm = g.holes[1];
    const d2r = d => d * Math.PI / 180;
    const mid = [90, 70, 55, 40].map(a => width(tm, -d2r(a)).toFixed(1));            // 向上打上中袋，a 为与库边夹角
    const corner = [45, 30, 20].map(a => width(tl, Math.PI + d2r(a)).toFixed(1));    // 向左上打左上角袋
    console.log(`effective mouth width (ball diameter = ${2 * R}):`);
    console.log(`  middle  90/70/55/40 deg: ${mid.join(' / ')}`);
    console.log(`  corner  45/30/20 deg:    ${corner.join(' / ')}`);

    // 从离右上角袋 120 处贴库出发（与台长无关；斯诺克台长，从中点出发会先停下）
    const railRollCorner = run(g.TABLE_WIDTH - g.BORDER - 120, g.BORDER + R + 0.01, 0, 3);
    const railRollPastMid = run(tm.x + 70, g.BORDER + R + 0.01, Math.PI, 1.3);
    console.log(`  rail roll into corner: ${railRollCorner ? 'pocketed' : 'NOT pocketed'}; rail roll past middle: ${railRollPastMid ? 'pocketed at far corner' : 'not pocketed'}`);
    if (!railRollCorner) problems.push('rail-rolling ball does not drop into corner pocket');

    // 随机 4000 杆穿模
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    worst = 0;
    for (let i = 0; i < 4000; i++) {
        const x = g.BORDER + R + rand() * (g.TABLE_WIDTH - 2 * (g.BORDER + R));
        const y = g.BORDER + R + rand() * (g.TABLE_HEIGHT - 2 * (g.BORDER + R));
        run(x, y, rand() * Math.PI * 2, 1 + rand() * 11);
    }
    console.log(`  4000 random shots: max residual penetration ${Math.max(0, worst).toFixed(4)}`);
    if (worst > 1e-6) problems.push('penetration ' + worst);

    console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'ALL CHECKS PASSED');
    return problems.length === 0;
}

const files = process.argv.slice(2);
let ok = true;
for (const f of files) ok = verify(f) && ok;
process.exit(ok ? 0 : 1);

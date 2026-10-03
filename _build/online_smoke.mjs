// 联网端到端冒烟（不打球）：起游戏自己的 server.js，开 2D 联网页 + 3D 联网页进同一房间。
// 检查：3D 页经服务器 /_vendor 路由加载 three.js、两端都连上、开局球位一致、
//       2D 端（先进房 = 玩家 1，开局由他摆白球）摆好白球并同步后，3D 端收到同一位置且本机无操作权。
// 用法：node online_smoke.mjs <game 目录，如 chinese_eight_ball/chinese_eight_ball-game> [port]
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const WebSocket = require('../chinese_eight_ball/chinese_eight_ball-game/node_modules/ws');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const gameDir = process.argv[2];
const PORT = Number(process.argv[3] || 3191);
const DEBUG_PORT = 9334;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isSnooker = gameDir.includes('snooker');

async function connectTarget(url) {
    const t = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise(r => ws.once('open', r));
    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push((d.exception && d.exception.description || d.text).split('\n')[0]);
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error'
            && !/favicon\.ico$/.test(msg.params.entry.url || '')) errors.push('log: ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    await send('Log.enable');
    const evaluate = async expr => {
        const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
        if (r.result.exceptionDetails) throw new Error(url + ': ' + r.result.exceptionDetails.exception.description);
        return r.result.result.value;
    };
    return { evaluate, errors, close: () => ws.close() };
}

async function main() {
    const server = spawn(process.execPath, ['server.js'], { cwd: path.join(ROOT, gameDir), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'online-smoke-'));
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1400,900',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`],
        { stdio: 'ignore' });
    const problems = [];
    try {
        for (let i = 0; i < 50; i++) {
            await sleep(200);
            try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); await fetch(`http://localhost:${PORT}/`); break; } catch { /* 还没起来 */ }
        }
        const vendor = await fetch(`http://localhost:${PORT}/_vendor/three@0.169.0/three.module.js`);
        console.log(`server /_vendor route: HTTP ${vendor.status}`);
        if (vendor.status !== 200) problems.push('/_vendor route not served');

        const room = 'smoke-' + Date.now();
        const A = await connectTarget(`http://localhost:${PORT}/game_2d_online.html?room=${room}`);
        const B = await connectTarget(`http://localhost:${PORT}/game_3d_online.html?room=${room}`);
        await sleep(3500);
        await A.evaluate("document.getElementById('connectBtn').click()");
        await sleep(1500);
        await B.evaluate("document.getElementById('connectBtn').click()");
        await sleep(3000);

        const stateA = isSnooker
            ? `JSON.stringify({ connected: onlineConnected, player: myPlayer, canControl: canControlCurrentTurn(), placing: isPlacingBall, white: whiteBall && [Math.round(whiteBall.x), Math.round(whiteBall.y)], n: balls.length })`
            : `JSON.stringify({ connected: isConnected, player: myPlayerNumber, canControl: isMyTurn, placing: isPlacingBall, white: whiteBall && [Math.round(whiteBall.x), Math.round(whiteBall.y)], n: balls.length })`;
        const stateB = `JSON.stringify((g => ({ connected: g.online && g.online.connected, player: g.online && g.online.player, canControl: g.canControl, placing: g.isPlacingBall, white: g.whiteBall && [g.whiteBall.x, g.whiteBall.y], n: g.ballCount }))(window.__game()))`;
        const a0 = JSON.parse(await A.evaluate(stateA));
        const b0 = JSON.parse(await B.evaluate(stateB));
        console.log('after join   2D:', JSON.stringify(a0));
        console.log('             3D:', JSON.stringify(b0));
        if (!a0.connected || !b0.connected) problems.push('a client failed to connect');
        if (a0.n !== b0.n) problems.push('ball counts differ');
        if (!a0.canControl || b0.canControl) problems.push('turn ownership wrong at start (2D should control, 3D should not)');

        // 2D 端摆白球（D 区内、离其它球足够远）并同步
        const place = isSnooker
            ? `(() => { whiteBall.x = D_ZONE_CENTER_X - 20; whiteBall.y = D_ZONE_CENTER_Y - 25; const ok = isValidBallPosition(whiteBall.x, whiteBall.y); isPlacingBall = false; gameStarted = true; broadcastState('ball-placement'); return ok; })()`
            : `(() => { whiteBall.x = BAULK_LINE_X - 40; whiteBall.y = TABLE_HEIGHT / 2 - 25; const ok = isValidBallPosition(whiteBall.x, whiteBall.y); isPlacingBall = false; gameStarted = true; sendGameStateToServer('ball-placement'); return ok; })()`;
        const valid = await A.evaluate(place);
        await sleep(1500);
        const a1 = JSON.parse(await A.evaluate(stateA));
        const b1 = JSON.parse(await B.evaluate(stateB));
        console.log('after place  2D:', JSON.stringify(a1), valid ? '' : '(placement spot invalid!)');
        console.log('             3D:', JSON.stringify(b1));
        if (!b1.white || a1.white[0] !== b1.white[0] || a1.white[1] !== b1.white[1]) problems.push('3D did not receive the cue-ball placement');
        if (b1.placing) problems.push('3D still in placing state after remote placement');
        if (b1.canControl) problems.push('3D gained control during opponent turn');

        for (const [label, c] of [['2D', A], ['3D', B]]) c.errors.forEach(e => problems.push(`${label} page error: ${e}`));
        A.close(); B.close();
    } finally {
        chrome.kill();
        server.kill();
    }
    console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'ONLINE CHECK PASSED');
    process.exit(problems.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });

// 页面初始化冒烟测试（只确认页面能加载、无未捕获异常、关键对象已建好；不跑游戏流程）。
// 通过 Chrome DevTools Protocol 驱动无头 Chrome，WebSocket 客户端借用游戏目录里已安装的 ws 包。
// 前置：仓库根目录起静态服务器，如 `py -m http.server 8137`
// 用法：node smoke.mjs <相对仓库根的页面路径> [...]   环境变量 PORT（默认 8137）
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const WebSocket = require('../chinese_eight_ball/chinese_eight_ball-game/node_modules/ws');

const PORT = process.env.PORT || 8137;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const DEBUG_PORT = 9333;

// 在页面里执行的探针：返回一份摘要，不改游戏状态
const PROBE = `(() => {
    const out = { title: document.title };
    const g = typeof window.__game === 'function' ? window.__game() : null;
    if (g) out.game = { ballCount: g.ballCount, phase: g.phase, placing: g.isPlacingBall };
    const cv = document.querySelector('#table3d canvas') || document.getElementById('table');
    if (cv) out.canvas = { w: cv.width, h: cv.height, tag: cv.parentElement && cv.parentElement.id };
    if (cv && cv.id === 'table') {
        // 2D：采样袋口与台面中心像素，确认真的画出来了
        const ctx = cv.getContext('2d');
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        out.pixels = { center: px(cv.width / 2 | 0, cv.height / 2 | 0) };
    }
    return JSON.stringify(out);
})()`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main(pages) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1600,1000', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
        { stdio: 'ignore' });
    let target;
    for (let i = 0; i < 50 && !target; i++) {
        await sleep(200);
        try {
            const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
            target = list.find(t => t.type === 'page');
        } catch { /* chrome 还没起来 */ }
    }
    if (!target) throw new Error('chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.once('open', r));
    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            errors.push((d.exception && d.exception.description || d.text).split('\n')[0] + ` @${d.lineNumber}`);
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
            const { text: t, url = '' } = msg.params.entry;
            if (!/WebSocket|ERR_CONNECTION_REFUSED/.test(t) && !/favicon\.ico$/.test(url)) errors.push('log: ' + t + ' ' + url);
        }
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    let allOk = true;
    for (const p of pages) {
        errors.length = 0;
        await send('Page.navigate', { url: `http://localhost:${PORT}/${p}` });
        await sleep(3500);
        const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
        const summary = res.result && res.result.result && res.result.result.value;
        if (process.env.SHOT) {   // 可选：把画布存成 PNG（2D 取 #table，3D 取 WebGL 画布）
            const shot = await send('Runtime.evaluate', { returnByValue: true, expression:
                `(document.querySelector('#table3d canvas') || document.getElementById('table')).toDataURL('image/png')` });
            const url = shot.result && shot.result.result && shot.result.result.value;
            if (url) {
                const file = path.join(process.env.SHOT, p.replace(/[\/]/g, '_').replace(/\.html$/, '.png'));
                fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
            }
        }
        let placeNote = '';
        if (process.env.PLACE && /game_3d.html$/.test(p)) {   // 只测单机 3D；联网页未连接时点击会被正确拦下
            // 点击链路检查（不跑游戏流程）：在 3D 画布上按网格发真实鼠标点击，直到游戏报告白球已摆好。
            // 验证 射线求台面点 → handleTableClick（游戏自己的摆球逻辑）这条管线是通的
            const rectRes = await send('Runtime.evaluate', { returnByValue: true, expression:
                `JSON.stringify(document.querySelector('#table3d canvas').getBoundingClientRect())` });
            const rc = JSON.parse(rectRes.result.result.value);
            const placing = async () => (await send('Runtime.evaluate', { returnByValue: true,
                expression: 'window.__game().isPlacingBall' })).result.result.value;
            let placed = null;
            outer: for (let iy = 6; iy <= 14; iy++) {
                for (let ix = 1; ix <= 27; ix++) {
                    const x = rc.left + rc.width * ix / 28, y = rc.top + rc.height * iy / 20;
                    for (const type of ['mousePressed', 'mouseReleased']) {
                        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
                    }
                    await sleep(60);
                    if (!(await placing())) { placed = [Math.round(x), Math.round(y)]; break outer; }
                }
            }
            const wb = (await send('Runtime.evaluate', { returnByValue: true,
                expression: 'JSON.stringify(window.__game().whiteBall)' })).result.result.value;
            placeNote = placed ? `placed by click at ${placed} -> white ${wb}` : 'NOT PLACED by any click';
            if (!placed) errors.push('click-to-place failed');
        }
        const ok = errors.length === 0 && !!summary;
        if (placeNote) console.log('     ' + placeNote);
        allOk = allOk && ok;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${p}\n     ${summary}`);
        errors.forEach(e => console.log('     ERROR ' + e));
    }
    ws.close();
    chrome.kill();
    process.exit(allOk ? 0 : 1);
}

main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });

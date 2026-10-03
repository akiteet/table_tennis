        // ==================== 3D 渲染层（Three.js） ====================
        // 坐标映射：逻辑 2D (x, y) → 世界 (worldX, worldZ)，台面位于 XZ 平面，Y 向上
        let renderer, scene, camera, orbitControls;
        let ballMeshMap;
        let cueYawGroup, cuePitchGroup;
        let guideMainLine, guideWhiteLine, guideTargetLine, guideHitMarker;
        let placementRing, dZoneMesh;
        let raycaster, tablePlane;
        let camTarget;
        let cameraMode = 'orbit';
        let cameraAnim = null;
        let cueStrikeAnim = null;
        let pocketAnimations = [];
        let callShotOverlay = null;   // 美式八球叫袋标记（其它游戏为 null）
        let canvasAiming = false;
        const tmpAxis = new THREE.Vector3();
        const tmpDir = new THREE.Vector3();

        // 各游戏的差异（配色、台面标线、球的画法、点选交互）由 build_3d.py 注入的 GAME_3D 配置提供。
        // 镜头 / 地板等尺度按台长缩放：中式八球 / 美式台内沿长 508 为基准 1，斯诺克 714 ≈ 1.4
        function viewScale() { return TABLE_INNER_LENGTH / 508; }

        // 联网版轮到对手时本机不显示球杆 / 引导线、不能拖动瞄准（与各自 2D 联网版一致）：
        // 美式台三款用 isMyTurn；斯诺克用 canControlCurrentTurn()（未连接时不限制）；单机版两者都没有，恒为 true
        function canControlLocally() {
            if (typeof isMyTurn !== 'undefined') return isMyTurn;
            if (typeof canControlCurrentTurn === 'function') return !onlineConnected || canControlCurrentTurn();
            return true;
        }

        function toWorldX(x) { return x - TABLE_WIDTH / 2; }
        function toWorldZ(y) { return y - TABLE_HEIGHT / 2; }
        function toLogicX(wx) { return wx + TABLE_WIDTH / 2; }
        function toLogicY(wz) { return wz + TABLE_HEIGHT / 2; }

        // 球 → 网格的稳定键：快照恢复 / 回放 / 复位都会重建球对象，键必须取自数据。
        // 美式台球有编号；斯诺克没有编号：彩球按颜色，15 颗红球按开局摆放位置（defaultX/Y 在各种复制中都保留）
        function ballKey(ball) {
            if (ball.type === 'white') return 'white';
            if (ball.number !== undefined) return 'n' + ball.number;
            if (ball.type === 'red') return 'r' + Math.round(ball.defaultX * 100) + ',' + Math.round(ball.defaultY * 100);
            return 'c' + ball.color;
        }

        function init3DScene() {
            const container = document.getElementById('table3d');
            renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            container.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x11151a);

            camera = new THREE.PerspectiveCamera(48, 1, 1, 4000);
            camera.position.set(0, 320 * viewScale(), 305 * viewScale());
            camera.lookAt(0, 0, 0);

            scene.add(new THREE.AmbientLight(0xdfe6f0, 0.5));
            // 台面上方等距吊灯：约每 254（半张美式台）一盏 —— 美式台 2 盏（±L/4，与原先一致），斯诺克 3 盏
            const lampCount = Math.max(2, Math.round(TABLE_INNER_LENGTH / 254));
            const lampXs = Array.from({ length: lampCount }, (_, i) => TABLE_INNER_LENGTH * ((i + 0.5) / lampCount - 0.5));
            for (const sx of lampXs) {
                const spot = new THREE.SpotLight(0xfff3da, 2.6, 0, Math.PI / 3.6, 0.55, 0);
                spot.position.set(sx, 210, 0);
                spot.target.position.set(sx, 0, 0);
                spot.castShadow = true;
                spot.shadow.mapSize.set(2048, 2048);
                spot.shadow.camera.near = 60;
                spot.shadow.camera.far = 560 * viewScale();
                spot.shadow.bias = -0.0006;
                scene.add(spot);
                scene.add(spot.target);
            }
            const fillLight = new THREE.DirectionalLight(0xcfd8e8, 0.35);
            fillLight.position.set(-160, 180, 140);
            scene.add(fillLight);

            buildFloor();
            buildTable();
            buildBalls();
            buildCue();
            buildGuides();
            buildPlacementHelpers();
            buildCallShotOverlay();

            raycaster = new THREE.Raycaster();
            tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

            orbitControls = new OrbitControls(camera, renderer.domElement);
            orbitControls.enableDamping = true;
            orbitControls.dampingFactor = 0.08;
            orbitControls.maxPolarAngle = Math.PI * 0.495;
            orbitControls.minDistance = 60;
            orbitControls.maxDistance = 1100 * viewScale();
            camTarget = orbitControls.target;
            camTarget.set(0, 0, 0);

            init3DResize(container);
            initCanvasAiming(container);
            setCameraMode('orbit', true);
        }

        function buildFloor() {
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(1600 * viewScale(), 1000 * viewScale()),
                new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.95 })
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -89;
            floor.receiveShadow = true;
            scene.add(floor);
        }

        function buildTable() {
            const table = new THREE.Group();

            const clothMat = new THREE.MeshStandardMaterial({ color: GAME_3D.cloth, roughness: 0.95, metalness: 0 });
            const cushionMat = new THREE.MeshStandardMaterial({ color: GAME_3D.cushion, roughness: 0.7 });
            const woodMat = new THREE.MeshStandardMaterial({ color: GAME_3D.wood, roughness: 0.55, metalness: 0.05 });
            const woodDarkMat = new THREE.MeshStandardMaterial({ color: GAME_3D.woodDark, roughness: 0.6 });
            const pocketMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
            const wellMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide });

            // 几何全部取自逻辑层：holes（洞心）、cushionPieces（库边平面形状）、CUSHION_WIDTH / RAIL_WIDTH，
            // 与 2D 绘制和物理碰撞同源
            const c = CUSHION_WIDTH, r = HOLE_RADIUS, railW = RAIL_3D_WIDTH;
            const noseH = 6.5;          // 库边鼻子高 ≈ 0.65 × 球径：碰点在球心上方一点，与真台一致
            const railH = 8;            // 木框顶面 = 库边背面高度；库边顶面从鼻子斜升到这里
            const bedDepth = 9;
            const L = BORDER, R = TABLE_WIDTH - BORDER, T = BORDER, B = TABLE_HEIGHT - BORDER;
            const midX = BORDER + TABLE_INNER_LENGTH / 2;
            const PI = Math.PI;

            // 平面形状用 shape (x, y) = (worldX, -worldZ)，挤出后 rotateX(-π/2)：挤出方向变成 +Y，y 还原成 worldZ
            const toShape = (path, pts) => {
                path.moveTo(toWorldX(pts[0].x), -toWorldZ(pts[0].y));
                for (let i = 1; i < pts.length; i++) path.lineTo(toWorldX(pts[i].x), -toWorldZ(pts[i].y));
                return path;
            };
            const extrude = (shape, height, y0) => {
                const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 });
                geo.rotateX(-PI / 2);
                geo.translate(0, y0, 0);
                return geo;
            };
            const arc = (cx, cy, rad, a0, a1, n = 24) => {
                const pts = [];
                for (let i = 0; i <= n; i++) {
                    const a = a0 + (a1 - a0) * i / n;
                    pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
                }
                return pts;
            };
            const addMesh = (geo, mat) => {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                table.add(mesh);
                return mesh;
            };

            // 绿呢：铺满库边外沿围成的矩形（库边就坐在它上面），6 个洞在轮廓上直接让出去——
            // 角袋绕洞圆朝台面的 3/4 圆弧、中袋绕洞圆朝台面的半圆
            const bedOutline = [
                ...arc(L, T, r, -PI / 2, PI),
                ...arc(L, B, r, PI, PI * 5 / 2),
                ...arc(midX, B + c, r, PI, PI * 2),
                ...arc(R, B, r, PI / 2, PI * 2),
                ...arc(R, T, r, 0, PI * 3 / 2),
                ...arc(midX, T - c, r, 0, PI)
            ];
            const bed = new THREE.Mesh(extrude(toShape(new THREE.Shape(), bedOutline), bedDepth, -bedDepth), clothMat);
            bed.receiveShadow = true;
            table.add(bed);

            // 木框（含四角袋口外侧那块）：外轮廓圆角矩形，内轮廓沿库边外沿走，
            // 中袋处向外让出洞圆的外半圆、角袋处沿洞圆朝木框的 1/4 圆弧。向下伸到台体底板，侧面不露缝。
            // 3D 木框用真实宽度 RAIL_3D_WIDTH，从库边外沿往外量（2D 画布只画窄框，不决定 3D 外轮廓）
            const ox0 = toWorldX(L - c - railW), ox1 = toWorldX(R + c + railW);
            const oz0 = -toWorldZ(T - c - railW), oz1 = -toWorldZ(B + c + railW);
            const railShape = new THREE.Shape();
            railShape.moveTo(ox0 + railW, oz0);
            railShape.lineTo(ox1 - railW, oz0);
            railShape.absarc(ox1 - railW, oz0 - railW, railW, PI / 2, 0, true);
            railShape.lineTo(ox1, oz1 + railW);
            railShape.absarc(ox1 - railW, oz1 + railW, railW, 0, -PI / 2, true);
            railShape.lineTo(ox0 + railW, oz1);
            railShape.absarc(ox0 + railW, oz1 + railW, railW, -PI / 2, -PI, true);
            railShape.lineTo(ox0, oz0 - railW);
            railShape.absarc(ox0 + railW, oz0 - railW, railW, PI, PI / 2, true);
            const railInner = [
                ...arc(L, T, r, -PI / 2, -PI),
                ...arc(L, B, r, PI, PI / 2),
                ...arc(midX, B + c, r, PI, 0),
                ...arc(R, B, r, PI / 2, 0),
                ...arc(R, T, r, 0, -PI / 2),
                ...arc(midX, T - c, r, 0, -PI)
            ];
            railShape.holes.push(toShape(new THREE.Path(), railInner));
            addMesh(extrude(railShape, railH + bedDepth, -bedDepth), woodMat);

            // 库边：cushionPieces 的平面形状挤出，顶面从鼻子（noseH）斜升到背面（railH），鼻子面竖直
            cushionPieces.forEach(({ pts, axis, nose, out }) => {
                const geo = extrude(toShape(new THREE.Shape(), pts), 1, 0);
                const pos = geo.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    if (pos.getY(i) < 0.5) continue;
                    const lx = toLogicX(pos.getX(i)), ly = toLogicY(pos.getZ(i));
                    const depth = Math.max(0, Math.min(c, ((axis === 'y' ? ly : lx) - nose) * out));
                    pos.setY(i, noseH + (railH - noseH) * depth / c);
                }
                geo.computeVertexNormals();
                addMesh(geo, cushionMat);
            });

            // 袋口：黑井（井壁略收进洞圆，避免与绿呢/木框的切口面重叠闪烁）+ 井底
            const wellBottom = -bedDepth + 0.1;
            holes.forEach(h => {
                const wx = toWorldX(h.x), wz = toWorldZ(h.y);
                const wall = new THREE.Mesh(
                    new THREE.CylinderGeometry(r - 0.1, r - 0.1, -wellBottom, 40, 1, true),
                    wellMat
                );
                wall.position.set(wx, wellBottom / 2, wz);
                table.add(wall);
                const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 40), pocketMat);
                floor.rotation.x = -PI / 2;
                floor.position.set(wx, wellBottom, wz);
                table.add(floor);
            });

            // 台体底板 + 桌腿
            const base = new THREE.Mesh(new THREE.BoxGeometry(ox1 - ox0, 10, oz0 - oz1), woodDarkMat);
            base.position.y = -bedDepth - 5;
            base.receiveShadow = true;
            base.castShadow = true;
            table.add(base);
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    const leg = new THREE.Mesh(new THREE.BoxGeometry(16, 70, 16), woodDarkMat);
                    leg.position.set(sx * (TABLE_INNER_LENGTH / 2 - 10), -54, sz * (TABLE_INNER_WIDTH / 2 - 10));
                    leg.castShadow = true;
                    table.add(leg);
                }
            }

            // 开球线；美式台加一个置球点，斯诺克加 D 区半圆弧与 6 个彩球置球点
            const baulkLine = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.12, TABLE_INNER_WIDTH),
                new THREE.MeshBasicMaterial({ color: 0xcfe8d5, transparent: true, opacity: 0.55 })
            );
            baulkLine.position.set(toWorldX(BAULK_LINE_X), 0.12, 0);
            table.add(baulkLine);

            const markMat = new THREE.MeshBasicMaterial({ color: 0xd8e6da, transparent: true, opacity: 0.5 });
            const addSpot = (lx, ly) => {
                const spot = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), markMat);
                spot.rotation.x = -PI / 2;
                spot.position.set(toWorldX(lx), 0.13, toWorldZ(ly));
                table.add(spot);
            };
            if (GAME_3D.markings === 'snooker') {
                // D 区：以开球线中点为心、朝开球端（-x）的半圆
                const dArc = new THREE.Mesh(
                    new THREE.RingGeometry(D_ZONE_RADIUS - 0.35, D_ZONE_RADIUS + 0.35, 64, 1, PI / 2, PI),
                    new THREE.MeshBasicMaterial({ color: 0xcfe8d5, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
                );
                dArc.rotation.x = -PI / 2;
                dArc.position.set(toWorldX(D_ZONE_CENTER_X), 0.12, toWorldZ(D_ZONE_CENTER_Y));
                table.add(dArc);
                COLOR_BALLS_DEF.forEach(def => addSpot(def.defaultX, def.defaultY));
            } else {
                addSpot(BORDER + TABLE_INNER_LENGTH * 0.75, TABLE_HEIGHT / 2);
            }

            scene.add(table);
        }

        function makeBallTexture(ball) {
            const w = 512, h = 256;
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const g = c.getContext('2d');
            if (ball.type !== 'white' && ball.number === undefined) {
                // 斯诺克：纯色球、无号码（黑球与 2D 一样提亮一点，免得在暗处看不见）
                g.fillStyle = ball.color === '#111111' ? '#222222' : ball.color;
                g.fillRect(0, 0, w, h);
                const plain = new THREE.CanvasTexture(c);
                plain.colorSpace = THREE.SRGBColorSpace;
                return plain;
            }
            const number = ball.type === 'white' ? 0 : ball.number;
            const baseColor = number > 0 ? BALL_COLORS[number] : '#fdfdf8';

            if (number >= 9 && number <= 15) {
                g.fillStyle = '#f6f5ee';
                g.fillRect(0, 0, w, h);
                g.fillStyle = baseColor;
                g.fillRect(0, h * 0.30, w, h * 0.40);
            } else {
                g.fillStyle = baseColor;
                g.fillRect(0, 0, w, h);
            }

            if (number > 0) {
                for (const cx of [w * 0.25, w * 0.75]) {
                    const cy = h * 0.5;
                    g.fillStyle = '#f8f7f0';
                    g.beginPath();
                    g.arc(cx, cy, 30, 0, Math.PI * 2);
                    g.fill();
                    g.strokeStyle = 'rgba(0,0,0,0.55)';
                    g.lineWidth = 2;
                    g.stroke();
                    g.fillStyle = '#111';
                    g.font = 'bold 34px "Segoe UI", Arial, sans-serif';
                    g.textAlign = 'center';
                    g.textBaseline = 'middle';
                    g.fillText(String(number), cx, cy + 2);
                }
            }

            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            return tex;
        }

        function buildBalls() {
            ballMeshMap = new Map();
            for (const ball of balls) createBallMesh(ball);
        }

        function createBallMesh(ball) {
            const key = ballKey(ball);
            let mesh = ballMeshMap.get(key);
            if (mesh) return mesh;
            const mat = new THREE.MeshStandardMaterial({ map: makeBallTexture(ball), roughness: 0.17, metalness: 0.03 });
            mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 48, 32), mat);
            mesh.castShadow = true;
            mesh.position.set(toWorldX(ball.x), BALL_RADIUS, toWorldZ(ball.y));
            mesh.userData.lx = ball.x;
            mesh.userData.ly = ball.y;
            scene.add(mesh);
            ballMeshMap.set(key, mesh);
            return mesh;
        }

        function buildCue() {
            cueYawGroup = new THREE.Group();
            cuePitchGroup = new THREE.Group();
            cueYawGroup.add(cuePitchGroup);

            const shaftLen = 150;
            const shaft = new THREE.Mesh(
                new THREE.CylinderGeometry(1.0, 2.4, shaftLen, 14),
                new THREE.MeshStandardMaterial({ color: 0xc89a5e, roughness: 0.45 })
            );
            // +Y（细端）转到 -X：细端/皮头朝白球，杆尾朝后
            shaft.rotation.z = Math.PI / 2;
            shaft.castShadow = true;
            cuePitchGroup.add(shaft);

            const tip = new THREE.Mesh(
                new THREE.CylinderGeometry(1.0, 1.0, 1.6, 12),
                new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.7 })
            );
            tip.rotation.z = Math.PI / 2;
            tip.position.x = -shaftLen / 2 - 0.8;
            cuePitchGroup.add(tip);

            cuePitchGroup.userData.shaftLen = shaftLen;
            cueYawGroup.visible = false;
            scene.add(cueYawGroup);
        }

        function positionCueStick(angle, gap) {
            const shaftLen = cuePitchGroup.userData.shaftLen;
            cueYawGroup.position.set(toWorldX(whiteBall.x), BALL_RADIUS + 1.5, toWorldZ(whiteBall.y));
            cueYawGroup.rotation.y = Math.PI - angle;
            cuePitchGroup.rotation.z = cueSpinY * 0.12;
            cuePitchGroup.position.x = gap + shaftLen / 2;
        }

        function startCueStrikeAnim(angle, power) {
            cueStrikeAnim = {
                t0: performance.now(),
                duration: 90,
                angle,
                pull: 8 + Math.max(0, Math.min(100, power)) * 0.32
            };
        }

        function updateCueStick(now) {
            if (!cueYawGroup) return;
            if (cueStrikeAnim) {
                const t = (now - cueStrikeAnim.t0) / cueStrikeAnim.duration;
                if (t >= 1) {
                    cueStrikeAnim = null;
                    cueYawGroup.visible = false;
                    return;
                }
                const e = t * t;
                const gap = BALL_RADIUS + 5 + cueStrikeAnim.pull * (1 - e);
                positionCueStick(cueStrikeAnim.angle, gap);
                cueYawGroup.visible = true;
                return;
            }
            const showAim = canControlLocally() && !isTableInMotion() && gameStarted && !isPlacingBall && !isReplaying && !!whiteBall;
            cueYawGroup.visible = showAim;
            if (!showAim) return;
            positionCueStick(cueAngle, BALL_RADIUS + 13 + cuePower * 0.18);
        }

        function buildGuides() {
            guideMainLine = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 3.4, gapSize: 2.2, transparent: true, opacity: 0.92 })
            );
            guideMainLine.frustumCulled = false;
            guideWhiteLine = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({ color: 0xbcc8ff, transparent: true, opacity: 0.75 })
            );
            guideWhiteLine.frustumCulled = false;
            guideTargetLine = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.9 })
            );
            guideTargetLine.frustumCulled = false;
            guideHitMarker = new THREE.Mesh(
                new THREE.SphereGeometry(2.2, 16, 12),
                new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.95 })
            );
            guideMainLine.visible = false;
            guideWhiteLine.visible = false;
            guideTargetLine.visible = false;
            guideHitMarker.visible = false;
            scene.add(guideMainLine, guideWhiteLine, guideTargetLine, guideHitMarker);
        }

        function setLinePoints(line, points) {
            line.geometry.dispose();
            line.geometry = new THREE.BufferGeometry().setFromPoints(points);
        }

        function predictGuideCollision(startX, startY, vx, vy, targetX, targetY) {
            const speed = Math.hypot(vx, vy);
            if (speed < 0.01) return null;

            const ux = vx / speed;
            const uy = vy / speed;
            const relX = targetX - startX;
            const relY = targetY - startY;
            const projection = relX * ux + relY * uy;
            if (projection <= 0) return null;

            const collisionDistance = BALL_RADIUS * 2;
            const perpendicularSq = relX * relX + relY * relY - projection * projection;
            const collisionDistanceSq = collisionDistance * collisionDistance;
            if (perpendicularSq >= collisionDistanceSq) return null;

            const distance = projection - Math.sqrt(collisionDistanceSq - perpendicularSq);
            if (distance < 0) return null;

            const x = startX + ux * distance;
            const y = startY + uy * distance;
            const normalLength = Math.hypot(targetX - x, targetY - y);
            if (normalLength < 0.001) return null;

            return {
                distance,
                x,
                y,
                nx: (targetX - x) / normalLength,
                ny: (targetY - y) / normalLength
            };
        }

        function updateGuides() {
            const show = canControlLocally() && guideMode !== 'off' && !isTableInMotion() && !!whiteBall && gameStarted && !isReplaying;
            guideMainLine.visible = false;
            guideWhiteLine.visible = false;
            guideTargetLine.visible = false;
            guideHitMarker.visible = false;
            if (!show) return;

            const speed = Math.max(getShotSpeed(cuePower), 0.5);
            const whiteVx = Math.cos(cueAngle) * speed;
            const whiteVy = Math.sin(cueAngle) * speed;
            const maxLength = guideMode === 'long' ? 1500 : 350;

            let closestBall = null;
            let closestCollision = null;
            let minDist = Infinity;
            for (const ball of balls) {
                if (ball.type === 'white') continue;
                const collision = predictGuideCollision(whiteBall.x, whiteBall.y, whiteVx, whiteVy, ball.x, ball.y);
                if (collision && collision.distance < minDist) {
                    minDist = collision.distance;
                    closestBall = ball;
                    closestCollision = collision;
                }
            }

            let endX, endY;
            if (closestCollision) {
                endX = closestCollision.x;
                endY = closestCollision.y;
            } else {
                endX = whiteBall.x + whiteVx * (maxLength / speed);
                endY = whiteBall.y + whiteVy * (maxLength / speed);
            }

            const GUIDE_Y = BALL_RADIUS;
            // 线从球体边缘外起画，避免被白球自身遮挡
            const startOffset = BALL_RADIUS + 1;
            const dirLen = Math.hypot(whiteVx, whiteVy);
            const dirUx = whiteVx / dirLen;
            const dirUy = whiteVy / dirLen;
            setLinePoints(guideMainLine, [
                new THREE.Vector3(toWorldX(whiteBall.x + dirUx * startOffset), GUIDE_Y, toWorldZ(whiteBall.y + dirUy * startOffset)),
                new THREE.Vector3(toWorldX(endX), GUIDE_Y, toWorldZ(endY))
            ]);
            guideMainLine.computeLineDistances();
            guideMainLine.visible = true;

            if (closestBall && closestCollision) {
                const { x: hitX, y: hitY, nx, ny } = closestCollision;
                const dvn = whiteVx * nx + whiteVy * ny;
                const whiteAfterVx = whiteVx - dvn * nx;
                const whiteAfterVy = whiteVy - dvn * ny;
                const ballVx = dvn * nx;
                const ballVy = dvn * ny;
                const previewScale = maxLength / speed * 0.5;

                const sepLen = Math.hypot(whiteAfterVx, whiteAfterVy);
                const sepUx = sepLen ? whiteAfterVx / sepLen : 0;
                const sepUy = sepLen ? whiteAfterVy / sepLen : 0;
                const tgtLen = Math.hypot(ballVx, ballVy);
                const tgtUx = tgtLen ? ballVx / tgtLen : 0;
                const tgtUy = tgtLen ? ballVy / tgtLen : 0;

                setLinePoints(guideWhiteLine, [
                    new THREE.Vector3(toWorldX(hitX + sepUx * startOffset), GUIDE_Y, toWorldZ(hitY + sepUy * startOffset)),
                    new THREE.Vector3(toWorldX(hitX + whiteAfterVx * previewScale), GUIDE_Y, toWorldZ(hitY + whiteAfterVy * previewScale))
                ]);
                setLinePoints(guideTargetLine, [
                    new THREE.Vector3(toWorldX(closestBall.x + tgtUx * startOffset), GUIDE_Y, toWorldZ(closestBall.y + tgtUy * startOffset)),
                    new THREE.Vector3(toWorldX(closestBall.x + ballVx * previewScale), GUIDE_Y, toWorldZ(closestBall.y + ballVy * previewScale))
                ]);
                guideHitMarker.position.set(toWorldX(hitX), BALL_RADIUS, toWorldZ(hitY));
                guideWhiteLine.visible = true;
                guideTargetLine.visible = true;
                guideHitMarker.visible = true;
            }
        }

        function buildPlacementHelpers() {
            // 摆白球区域：美式台为开球线后的整块矩形；斯诺克为 D 区半圆
            const zoneMat = new THREE.MeshBasicMaterial({ color: 0x50b4ff, transparent: true, opacity: GAME_3D.dZone === 'semicircle' ? 0.22 : 0.1, side: THREE.DoubleSide, depthWrite: false });
            if (GAME_3D.dZone === 'semicircle') {
                dZoneMesh = new THREE.Mesh(new THREE.CircleGeometry(D_ZONE_RADIUS, 48, Math.PI / 2, Math.PI), zoneMat);
                dZoneMesh.position.set(toWorldX(D_ZONE_CENTER_X), 0.35, toWorldZ(D_ZONE_CENTER_Y));
            } else {
                dZoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(BAULK_LINE_X - BORDER, TABLE_INNER_WIDTH), zoneMat);
                dZoneMesh.position.set((toWorldX(BORDER) + toWorldX(BAULK_LINE_X)) / 2, 0.35, 0);
            }
            dZoneMesh.rotation.x = -Math.PI / 2;
            dZoneMesh.visible = false;
            scene.add(dZoneMesh);

            placementRing = new THREE.Mesh(
                new THREE.RingGeometry(BALL_RADIUS + 3, BALL_RADIUS + 5.2, 40),
                new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
            );
            placementRing.rotation.x = -Math.PI / 2;
            placementRing.visible = false;
            scene.add(placementRing);
        }

        function updatePlacementHelpers() {
            const show = isPlacingBall && !isReplaying;
            dZoneMesh.visible = show;
            placementRing.visible = show && !!whiteBall;
            if (!(show && whiteBall)) return;
            // 自由摆球（美式台犯规后的 ball in hand）用全台判定；斯诺克没有 isValidAnyPosition，只在 D 区摆球
            const anyPos = freeBallMode && typeof isValidAnyPosition === 'function';
            const isValid = anyPos ? isValidAnyPosition(whiteBall.x, whiteBall.y) : isValidBallPosition(whiteBall.x, whiteBall.y);
            placementRing.material.color.setHex(isValid ? 0x00ff66 : 0xff3322);
            placementRing.position.set(toWorldX(whiteBall.x), BALL_RADIUS, toWorldZ(whiteBall.y));
        }

        // 叫袋标记，对应 2D 的 drawCallShotOverlay：可报目标球脚下细环（已报的更亮更粗）、6 个袋口标记环
        // （已报袋口更亮）、球与袋都选定后画虚线。只有存在叫袋规则（isCallShotRequired）的游戏才创建
        function buildCallShotOverlay() {
            if (typeof isCallShotRequired !== 'function') return;
            const gold = 0xeed4a0;
            const flatMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
            const flat = (geo, mat) => {
                const m = new THREE.Mesh(geo, mat);
                m.rotation.x = -Math.PI / 2;
                m.visible = false;
                scene.add(m);
                return m;
            };
            const ringGeo = new THREE.RingGeometry(BALL_RADIUS + 1.6, BALL_RADIUS + 2.4, 40);
            const calledRingGeo = new THREE.RingGeometry(BALL_RADIUS + 2.4, BALL_RADIUS + 3.6, 40);
            const ringMat = flatMat(0xffffff, 0.16), calledMat = flatMat(gold, 0.72);
            callShotOverlay = {
                ballRings: Array.from({ length: 16 }, () => flat(ringGeo, ringMat)),
                calledRing: flat(calledRingGeo, calledMat),
                pockets: holes.map(() => flat(new THREE.RingGeometry(HOLE_RADIUS * 0.3, HOLE_RADIUS * 0.38, 32), flatMat(0xffffff, 0.14))),
                calledPocket: flat(new THREE.RingGeometry(HOLE_RADIUS * 0.42, HOLE_RADIUS * 0.52, 32), calledMat),
                line: new THREE.Line(new THREE.BufferGeometry(),
                    new THREE.LineDashedMaterial({ color: gold, dashSize: 2.5, gapSize: 4, transparent: true, opacity: 0.38 }))
            };
            callShotOverlay.line.visible = false;
            callShotOverlay.line.frustumCulled = false;
            scene.add(callShotOverlay.line);
        }

        function updateCallShotOverlay() {
            if (!callShotOverlay) return;
            const o = callShotOverlay;
            const show = !isReplaying && gameStarted && !isPlacingBall && !isTableInMotion() && isCallShotRequired();
            o.ballRings.forEach(m => { m.visible = false; });
            o.pockets.forEach(m => { m.visible = false; });
            o.calledRing.visible = o.calledPocket.visible = o.line.visible = false;
            if (!show) return;
            const legal = getLegalTargetNumbers(currentPlayer);
            let i = 0, calledBall = null;
            for (const ball of balls) {
                if (ball.type !== 'numbered' || !legal.includes(ball.number)) continue;
                const isCalled = ball.number === calledBallNumber;
                if (isCalled) calledBall = ball;
                const m = isCalled ? o.calledRing : o.ballRings[i++];
                if (!m) continue;
                m.position.set(toWorldX(ball.x), 0.4, toWorldZ(ball.y));
                m.visible = true;
            }
            let calledHole = null;
            holes.forEach((h, k) => {
                const isCalled = h.id === calledPocketId;
                if (isCalled) calledHole = h;
                const m = isCalled ? o.calledPocket : o.pockets[k];
                m.position.set(toWorldX(h.x), 0.45, toWorldZ(h.y));
                m.visible = true;
            });
            if (calledBall && calledHole) {
                setLinePoints(o.line, [
                    new THREE.Vector3(toWorldX(calledBall.x), 0.5, toWorldZ(calledBall.y)),
                    new THREE.Vector3(toWorldX(calledHole.x), 0.5, toWorldZ(calledHole.y))
                ]);
                o.line.computeLineDistances();
                o.line.visible = true;
            }
        }

        function startPocketAnimation(ball, hole) {
            const key = ballKey(ball);
            const mesh = ballMeshMap.get(key);
            if (mesh) addPocketAnimation(key, mesh, ball.x, ball.y, hole);
        }

        function addPocketAnimation(key, mesh, lx, ly, hole) {
            pocketAnimations.push({
                key,
                mesh,
                fromX: toWorldX(lx),
                fromZ: toWorldZ(ly),
                toX: toWorldX(hole.x),
                toZ: toWorldZ(hole.y),
                t0: performance.now(),
                duration: 450
            });
        }

        function updatePocketAnimations(now) {
            for (let i = pocketAnimations.length - 1; i >= 0; i--) {
                const a = pocketAnimations[i];
                const alive = balls.some(b => ballKey(b) === a.key);
                if (alive) {
                    a.mesh.scale.setScalar(1);
                    pocketAnimations.splice(i, 1);
                    continue;
                }
                const t = Math.min(1, (now - a.t0) / a.duration);
                const e = t * t;
                a.mesh.position.x = a.fromX + (a.toX - a.fromX) * e;
                a.mesh.position.z = a.fromZ + (a.toZ - a.fromZ) * e;
                a.mesh.position.y = BALL_RADIUS - 14 * e;
                a.mesh.scale.setScalar(Math.max(0.35, 1 - 0.6 * e));
                if (t >= 1) {
                    a.mesh.visible = false;
                    a.mesh.scale.setScalar(1);
                    pocketAnimations.splice(i, 1);
                }
            }
        }

        function syncBalls() {
            const seen = new Set();
            for (const ball of balls) {
                const key = ballKey(ball);
                seen.add(key);
                const mesh = createBallMesh(ball);
                mesh.visible = true;
                const lx = mesh.userData.lx ?? ball.x;
                const ly = mesh.userData.ly ?? ball.y;
                const dx = ball.x - lx;
                const dz = ball.y - ly;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.0001 && dist < 45) {
                    tmpAxis.set(dz / dist, 0, -dx / dist);
                    mesh.rotateOnWorldAxis(tmpAxis, dist / BALL_RADIUS);
                }
                mesh.position.set(toWorldX(ball.x), BALL_RADIUS, toWorldZ(ball.y));
                mesh.userData.lx = ball.x;
                mesh.userData.ly = ball.y;
                if (ball.type !== 'white') {
                    const isFreeTarget = ball === freeBallTarget;
                    mesh.material.emissive.setHex(isFreeTarget ? 0x6a5a00 : 0x000000);
                    mesh.material.emissiveIntensity = isFreeTarget ? 0.9 : 1;
                }
            }
            for (const [key, mesh] of ballMeshMap) {
                if (seen.has(key)) continue;
                if (pocketAnimations.some(a => a.key === key)) continue;
                // 本机 checkHoles 进袋的球已在动画中；其余（联网对手侧收到状态、回放跳帧）若消失前就在袋口旁，补一段进袋动画
                const lx = mesh.userData.lx, ly = mesh.userData.ly;
                const hole = mesh.visible && lx !== undefined
                    ? holes.find(h => Math.hypot(lx - h.x, ly - h.y) < HOLE_RADIUS + BALL_RADIUS * 3) : null;
                if (hole) addPocketAnimation(key, mesh, lx, ly, hole);
                else mesh.visible = false;
            }
        }

        function init3DResize(container) {
            const resize = () => {
                const w = container.clientWidth;
                const h = container.clientHeight;
                if (!w || !h) return;
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            };
            if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
            window.addEventListener('resize', resize);
            resize();
        }

        function pointerToTablePoint(event) {
            const rect = renderer.domElement.getBoundingClientRect();
            const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
            const hit = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(tablePlane, hit)) return null;
            const lx = toLogicX(hit.x);
            const ly = toLogicY(hit.z);
            if (lx < -40 || lx > TABLE_WIDTH + 40 || ly < -40 || ly > TABLE_HEIGHT + 40) return null;
            return { x: lx, y: ly };
        }

        function aimAtPoint(mx, my) {
            if (!whiteBall) return;
            const dx = mx - whiteBall.x;
            const dy = my - whiteBall.y;
            if (Math.hypot(dx, dy) < 1) return;
            cueAngle = Math.atan2(dy, dx);
            updateDirectionHandle();
            updateAngleDisplay();
        }

        function initCanvasAiming(container) {
            const el = renderer.domElement;
            el.style.touchAction = 'none';

            el.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || isReplaying) return;
                // 顶视 / 环绕：点击交给游戏自己的 handleTableClick（由 2D 的 handleCanvasClick 去掉坐标换算而来），
                // 摆白球、叫袋选球选袋、自由球选球、点击瞄准与 2D 完全一致；击球视角只在摆白球时这样处理
                if (cameraMode !== 'cue' || isPlacingBall) {
                    const pt = pointerToTablePoint(e);
                    if (pt) handleTableClick(pt.x, pt.y);
                    if (cameraMode === 'orbit' || isPlacingBall) return;
                }
                if (isTableInMotion() || !gameStarted || !canControlLocally()) return;
                canvasAiming = true;
                el.setPointerCapture?.(e.pointerId);
            });
            el.addEventListener('pointermove', (e) => {
                if (!canvasAiming) return;
                if (cameraMode === 'cue') {
                    cueAngle -= (e.movementX || 0) * 0.0035;
                } else {
                    const pt = pointerToTablePoint(e);
                    if (pt) aimAtPoint(pt.x, pt.y);
                }
                updateDirectionHandle();
                updateAngleDisplay();
            });
            const stopAiming = () => { canvasAiming = false; };
            el.addEventListener('pointerup', stopAiming);
            el.addEventListener('pointercancel', stopAiming);
            el.addEventListener('lostpointercapture', stopAiming);
        }

        function flyCamera(toPos, toTarget, instant) {
            if (instant) {
                cameraAnim = null;
                camera.position.copy(toPos);
                camTarget.copy(toTarget);
                camera.lookAt(camTarget);
                return;
            }
            cameraAnim = {
                fromPos: camera.position.clone(),
                fromTarget: camTarget.clone(),
                toPos,
                toTarget,
                t0: performance.now(),
                duration: 450
            };
        }

        function setCameraMode(mode, instant = false) {
            cameraMode = mode;
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === mode);
            });
            if (orbitControls) orbitControls.enabled = mode === 'orbit';
            camera.up.set(0, 1, 0);
            if (mode === 'top') {
                camera.up.set(0, 0, -1);
                flyCamera(new THREE.Vector3(0, 430 * viewScale(), 0), new THREE.Vector3(0, 0, 0), instant);
            } else if (mode === 'cue') {
                cameraAnim = null;
                if (whiteBall) updateCueCamera();
            } else {
                flyCamera(new THREE.Vector3(0, 320 * viewScale(), 305 * viewScale()), new THREE.Vector3(0, 0, 0), instant);
            }
        }

        function updateCueCamera() {
            if (!whiteBall || !camera) return;
            tmpDir.set(Math.cos(cueAngle), 0, Math.sin(cueAngle));
            const wx = toWorldX(whiteBall.x);
            const wz = toWorldZ(whiteBall.y);
            // 相机位于杆尾上方：能看到球杆从画面下方伸向白球
            const desiredPos = new THREE.Vector3(wx - tmpDir.x * 74, BALL_RADIUS + 24, wz - tmpDir.z * 74);
            const desiredTarget = new THREE.Vector3(wx + tmpDir.x * 60, BALL_RADIUS - 2, wz + tmpDir.z * 60);
            camera.position.lerp(desiredPos, 0.18);
            camTarget.lerp(desiredTarget, 0.18);
            camera.lookAt(camTarget);
        }

        function updateCameraPerFrame(now) {
            if (cameraAnim) {
                const t = Math.min(1, (now - cameraAnim.t0) / cameraAnim.duration);
                const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                camera.position.lerpVectors(cameraAnim.fromPos, cameraAnim.toPos, e);
                camTarget.lerpVectors(cameraAnim.fromTarget, cameraAnim.toTarget, e);
                camera.lookAt(camTarget);
                if (t >= 1) {
                    cameraAnim = null;
                    orbitControls.target.copy(camTarget);
                    orbitControls.update();
                }
                return;
            }
            if (cameraMode === 'orbit') {
                orbitControls.update();
                return;
            }
            if (cameraMode === 'cue') updateCueCamera();
        }

        // 每帧 3D 渲染。调度（回放 / 物理 / 联网同步 / 运动广播）仍由游戏自己的 gameLoop 负责：
        // build_3d.py 把 gameLoop 里的清屏与 draw* 调用换成 render3DFrame()，其余原样保留
        function render3DFrame() {
            const now = performance.now();
            updatePocketAnimations(now);
            syncBalls();
            updateCueStick(now);
            updateGuides();
            updatePlacementHelpers();
            updateCallShotOverlay();
            updateCameraPerFrame(now);
            renderer.render(scene, camera);
        }

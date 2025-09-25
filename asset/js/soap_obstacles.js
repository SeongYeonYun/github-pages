/* ========== soap_obstacles.js ========== */
(function(){
  'use strict';
  const { U, G, DIRS, BASIN_FALL_MS, edgeId, nodeToXY, El } = window;

  function trySpawnObstacle(){
    const st = CONFIG.stages[G.stageIndex], now = U.now();
    // purge expired
    G.obstacles = G.obstacles.filter(o => o.until > now);

    if (now < G.graceUntil || G.obstacles.length >= st.maxObstacles || now < G.nextSpawnAt) return;

    // collect possible edges
    const edges = []; const max = G.gridNodes - 1;
    for (let y = 0; y <= max; y++) {
      for (let x = 0; x <= max; x++) {
        if (x < max) edges.push({ a: { x: x, y: y }, b: { x: x + 1, y: y } });
        if (y < max) edges.push({ a: { x: x, y: y }, b: { x: x,     y: y + 1 } });
      }
    }

    // exclude edges adjacent to the window node
    const safeEdges = edges.filter(e =>
      !((e.a.x===G.window.x && e.a.y===G.window.y) || (e.b.x===G.window.x && e.b.y===G.window.y))
    );

    // exclude current moving edge (warning can show elsewhere)
    const currentId = edgeId(G.nodeA, G.nodeB);
    const pool = safeEdges.filter(e => edgeId(e.a, e.b) !== currentId);
    if (!pool.length) { G.nextSpawnAt = now + 200; return; }

    const pick = pool[U.randInt(0, pool.length - 1)];
    const id = edgeId(pick.a, pick.b);
    if (G.obstacles.some(o => o.id === id && o.until > now)) { G.nextSpawnAt = now + 150; return; }

    // center in screen coords
    const a = nodeToXY(pick.a), b = nodeToXY(pick.b);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const WARNING_MS = 2000;
    const dropAt = now + WARNING_MS;
    const landAt = dropAt + BASIN_FALL_MS;

    G.obstacles.push({
      id: id,
      a: pick.a, b: pick.b,
      center: center,
      spawn: now,
      warnFrom: now,
      dropAt: dropAt,
      landAt: landAt,
      until: now + st.obstacleLifetimeMs + WARNING_MS + BASIN_FALL_MS,
      state: 'warning'
    });

    G.nextSpawnAt = now + st.obstacleSpawnIntervalMs;
  }
  window.trySpawnObstacle = trySpawnObstacle;

  function drawObstacles(){
    const now = U.now();
    // purge expired
    G.obstacles = G.obstacles.filter(o => o.until > now);

    const usableH = El.canvas.height - G.margin*2;
    const stepY = usableH/(G.gridNodes-1);
    const radius = stepY * 0.18; // smaller so it doesn't block other lanes

    for (const o of G.obstacles){
      // advance state
      if (o.state === 'warning' && now >= o.dropAt) o.state = 'falling';
      if (o.state === 'falling' && now >= o.landAt) o.state = 'landed';

      // warning indicator
      if (o.state === 'warning'){
        const t = Math.max(0, Math.min(1, (now - o.warnFrom) / 2000));
        const pulse = 1 + 0.2 * Math.sin(t * 10);
        El.ctx.save();
        El.ctx.translate(o.center.x, o.center.y);
        El.ctx.globalAlpha = 0.85;
        El.ctx.lineWidth = 3;
        El.ctx.strokeStyle = '#ff4d4d';
        El.ctx.beginPath();
        El.ctx.arc(0, 0, radius * 1.2 * pulse, 0, Math.PI*2);
        El.ctx.stroke();
        El.ctx.globalAlpha = 0.25;
        El.ctx.fillStyle = '#ff4d4d';
        El.ctx.beginPath();
        El.ctx.arc(0, 0, radius * 0.9, 0, Math.PI*2);
        El.ctx.fill();
        El.ctx.restore();
        continue;
      }

      let offsetY = 0;
      if (o.state === 'falling'){
        const t = Math.min(1, (now - o.dropAt) / BASIN_FALL_MS);
        const fallDist = stepY * 0.8;
        offsetY = -fallDist * (1 - t);
      }

      El.ctx.save();
      El.ctx.translate(o.center.x, o.center.y + offsetY);

      // shadow
      const shadowY = 6 + Math.max(0, -offsetY*0.08);
      El.ctx.save();
      El.ctx.globalAlpha = 0.22;
      El.ctx.beginPath();
      El.ctx.ellipse(6, shadowY, radius*0.75, radius*0.40, 0, 0, Math.PI*2);
      El.ctx.fillStyle = '#000';
      El.ctx.fill();
      El.ctx.restore();

      // basin body
      const rim = Math.max(2, radius*0.16);
      El.ctx.beginPath(); El.ctx.arc(0,0, radius, 0, Math.PI*2);
      El.ctx.fillStyle = '#ffffff'; El.ctx.fill();
      El.ctx.lineWidth = rim; El.ctx.strokeStyle = '#dfe6ff'; El.ctx.stroke();

      // inner ellipse
      El.ctx.beginPath(); El.ctx.ellipse(0, 0, radius*0.8, radius*0.5, 0, 0, Math.PI*2);
      El.ctx.strokeStyle = 'rgba(180,200,255,0.8)';
      El.ctx.lineWidth = 1.2; El.ctx.stroke();

      El.ctx.restore();
    }
  }
  window.drawObstacles = drawObstacles;

  function checkBasinCollision(){
    if(!G.running) return;
    const now = U.now();
    const pos = window.soapPos();
    const usableH = El.canvas.height - G.margin*2;
    const stepY = usableH/(G.gridNodes-1);
    const r = (stepY/2) / 2;

    for(const o of G.obstacles){
      if(o.until <= now) continue;
      if(o.state !== 'landed') continue;
      const dx = pos.x - o.center.x, dy = pos.y - o.center.y;
      if(Math.hypot(dx,dy) <= r){
        logEvent('CRASH','세숫대야 충돌');
        window.endGame('fail','세숫대야 충돌');
        return;
      }
    }
  }
  window.checkBasinCollision = checkBasinCollision;
})();
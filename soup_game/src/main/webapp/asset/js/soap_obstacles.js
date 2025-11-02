// soap_obstacles.js
(function(window){
  const U = window.soapUtils;
  if(!U) { console.warn('soapObstacles: soapUtils missing - aborting obstacle helper load.'); return; }

  function drawRoundedBar(ctx,x,y,w,thickness,color){
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    const r = thickness;
    U.roundRectFill(ctx, x, y, w, thickness, r, color);
    ctx.restore();
  }

  function drawDoubleLine(ctx, x, y, w, thickness){
    drawRoundedBar(ctx, x, y, w, thickness, '#04363a');
    drawRoundedBar(ctx, x, y + Math.max(8, thickness*1.2), w*0.95, thickness, '#04363a');
  }

  function drawLowerPlatforms(ctx, canvasW, canvasH, boardArea){
    const rects = [];
    const px = Math.max(12, canvasW * 0.06);
    const platformW = Math.max(80, canvasW * 0.36);
    const leftX = px;
    const rightX = canvasW - platformW - px;
    const top = boardArea.y + boardArea.size + canvasH*0.06;

    const t1 = {x:leftX, y: top, w: platformW, h: 10};
    drawDoubleLine(ctx, t1.x, t1.y, t1.w, t1.h); rects.push(t1);

    const t2 = {x:leftX, y: top + 24, w: platformW * 0.9, h: 10};
    drawDoubleLine(ctx, t2.x, t2.y, t2.w, t2.h); rects.push(t2);

    const t3 = {x:rightX, y: top + 6, w: platformW, h: 10};
    drawDoubleLine(ctx, t3.x, t3.y, t3.w, t3.h); rects.push(t3);

    const t4 = {x:rightX, y: top + 30, w: platformW * 0.9, h: 10};
    drawDoubleLine(ctx, t4.x, t4.y, t4.w, t4.h); rects.push(t4);

    return rects;
  }

  function drawRotatedBox(ctx, cx, cy, w, h, angle, color){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    U.roundRectPath(ctx, -w/2, -h/2, w, h, Math.min(w,h)*0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    U.roundRectPath(ctx, -w/2 + 3, -h/2 + 3, w - 6, h/2 - 4, Math.min(w,h)*0.06);
    ctx.fill();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    U.roundRectPath(ctx, -w/2 + 2, h/2 - (h*0.2), w - 4, h*0.2, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(-w/2 + 6, -h/8, w - 12, Math.max(2, h*0.07));
    ctx.restore();
  }

  function drawPuckWithHandle(ctx, cx, cy, radius, color, innerColor){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx+3, cy+6, radius*1.05, radius*0.6, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, radius, radius, 0, 0, Math.PI*2); ctx.fillStyle = '#0f7881'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, radius*0.58, radius*0.58, 0, 0, Math.PI*2); ctx.fillStyle = innerColor; ctx.fill();
    const hx = cx + radius + 6;
    const hy = cy - 4;
    U.roundRectFill(ctx, hx, hy, radius*0.65, Math.max(6, radius*0.45), 4, '#6ed3c6');
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + radius*0.55, cy - 2); ctx.lineTo(hx + 2, hy + 3); ctx.stroke();
    ctx.restore();
  }

  function drawObjects(ctx, checker){
    const {innerX, innerY, innerSize, tw, th} = checker;
    const boxCenterX = innerX + tw * 1.1;
    const boxCenterY = innerY + th * 0.9;
    drawRotatedBox(ctx, boxCenterX, boxCenterY, tw*0.9, th*0.6, -18 * Math.PI/180, '#f58a2c');

    const puckX = innerX + tw*2.4;
    const puckY = innerY + th * 1.1;
    drawPuckWithHandle(ctx, puckX, puckY, Math.min(tw, th)*0.38, '#2ea3b6', '#a6f0ee');
  }

  window.soapObstacles = {
    drawLowerPlatforms, drawObjects,
    drawDoubleLine, drawRoundedBar, drawRotatedBox, drawPuckWithHandle
  };
})(window);

window.THIGMO_BUILD = '2026-05-10-botanical-overhaul';

const WIN_CAPTURES = 10;
const MAX_STACK = 7;
const ui = {
  viewport: document.getElementById('viewport'), scorePurple: document.getElementById('score-purple'), scoreOrange: document.getElementById('score-orange'),
  turnInfo: document.getElementById('turn-info'), undoBtn: document.getElementById('undo-btn'), log: document.getElementById('log'),
  phaseBadge: document.getElementById('phase-badge'), feedback: document.getElementById('feedback'), showCoords: document.getElementById('show-coords'),
  showLiberties: document.getElementById('show-liberties'), debugOutput: document.getElementById('debug-output'), runAudit: document.getElementById('run-audit'),
  winModal: document.getElementById('win-modal'), winTitle: document.getElementById('win-title')
};

const state = {
  turn: 'purple',
  phase: 'selectTile',
  tiles: new Map(),
  stacks: new Map(),
  openingRound: 2,
  captures: { purple: 0, orange: 0 },
  selectedTileId: null,
  legalMoves: [],
  tileSpacing: 88,
  undoSnapshot: null,
  winner: null,
  wiltingEffects: [],
  camera: { yaw: -0.55, pitch: 0.72, zoom: 1.15 },
  drag: { active: false, moved: false, startX: 0, startY: 0, startYaw: 0, startPitch: 0 },
};

const canvas = document.createElement('canvas');
canvas.width = 1200;
canvas.height = 800;
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.display = 'block';
ui.viewport.appendChild(canvas);
const ctx = canvas.getContext('2d');

function key(x,y){ return `${x},${y}`; }
function other(p){ return p === 'purple' ? 'orange' : 'purple'; }
function neighbors8(x,y){ const out=[]; for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) if(dx||dy) out.push([x+dx,y+dy]); return out; }
function neighbors6(x,y,z){ return [[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]]; }
function cellKey(x,y,z){ return `${x},${y},${z}`; }
function log(msg){ const div = document.createElement('div'); div.textContent = msg; ui.log.prepend(div); }

function init() {
  let id = 0;
  for (let y=0;y<2;y++) for (let x=0;x<4;x++) {
    const tid = `t${id++}`;
    state.tiles.set(tid, { x, y });
    state.stacks.set(key(x,y), []);
  }
  refresh();
}

function snapshot(){
  return {
    turn: state.turn, phase: state.phase, openingRound: state.openingRound,
    captures: { ...state.captures }, selectedTileId: state.selectedTileId,
    tiles: new Map([...state.tiles].map(([k,v])=>[k,{...v}])),
    stacks: new Map([...state.stacks].map(([k,v])=>[k,[...v]])),
    winner: state.winner,
    wiltingEffects: state.wiltingEffects.map((effect)=>({ ...effect })),
  };
}

function restore(s){ Object.assign(state, s); refresh(); }

function influencedTiles(player){
  if (state.openingRound > 0) return new Set([...state.tiles.keys()]);
  const set = new Set();
  for (const [tid,pos] of state.tiles) {
    const own = state.stacks.get(key(pos.x,pos.y)).includes(player);
    if (own) { set.add(tid); continue; }
    for (const [nx,ny] of neighbors8(pos.x,pos.y)) {
      if (state.stacks.get(key(nx,ny))?.includes(player)) { set.add(tid); break; }
    }
  }
  return set;
}


function isOrthogonallyConnectedAfterMove(tid, toX, toY){
  const occupied = new Map();
  for (const [id, pos] of state.tiles) {
    const x = id === tid ? toX : pos.x;
    const y = id === tid ? toY : pos.y;
    const k = key(x, y);
    if (occupied.has(k)) return false;
    occupied.set(k, id);
  }

  const coords = [...occupied.keys()];
  if (coords.length !== state.tiles.size || coords.length === 0) return false;

  const visited = new Set();
  const queue = [coords[0]];
  visited.add(coords[0]);

  while (queue.length) {
    const current = queue.shift();
    const [x, y] = current.split(',').map(Number);
    for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      const nk = key(nx, ny);
      if (!occupied.has(nk) || visited.has(nk)) continue;
      visited.add(nk);
      queue.push(nk);
    }
  }

  return visited.size === state.tiles.size;
}

function legalMovesFor(player){
  const moves=[];
  const influenced = influencedTiles(player);
  const occ = new Set([...state.tiles.values()].map(t=>key(t.x,t.y)));
  for (const [tid,from] of state.tiles) {
    if (!influenced.has(tid)) continue;
    for (const [nx,ny] of neighbors8(from.x,from.y)) {
      if (occ.has(key(nx,ny))) continue;
      if (!isOrthogonallyConnectedAfterMove(tid, nx, ny)) continue;
      moves.push({ tid, from:{...from}, to:{x:nx,y:ny} });
    }
  }
  return moves;
}

function hasTile(x,y){ for(const t of state.tiles.values()) if(t.x===x && t.y===y) return true; return false; }
function getOccupancy(){
  const occ = new Map();
  for (const [kxy,stack] of state.stacks) {
    const [x,y] = kxy.split(',').map(Number);
    stack.forEach((c,z)=>occ.set(cellKey(x,y,z),c));
  }
  return occ;
}
function groupFrom(start, occ){
  const color = occ.get(start), q=[start], seen=new Set([start]), out=[];
  while(q.length){
    const c=q.pop(); out.push(c);
    const [x,y,z]=c.split(',').map(Number);
    for(const [nx,ny,nz] of neighbors6(x,y,z)){
      const nk=cellKey(nx,ny,nz);
      if(!seen.has(nk)&&occ.get(nk)===color){ seen.add(nk); q.push(nk); }
    }
  }
  return out;
}
function liberties(group, occ){
  const libs = new Set();
  for(const c of group){
    const [x,y,z]=c.split(',').map(Number);
    for(const [nx,ny,nz] of neighbors6(x,y,z)){
      if(nz<0) continue;
      if((nx!==x||ny!==y)&&!hasTile(nx,ny)) continue;
      const nk=cellKey(nx,ny,nz);
      if(!occ.has(nk)) libs.add(nk);
    }
  }
  return libs;
}

function addWiltingEffects(cells, occ){
  const start = performance.now();
  const DURATION_MS = 1800;
  cells.forEach((c)=>{
    const [x,y,z]=c.split(',').map(Number);
    state.wiltingEffects.push({
      x,y,z,
      color: occ.get(c),
      start,
      duration: DURATION_MS,
      wobbleSeed: Math.random()*Math.PI*2,
    });
  });
}

function pruneWiltingEffects(now = performance.now()){
  state.wiltingEffects = state.wiltingEffects.filter((effect)=> now - effect.start < effect.duration);
}
function removeCells(cells){
  const map = new Map();
  for(const c of cells){ const [x,y,z]=c.split(',').map(Number); const kxy=key(x,y); if(!map.has(kxy)) map.set(kxy,[]); map.get(kxy).push(z); }
  for(const [kxy,zs] of map){ const s=state.stacks.get(kxy)||[]; state.stacks.set(kxy,s.filter((_,i)=>!zs.includes(i))); }
}
function resolveCaptures(active){
  let changed = true;
  while(changed){
    changed = false;
    const occ = getOccupancy();
    const visited = new Set();
    const groups = { purple: [], orange: [] };
    for(const c of occ.keys()){
      if(visited.has(c)) continue;
      const g = groupFrom(c, occ);
      g.forEach(v=>visited.add(v));
      groups[occ.get(c)].push(g);
    }
    const remEnemy=[];
    for(const g of groups[other(active)]) if(liberties(g,occ).size===0) remEnemy.push(...g);
    if(remEnemy.length){
      addWiltingEffects(remEnemy, occ);
      removeCells(remEnemy);
      state.captures[active]+=remEnemy.length;
      log(`${active} captured ${remEnemy.length} ${other(active)} flower${remEnemy.length===1?'':'s'} (group had no liberties).`);
      changed=true;
    }

    const occ2 = getOccupancy();
    const visited2=new Set();
    const remOwn=[];
    for(const c of occ2.keys()){
      if(visited2.has(c)||occ2.get(c)!==active) continue;
      const g=groupFrom(c,occ2); g.forEach(v=>visited2.add(v));
      if(liberties(g,occ2).size===0) remOwn.push(...g);
    }
    if(remOwn.length){
      addWiltingEffects(remOwn, occ2);
      removeCells(remOwn);
      log(`${active} lost ${remOwn.length} flower${remOwn.length===1?'':'s'} to self-capture (no liberties).`);
      changed=true;
    }
  }
}

function worldToScreen(x, y, height = 0){
  if (state.tiles.size === 0) {
    return { sx: canvas.width * 0.5, sy: canvas.height * 0.5, depth: 0, scale: 1 };
  }

  const xs = [...state.tiles.values()].map((t)=>t.x);
  const ys = [...state.tiles.values()].map((t)=>t.y);
  const centerTileX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
  const centerTileY = (Math.min(...ys) + Math.max(...ys)) * 0.5;

  const localX = (x - centerTileX) * state.tileSpacing;
  const localY = (y - centerTileY) * state.tileSpacing * 0.85;

  const { yaw, pitch, zoom } = state.camera;
  const yawCos = Math.cos(yaw), yawSin = Math.sin(yaw);
  const rotX = localX * yawCos - localY * yawSin;
  const rotY = localX * yawSin + localY * yawCos;

  const floorTilt = Math.max(0.58, Math.cos(pitch));
  const heightLift = Math.max(0.45, Math.cos(pitch * 0.72));

  return {
    sx: canvas.width * 0.5 + rotX * zoom,
    sy: canvas.height * 0.56 + rotY * zoom * floorTilt - height * zoom * heightLift,
    depth: rotY,
    scale: zoom,
  };
}

function tileCorners(x, y){
  const half = 0.5;
  return [
    worldToScreen(x - half, y - half),
    worldToScreen(x + half, y - half),
    worldToScreen(x + half, y + half),
    worldToScreen(x - half, y + half),
  ];
}

function activeTurnHighlight(){
  return state.turn === 'orange'
    ? { solid: 'rgba(255,159,28,0.85)', ghost: 'rgba(255,159,28,0.45)' }
    : { solid: 'rgba(122,60,255,0.85)', ghost: 'rgba(122,60,255,0.45)' };
}

function drawVineConnections(){
  const occ = getOccupancy();
  const drawn = new Set();
  for (const [cell, color] of occ) {
    const [x,y,z] = cell.split(',').map(Number);
    const neighbors = [[x+1,y,z],[x,y+1,z]];
    for (const [nx,ny,nz] of neighbors) {
      const nKey = cellKey(nx,ny,nz);
      if (occ.get(nKey) !== color) continue;
      const pairKey = `${cell}|${nKey}`;
      if (drawn.has(pairKey)) continue;
      drawn.add(pairKey);
      const a = worldToScreen(x,y);
      const b = worldToScreen(nx,ny);
      const ay = worldToScreen(x, y, z * 18).sy - 3;
      const by = worldToScreen(nx, ny, nz * 18).sy - 3;
      const midX = (a.sx + b.sx) * 0.5;
      const midY = (ay + by) * 0.5;
      const curveBend = (x !== nx ? 12 : -12);
      const pal = color === 'purple'
        ? {vine:'#6f4ed9', leaf:'#aa8dff', accent:'#5632b8'}
        : {vine:'#d67a22', leaf:'#ffbf73', accent:'#b65f12'};

      ctx.strokeStyle = pal.vine;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.sx, ay);
      ctx.quadraticCurveTo(midX + curveBend, midY - curveBend*0.35, b.sx, by);
      ctx.stroke();

      const leafCount = 3;
      for (let i=1;i<=leafCount;i++) {
        const t = i/(leafCount+1);
        const lx = (1-t)*(1-t)*a.sx + 2*(1-t)*t*(midX + curveBend) + t*t*b.sx;
        const ly = (1-t)*(1-t)*ay + 2*(1-t)*t*(midY - curveBend*0.35) + t*t*by;
        const dir = i%2===0 ? 1 : -1;
        ctx.fillStyle = pal.leaf;
        ctx.beginPath();
        ctx.ellipse(lx + dir*6, ly - dir*3, 5.2, 2.8, dir*0.8, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dir*6, ly - dir*3);
        ctx.stroke();
      }
    }
  }
}

function drawTile(pos, movable, selected){
  const corners = tileCorners(pos.x, pos.y);
  const fill = selected ? '#fef3c7' : movable ? '#dbeafe' : '#f6f0e6';
  const stroke = selected ? '#d97706' : movable ? '#3b82f6' : '#8b7a63';

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = selected ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(corners[0].sx, corners[0].sy);
  for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i].sx, corners[i].sy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawFlower(player, x, y, z, topPiece){
  const { sx, sy: pyFinal } = worldToScreen(x, y, z * 18);
  const pal = player === 'purple'
    ? { petal: '#7c3aed', edge: '#5b21b6', core: '#e9d5ff' }
    : { petal: '#f59e0b', edge: '#b45309', core: '#fff7d6' };
  const r = topPiece ? 10 : 8.5;

  ctx.fillStyle = pal.petal;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    const px = sx + Math.cos(a) * (r * 0.95);
    const py2 = pyFinal + Math.sin(a) * (r * 0.95);
    ctx.beginPath();
    ctx.ellipse(px, py2, r * 0.58, r * 0.42, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(sx, pyFinal, r * 0.95, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = pal.core;
  ctx.beginPath();
  ctx.arc(sx, pyFinal, r * 0.44, 0, Math.PI * 2);
  ctx.fill();
}

function resizeCanvas() {
  const rect = ui.viewport.getBoundingClientRect();
  const nextWidth = Math.max(640, Math.round(rect.width));
  const nextHeight = Math.max(420, Math.round(rect.height));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}

function draw(){
  pruneWiltingEffects();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#bde6af'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const highlight = activeTurnHighlight();

  const selectedMoves = state.selectedTileId ? state.legalMoves.filter(m=>m.tid===state.selectedTileId) : [];
  if (state.phase === 'selectDest') {
    for(const m of selectedMoves){
      const {sx,sy}=worldToScreen(m.to.x,m.to.y);
      ctx.fillStyle = highlight.ghost;
      ctx.fillRect(sx-30,sy-30,60,60);
    }
  }

  for(const [tid,pos] of state.tiles){
    drawTile(pos, state.phase==='selectTile'&&state.legalMoves.some(m=>m.tid===tid), state.hoverTileId===tid || state.selectedTileId===tid);
  }
  drawVineConnections();
  for(const [tid,pos] of state.tiles){
    const stack=state.stacks.get(key(pos.x,pos.y))||[]; const {sx,sy}=worldToScreen(pos.x,pos.y);
    stack.forEach((p,z)=>drawFlower(p,pos.x,pos.y,z,z===stack.length-1));
    if(stack.length>=6){ ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='bold 14px Inter'; ctx.fillText(String(stack.length),sx+20,sy-stack.length*18); }
  }

  if (ui.showLiberties?.checked) drawLibertyAssist();
}

function drawLibertyAssist(){
  const enemy = other(state.turn);
  const occ = getOccupancy();
  const seen = new Set();
  const assists = new Set();
  for(const c of occ.keys()){
    if(seen.has(c) || occ.get(c)!==enemy) continue;
    const g = groupFrom(c, occ); g.forEach(v=>seen.add(v));
    liberties(g,occ).forEach(l=>assists.add(l));
  }
  ctx.fillStyle='rgba(75,217,107,0.7)';
  for(const l of assists){
    const [x,y,z]=l.split(',').map(Number);
    const {sx,sy}=worldToScreen(x,y);
    const stackPos = worldToScreen(x, y, z * 16);
    ctx.beginPath(); ctx.arc(stackPos.sx, stackPos.sy, 6, 0, Math.PI*2); ctx.fill();
  }
}

function refresh(){
  state.legalMoves = legalMovesFor(state.turn);
  ui.scorePurple.textContent = state.captures.purple;
  ui.scoreOrange.textContent = state.captures.orange;
  const phaseText = state.winner ? `${state.winner.toUpperCase()} WINS` : (state.phase==='selectTile' ? 'Move a tile' : state.phase==='selectDest' ? 'Select destination' : 'Place a piece');
  ui.turnInfo.textContent = `${state.turn[0].toUpperCase()+state.turn.slice(1)} Turn · ${phaseText}`;
  document.getElementById('app-shell').style.setProperty('--edge-glow', state.turn==='purple' ? '#8f66ff88' : '#ffb14f88');
  draw();
}

function nearestTile(mx,my){
  let best=null, bestD=1e9;
  for(const [tid,pos] of state.tiles){
    const {sx,sy}=worldToScreen(pos.x,pos.y);
    const d = Math.hypot(mx-sx,my-sy);
    if(d<bestD){bestD=d;best={tid,pos};}
  }
  return bestD < 45 ? best : null;
}
function nearestGhost(mx,my){
  if(state.phase!=='selectDest'||!state.selectedTileId) return null;
  let best=null,bestD=1e9;
  for(const m of state.legalMoves.filter(m=>m.tid===state.selectedTileId)){
    const {sx,sy}=worldToScreen(m.to.x,m.to.y);
    const d=Math.hypot(mx-sx,my-sy); if(d<bestD){bestD=d;best=m;}
  }
  return bestD<45 ? best : null;
}



canvas.addEventListener('mousedown', (e)=>{
  const rect=canvas.getBoundingClientRect();
  const mx=(e.clientX-rect.left)*(canvas.width/rect.width);
  const my=(e.clientY-rect.top)*(canvas.height/rect.height);
  const canRotate = !nearestTile(mx,my) && !nearestGhost(mx,my);
  if (!canRotate) return;
  state.drag.active = true;
  state.drag.moved = false;
  state.drag.startX = e.clientX;
  state.drag.startY = e.clientY;
  state.drag.startYaw = state.camera.yaw;
  state.drag.startPitch = state.camera.pitch;
});

window.addEventListener('mousemove', (e)=>{
  if (!state.drag.active) return;
  const dx = e.clientX - state.drag.startX;
  const dy = e.clientY - state.drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 2) state.drag.moved = true;
  state.camera.yaw = state.drag.startYaw + dx * 0.0075;
  state.camera.pitch = Math.max(0.35, Math.min(0.98, state.drag.startPitch + dy * 0.0048));
  draw();
});

window.addEventListener('mouseup', ()=>{
  state.drag.active = false;
});

canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0012);
  state.camera.zoom = Math.max(0.85, Math.min(2.6, state.camera.zoom * factor));
  draw();
}, { passive: false });
canvas.addEventListener('click', (e)=>{
  if (state.winner || state.drag.moved) { state.drag.moved = false; return; }
  const rect=canvas.getBoundingClientRect();
  const mx=(e.clientX-rect.left)*(canvas.width/rect.width);
  const my=(e.clientY-rect.top)*(canvas.height/rect.height);

  if(state.phase==='selectTile'){
    const t=nearestTile(mx,my); if(!t) return;
    if(!state.legalMoves.some(m=>m.tid===t.tid)) return;
    state.selectedTileId=t.tid; state.phase='selectDest'; refresh(); return;
  }
  if(state.phase==='selectDest'){
    const m=nearestGhost(mx,my); if(!m) return;
    if (hasTile(m.to.x, m.to.y) || !isOrthogonallyConnectedAfterMove(m.tid, m.to.x, m.to.y)) {
      log('Illegal move: root network must remain orthogonally connected.');
      return;
    }
    state.undoSnapshot = snapshot();
    const p=state.tiles.get(m.tid); const fromK=key(p.x,p.y), toK=key(m.to.x,m.to.y); const stack=state.stacks.get(fromK);
    state.stacks.delete(fromK); state.stacks.set(toK,stack); p.x=m.to.x; p.y=m.to.y;
    state.phase='place'; log(`${state.turn} moved tile to (${p.x}, ${p.y})`); refresh(); return;
  }
  if(state.phase==='place'){
    const t=nearestTile(mx,my); if(!t) return;
    state.stacks.get(key(t.pos.x,t.pos.y)).push(state.turn);
    resolveCaptures(state.turn);
    if(state.captures[state.turn] >= WIN_CAPTURES){ state.winner=state.turn; refresh(); return; }
    state.turn = other(state.turn);
    if(state.openingRound>0) state.openingRound -= 1;
    state.phase='selectTile'; state.selectedTileId=null; refresh();
  }
});

if (ui.undoBtn) ui.undoBtn.addEventListener('click',()=>{ if(state.undoSnapshot){ restore(state.undoSnapshot); log('Turn undone.'); }});
if (ui.showLiberties) ui.showLiberties.addEventListener('change',draw);
function tick(ts){ state.t=ts; draw(); requestAnimationFrame(tick); }

log('Thigmo botanical battlefield loaded.');
resizeCanvas();
init();

window.addEventListener('resize', ()=>{ resizeCanvas(); draw(); });

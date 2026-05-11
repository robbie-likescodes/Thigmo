window.THIGMO_BUILD = '2026-05-10-botanical-overhaul';

const WIN_CAPTURES = 10;
const MAX_STACK = 7;
const MOVEMENT_RULES = Object.freeze({
  directions: Object.freeze([
    [-1,-1], [0,-1], [1,-1],
    [-1, 0],         [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ]),
  mustLandOnEmptyCoordinate: true,
  mustRemainOrthogonallyConnected: true,
});
const ui = {
  viewport: document.getElementById('viewport'), scorePurple: document.getElementById('score-purple'), scoreOrange: document.getElementById('score-orange'),
  turnInfo: document.getElementById('turn-info'), undoBtn: document.getElementById('undo-btn'), log: document.getElementById('log'),
  phaseBadge: document.getElementById('phase-badge'), feedback: document.getElementById('feedback'),
  winModal: document.getElementById('win-modal'), winTitle: document.getElementById('win-title'),
  winAnnouncement: document.getElementById('win-announcement'), replayBtn: document.getElementById('replay-btn'),
  mobileFlowerDock: document.getElementById('mobile-flower-dock'),
  mobileFlowerIcon: document.getElementById('mobile-flower-icon'),
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
  camera: { yaw: -0.55, pitch: 0.72, zoom: 1.15, userAdjusted: false },
  drag: { active: false, moved: false, startX: 0, startY: 0, startYaw: 0, startPitch: 0 },
  hoverTileId: null,
  hoverPlaceTileId: null,
  touch: { mode: 'none', startX: 0, startY: 0, startYaw: 0, startPitch: 0, moved: false, pinchDist: 0, pinchZoom: 1, suppressClickUntil: 0 },
  mobilePlaceDrag: { active: false, snappedTileId: null },
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
function neighbors8(x,y){ return MOVEMENT_RULES.directions.map(([dx,dy])=>[x+dx,y+dy]); }
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
  fitCameraToBoard();
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


function isAdjacentKingStep(fromX, fromY, toX, toY){
  return MOVEMENT_RULES.directions.some(([dx,dy]) => fromX + dx === toX && fromY + dy === toY);
}

function isLegalTileTranslation(tid, toX, toY, player){
  const from = state.tiles.get(tid);
  if (!from || !isAdjacentKingStep(from.x, from.y, toX, toY)) return false;

  if (MOVEMENT_RULES.mustLandOnEmptyCoordinate && hasTile(toX, toY)) return false;

  const influenced = influencedTiles(player);
  if (!influenced.has(tid)) return false;

  if (MOVEMENT_RULES.mustRemainOrthogonallyConnected && !isOrthogonallyConnectedAfterMove(tid, toX, toY)) return false;

  return true;
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
  for (const [tid,from] of state.tiles) {
    if (!influenced.has(tid)) continue;
    for (const [nx,ny] of neighbors8(from.x,from.y)) {
      if (!isLegalTileTranslation(tid, nx, ny, player)) continue;
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
  const heightLift = Math.max(0.62, Math.cos(pitch * 0.72));

  return {
    sx: canvas.width * 0.5 + rotX * zoom,
    sy: canvas.height * 0.56 + rotY * zoom * floorTilt - height * zoom * heightLift,
    depth: rotY,
    scale: zoom,
  };
}

function tileCorners(x, y){
  const half = 0.43;
  return [
    worldToScreen(x - half, y - half),
    worldToScreen(x + half, y - half),
    worldToScreen(x + half, y + half),
    worldToScreen(x - half, y + half),
  ];
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

const FLOWER_VERTICAL_SPACING = 22;

function drawVineConnections(){
  const tNow = (state.t || performance.now()) * 0.001;
  const occ = getOccupancy();
  const drawn = new Set();
  for (const [cell, color] of occ) {
    const [x,y,z] = cell.split(',').map(Number);
    const neighbors = [[x+1,y,z],[x,y+1,z],[x,y,z+1]];
    for (const [nx,ny,nz] of neighbors) {
      const nKey = cellKey(nx,ny,nz);
      if (occ.get(nKey) !== color) continue;
      const pairKey = `${cell}|${nKey}`;
      if (drawn.has(pairKey)) continue;
      drawn.add(pairKey);
      const a = worldToScreen(x,y);
      const b = worldToScreen(nx,ny);
      const ay = worldToScreen(x, y, z * FLOWER_VERTICAL_SPACING).sy - 3;
      const by = worldToScreen(nx, ny, nz * FLOWER_VERTICAL_SPACING).sy - 3;
      const midX = (a.sx + b.sx) * 0.5;
      const midY = (ay + by) * 0.5;
      const baseBend = nz !== z ? -6 : (x !== nx ? 12 : -12);
      const curveBend = baseBend + Math.sin(tNow * 1.3 + x * 0.9 + y * 0.7 + z * 0.5) * 3.8;
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
        const leafWiggle = Math.sin(tNow * 2 + i * 0.8 + x * 0.5 + y * 0.6) * 2.2;
        ctx.fillStyle = pal.leaf;
        ctx.beginPath();
        ctx.ellipse(lx + dir*(6 + leafWiggle * 0.4), ly - dir*3 + leafWiggle, 5.2, 2.8, dir*0.8 + leafWiggle*0.06, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + dir*(6 + leafWiggle * 0.4), ly - dir*3 + leafWiggle);
        ctx.stroke();
      }
    }
  }
}

function drawTile(pos, movable, selected){
  const corners = tileCorners(pos.x, pos.y);
  const fill = selected ? '#f7e2b2' : movable ? '#e7d2ad' : '#d8b183';
  const stroke = selected ? '#c77722' : movable ? '#8e5d2e' : '#7a4d28';

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = selected ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(corners[0].sx, corners[0].sy);
  for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i].sx, corners[i].sy);
  ctx.closePath();
  ctx.fill();

  // Dirt speckles are generated in tile-space so they stay anchored to tile movement/rotation.
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 24; i++) {
    const localX = (((i * 19 + pos.x * 11) % 100) / 100 - 0.5) * 0.78;
    const localY = (((i * 23 + pos.y * 13) % 100) / 100 - 0.5) * 0.78;
    const center = worldToScreen(pos.x + localX, pos.y + localY);
    const xAxis = worldToScreen(pos.x + localX + 0.04, pos.y + localY);
    const yAxis = worldToScreen(pos.x + localX, pos.y + localY + 0.04);
    const angle = Math.atan2(yAxis.sy - center.sy, yAxis.sx - center.sx);
    const speckScaleX = Math.max(1.4, Math.hypot(xAxis.sx - center.sx, xAxis.sy - center.sy) * (5 + (i % 3)));
    const speckScaleY = Math.max(1.1, Math.hypot(yAxis.sx - center.sx, yAxis.sy - center.sy) * (4 + ((i + 1) % 2)));

    ctx.fillStyle = i % 2 === 0 ? 'rgba(86, 56, 32, 0.24)' : 'rgba(186, 147, 97, 0.2)';
    ctx.beginPath();
    ctx.ellipse(center.sx, center.sy, speckScaleX * 0.16, speckScaleY * 0.16, angle + (i % 5) * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.stroke();
  ctx.strokeStyle = 'rgba(42,36,28,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFlower(player, x, y, z, topPiece){
  const { sx, sy: pyFinal } = worldToScreen(x, y, z * FLOWER_VERTICAL_SPACING);
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


function fitCameraToBoard(){
  if (state.tiles.size === 0) return;
  const points = [];
  for (const {x,y} of state.tiles.values()) {
    points.push([x-0.5,y-0.5],[x+0.5,y-0.5],[x+0.5,y+0.5],[x-0.5,y+0.5]);
  }

  const xs = [...state.tiles.values()].map((t)=>t.x);
  const ys = [...state.tiles.values()].map((t)=>t.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) * 0.5;
  const cy = (Math.min(...ys) + Math.max(...ys)) * 0.5;

  const { yaw, pitch } = state.camera;
  const yawCos = Math.cos(yaw), yawSin = Math.sin(yaw);
  const floorTilt = Math.max(0.58, Math.cos(pitch));
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (const [px,py] of points) {
    const localX = (px - cx) * state.tileSpacing;
    const localY = (py - cy) * state.tileSpacing * 0.85;
    const rotX = localX * yawCos - localY * yawSin;
    const rotY = localX * yawSin + localY * yawCos;
    minX = Math.min(minX, rotX); maxX = Math.max(maxX, rotX);
    minY = Math.min(minY, rotY * floorTilt); maxY = Math.max(maxY, rotY * floorTilt);
  }
  const boardW = Math.max(1, maxX - minX);
  const boardH = Math.max(1, maxY - minY);
  const targetW = canvas.width * 0.42;
  const targetH = canvas.height * 0.34;
  state.camera.zoom = Math.max(0.9, Math.min(2.6, Math.min(targetW / boardW, targetH / boardH)));
}



function ensureCoordinateVisible(x, y){
  const { sx, sy } = worldToScreen(x, y);
  const marginX = canvas.width * 0.12;
  const marginY = canvas.height * 0.15;
  const isOffscreen = sx < marginX || sx > canvas.width - marginX || sy < marginY || sy > canvas.height - marginY;
  if (!isOffscreen) return;
  state.camera.userAdjusted = false;
  fitCameraToBoard();
}

function tilesByDepth(){
  return [...state.tiles.entries()]
    .map(([tid, pos])=>({ tid, pos }))
    .sort((a,b)=> (a.pos.y - b.pos.y) || (a.pos.x - b.pos.x));
}

function drawProjectedSquare(x, y, color){
  const corners = tileCorners(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(corners[0].sx, corners[0].sy);
  for (let i=1;i<corners.length;i++) ctx.lineTo(corners[i].sx, corners[i].sy);
  ctx.closePath();
  ctx.fill();
}


function projectedTileRadius(x, y){
  const c = worldToScreen(x, y);
  const corners = tileCorners(x, y);
  const r = corners.reduce((acc,pt)=>acc + Math.hypot(pt.sx - c.sx, pt.sy - c.sy), 0) / corners.length;
  return Math.max(20, r * 0.62);
}

function draw(){
  pruneWiltingEffects();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const t = (state.t || performance.now()) * 0.001;

  const horizonY = canvas.height * (0.34 + (1 - state.camera.pitch) * 0.18);

  // Sky gradient above the horizon so camera movement always reveals blue sky.
  const skyGradient = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGradient.addColorStop(0, '#9ad6ff');
  skyGradient.addColorStop(0.68, '#bde9ff');
  skyGradient.addColorStop(1, '#d6f3ff');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvas.width, Math.max(1, horizonY));

  // Ground gradient starts at the horizon line and deepens toward foreground.
  const groundGradient = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
  groundGradient.addColorStop(0, '#a7da90');
  groundGradient.addColorStop(0.5, '#93ce7e');
  groundGradient.addColorStop(1, '#84bf74');
  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

  ctx.strokeStyle = 'rgba(116, 181, 124, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 0.5);
  ctx.quadraticCurveTo(canvas.width * 0.5, horizonY - 16, canvas.width, horizonY + 0.5);
  ctx.stroke();

  for (let y = 0; y < canvas.height; y += 3) {
    if (y < horizonY) continue;
    const wave = Math.sin(t * 0.55 + y * 0.03) * 18;
    ctx.strokeStyle = `rgba(162, 214, 138, ${0.06 + ((y / canvas.height) * 0.05)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y + wave * 0.1);
    ctx.stroke();
  }

  for (let i = 0; i < 340; i++) {
    const x = (i * 73) % canvas.width;
    const y = ((i * 97) % canvas.height) + 8;
    if (y < horizonY) continue;
    const h = 3 + (i % 5);
    const bend = ((i % 4) - 1.5) * 0.8 + Math.sin(t * 1.2 + i * 0.14) * 1.6;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(76, 140, 62, 0.28)' : 'rgba(104, 170, 85, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + bend, y - h * 0.5, x + bend * 1.2, y - h);
    ctx.stroke();
  }
  const highlight = activeTurnHighlight();

  const orderedTiles = tilesByDepth();
  const selectedMoves = state.selectedTileId ? state.legalMoves.filter(m=>m.tid===state.selectedTileId) : [];
  if (state.phase === 'selectDest') {
    for (const m of selectedMoves) drawProjectedSquare(m.to.x, m.to.y, highlight.ghost);
  }
  if (state.phase === 'place') {
    for (const {pos} of orderedTiles) drawProjectedSquare(pos.x, pos.y, 'rgba(95,201,120,0.14)');
  }

  for(const {tid,pos} of orderedTiles){
    drawTile(pos, state.phase==='selectTile'&&state.legalMoves.some(m=>m.tid===tid), state.hoverTileId===tid || state.selectedTileId===tid);
  }
  drawVineConnections();
  for(const {pos} of orderedTiles){
    const stack=state.stacks.get(key(pos.x,pos.y))||[]; const {sx,sy}=worldToScreen(pos.x,pos.y);
    stack.forEach((p,z)=>drawFlower(p,pos.x,pos.y,z,z===stack.length-1));
    if (state.phase === 'place' && state.hoverPlaceTileId) {
      const hoverPos = state.tiles.get(state.hoverPlaceTileId);
      if (hoverPos && hoverPos.x === pos.x && hoverPos.y === pos.y) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        drawFlower(state.turn, pos.x, pos.y, stack.length, true);
        ctx.restore();
      }
    }
    if(stack.length>=6){ ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='bold 14px Inter'; ctx.fillText(String(stack.length),sx+20,sy-stack.length*FLOWER_VERTICAL_SPACING); }
  }

}

function winnerAnnouncement(player){
  const side = player[0].toUpperCase() + player.slice(1);
  return `${side} has prevailed.\nYour colony became the dominant invasive species, aggressively expanding across the root network and thigmotropically overgrowing the opposing bloom. Deprived of sunlight and lateral exposure, the rival colony collapsed under complete ecological suffocation.\nThe canopy now belongs to you.`;
}

function showWinModal(player){
  if (!ui.winModal || !ui.winTitle || !ui.winAnnouncement) return;
  const side = player[0].toUpperCase() + player.slice(1);
  ui.winTitle.textContent = `${side} has prevailed.`;
  ui.winAnnouncement.textContent = winnerAnnouncement(player);
  ui.winModal.classList.remove('hidden');
}

function hideWinModal(){
  if (!ui.winModal) return;
  ui.winModal.classList.add('hidden');
}

function restartGame(){
  state.turn = 'purple';
  state.phase = 'selectTile';
  state.tiles = new Map();
  state.stacks = new Map();
  state.openingRound = 2;
  state.captures = { purple: 0, orange: 0 };
  state.selectedTileId = null;
  state.legalMoves = [];
  state.undoSnapshot = null;
  state.winner = null;
  state.wiltingEffects = [];
  state.drag = { active: false, moved: false, startX: 0, startY: 0, startYaw: 0, startPitch: 0 };
  hideWinModal();
  init();
  log('Replay started. New colony skirmish begins.');
}

function refresh(){
  state.legalMoves = legalMovesFor(state.turn);
  ui.scorePurple.textContent = state.captures.purple;
  ui.scoreOrange.textContent = state.captures.orange;
  const phaseText = state.winner ? `${state.winner.toUpperCase()} WINS` : (state.phase==='selectTile' ? 'Move a tile' : state.phase==='selectDest' ? 'Select destination' : 'Place a piece');
  ui.turnInfo.textContent = `${state.turn[0].toUpperCase()+state.turn.slice(1)} Turn · ${phaseText}`;
  document.getElementById('app-shell').style.setProperty('--edge-glow', state.turn==='purple' ? '#8f66ff88' : '#ffb14f88');
  syncMobileFlowerDock();
  draw();
}

function isMobileViewport(){ return window.matchMedia('(max-width: 900px)').matches; }
function syncMobileFlowerDock(){
  if (!ui.mobileFlowerIcon || !ui.mobileFlowerDock) return;
  const ready = isMobileViewport() && !state.winner && state.phase === 'place';
  ui.mobileFlowerDock.style.display = isMobileViewport() ? 'block' : 'none';
  ui.mobileFlowerIcon.classList.toggle('ready', ready);
  ui.mobileFlowerIcon.classList.toggle('purple', state.turn === 'purple');
  ui.mobileFlowerIcon.classList.toggle('orange', state.turn === 'orange');
}

function nearestTile(mx,my){
  let best=null, bestScore=1e9;
  for(const [tid,pos] of state.tiles){
    const center=worldToScreen(pos.x,pos.y);
    const d = Math.hypot(mx-center.sx,my-center.sy);
    const score = d / projectedTileRadius(pos.x, pos.y);
    if(score<bestScore){bestScore=score;best={tid,pos};}
  }
  return bestScore < 1 ? best : null;
}
function nearestGhost(mx,my){
  if(state.phase!=='selectDest'||!state.selectedTileId) return null;
  let best=null,bestScore=1e9;
  for(const m of state.legalMoves.filter(m=>m.tid===state.selectedTileId)){
    const c=worldToScreen(m.to.x,m.to.y);
    const d=Math.hypot(mx-c.sx,my-c.sy);
    const score = d / projectedTileRadius(m.to.x, m.to.y);
    if(score<bestScore){bestScore=score;best=m;}
  }
  return bestScore<1 ? best : null;
}
function canvasPointFromClient(clientX, clientY){
  const rect=canvas.getBoundingClientRect();
  return {
    mx:(clientX-rect.left)*(canvas.width/rect.width),
    my:(clientY-rect.top)*(canvas.height/rect.height),
  };
}
function handleBoardClick(mx,my){
  if (state.winner || state.drag.moved || state.touch.moved) { state.drag.moved = false; state.touch.moved = false; return; }
  if(state.phase==='selectTile'){
    const t=nearestTile(mx,my); if(!t) return;
    if(!state.legalMoves.some(m=>m.tid===t.tid)) return;
    state.selectedTileId=t.tid; state.phase='selectDest'; state.hoverPlaceTileId=null; ensureCoordinateVisible(t.pos.x, t.pos.y); refresh(); return;
  }
  if(state.phase==='selectDest'){
    const selectedTile = nearestTile(mx,my);
    if (selectedTile?.tid === state.selectedTileId) {
      state.phase = 'selectTile';
      state.selectedTileId = null;
      state.hoverPlaceTileId = null;
      refresh();
      return;
    }
    const m=nearestGhost(mx,my); if(!m) return;
    if (!isLegalTileTranslation(m.tid, m.to.x, m.to.y, state.turn)) {
      log('Illegal move: must be a 1-step influenced move to an empty coordinate that preserves orthogonal connectivity.');
      return;
    }
    state.undoSnapshot = snapshot();
    const p=state.tiles.get(m.tid); const fromK=key(p.x,p.y), toK=key(m.to.x,m.to.y); const stack=state.stacks.get(fromK);
    state.stacks.delete(fromK); state.stacks.set(toK,stack); p.x=m.to.x; p.y=m.to.y;
    state.phase='place'; state.hoverPlaceTileId=null; ensureCoordinateVisible(p.x, p.y); log(`${state.turn} moved tile to (${p.x}, ${p.y})`); refresh(); return;
  }
  if(state.phase==='place'){
    const t=nearestTile(mx,my); if(!t) return;
    placeFlowerOnTile(t.tid);
  }
}

function placeFlowerOnTile(tileId){
  const pos = state.tiles.get(tileId);
  if (!pos || state.phase !== 'place' || state.winner) return;
  state.stacks.get(key(pos.x,pos.y)).push(state.turn);
  resolveCaptures(state.turn);
  if(state.captures[state.turn] >= WIN_CAPTURES){ state.winner=state.turn; showWinModal(state.turn); refresh(); return; }
  state.turn = other(state.turn);
  if(state.openingRound>0) state.openingRound -= 1;
  state.phase='selectTile'; state.selectedTileId=null; state.hoverPlaceTileId=null; refresh();
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
  state.camera.userAdjusted = true;
  state.camera.yaw = state.drag.startYaw + dx * 0.0075;
  state.camera.pitch = Math.max(0.35, Math.min(0.98, state.drag.startPitch + dy * 0.0048));
  draw();
});

canvas.addEventListener('mousemove', (e)=>{
  if (state.drag.active) return;
  const rect=canvas.getBoundingClientRect();
  const mx=(e.clientX-rect.left)*(canvas.width/rect.width);
  const my=(e.clientY-rect.top)*(canvas.height/rect.height);
  const tile = nearestTile(mx,my);
  const nextHoverTileId = (state.phase === 'selectTile' || state.phase === 'place') ? (tile ? tile.tid : null) : null;
  const nextHoverPlaceTileId = state.phase === 'place' ? (tile ? tile.tid : null) : null;
  if (nextHoverTileId !== state.hoverTileId || nextHoverPlaceTileId !== state.hoverPlaceTileId) {
    state.hoverTileId = nextHoverTileId;
    state.hoverPlaceTileId = nextHoverPlaceTileId;
    draw();
  }
});

window.addEventListener('mouseup', ()=>{
  state.drag.active = false;
});

canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0012);
  state.camera.userAdjusted = true;
  state.camera.zoom = Math.max(0.85, Math.min(2.6, state.camera.zoom * factor));
  draw();
}, { passive: false });
canvas.addEventListener('click', (e)=>{
  if (performance.now() < state.touch.suppressClickUntil) return;
  const { mx, my } = canvasPointFromClient(e.clientX, e.clientY);
  handleBoardClick(mx, my);
});
canvas.addEventListener('touchstart', (e)=>{
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const { mx, my } = canvasPointFromClient(t.clientX, t.clientY);
    const canRotate = !nearestTile(mx,my) && !nearestGhost(mx,my);
    state.touch.mode = canRotate ? 'rotate' : 'tap';
    state.touch.moved = false;
    state.touch.startX = t.clientX;
    state.touch.startY = t.clientY;
    state.touch.startYaw = state.camera.yaw;
    state.touch.startPitch = state.camera.pitch;
  } else if (e.touches.length === 2) {
    const a = e.touches[0], b = e.touches[1];
    state.touch.mode = 'pinch';
    state.touch.pinchDist = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    state.touch.pinchZoom = state.camera.zoom;
    state.touch.moved = true;
  }
}, { passive: true });
canvas.addEventListener('touchmove', (e)=>{
  if (state.touch.mode === 'rotate' && e.touches.length === 1) {
    const t = e.touches[0];
    const dx = t.clientX - state.touch.startX;
    const dy = t.clientY - state.touch.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.touch.moved = true;
    state.camera.userAdjusted = true;
    state.camera.yaw = state.touch.startYaw + dx * 0.0075;
    state.camera.pitch = Math.max(0.35, Math.min(0.98, state.touch.startPitch + dy * 0.0048));
    draw();
  } else if (state.touch.mode === 'pinch' && e.touches.length === 2) {
    const a = e.touches[0], b = e.touches[1];
    const dist = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    const factor = dist / state.touch.pinchDist;
    state.camera.userAdjusted = true;
    state.camera.zoom = Math.max(0.85, Math.min(2.6, state.touch.pinchZoom * factor));
    draw();
  }
}, { passive: true });
canvas.addEventListener('touchend', (e)=>{
  state.touch.suppressClickUntil = performance.now() + 700;
  if (state.touch.mode === 'tap' && e.changedTouches.length) {
    const t = e.changedTouches[0];
    const { mx, my } = canvasPointFromClient(t.clientX, t.clientY);
    handleBoardClick(mx, my);
  }
  if (e.touches.length === 0) state.touch.mode = 'none';
}, { passive: true });


if (ui.mobileFlowerIcon) {
  const dragMove = (clientX, clientY)=>{
    const { mx, my } = canvasPointFromClient(clientX, clientY);
    const tile = nearestTile(mx, my);
    state.mobilePlaceDrag.snappedTileId = tile ? tile.tid : null;
    state.hoverPlaceTileId = state.mobilePlaceDrag.snappedTileId;
    draw();
  };
  ui.mobileFlowerIcon.addEventListener('pointerdown', (e)=>{
    if (!isMobileViewport() || state.phase !== 'place' || state.winner) return;
    e.preventDefault();
    ui.mobileFlowerIcon.setPointerCapture(e.pointerId);
    state.mobilePlaceDrag.active = true;
    state.mobilePlaceDrag.snappedTileId = null;
    state.hoverPlaceTileId = null;
  });
  ui.mobileFlowerIcon.addEventListener('pointermove', (e)=>{
    if (!state.mobilePlaceDrag.active) return;
    dragMove(e.clientX, e.clientY);
  });
  ui.mobileFlowerIcon.addEventListener('pointerup', (e)=>{
    if (!state.mobilePlaceDrag.active) return;
    state.mobilePlaceDrag.active = false;
    ui.mobileFlowerIcon.releasePointerCapture(e.pointerId);
    const dropTileId = state.mobilePlaceDrag.snappedTileId;
    state.mobilePlaceDrag.snappedTileId = null;
    state.hoverPlaceTileId = null;
    if (dropTileId) placeFlowerOnTile(dropTileId);
    else draw();
  });
  ui.mobileFlowerIcon.addEventListener('pointercancel', ()=>{
    state.mobilePlaceDrag.active = false;
    state.mobilePlaceDrag.snappedTileId = null;
    state.hoverPlaceTileId = null;
    draw();
  });
}

if (ui.undoBtn) ui.undoBtn.addEventListener('click',()=>{ if(state.undoSnapshot){ restore(state.undoSnapshot); log('Turn undone.'); }});
if (ui.replayBtn) ui.replayBtn.addEventListener('click', restartGame);
function tick(ts){ state.t=ts; draw(); requestAnimationFrame(tick); }

log('Thigmo botanical battlefield loaded.');
resizeCanvas();
init();
requestAnimationFrame(tick);

window.addEventListener('resize', ()=>{ resizeCanvas(); if (!state.camera.userAdjusted) fitCameraToBoard(); draw(); });

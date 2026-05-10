window.THIGMO_BUILD = '2026-05-10-playable-2d';

const WIN_CAPTURES = 10;
const ui = {
  viewport: document.getElementById('viewport'),
  scorePurple: document.getElementById('score-purple'),
  scoreOrange: document.getElementById('score-orange'),
  turnInfo: document.getElementById('turn-info'),
  libertyToggle: document.getElementById('liberty-toggle'),
  spacing: document.getElementById('spacing'),
  undoBtn: document.getElementById('undo-btn'),
  log: document.getElementById('log'),
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
    if(remEnemy.length){ removeCells(remEnemy); state.captures[active]+=remEnemy.length; changed=true; }

    const occ2 = getOccupancy();
    const visited2=new Set();
    const remOwn=[];
    for(const c of occ2.keys()){
      if(visited2.has(c)||occ2.get(c)!==active) continue;
      const g=groupFrom(c,occ2); g.forEach(v=>visited2.add(v));
      if(liberties(g,occ2).size===0) remOwn.push(...g);
    }
    if(remOwn.length){ removeCells(remOwn); changed=true; }
  }
}

function worldToScreen(x,y){
  const centerX = canvas.width*0.45;
  const centerY = canvas.height*0.5;
  return { sx: centerX + x*state.tileSpacing, sy: centerY + y*state.tileSpacing*0.85 };
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#bde6af'; ctx.fillRect(0,0,canvas.width,canvas.height);

  const selectedMoves = state.selectedTileId ? state.legalMoves.filter(m=>m.tid===state.selectedTileId) : [];
  if (state.phase === 'selectDest') {
    for(const m of selectedMoves){
      const {sx,sy}=worldToScreen(m.to.x,m.to.y);
      ctx.fillStyle='rgba(199,170,122,0.6)';
      ctx.fillRect(sx-30,sy-30,60,60);
    }
  }

  for(const [tid,pos] of state.tiles){
    const {sx,sy}=worldToScreen(pos.x,pos.y);
    ctx.fillStyle = '#714625';
    ctx.fillRect(sx-34,sy-34,68,68);

    if (state.phase === 'selectTile' && state.legalMoves.some(m=>m.tid===tid)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.strokeRect(sx-36,sy-36,72,72);
    }

    const stack = state.stacks.get(key(pos.x,pos.y)) || [];
    stack.forEach((p,z)=>{
      const yOffset = sy - z*16;
      ctx.fillStyle = p === 'purple' ? '#7a3cff' : '#ff9f1c';
      ctx.beginPath(); ctx.arc(sx,yOffset,12,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = p === 'purple' ? '#c9b5ff' : '#ffd19a'; ctx.lineWidth=2; ctx.stroke();
    });
  }

  if (ui.libertyToggle.checked) drawLibertyAssist();
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
    ctx.beginPath(); ctx.arc(sx, sy - z*16, 6, 0, Math.PI*2); ctx.fill();
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

canvas.addEventListener('click', (e)=>{
  if (state.winner) return;
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

ui.undoBtn.addEventListener('click', ()=>{ if(state.undoSnapshot) { restore(state.undoSnapshot); log('Turn undone.'); } });
ui.spacing.addEventListener('input', ()=>{ state.tileSpacing = 56 + Number(ui.spacing.value)*10; draw(); });
ui.libertyToggle.addEventListener('change', draw);
window.addEventListener('resize', ()=>{ draw(); });

log('Thigmo loaded.');
init();

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
  turn: 'purple', phase: 'selectTile', tiles: new Map(), stacks: new Map(),
  openingRound: 2, captures: { purple: 0, orange: 0 }, selectedTileId: null,
  legalMoves: [], tileSpacing: 88, undoSnapshot: null, winner: null,
  hoverTileId: null, hoverGhost: null, t: 0,
};

const canvas = document.createElement('canvas');
canvas.width = 1200; canvas.height = 800;
canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block';
ui.viewport.appendChild(canvas);
const ctx = canvas.getContext('2d');

const key=(x,y)=>`${x},${y}`; const cellKey=(x,y,z)=>`${x},${y},${z}`;
const other=(p)=>p==='purple'?'orange':'purple';
const neighbors8=(x,y)=>{const o=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy)o.push([x+dx,y+dy]);return o;};
const neighbors6=(x,y,z)=>[[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]];
function log(msg){ const div=document.createElement('div'); div.textContent=msg; ui.log.prepend(div); }

function init(){ let id=0; for(let y=0;y<2;y++)for(let x=0;x<4;x++){ const tid=`t${id++}`; state.tiles.set(tid,{x,y}); state.stacks.set(key(x,y),[]);} refresh(); requestAnimationFrame(tick); }
function snapshot(){ return { ...state, captures:{...state.captures}, tiles:new Map([...state.tiles].map(([k,v])=>[k,{...v}])), stacks:new Map([...state.stacks].map(([k,v])=>[k,[...v]]))}; }
function restore(s){ Object.assign(state,s); refresh(); }

function influencedTiles(player){
  if(state.openingRound>0) return new Set([...state.tiles.keys()]);
  const set=new Set();
  for(const [tid,pos] of state.tiles){
    if(state.stacks.get(key(pos.x,pos.y)).includes(player)){ set.add(tid); continue; }
    for(const [nx,ny] of neighbors8(pos.x,pos.y)) if(state.stacks.get(key(nx,ny))?.includes(player)) { set.add(tid); break; }
  }
  return set;
}
function legalMovesFor(player){
  const moves=[], influenced=influencedTiles(player), occ=new Set([...state.tiles.values()].map(t=>key(t.x,t.y)));
  for(const [tid,from] of state.tiles) if(influenced.has(tid)) for(const [nx,ny] of neighbors8(from.x,from.y)) if(!occ.has(key(nx,ny))) moves.push({tid,from:{...from},to:{x:nx,y:ny}});
  return moves;
}
function hasTile(x,y){ for(const t of state.tiles.values()) if(t.x===x&&t.y===y) return true; return false; }
function getOccupancy(){ const occ=new Map(); for(const [kxy,stack] of state.stacks){ const [x,y]=kxy.split(',').map(Number); stack.forEach((c,z)=>occ.set(cellKey(x,y,z),c)); } return occ; }
function groupFrom(start,occ){ const color=occ.get(start),q=[start],seen=new Set([start]),out=[]; while(q.length){ const c=q.pop(); out.push(c); const [x,y,z]=c.split(',').map(Number); for(const [nx,ny,nz] of neighbors6(x,y,z)){ const nk=cellKey(nx,ny,nz); if(!seen.has(nk)&&occ.get(nk)===color){seen.add(nk); q.push(nk);} } } return out; }
function liberties(group,occ){ const libs=new Set(); for(const c of group){ const [x,y,z]=c.split(',').map(Number); for(const [nx,ny,nz] of neighbors6(x,y,z)){ if(nz<0) continue; if((nx!==x||ny!==y)&&!hasTile(nx,ny)) continue; const nk=cellKey(nx,ny,nz); if(!occ.has(nk)) libs.add(nk);} } return libs; }
function removeCells(cells){ const map=new Map(); for(const c of cells){ const [x,y,z]=c.split(',').map(Number),kxy=key(x,y); if(!map.has(kxy)) map.set(kxy,[]); map.get(kxy).push(z);} for(const [kxy,zs] of map){ const s=state.stacks.get(kxy)||[]; state.stacks.set(kxy,s.filter((_,i)=>!zs.includes(i))); } }
function resolveCaptures(active){ let changed=true; while(changed){ changed=false; const occ=getOccupancy(),visited=new Set(),groups={purple:[],orange:[]}; for(const c of occ.keys()){ if(visited.has(c)) continue; const g=groupFrom(c,occ); g.forEach(v=>visited.add(v)); groups[occ.get(c)].push(g);} const remEnemy=[]; for(const g of groups[other(active)]) if(liberties(g,occ).size===0) remEnemy.push(...g); if(remEnemy.length){removeCells(remEnemy); state.captures[active]+=remEnemy.length; changed=true;} const occ2=getOccupancy(),visited2=new Set(),remOwn=[]; for(const c of occ2.keys()){ if(visited2.has(c)||occ2.get(c)!==active) continue; const g=groupFrom(c,occ2); g.forEach(v=>visited2.add(v)); if(liberties(g,occ2).size===0) remOwn.push(...g);} if(remOwn.length){removeCells(remOwn); changed=true;} }}

function worldToScreen(x,y){ const cx=canvas.width*0.45, cy=canvas.height*0.5; return {sx:cx+x*state.tileSpacing, sy:cy+y*state.tileSpacing*0.85}; }
function tileRect(pos){ const {sx,sy}=worldToScreen(pos.x,pos.y); return {sx,sy,w:74,h:64}; }

function drawBackground(){
  const g=ctx.createRadialGradient(canvas.width*0.35,canvas.height*0.3,60,canvas.width*0.5,canvas.height*0.5,900);
  g.addColorStop(0,'#6f9a57'); g.addColorStop(1,'#36552f'); ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<220;i++){ const x=(i*97)%canvas.width, y=(i*61)%canvas.height; const a=0.06+0.03*Math.sin(i+state.t*0.0005); ctx.fillStyle=`rgba(209,244,180,${a})`; ctx.beginPath(); ctx.arc(x,y,10+((i*7)%11),0,Math.PI*2); ctx.fill(); }
}

function drawTile(pos, active, hover){
  const {sx,sy,w,h}=tileRect(pos);
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sx+3,sy+20,w*0.58,h*0.28,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#3c2a1d'; ctx.fillRect(sx-w/2,sy-h/2+8,w,h*0.24);
  const soil=ctx.createLinearGradient(sx,sy-h/2,sx,sy+h/2); soil.addColorStop(0,'#6b4d35'); soil.addColorStop(1,'#3c2818');
  ctx.fillStyle=soil; roundRect(sx-w/2,sy-h/2,w,h,12); ctx.fill();
  ctx.strokeStyle='rgba(196,230,161,.35)'; ctx.lineWidth=2; roundRect(sx-w/2,sy-h/2,w,h,12); ctx.stroke();
  for(let i=0;i<10;i++){ ctx.strokeStyle='rgba(95,63,40,.35)'; ctx.beginPath(); ctx.moveTo(sx-w/2+8+i*7,sy-h/2+6); ctx.lineTo(sx-w/2+4+i*7,sy+h/2-6); ctx.stroke(); }
  if(active||hover){ const pulse=0.35+0.25*Math.sin(state.t*0.006); ctx.strokeStyle=active?`rgba(219,255,190,${pulse+0.35})`:`rgba(244,255,220,${pulse})`; ctx.lineWidth=4; roundRect(sx-w/2-2,sy-h/2-2,w+4,h+4,14); ctx.stroke(); }
}

function drawFlower(player,x,y,z,top){
  const sway = Math.sin(state.t*0.003 + z + x*0.7 + y*0.3) * 2;
  const stemH=15; const py=y-z*18;
  if(z>0){ ctx.strokeStyle='rgba(80,110,65,.9)'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(x+sway*0.4,py+8); ctx.lineTo(x+sway*0.2,py+stemH+5); ctx.stroke(); }
  const pal = player==='purple'
    ? {petal:'#9270ff',core:'#d8cbff',leaf:'#527749',glow:'rgba(176,145,255,.35)'}
    : {petal:'#ff9f42',core:'#ffe5b5',leaf:'#64863f',glow:'rgba(255,172,89,.28)'};
  if(top){ ctx.fillStyle=pal.glow; ctx.beginPath(); ctx.arc(x,py-2,20,0,Math.PI*2); ctx.fill(); }
  ctx.strokeStyle=pal.leaf; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x-2,py+6); ctx.quadraticCurveTo(x-12,py+4,x-8,py-4); ctx.stroke();
  for(let p=0;p<6;p++){ const a=(Math.PI*2/6)*p + state.t*0.0002; const px=x+Math.cos(a)*8+sway, py2=py+Math.sin(a)*6; ctx.fillStyle=pal.petal; ctx.beginPath(); ctx.ellipse(px,py2,5.5,3.5,a,0,Math.PI*2); ctx.fill(); }
  ctx.fillStyle=pal.core; ctx.beginPath(); ctx.arc(x+sway*0.6,py,3.6,0,Math.PI*2); ctx.fill();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height); drawBackground();
  const selectedMoves = state.selectedTileId ? state.legalMoves.filter(m=>m.tid===state.selectedTileId) : [];
  if(state.phase==='selectDest') for(const m of selectedMoves){ const {sx,sy}=worldToScreen(m.to.x,m.to.y); const pulse=0.5+0.3*Math.sin(state.t*0.01 + sx); ctx.fillStyle=`rgba(223,245,192,${pulse})`; roundRect(sx-32,sy-28,64,56,14); ctx.fill(); }

  for(const [tid,pos] of state.tiles){
    drawTile(pos, state.phase==='selectTile'&&state.legalMoves.some(m=>m.tid===tid), state.hoverTileId===tid || state.selectedTileId===tid);
    const stack=state.stacks.get(key(pos.x,pos.y))||[]; const {sx,sy}=worldToScreen(pos.x,pos.y);
    stack.forEach((p,z)=>drawFlower(p,sx,sy-3,z,z===stack.length-1));
    if(stack.length>=6){ ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='bold 14px Inter'; ctx.fillText(String(stack.length),sx+20,sy-stack.length*18); }
  }
  if(ui.libertyToggle.checked) drawLibertyAssist();
}

function drawLibertyAssist(){ const enemy=other(state.turn),occ=getOccupancy(),seen=new Set(),assists=new Set(); for(const c of occ.keys()){ if(seen.has(c)||occ.get(c)!==enemy) continue; const g=groupFrom(c,occ); g.forEach(v=>seen.add(v)); liberties(g,occ).forEach(l=>assists.add(l)); } for(const l of assists){ const [x,y,z]=l.split(',').map(Number); const {sx,sy}=worldToScreen(x,y); ctx.fillStyle='rgba(196,255,178,.78)'; ctx.beginPath(); ctx.arc(sx,sy-z*18,5.3,0,Math.PI*2); ctx.fill(); }}

function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function refresh(){ state.legalMoves=legalMovesFor(state.turn); ui.scorePurple.textContent=state.captures.purple; ui.scoreOrange.textContent=state.captures.orange; const phaseText=state.winner?`${state.winner.toUpperCase()} WINS`:(state.phase==='selectTile'?'Move living soil tile':state.phase==='selectDest'?'Select growth destination':'Plant invasive bloom'); ui.turnInfo.textContent=`${state.turn[0].toUpperCase()+state.turn.slice(1)} Turn · ${phaseText}`; document.getElementById('app-shell').style.setProperty('--edge-glow', state.turn==='purple' ? '#a084ff66' : '#ffbf7366'); draw(); }
function nearestTile(mx,my){ let best=null,bestD=1e9; for(const [tid,pos] of state.tiles){ const {sx,sy}=worldToScreen(pos.x,pos.y); const d=Math.hypot(mx-sx,my-sy); if(d<bestD){bestD=d;best={tid,pos};}} return bestD<52?best:null; }
function nearestGhost(mx,my){ if(state.phase!=='selectDest'||!state.selectedTileId) return null; let best=null,bestD=1e9; for(const m of state.legalMoves.filter(m=>m.tid===state.selectedTileId)){ const {sx,sy}=worldToScreen(m.to.x,m.to.y); const d=Math.hypot(mx-sx,my-sy); if(d<bestD){bestD=d;best=m;}} return bestD<55?best:null; }

canvas.addEventListener('mousemove',(e)=>{ const r=canvas.getBoundingClientRect(); const mx=(e.clientX-r.left)*(canvas.width/r.width), my=(e.clientY-r.top)*(canvas.height/r.height); state.hoverTileId=nearestTile(mx,my)?.tid||null; state.hoverGhost=nearestGhost(mx,my); draw(); });
canvas.addEventListener('click',(e)=>{ if(state.winner) return; const rect=canvas.getBoundingClientRect(); const mx=(e.clientX-rect.left)*(canvas.width/rect.width), my=(e.clientY-rect.top)*(canvas.height/rect.height);
  if(state.phase==='selectTile'){ const t=nearestTile(mx,my); if(!t||!state.legalMoves.some(m=>m.tid===t.tid)) return; state.selectedTileId=t.tid; state.phase='selectDest'; refresh(); return; }
  if(state.phase==='selectDest'){ const m=nearestGhost(mx,my); if(!m) return; state.undoSnapshot=snapshot(); const p=state.tiles.get(m.tid), fromK=key(p.x,p.y), toK=key(m.to.x,m.to.y), stack=state.stacks.get(fromK); state.stacks.delete(fromK); state.stacks.set(toK,stack); p.x=m.to.x; p.y=m.to.y; state.phase='place'; log(`${state.turn} shifted living earth to (${p.x}, ${p.y})`); refresh(); return; }
  if(state.phase==='place'){ const t=nearestTile(mx,my); if(!t) return; state.stacks.get(key(t.pos.x,t.pos.y)).push(state.turn); resolveCaptures(state.turn); if(state.captures[state.turn]>=WIN_CAPTURES){ state.winner=state.turn; refresh(); return; } state.turn=other(state.turn); if(state.openingRound>0) state.openingRound-=1; state.phase='selectTile'; state.selectedTileId=null; refresh(); }
});

ui.undoBtn.addEventListener('click',()=>{ if(state.undoSnapshot){ restore(state.undoSnapshot); log('Turn undone.'); }});
ui.spacing.addEventListener('input',()=>{ state.tileSpacing=56+Number(ui.spacing.value)*10; draw(); });
ui.libertyToggle.addEventListener('change',draw);
function tick(ts){ state.t=ts; draw(); requestAnimationFrame(tick); }

log('Thigmo botanical battlefield loaded.');
init();

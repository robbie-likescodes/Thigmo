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
const state={turn:'purple',phase:'selectTile',tiles:new Map(),stacks:new Map(),captures:{purple:0,orange:0},selectedTileId:null,legalMoves:[],undoSnapshot:null,winner:null,tileSpacing:88,captureFx:[],hoverTile:null};
const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=840;canvas.style.width='100%';canvas.style.height='100%';ui.viewport.appendChild(canvas);const ctx=canvas.getContext('2d');
const key=(x,y)=>`${x},${y}`; const other=(p)=>p==='purple'?'orange':'purple'; const ckey=(x,y,z)=>`${x},${y},${z}`;
const n8=(x,y)=>{const a=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(dx||dy)a.push([x+dx,y+dy]);return a;};
const n6=(x,y,z)=>[[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]];
function log(msg,type=''){const d=document.createElement('div');d.className=`log-entry ${type}`;d.textContent=msg;ui.log.prepend(d);}
function setFeedback(msg){ui.feedback.textContent=msg;}
function init(){let id=0;for(let y=0;y<2;y++)for(let x=0;x<4;x++){const tid=`t${id++}`;state.tiles.set(tid,{x,y});state.stacks.set(key(x,y),[]);}refresh();}
function snapshot(){return {turn:state.turn,phase:state.phase,captures:{...state.captures},selectedTileId:state.selectedTileId,tiles:new Map([...state.tiles].map(([k,v])=>[k,{...v}])),stacks:new Map([...state.stacks].map(([k,v])=>[k,[...v]])),winner:state.winner};}
function restore(s){Object.assign(state,s);refresh();}
function hasTile(x,y){for(const t of state.tiles.values())if(t.x===x&&t.y===y)return true;return false;}
function orthAdjacentToAnyTile(x,y){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(hasTile(x+dx,y+dy)) return true; return false;}
function orthAdjacentInSet(x,y,occupied){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(occupied.has(key(x+dx,y+dy))) return true; return false;}
function isOrthConnected(occupied){if(occupied.size<=1)return true;const start=occupied.values().next().value;const stack=[start],seen=new Set([start]);while(stack.length){const pos=stack.pop();const [x,y]=pos.split(',').map(Number);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nk=key(x+dx,y+dy);if(occupied.has(nk)&&!seen.has(nk)){seen.add(nk);stack.push(nk);}}}return seen.size===occupied.size;}
function influencedTiles(player){const out=new Set();for(const [tid,p] of state.tiles){if((state.stacks.get(key(p.x,p.y))||[]).includes(player)){out.add(tid);continue;}for(const [nx,ny] of n8(p.x,p.y)){if((state.stacks.get(key(nx,ny))||[]).includes(player)){out.add(tid);break;}}}return out;}
function legalMovesFor(player){const out=[],infl=influencedTiles(player),occ=new Set([...state.tiles.values()].map(t=>key(t.x,t.y)));for(const [tid,from] of state.tiles){if(!infl.has(tid))continue;for(const [nx,ny] of n8(from.x,from.y)){if(occ.has(key(nx,ny)))continue;if(!orthAdjacentToAnyTile(nx,ny))continue;const movedOcc=new Set(occ);movedOcc.delete(key(from.x,from.y));movedOcc.add(key(nx,ny));if(!isOrthConnected(movedOcc))continue;out.push({tid,from:{...from},to:{x:nx,y:ny}});}}return out;}
function getOcc(){const o=new Map();for(const [kxy,stack] of state.stacks){const [x,y]=kxy.split(',').map(Number);stack.forEach((p,z)=>o.set(ckey(x,y,z),p));}return o;}
function groupFrom(start,occ){const color=occ.get(start),q=[start],seen=new Set([start]),out=[];while(q.length){const c=q.pop();out.push(c);const [x,y,z]=c.split(',').map(Number);for(const [nx,ny,nz] of n6(x,y,z)){const nk=ckey(nx,ny,nz);if(!seen.has(nk)&&occ.get(nk)===color){seen.add(nk);q.push(nk);}}}return out;}
// Liberties are computed in 3D using ONLY orthogonal 6-neighbor adjacency.
// Horizontal liberties require a tile to physically exist at that (x,y) coordinate.
function liberties(group,occ){const libs=new Set();for(const c of group){const [x,y,z]=c.split(',').map(Number);for(const [nx,ny,nz] of n6(x,y,z)){if(nz<0)continue;if((nx!==x||ny!==y)&&!hasTile(nx,ny))continue;const nk=ckey(nx,ny,nz);if(!occ.has(nk))libs.add(nk);}}return libs;}
function removeCells(cells){const by=new Map();for(const c of cells){const [x,y,z]=c.split(',').map(Number);const k=key(x,y);if(!by.has(k))by.set(k,[]);by.get(k).push(z);}for(const [k,zs] of by){const s=state.stacks.get(k)||[];state.stacks.set(k,s.filter((_,i)=>!zs.includes(i)));}}
function resolveCaptures(active){let changed=true;while(changed){changed=false;const occ=getOcc(),seen=new Set(),groups={purple:[],orange:[]};for(const c of occ.keys()){if(seen.has(c))continue;const g=groupFrom(c,occ);g.forEach(v=>seen.add(v));groups[occ.get(c)].push(g);}const remEnemy=[];for(const g of groups[other(active)])if(liberties(g,occ).size===0)remEnemy.push(...g);if(remEnemy.length){removeCells(remEnemy);state.captures[active]+=remEnemy.length;state.captureFx=remEnemy.map(c=>({c,t:20}));log(`${active} captured ${remEnemy.length} piece(s).`,'log-capture');changed=true;}const occ2=getOcc(),seen2=new Set(),remOwn=[];for(const c of occ2.keys()){if(seen2.has(c)||occ2.get(c)!==active)continue;const g=groupFrom(c,occ2);g.forEach(v=>seen2.add(v));if(liberties(g,occ2).size===0)remOwn.push(...g);}if(remOwn.length){removeCells(remOwn);log(`${active} self-capture triggered (${remOwn.length}).`,'log-capture');changed=true;}}}
function worldToScreen(x,y){return {sx:canvas.width*0.42+x*state.tileSpacing,sy:canvas.height*0.52+y*state.tileSpacing*0.84};}
function drawPiece(sx,sy,p,z){const y=sy-z*14;ctx.strokeStyle='rgba(0,0,0,.25)';ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(sx,y+8,11,4,0,0,Math.PI*2);ctx.fill();ctx.lineWidth=1.5;const c=p==='purple'?'#7b3eff':'#ff9c1f';ctx.fillStyle=c;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.ellipse(sx+Math.cos(a)*7,y+Math.sin(a)*7,5,3,a,0,Math.PI*2);ctx.fill();}ctx.beginPath();ctx.arc(sx,y,5,0,Math.PI*2);ctx.fillStyle='#ffe9a8';ctx.fill();ctx.stroke();}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#bfe4aa';ctx.fillRect(0,0,canvas.width,canvas.height);for(const [tid,p] of state.tiles){const {sx,sy}=worldToScreen(p.x,p.y);const g=ctx.createLinearGradient(sx-34,sy-34,sx+34,sy+34);g.addColorStop(0,'#8b5c33');g.addColorStop(1,'#6f4525');ctx.fillStyle=g;ctx.fillRect(sx-34,sy-34,68,68);ctx.strokeStyle='#4d2d15';ctx.strokeRect(sx-34,sy-34,68,68);if(state.phase==='selectTile'&&state.legalMoves.some(m=>m.tid===tid)){ctx.strokeStyle='#b7efff';ctx.lineWidth=3;ctx.strokeRect(sx-37,sy-37,74,74);}if(state.selectedTileId===tid){ctx.strokeStyle='#fff';ctx.strokeRect(sx-40,sy-40,80,80);}const stack=state.stacks.get(key(p.x,p.y))||[];stack.forEach((pl,z)=>drawPiece(sx,sy,pl,z));ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.fillText(String(stack.length),sx+23,sy-20);if(ui.showCoords.checked){ctx.fillStyle='#132';ctx.fillText(`(${p.x},${p.y})`,sx-20,sy+46);} }
  if(state.phase==='selectDest'&&state.selectedTileId){for(const m of state.legalMoves.filter(v=>v.tid===state.selectedTileId)){const {sx,sy}=worldToScreen(m.to.x,m.to.y);ctx.fillStyle='rgba(206,176,255,.45)';ctx.fillRect(sx-30,sy-30,60,60);}}
  if(state.phase==='place'){for(const p of state.tiles.values()){const {sx,sy}=worldToScreen(p.x,p.y);const s=state.stacks.get(key(p.x,p.y))||[];if(s.length<MAX_STACK){ctx.strokeStyle='rgba(255,190,120,.8)';ctx.strokeRect(sx-35,sy-35,70,70);}}}
  if(ui.showLiberties.checked&&state.selectedTileId){const t=state.tiles.get(state.selectedTileId);if(t){const occ=getOcc();const stack=state.stacks.get(key(t.x,t.y))||[];if(stack.length){const start=ckey(t.x,t.y,stack.length-1);const g=groupFrom(start,occ),libs=liberties(g,occ);ctx.fillStyle='rgba(90,240,140,.7)';for(const l of libs){const [x,y,z]=l.split(',').map(Number);const {sx,sy}=worldToScreen(x,y);ctx.beginPath();ctx.arc(sx,sy-z*14,6,0,Math.PI*2);ctx.fill();}}}}
  state.captureFx=state.captureFx.filter(f=>f.t-->0);for(const fx of state.captureFx){const [x,y,z]=fx.c.split(',').map(Number);const {sx,sy}=worldToScreen(x,y);ctx.strokeStyle=`rgba(255,80,80,${fx.t/20})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(sx,sy-z*14,14+(20-fx.t),0,Math.PI*2);ctx.stroke();}
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

if (ui.undoBtn) ui.undoBtn.addEventListener('click',()=>{ if(state.undoSnapshot){ restore(state.undoSnapshot); log('Turn undone.'); }});
if (ui.spacing) ui.spacing.addEventListener('input',()=>{ state.tileSpacing=56+Number(ui.spacing.value)*10; draw(); });
if (ui.libertyToggle) ui.libertyToggle.addEventListener('change',draw);
function tick(ts){ state.t=ts; draw(); requestAnimationFrame(tick); }

log('Thigmo botanical battlefield loaded.');
init();

window.addEventListener('resize', ()=>{ resizeCanvas(); draw(); });

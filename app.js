import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js';

const COLORS = { purple: 0x7a3cff, orange: 0xff9f1c, greenAssist: 0x4bd96b };
const TILE_SIZE = 1.25;
const LEVEL_H = 0.62;
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
  appShell: document.getElementById('app-shell'),
  axisCube: document.getElementById('axis-cube'),
};

const state = {
  turn: 'purple',
  phase: 'selectTile',
  tiles: new Map(),
  stacks: new Map(),
  captures: { purple: 0, orange: 0 },
  openingRound: 2,
  turnIndex: 0,
  selectedTile: null,
  legalTileMoves: [],
  legalPlacements: [],
  undoSnapshot: null,
  interactionLocked: false,
  tileSpacing: 1.5,
  winner: null,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9e9a8);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(6.5, 6.5, 6.5);
const renderer = new THREE.WebGLRenderer({ antialias: true });
ui.viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
controls.enablePan = true;
controls.target.set(2.25, 0.4, 0.8);
controls.update();

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.shiftKey) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
});
renderer.domElement.addEventListener('pointerup', () => {
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
});

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xfff4cf, 0.8);
sun.position.set(10, 20, 5);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ color: 0x91d786, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const world = new THREE.Group();
scene.add(world);

const hoverRay = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const meshRefs = { tiles: new Map(), flowers: new Map(), ghosts: [] , assists: []};

function key(x, y) { return `${x},${y}`; }
function cellKey(x,y,z){ return `${x},${y},${z}`; }
function other(player){ return player === 'purple' ? 'orange' : 'purple'; }
function getBoardCenter() {
  const positions = [...state.tiles.values()];
  const cx = positions.reduce((a, p) => a + p.x, 0) / positions.length;
  const cy = positions.reduce((a, p) => a + p.y, 0) / positions.length;
  return { x: cx * state.tileSpacing, z: cy * state.tileSpacing };
}
function frameBoard(resetCamera = false) {
  const c = getBoardCenter();
  controls.target.set(c.x, 0.35, c.z);
  if (resetCamera) {
    camera.position.set(c.x + 6, 6.8, c.z + 6);
  }
  controls.update();
}

function log(msg) {
  const p = document.createElement('div');
  p.textContent = msg;
  ui.log.prepend(p);
}

function initBoard() {
  let id = 0;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      state.tiles.set(`t${id++}`, { x, y });
      state.stacks.set(key(x,y), []);
    }
  }
}

function snapshot() {
  return {
    turn: state.turn,
    phase: state.phase,
    tiles: new Map([...state.tiles].map(([k,v]) => [k, { ...v }])),
    stacks: new Map([...state.stacks].map(([k,v]) => [k, [...v]])),
    captures: { ...state.captures },
    openingRound: state.openingRound,
    turnIndex: state.turnIndex,
    winner: state.winner,
  };
}
function restore(s) {
  Object.assign(state, {
    turn:s.turn, phase:s.phase, tiles:s.tiles, stacks:s.stacks,
    captures:s.captures, openingRound:s.openingRound, turnIndex:s.turnIndex, winner:s.winner,
    selectedTile:null, legalTileMoves:[], legalPlacements:[], interactionLocked:false,
  });
  refreshPhase();
}

function neighbors8(x,y){
  const arr=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    if(dx===0&&dy===0)continue; arr.push([x+dx,y+dy]);
  }
  return arr;
}
function neighbors6(x,y,z){ return [[x+1,y,z],[x-1,y,z],[x,y+1,z],[x,y-1,z],[x,y,z+1],[x,y,z-1]]; }
function hasTile(x,y){
  for (const t of state.tiles.values()) if(t.x===x&&t.y===y) return true;
  return false;
}
function influencedTiles(player){
  if (state.openingRound > 0) return new Set([...state.tiles.keys()]);
  const set = new Set();
  for (const [tid,pos] of state.tiles.entries()) {
    const s = state.stacks.get(key(pos.x,pos.y))||[];
    if (s.includes(player)) set.add(tid);
    else {
      for (const [nx,ny] of neighbors8(pos.x,pos.y)) {
        const ns = state.stacks.get(key(nx,ny));
        if (ns?.includes(player)) { set.add(tid); break; }
      }
    }
  }
  return set;
}

function legalTileMovesFor(player){
  const moves=[];
  const influenced = influencedTiles(player);
  const occupied = new Set([...state.tiles.values()].map(t=>key(t.x,t.y)));
  for (const [tid,pos] of state.tiles.entries()) {
    if (!influenced.has(tid)) continue;
    for (const [nx,ny] of neighbors8(pos.x,pos.y)) {
      if (occupied.has(key(nx,ny))) continue;
      moves.push({tid, from:{...pos}, to:{x:nx,y:ny}});
    }
  }
  return moves;
}

function legalPlacements(){ return [...state.tiles.values()].map(t=>({x:t.x,y:t.y})); }

function placePiece(x,y,player){ state.stacks.get(key(x,y)).push(player); }

function getOccupancyMap(){
  const occ = new Map();
  for (const [kxy, stack] of state.stacks.entries()) {
    const [x,y] = kxy.split(',').map(Number);
    stack.forEach((p,z)=>occ.set(cellKey(x,y,z),p));
  }
  return occ;
}

function groupFrom(start, occ){
  const color = occ.get(start);
  const q=[start], vis=new Set([start]), group=[];
  while(q.length){
    const c=q.pop(); group.push(c);
    const [x,y,z]=c.split(',').map(Number);
    for(const [nx,ny,nz] of neighbors6(x,y,z)){
      const nk=cellKey(nx,ny,nz);
      if(!vis.has(nk)&&occ.get(nk)===color){vis.add(nk);q.push(nk);} }
  }
  return group;
}

function libertiesForGroup(group, occ){
  const libs = new Set();
  for(const ck of group){
    const [x,y,z]=ck.split(',').map(Number);
    for(const [nx,ny,nz] of neighbors6(x,y,z)){
      if (nz < 0) continue;
      if ((nx!==x || ny!==y) && !hasTile(nx,ny)) continue;
      const nk=cellKey(nx,ny,nz);
      if(!occ.has(nk)) libs.add(nk);
    }
  }
  return libs;
}

function removeCells(cells){
  const byCol = new Map();
  cells.forEach(k=>{
    const [x,y,z]=k.split(',').map(Number);
    const kxy=key(x,y);
    if(!byCol.has(kxy)) byCol.set(kxy,[]);
    byCol.get(kxy).push(z);
  });
  for(const [kxy, zs] of byCol.entries()){
    const s = state.stacks.get(kxy);
    const keep = s.filter((_,idx)=>!zs.includes(idx));
    state.stacks.set(kxy, keep);
  }
}

async function animatePlacement(pos,color){
  state.interactionLocked = true;
  const can = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.25,12), new THREE.MeshStandardMaterial({color:0x6f7f95}));
  const spout = new THREE.Mesh(new THREE.BoxGeometry(.16,.04,.04), new THREE.MeshStandardMaterial({color:0x6f7f95}));
  spout.position.set(.13,.05,0); can.add(spout);
  can.position.set(pos.x, 2.4, pos.y);
  world.add(can);
  await wait(300);
  for(let i=0;i<20;i++){
    const d = new THREE.Mesh(new THREE.SphereGeometry(.02,6,6), new THREE.MeshBasicMaterial({color:0x67b7ff}));
    d.position.set(pos.x+(Math.random()-.5)*.2, 2.2 - Math.random()*.8, pos.y+(Math.random()-.5)*.2);
    world.add(d); setTimeout(()=>world.remove(d), 350);
  }
  await wait(350);
  world.remove(can);
  await wait(550);
  state.interactionLocked = false;
}

async function resolveCaptures(activePlayer){
  state.interactionLocked = true;
  let changed=true;
  while(changed){
    changed=false;
    const occ = getOccupancyMap();
    const visited = new Set();
    const groupsByColor = { purple: [], orange: [] };
    for (const ck of occ.keys()) {
      if (visited.has(ck)) continue;
      const grp = groupFrom(ck, occ);
      grp.forEach(c=>visited.add(c));
      groupsByColor[occ.get(ck)].push(grp);
    }

    const toRemoveOpp = [];
    for (const grp of groupsByColor[other(activePlayer)]) {
      if (libertiesForGroup(grp, occ).size === 0) toRemoveOpp.push(...grp);
    }
    if (toRemoveOpp.length){
      await wiltAnimation(toRemoveOpp);
      removeCells(toRemoveOpp);
      state.captures[activePlayer] += toRemoveOpp.length;
      changed=true;
    }

    const occ2 = getOccupancyMap();
    const visited2=new Set();
    const ownRem=[];
    for(const ck of occ2.keys()){
      if(visited2.has(ck)||occ2.get(ck)!==activePlayer) continue;
      const grp=groupFrom(ck,occ2); grp.forEach(c=>visited2.add(c));
      if(libertiesForGroup(grp,occ2).size===0) ownRem.push(...grp);
    }
    if(ownRem.length){
      await wiltAnimation(ownRem);
      removeCells(ownRem);
      changed=true;
    }
    rerenderBoard();
  }
  state.interactionLocked = false;
}

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function wiltAnimation(cells){ await wait(450); }

async function executeMove(tileMove){
  state.interactionLocked = true;
  state.undoSnapshot = snapshot();
  const pos = state.tiles.get(tileMove.tid);
  const fromK = key(pos.x,pos.y), toK = key(tileMove.to.x,tileMove.to.y);
  const stack = state.stacks.get(fromK);
  state.stacks.delete(fromK); state.stacks.set(toK, stack);
  pos.x = tileMove.to.x; pos.y = tileMove.to.y;
  rerenderBoard();
  log(`${state.turn} moved tile to (${pos.x}, ${pos.y})`);
  await wait(500);
  state.phase = 'place';
  state.interactionLocked = false;
  refreshPhase();
}

async function executePlacement(target){
  if (!target) return;
  placePiece(target.x,target.y,state.turn);
  await animatePlacement({x:target.x*state.tileSpacing,y:target.y*state.tileSpacing},state.turn);
  rerenderBoard();
  await resolveCaptures(state.turn);

  if(state.captures[state.turn] >= WIN_CAPTURES){
    state.winner = state.turn;
    updateHud();
    log(`${state.turn} wins!`);
    return;
  }
  state.turn = other(state.turn);
  state.turnIndex += 1;
  if (state.openingRound > 0) state.openingRound -= 1;
  state.phase = 'selectTile';
  state.selectedTile = null;
  refreshPhase();
}

function clearGroup(group){ while(group.children.length) group.remove(group.children[0]); }

function rerenderBoard(){
  clearGroup(world);
  meshRefs.tiles.clear(); meshRefs.flowers.clear(); meshRefs.ghosts=[]; meshRefs.assists=[];

  for(const [tid,pos] of state.tiles.entries()){
    const patch = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE,.2,TILE_SIZE), new THREE.MeshStandardMaterial({color:0x6f3d1f, roughness:.82}));
    patch.position.set(pos.x*state.tileSpacing, .08, pos.y*state.tileSpacing);
    patch.userData={type:'tile',tid};
    world.add(patch); meshRefs.tiles.set(tid, patch);

    const stack = state.stacks.get(key(pos.x,pos.y)) || [];
    stack.forEach((player,z)=>{
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.15,.17,.28,8), new THREE.MeshStandardMaterial({color: player==='purple'?0x8f66ff:0xffb14f}));
      stem.position.set(pos.x*state.tileSpacing, .30 + z*LEVEL_H, pos.y*state.tileSpacing);
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(.2,12,10), new THREE.MeshStandardMaterial({color: player==='purple'?COLORS.purple:COLORS.orange, emissive: player==='purple'?0x2a135f:0x4f2a00, emissiveIntensity: .35}));
      bloom.position.set(0,.22,0); stem.add(bloom);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.48,.48,.48)), new THREE.LineBasicMaterial({color: player==='purple'?COLORS.purple:COLORS.orange}));
      outline.position.y += .1; stem.add(outline);
      world.add(stem);
      meshRefs.flowers.set(cellKey(pos.x,pos.y,z), stem);
    });
  }

  if(state.phase==='selectDest' && state.selectedTile){
    for(const m of state.legalTileMoves.filter(m=>m.tid===state.selectedTile)){
      const g = new THREE.Mesh(new THREE.BoxGeometry(1,.05,1), new THREE.MeshStandardMaterial({color:0xb8986a, transparent:true, opacity:.55}));
      g.position.set(m.to.x*state.tileSpacing,.04,m.to.y*state.tileSpacing);
      g.userData={type:'ghost',move:m};
      world.add(g); meshRefs.ghosts.push(g);
    }
  }

  if(ui.libertyToggle.checked){
    const assists = computeAssistCells();
    assists.forEach(c=>{
      const [x,y,z]=c.split(',').map(Number);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.2,.03,6,16), new THREE.MeshBasicMaterial({color:COLORS.greenAssist, transparent:true, opacity:.6}));
      ring.rotation.x = Math.PI/2;
      ring.position.set(x*state.tileSpacing, .25 + z*LEVEL_H, y*state.tileSpacing);
      world.add(ring); meshRefs.assists.push(ring);
    });
  }
  frameBoard(false);
}

function computeAssistCells(){
  const enemy = other(state.turn);
  const occ = getOccupancyMap();
  const assists = new Set();
  const visited = new Set();
  for(const ck of occ.keys()){
    if(visited.has(ck) || occ.get(ck)!==enemy) continue;
    const grp = groupFrom(ck,occ); grp.forEach(c=>visited.add(c));
    libertiesForGroup(grp,occ).forEach(l=>assists.add(l));
  }
  return [...assists];
}

function refreshPhase(){
  state.legalTileMoves = legalTileMovesFor(state.turn);
  if(state.phase === 'selectTile' && !state.legalTileMoves.length){
    log('Invalid state: no legal tile moves.');
  }
  updateHud();
  rerenderBoard();
}

function updateHud(){
  ui.scorePurple.textContent = state.captures.purple;
  ui.scoreOrange.textContent = state.captures.orange;
  const phaseText = state.winner ? `${state.winner.toUpperCase()} WINS` : (state.phase==='selectTile'?'Move a tile': state.phase==='selectDest' ? 'Choose destination' : 'Place a flower');
  ui.turnInfo.textContent = `${state.turn[0].toUpperCase()+state.turn.slice(1)} Turn · ${phaseText}`;
  ui.appShell.style.setProperty('--edge-glow', state.turn==='purple' ? '#8f66ff88' : '#ffb14f88');
}

renderer.domElement.addEventListener('click', async (e) => {
  if (state.interactionLocked || state.winner) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  hoverRay.setFromCamera(pointer, camera);
  const hits = hoverRay.intersectObjects(world.children, true);
  if(!hits.length) return;
  const top = hits.find(h=>h.object.userData.type) || hits[0];
  const data = top.object.userData;

  if(state.phase==='selectTile' && data.type==='tile'){
    const legal = state.legalTileMoves.some(m=>m.tid===data.tid);
    if(!legal) return;
    state.selectedTile = data.tid;
    state.phase='selectDest';
    refreshPhase();
  } else if(state.phase==='selectDest' && data.type==='ghost'){
    await executeMove(data.move);
  } else if(state.phase==='place' && data.type==='tile'){
    const pos = state.tiles.get(data.tid);
    await executePlacement({x:pos.x,y:pos.y});
  }
});

ui.undoBtn.addEventListener('click', ()=>{
  if(state.interactionLocked || !state.undoSnapshot) return;
  restore(state.undoSnapshot);
  log('Turn undone.');
});
ui.spacing.addEventListener('input', ()=>{ state.tileSpacing = 1.1 + Number(ui.spacing.value)*0.25; rerenderBoard(); });
ui.libertyToggle.addEventListener('change', rerenderBoard);

function buildAxisCube(){
  const r = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  r.setSize(92,92); ui.axisCube.appendChild(r.domElement);
  const s = new THREE.Scene();
  const c = new THREE.PerspectiveCamera(45,1,.1,10); c.position.set(2,2,2);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), [
    new THREE.MeshBasicMaterial({color:0xffcccc}),new THREE.MeshBasicMaterial({color:0xccffcc}),
    new THREE.MeshBasicMaterial({color:0xccccff}),new THREE.MeshBasicMaterial({color:0xfff4cc}),
    new THREE.MeshBasicMaterial({color:0xccf4ff}),new THREE.MeshBasicMaterial({color:0xf4ccff})
  ]);
  s.add(cube);
  const rr = new THREE.Raycaster(); const pp = new THREE.Vector2();
  r.domElement.addEventListener('click', (e)=>{
    const rect=r.domElement.getBoundingClientRect();
    pp.x=((e.clientX-rect.left)/rect.width)*2-1; pp.y=-((e.clientY-rect.top)/rect.height)*2+1;
    rr.setFromCamera(pp,c);
    const hit = rr.intersectObject(cube)[0]; if(!hit) return;
    const n = hit.face.normal.clone();
    camera.position.copy(n.multiplyScalar(12)); camera.lookAt(0,0,0);
  });
  return ()=>{ cube.quaternion.copy(camera.quaternion); r.render(s,c); };
}
const axisTick = buildAxisCube();

function resize(){
  const w=ui.viewport.clientWidth,h=ui.viewport.clientHeight;
  renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

initBoard();
frameBoard(true);
refreshPhase();
resize();
log('Welcome to Thigmo v1 prototype.');

(function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene,camera);
  axisTick();
})();

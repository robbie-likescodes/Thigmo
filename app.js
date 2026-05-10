import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js";

window.THIGMO_BUILD = '2026-05-10-esm-three-fix';

function showRendererError(error) {
  const viewport = document.getElementById('viewport');
  if (!viewport) return;
  const box = document.createElement('div');
  box.style.cssText = 'margin:16px;padding:12px;border:1px solid #d33;background:#2b0d0d;color:#ffdede;border-radius:8px;font:14px/1.4 sans-serif;';
  box.textContent = `Renderer startup failed: ${error?.message || error}`;
  viewport.appendChild(box);
}

function init() {
  const viewport = document.getElementById('viewport');
  if (!viewport) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbde6af);

  const camera = new THREE.PerspectiveCamera(50, viewport.clientWidth / Math.max(1, viewport.clientHeight), 0.1, 100);
  camera.position.set(5, 6, 8);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    showRendererError(error);
    return;
  }

  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(viewport.clientWidth, Math.max(1, viewport.clientHeight));
  viewport.replaceChildren(renderer.domElement);

  console.log('THREE revision', THREE.REVISION);
  console.log('canvas count', document.querySelectorAll('canvas').length);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(8, 10, 5);
  scene.add(dir);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x714625 })
  );
  board.position.y = -0.2;
  scene.add(board);

  for (let x = -1.5; x <= 1.5; x += 1) {
    for (let z = -1.5; z <= 1.5; z += 1) {
      const token = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.2, 24),
        new THREE.MeshStandardMaterial({ color: (x + z) % 2 === 0 ? 0x7a3cff : 0xff9f1c })
      );
      token.position.set(x, 0.15, z);
      scene.add(token);
    }
  }

  function onResize() {
    const w = viewport.clientWidth;
    const h = Math.max(1, viewport.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

window.THIGMO_BUILD = '2026-05-10-3d-with-2d-fallback';

async function boot() {
  try {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js');
    const { OrbitControls } = await import('https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js');

    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbde6af);

    const camera = new THREE.PerspectiveCamera(50, viewport.clientWidth / Math.max(1, viewport.clientHeight), 0.1, 100);
    camera.position.set(5, 6, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(viewport.clientWidth, Math.max(1, viewport.clientHeight));
    viewport.replaceChildren(renderer.domElement);

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
  } catch (error) {
    console.warn('3D renderer failed; loading 2D fallback.', error);
    await import('./main.js');
  }
}

boot();

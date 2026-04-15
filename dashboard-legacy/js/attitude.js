import * as THREE from 'three';

let scene, camera, renderer, droneGroup;

export function initAttitude(container){
  const w = container.clientWidth;
  const h = container.clientHeight || 260;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);

  camera = new THREE.PerspectiveCamera(50, w/h, 0.1, 100);
  camera.position.set(3.2, 2.6, 4.2);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  // world axes helper
  const axes = new THREE.AxesHelper(2);
  scene.add(axes);

  // ground grid
  const grid = new THREE.GridHelper(10, 20, 0x1f3347, 0x182230);
  grid.position.y = -1;
  scene.add(grid);

  // drone representation: body + 4 arms with motor caps
  droneGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({color: 0x3dd6d0, metalness: .4, roughness: .35});
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 18), bodyMat);
  droneGroup.add(body);

  const armMat = new THREE.MeshStandardMaterial({color: 0x7a7cff, metalness: .3, roughness: .5});
  const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2);
  const armA = new THREE.Mesh(armGeo, armMat);
  armA.rotation.z = Math.PI/2;
  armA.rotation.y = Math.PI/4;
  droneGroup.add(armA);
  const armB = new THREE.Mesh(armGeo, armMat);
  armB.rotation.z = Math.PI/2;
  armB.rotation.y = -Math.PI/4;
  droneGroup.add(armB);

  const motorMat = new THREE.MeshStandardMaterial({color: 0xffb454, emissive: 0x331a00, metalness: .3, roughness: .4});
  const motorGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.08);
  const offs = [
    [-0.6, 0,  0.6],   // m1 FL
    [ 0.6, 0,  0.6],   // m2 FR
    [ 0.6, 0, -0.6],   // m3 RR
    [-0.6, 0, -0.6],   // m4 RL
  ];
  for(const [x,y,z] of offs){
    const m = new THREE.Mesh(motorGeo, motorMat);
    m.position.set(x, y, z);
    droneGroup.add(m);
  }

  // forward-pointing indicator (nose cone)
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.3, 16),
    new THREE.MeshStandardMaterial({color: 0xff5871, emissive: 0x330008})
  );
  nose.position.set(0, 0, 0.5);
  nose.rotation.x = Math.PI/2;
  droneGroup.add(nose);

  scene.add(droneGroup);

  const amb = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(3, 5, 4);
  scene.add(dir);

  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight || 260;
    renderer.setSize(w, h);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  });

  animate();
}

function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

/**
 * Apply attitude from body-frame euler:
 *   euler[0] = roll  (+ = rolled right physically, after SIGN_ROLL convention)
 *   euler[1] = pitch (+ = nose down)
 *   euler[2] = yaw   (world)
 * Use Unity XYZ rotation mapping. Visual rotations on Z/X/Y axes of the
 * Three.js group approximate the body attitude for a visual reference.
 */
export function updateAttitude(euler){
  if(!droneGroup) return;
  const rollRad  = -THREE.MathUtils.degToRad(euler[0]);
  const pitchRad =  THREE.MathUtils.degToRad(euler[1]);
  const yawRad   = -THREE.MathUtils.degToRad(euler[2]);
  droneGroup.rotation.set(pitchRad, yawRad, rollRad, 'YXZ');
}

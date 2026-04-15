import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useTelemetry } from '@/store/telemetry'
import { HUD } from './HUD'

const DEG = Math.PI / 180
// Lowest point of the rocket's engine bell in local Y.
// Sonar "down" measures from engine bottom to ground.
const ROCKET_MOTOR_Y = -1.3

function buildRocket(): { group: THREE.Group; flame: THREE.Mesh; engineLight: THREE.PointLight } {
  const group = new THREE.Group()

  // body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.38, 3.2, 20),
    new THREE.MeshPhongMaterial({ color: 0xd8d8de, shininess: 40 })
  )
  body.position.y = 0.6
  group.add(body)

  // lower band
  const lb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.381, 0.381, 0.18, 20),
    new THREE.MeshPhongMaterial({ color: 0x17171c })
  )
  lb.position.y = -0.35
  group.add(lb)

  // mid band (red)
  const mb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.381, 0.381, 0.22, 20),
    new THREE.MeshPhongMaterial({ color: 0xd63c4a })
  )
  mb.position.y = 0.75
  group.add(mb)

  // porthole
  const port = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.1, 20),
    new THREE.MeshBasicMaterial({ color: 0x1fd6cf, side: THREE.DoubleSide })
  )
  port.position.set(0, 1.45, 0.38)
  port.rotation.x = Math.PI / 2
  group.add(port)

  // nose cone
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.95, 20),
    new THREE.MeshPhongMaterial({ color: 0xe8e8ee, shininess: 30 })
  )
  nose.position.y = 2.55
  group.add(nose)

  // nose tip
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.12, 12),
    new THREE.MeshPhongMaterial({ color: 0xd63c4a })
  )
  tip.position.y = 3.06
  group.add(tip)

  // fins
  const finMat = new THREE.MeshPhongMaterial({ color: 0x2a2a32 })
  const finGeo = new THREE.BoxGeometry(0.04, 0.55, 0.5)
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2
    const fin = new THREE.Mesh(finGeo, finMat)
    fin.position.set(Math.cos(angle) * 0.38, -0.8, Math.sin(angle) * 0.38)
    fin.rotation.y = -angle
    group.add(fin)
  }

  // engine bell
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.22, 0.35, 16, 1, true),
    new THREE.MeshPhongMaterial({ color: 0x101014, side: THREE.DoubleSide, shininess: 80 })
  )
  bell.position.y = -1.12
  group.add(bell)

  // engine cap (black)
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.18, 0.08, 16),
    new THREE.MeshBasicMaterial({ color: 0x05050a })
  )
  cap.position.y = -1.28
  group.add(cap)

  // flame
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 1.1, 14),
    new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  flame.position.y = -1.8
  flame.rotation.x = Math.PI
  group.add(flame)

  const engineLight = new THREE.PointLight(0xff8c3a, 0, 12, 1.5)
  engineLight.position.set(0, -1.4, 0)
  group.add(engineLight)

  // Forward-pointing arrow (local +Z = rocket's front, aligned with porthole).
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1.0, 0.42),
    1.6,
    0x3dd6d0,
    0.32,
    0.22
  )
  // make the arrow shaft a bit thicker / glowing via its line material
  const lineMat = arrow.line.material as THREE.LineBasicMaterial
  lineMat.linewidth = 2
  lineMat.transparent = true
  lineMat.opacity = 0.95
  const coneMat = arrow.cone.material as THREE.MeshBasicMaterial
  coneMat.transparent = true
  coneMat.opacity = 0.95
  group.add(arrow)

  return { group, flame, engineLight }
}

function buildStars(count: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // uniform points on sphere shell radius ~100
    const r = 100 + Math.random() * 30
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })
  return new THREE.Points(geom, mat)
}

function makeGrid(size: number, divisions: number, c1: number, c2: number, opacity: number): THREE.GridHelper {
  const grid = new THREE.GridHelper(size, divisions, c1, c2)
  const setMat = (m: THREE.Material) => {
    const mm = m as THREE.Material & { transparent?: boolean; opacity?: number; depthWrite?: boolean }
    mm.transparent = true
    mm.opacity = opacity
    mm.depthWrite = false
  }
  const mat = grid.material as THREE.Material | THREE.Material[]
  if (Array.isArray(mat)) mat.forEach(setMat)
  else setMat(mat)
  return grid
}

export function AttitudeViewer() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070c)
    scene.fog = new THREE.Fog(0x05070c, 22, 120)

    const w = mount.clientWidth
    const h = mount.clientHeight
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 300)
    camera.position.set(4, 2.5, 6)

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    renderer.setSize(w, h)
    mount.appendChild(renderer.domElement)

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xeaf0ff, 1.1)
    key.position.set(8, 12, 6)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x4cc9f0, 0.35)
    rim.position.set(-6, 3, -4)
    scene.add(rim)

    // stars
    const stars = buildStars(900)
    scene.add(stars)

    // ground (visible only when sonar-down returns a valid reading)
    const ground = makeGrid(80, 40, 0x3dd6d0, 0x1a4a48, 0.55)
    ground.visible = false
    scene.add(ground)

    // flight-mode reference grid: faint Unity-style plane to anchor orientation
    // when there is no altitude data. Cuts through the rocket's vertical midpoint.
    const flightGrid = makeGrid(200, 100, 0xa8b0c0, 0x5b6478, 0.2)
    // Rocket extends y=-1.3 (engine) to y≈3.03 (nose tip); midpoint ≈ 0.87.
    flightGrid.position.y = 0.87
    scene.add(flightGrid)

    // rocket
    const { group: rocket, flame, engineLight } = buildRocket()
    scene.add(rocket)

    // orbit controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 3
    controls.maxDistance = 15
    controls.target.set(0, 0.5, 0)
    controls.update()

    // resize
    const onResize = () => {
      if (!mount) return
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    // render loop
    let raf = 0
    let running = true
    const render = () => {
      if (!running) return
      raf = requestAnimationFrame(render)

      const t = useTelemetry.getState()

      // rocket rotation: YXZ, roll & yaw negated (legacy match)
      const rollRad = -t.euler[0] * DEG
      const pitchRad = t.euler[1] * DEG
      const yawRad = -t.euler[2] * DEG
      rocket.rotation.order = 'YXZ'
      rocket.rotation.set(pitchRad, yawRad, rollRad)

      // Flame proportional to actual motor output (average of m1..m4).
      // Hover burns energy → flame is non-zero at rest, saturates at MOTOR_MAX.
      const m = t.motors
      const avg = (m.m1 + m.m2 + m.m3 + m.m4) * 0.25
      const motorMax = (t.config?.MOTOR_MAX as number | undefined) ?? 6
      const intensity = Math.min(1, Math.max(0, avg / motorMax))
      flame.scale.set(
        0.35 + intensity * 0.4,
        0.35 + intensity * 1.4,
        0.35 + intensity * 0.4
      )
      const flameMat = flame.material as THREE.MeshBasicMaterial
      flameMat.opacity = intensity > 0.02 ? 0.3 + intensity * 0.7 : 0
      engineLight.intensity = intensity * 5

      // ground visibility + position
      const down = t.sonars?.down
      const showGround = !!down?.valid && down.distance < 25
      ground.visible = showGround
      flightGrid.visible = !showGround
      if (showGround) {
        // Sonar "down" measures from engine bottom to ground.
        // Ground Y = motor bottom Y − altitude.
        const alt = Math.max(0, Math.min(down!.distance, 20))
        ground.position.y = ROCKET_MOTOR_Y - alt
      }

      controls.update()
      renderer.render(scene, camera)
    }
    render()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh
        m.geometry?.dispose?.()
        const mat = m.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat && typeof (mat as THREE.Material).dispose === 'function') (mat as THREE.Material).dispose()
      })
    }
  }, [])

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="absolute inset-0" />
      <HUD />
    </div>
  )
}

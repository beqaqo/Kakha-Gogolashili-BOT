import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export default function CosmosScene({ busy, speed = 1 }) {
  const mountRef = useRef(null)
  const busyRef = useRef(busy)
  const speedRef = useRef(speed)

  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => {
    speedRef.current = speed
    // eslint-disable-next-line no-console
    console.log('[cosmos] speed prop change →', speed)
  }, [speed])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // eslint-disable-next-line no-console
    console.log('[cosmos] mount scene, initial speed =', speedRef.current)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x02030a, 0.0015)

    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      4000
    )
    camera.position.set(0, 35, 95)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)
    renderer.domElement.id = 'bg-canvas'

    // ----- Starfield (distant) -----
    const starCount = 6000
    const starGeo = new THREE.BufferGeometry()
    const starPos = new Float32Array(starCount * 3)
    const starCol = new Float32Array(starCount * 3)
    const starSize = new Float32Array(starCount)
    const palette = [
      new THREE.Color(0xffffff),
      new THREE.Color(0xcfe0ff),
      new THREE.Color(0xffe8c4),
      new THREE.Color(0xd4b6ff),
      new THREE.Color(0x9fd9ff)
    ]
    for (let i = 0; i < starCount; i++) {
      const r = 800 + Math.random() * 1500
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPos[i * 3 + 2] = r * Math.cos(phi)
      const c = palette[Math.floor(Math.random() * palette.length)]
      starCol[i * 3] = c.r
      starCol[i * 3 + 1] = c.g
      starCol[i * 3 + 2] = c.b
      starSize[i] = Math.random() * 2 + 0.3
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3))
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1))

    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSize;
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float uTime;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.7 + 0.3 * sin(uTime * 2.0 + position.x * 0.01 + position.y * 0.02);
          vTwinkle = tw;
          gl_PointSize = aSize * tw * (300.0 / -mv.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d) * vTwinkle;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    })

    const stars = new THREE.Points(starGeo, starMat)
    scene.add(stars)

    // ----- Nebula clouds (large sprites) -----
    const nebulaTex = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const ctx = c.getContext('2d')
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
      g.addColorStop(0, 'rgba(180,140,255,0.6)')
      g.addColorStop(0.4, 'rgba(100,120,255,0.2)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 256, 256)
      return new THREE.CanvasTexture(c)
    })()

    const nebulae = []
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({
        map: nebulaTex,
        color: new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.6, 0.5),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      const s = new THREE.Sprite(mat)
      const r = 400 + Math.random() * 400
      const t = Math.random() * Math.PI * 2
      s.position.set(Math.cos(t) * r, (Math.random() - 0.5) * 200, Math.sin(t) * r - 200)
      const sc = 300 + Math.random() * 300
      s.scale.set(sc, sc, 1)
      scene.add(s)
      nebulae.push(s)
    }

    // ----- Sun = Galactus (shines from center) -----
    const SUN_RADIUS = 6
    const sun = new THREE.Group()
    scene.add(sun)

    const sunLight = new THREE.PointLight(0xff8a40, 6, 600, 1.2)
    scene.add(sunLight)
    scene.add(new THREE.AmbientLight(0x223055, 0.4))

    // Procedural sun ShaderMaterial — applied to galactus meshes so the model
    // looks like a churning star instead of a flat yellow blob.
    const sunShader = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vPos;
        varying vec3 vNormal;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n = mix(mix(mix(hash(i),              hash(i+vec3(1,0,0)), f.x),
                             mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                         mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                             mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
          return n;
        }
        float fbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p *= 2.05;
            a *= 0.55;
          }
          return v;
        }
        void main() {
          vec3 p = vPos * 0.35 + vec3(uTime * 0.35);
          float n = fbm(p);
          float n2 = fbm(p * 2.1 + vec3(uTime * 0.9));
          float k = clamp(n * 0.6 + n2 * 0.5, 0.0, 1.0);
          vec3 cold = vec3(0.85, 0.18, 0.02);
          vec3 warm = vec3(1.0,  0.55, 0.12);
          vec3 hot  = vec3(1.0,  0.95, 0.55);
          vec3 col = mix(cold, warm, smoothstep(0.25, 0.65, k));
          col = mix(col, hot, smoothstep(0.65, 0.95, k));
          float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
          col += rim * vec3(1.0, 0.5, 0.2);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })

    // Corona sprite
    const coronaCanvas = document.createElement('canvas')
    coronaCanvas.width = coronaCanvas.height = 256
    const cctx = coronaCanvas.getContext('2d')
    const cg = cctx.createRadialGradient(128, 128, 20, 128, 128, 128)
    cg.addColorStop(0, 'rgba(255,220,160,0.9)')
    cg.addColorStop(0.3, 'rgba(255,160,80,0.4)')
    cg.addColorStop(1, 'rgba(255,100,50,0)')
    cctx.fillStyle = cg
    cctx.fillRect(0, 0, 256, 256)
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(coronaCanvas),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    }))
    corona.scale.set(22, 22, 1)
    scene.add(corona)

    // ----- Planets -----
    const makePlanetTex = (base, veins) => {
      const c = document.createElement('canvas')
      c.width = 512; c.height = 256
      const ctx = c.getContext('2d')
      ctx.fillStyle = base
      ctx.fillRect(0, 0, 512, 256)
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(${veins[0]},${veins[1]},${veins[2]},${Math.random() * 0.4})`
        const x = Math.random() * 512
        const y = Math.random() * 256
        const r = Math.random() * 30 + 5
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      return new THREE.CanvasTexture(c)
    }

    // Procedural Earth-like texture: oceans + continents + polar caps + clouds
    const makeEarthTex = () => {
      const c = document.createElement('canvas')
      c.width = 1024; c.height = 512
      const ctx = c.getContext('2d')
      const og = ctx.createLinearGradient(0, 0, 0, 512)
      og.addColorStop(0, '#0a2a55')
      og.addColorStop(0.5, '#1b5fb0')
      og.addColorStop(1, '#0a2a55')
      ctx.fillStyle = og
      ctx.fillRect(0, 0, 1024, 512)
      // land blobs
      const landColors = ['#2e6b34', '#3a7f3e', '#5a8c3a', '#7a6a3a', '#4a5c2a']
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = landColors[Math.floor(Math.random() * landColors.length)]
        const cx = Math.random() * 1024
        const cy = 80 + Math.random() * 360
        const rx = 30 + Math.random() * 90
        const ry = 20 + Math.random() * 60
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
      // green detail
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(30, 80, 30, ${Math.random() * 0.5})`
        ctx.beginPath()
        ctx.arc(Math.random() * 1024, 60 + Math.random() * 400, Math.random() * 14 + 2, 0, Math.PI * 2)
        ctx.fill()
      }
      // polar caps
      const polar = ctx.createLinearGradient(0, 0, 0, 512)
      polar.addColorStop(0, 'rgba(255,255,255,0.9)')
      polar.addColorStop(0.12, 'rgba(255,255,255,0)')
      polar.addColorStop(0.88, 'rgba(255,255,255,0)')
      polar.addColorStop(1, 'rgba(255,255,255,0.9)')
      ctx.fillStyle = polar
      ctx.fillRect(0, 0, 1024, 512)
      // cloud streaks
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.25})`
        const cx = Math.random() * 1024
        const cy = 60 + Math.random() * 400
        ctx.beginPath()
        ctx.ellipse(cx, cy, 40 + Math.random() * 80, 8 + Math.random() * 16, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      return new THREE.CanvasTexture(c)
    }

    const planetDefs = [
      { name: 'Aphro',   r: 1.5, d: 14, spd: 0.6, base: '#8ec5ff', veins: [60, 100, 200], tilt: 0.1 },
      { name: 'Kaxa',    r: 2.4, d: 24, spd: 0.35, base: '#3a6ee0', veins: [20, 50, 140], tilt: 0.2, ring: true },
      { name: 'Earth',   r: 1.9, d: 34, spd: 0.22, earth: true, tilt: 0.41, moon: true },
      { name: 'Ember',   d: 46, r: 3.0, spd: 0.14, base: '#ff9b6a', veins: [120, 40, 20], tilt: 0.12 },
      { name: 'Frost',   d: 60, r: 1.2, spd: 0.09, base: '#d4e6ff', veins: [80, 120, 200], tilt: 0.25 }
    ]

    const textureLoader = new THREE.TextureLoader()

    const planets = []
    let kaxaMoon = null
    let kaxaMoonPivot = null
    let kaxaMoonPhase = 0
    const KAXA_MOON_DIST = 3.4

    planetDefs.forEach((p, idx) => {
      const geo = new THREE.SphereGeometry(p.r, 64, 64)
      const tex = p.earth ? makeEarthTex() : makePlanetTex(p.base, p.veins)
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: p.earth ? 0.7 : 0.85,
        metalness: p.earth ? 0.15 : 0.05,
        emissive: p.earth
          ? new THREE.Color(0x0a1a3a)
          : new THREE.Color(p.base).multiplyScalar(0.08)
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.z = p.tilt

      const pivot = new THREE.Group()
      pivot.rotation.x = (Math.random() - 0.5) * 0.1
      pivot.add(mesh)
      mesh.position.x = p.d
      scene.add(pivot)

      // Atmosphere halo for Earth
      if (p.earth) {
        const atmGeo = new THREE.SphereGeometry(p.r * 1.08, 48, 48)
        const atmMat = new THREE.ShaderMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: `
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            void main() {
              float i = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
              gl_FragColor = vec4(0.35, 0.6, 1.0, 1.0) * i;
            }
          `
        })
        const atm = new THREE.Mesh(atmGeo, atmMat)
        mesh.add(atm)
      }

      // orbit ring
      const orbitGeo = new THREE.RingGeometry(p.d - 0.05, p.d + 0.05, 128)
      const orbitMat = new THREE.MeshBasicMaterial({
        color: 0x8ec5ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      })
      const orbit = new THREE.Mesh(orbitGeo, orbitMat)
      orbit.rotation.x = Math.PI / 2
      scene.add(orbit)

      // Saturn-like ring for Kaxa (planet)
      if (p.ring) {
        const rGeo = new THREE.RingGeometry(p.r + 0.8, p.r + 2.2, 64)
        const rMat = new THREE.MeshBasicMaterial({
          color: 0xb79cff,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide
        })
        const ring = new THREE.Mesh(rGeo, rMat)
        ring.rotation.x = Math.PI / 2 + 0.3
        mesh.add(ring)
      }

      // Kaxa moon (image-textured) orbits Earth
      if (p.moon) {
        // Fallback placeholder texture so something renders while JPG loads,
        // and stays visible if the load fails.
        const fallbackCanvas = document.createElement('canvas')
        fallbackCanvas.width = fallbackCanvas.height = 256
        const fctx = fallbackCanvas.getContext('2d')
        const fg = fctx.createRadialGradient(128, 128, 20, 128, 128, 128)
        fg.addColorStop(0, '#f4d9a4')
        fg.addColorStop(1, '#6b4a22')
        fctx.fillStyle = fg
        fctx.fillRect(0, 0, 256, 256)
        fctx.fillStyle = '#fff'
        fctx.font = 'bold 48px sans-serif'
        fctx.textAlign = 'center'
        fctx.textBaseline = 'middle'
        fctx.fillText('KAXA', 128, 128)
        const fallbackTex = new THREE.CanvasTexture(fallbackCanvas)
        fallbackTex.colorSpace = THREE.SRGBColorSpace

        const moonGeo = new THREE.SphereGeometry(0.7, 48, 48)
        const moonMat = new THREE.MeshBasicMaterial({ map: fallbackTex })
        kaxaMoon = new THREE.Mesh(moonGeo, moonMat)

        // Now kick off the real image load; swap map when ready.
        textureLoader.load(
          new URL('kaxa.jpg', window.location.origin + '/').href,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace
            tex.anisotropy = 4
            tex.needsUpdate = true
            moonMat.map = tex
            moonMat.needsUpdate = true
            // eslint-disable-next-line no-console
            console.log('[cosmos] kaxa.jpg loaded', tex.image?.width, tex.image?.height)
          },
          undefined,
          (err) => {
            // eslint-disable-next-line no-console
            console.warn('[cosmos] kaxa.jpg failed to load — keeping fallback', err)
          }
        )

        kaxaMoonPivot = new THREE.Group()
        kaxaMoonPivot.rotation.z = 0.25
        kaxaMoon.position.x = KAXA_MOON_DIST
        kaxaMoonPivot.add(kaxaMoon)
        scene.add(kaxaMoonPivot)

        // moon orbit ring
        const moonOrbitGeo = new THREE.RingGeometry(KAXA_MOON_DIST - 0.03, KAXA_MOON_DIST + 0.03, 96)
        const moonOrbitMat = new THREE.MeshBasicMaterial({
          color: 0xffd27a,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide
        })
        const moonOrbit = new THREE.Mesh(moonOrbitGeo, moonOrbitMat)
        moonOrbit.rotation.x = Math.PI / 2
        kaxaMoonPivot.add(moonOrbit)
      }

      planets.push({ mesh, pivot, ...p, phase: Math.random() * Math.PI * 2, idx })
    })

    const earthEntry = planets.find(p => p.earth)

    // ----- Galactus loaded as Sun at center -----
    let galactus = null
    let galactusBaseScale = 1

    const gltfLoader = new GLTFLoader()
    gltfLoader.setMeshoptDecoder(MeshoptDecoder)
    gltfLoader.load(
      '/models/galactus.glb',
      (gltf) => {
        galactus = gltf.scene
        const box = new THREE.Box3().setFromObject(galactus)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        galactus.position.sub(center)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        galactusBaseScale = (SUN_RADIUS * 2) / maxDim
        galactus.scale.setScalar(galactusBaseScale)
        galactus.traverse((obj) => {
          if (obj.isMesh) {
            const old = Array.isArray(obj.material) ? obj.material : [obj.material]
            old.forEach(m => m?.dispose?.())
            obj.material = sunShader
          }
        })
        galactus.rotation.y = -Math.PI / 2
        sun.add(galactus)
        // eslint-disable-next-line no-console
        console.log('[cosmos] galactus.glb loaded as sun', { size, scale: galactusBaseScale })
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[cosmos] galactus.glb failed to load', err)
      }
    )

    // ----- Meteors + Rockets + Explosions -----
    const meteors = []
    const rockets = []
    const explosions = []
    const TRAIL_LEN = 24

    const makeProjectile = (color) => {
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 12),
        new THREE.MeshBasicMaterial({ color })
      )
      const posArr = new Float32Array(TRAIL_LEN * 3)
      const colArr = new Float32Array(TRAIL_LEN * 3)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3))
      const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }))
      scene.add(head)
      scene.add(trail)
      return { head, trail, posArr, colArr, history: [] }
    }

    const disposeProjectile = (p) => {
      scene.remove(p.head)
      scene.remove(p.trail)
      p.head.geometry.dispose(); p.head.material.dispose()
      p.trail.geometry.dispose(); p.trail.material.dispose()
    }

    const spawnMeteor = () => {
      if (planets.length === 0) return
      const target = planets[Math.floor(Math.random() * planets.length)]
      const proj = makeProjectile(0xffa060)
      const from = new THREE.Vector3(
        (Math.random() - 0.5) * 220,
        70 + Math.random() * 60,
        (Math.random() - 0.5) * 220
      )
      proj.head.position.copy(from)
      meteors.push({ ...proj, from, target, progress: 0, speed: 0.35 + Math.random() * 0.45, rgb: [1.0, 0.55, 0.2] })
      // eslint-disable-next-line no-console
      console.log('[cosmos] spawnMeteor → target', target.name, 'total meteors =', meteors.length)
    }

    const spawnRocket = () => {
      if (planets.length < 2) return
      const a = Math.floor(Math.random() * planets.length)
      let b = Math.floor(Math.random() * planets.length)
      if (b === a) b = (b + 1) % planets.length
      const src = planets[a]
      const tgt = planets[b]
      const proj = makeProjectile(0xb79cff)
      proj.head.position.copy(src.mesh.position)
      rockets.push({ ...proj, src, target: tgt, progress: 0, speed: 0.55 + Math.random() * 0.4, rgb: [0.72, 0.61, 1.0] })
      // eslint-disable-next-line no-console
      console.log('[cosmos] spawnRocket', src.name, '→', tgt.name, 'total rockets =', rockets.length)
    }

    const spawnExplosion = (pos, color, count = 30, spread = 3) => {
      const arr = new Float32Array(count * 3)
      const vel = []
      for (let i = 0; i < count; i++) {
        arr[i * 3] = pos.x
        arr[i * 3 + 1] = pos.y
        arr[i * 3 + 2] = pos.z
        const v = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize().multiplyScalar(1.5 + Math.random() * spread)
        vel.push(v)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      const mat = new THREE.PointsMaterial({
        color,
        size: 0.4,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      const pts = new THREE.Points(geo, mat)
      scene.add(pts)
      explosions.push({ pts, arr, vel, life: 0, max: 0.7 })
    }

    let meteorT = 0
    let rocketT = 0

    // ----- Resize -----
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // ----- Mouse parallax -----
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = e => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMove)

    // ----- Animate -----
    const clock = new THREE.Clock()
    let raf = 0
    let logAcc = 0
    let frameCount = 0
    let tickCount = 0
    const watchdog = setInterval(() => {
      // eslint-disable-next-line no-console
      console.log('[cosmos] WATCHDOG tickCount=' + tickCount + ' speed=' + speedRef.current + ' planetsX0=' + (planets[0]?.mesh.position.x.toFixed(2)))
    }, 2000)
    // eslint-disable-next-line no-console
    console.log('[cosmos] tick fn defined, about to call')
    const tick = () => {
      try {
        tickCount++
        if (tickCount <= 3) {
          // eslint-disable-next-line no-console
          console.log('[cosmos] tick run #' + tickCount)
        }
        const dt = clock.getDelta()
        const t = clock.elapsedTime
        const speedMul = (busyRef.current ? 2.4 : 1.0) * speedRef.current
        frameCount++
        logAcc += dt
        if (logAcc > 2) {
          logAcc = 0
          const p0 = planets[0]
          // eslint-disable-next-line no-console
          console.log('[cosmos] tick diag', {
            fps: (frameCount / 2).toFixed(0),
            speed: speedRef.current,
            busy: busyRef.current,
            speedMul,
            dt: dt.toFixed(4),
            planetsCount: planets.length,
            firstPlanet: p0 ? { name: p0.name, phase: p0.phase.toFixed(3), x: p0.mesh.position.x.toFixed(2), z: p0.mesh.position.z.toFixed(2) } : null,
            meteors: meteors.length,
            rockets: rockets.length,
            meteorT: meteorT.toFixed(2),
            rocketT: rocketT.toFixed(2)
          })
          frameCount = 0
        }

      starMat.uniforms.uTime.value = t
      sunShader.uniforms.uTime.value = t
      corona.scale.setScalar(22 + Math.sin(t * 1.2) * 0.6)

      planets.forEach(p => {
        p.phase += p.spd * dt * 0.5 * speedMul
        p.mesh.position.x = Math.cos(p.phase) * p.d
        p.mesh.position.z = Math.sin(p.phase) * p.d
        p.mesh.rotation.y += 0.3 * dt * speedMul
      })

      if (earthEntry && kaxaMoonPivot && kaxaMoon) {
        kaxaMoonPivot.position.copy(earthEntry.mesh.position)
        kaxaMoonPhase += 1.3 * dt * speedMul
        kaxaMoonPivot.rotation.y = kaxaMoonPhase
        kaxaMoon.rotation.y += 0.25 * dt * speedMul
      }

      // ----- Sun = Galactus: menacing breathing pulse + light flicker -----
      if (galactus) {
        const pulse = 1 + Math.sin(t * 1.4) * 0.04
        galactus.scale.setScalar(galactusBaseScale * pulse)
      }
      sunLight.intensity = 5.5 + Math.sin(t * 3.2) * 1.2

      // ----- Meteor/rocket spawn (raw dt so they keep spawning even when orbit paused) -----
      meteorT += dt
      if (meteorT > 1.1) { spawnMeteor(); meteorT = 0 }
      rocketT += dt
      if (rocketT > 2.2) { spawnRocket(); rocketT = 0 }

      const projDt = Math.max(speedMul, 0.5) * dt
      const updateProjectile = (p, getStart, getEnd, arc) => {
        p.progress += projDt * p.speed
        const startPos = getStart()
        const endPos = getEnd()
        const tt = Math.min(p.progress, 1)
        const pos = new THREE.Vector3().lerpVectors(startPos, endPos, tt)
        if (arc > 0) pos.y += Math.sin(tt * Math.PI) * arc
        p.head.position.copy(pos)
        p.history.unshift(pos.clone())
        if (p.history.length > TRAIL_LEN) p.history.pop()
        for (let j = 0; j < TRAIL_LEN; j++) {
          const h = p.history[j] || pos
          p.posArr[j * 3] = h.x
          p.posArr[j * 3 + 1] = h.y
          p.posArr[j * 3 + 2] = h.z
          const a = 1 - j / TRAIL_LEN
          p.colArr[j * 3] = p.rgb[0] * a
          p.colArr[j * 3 + 1] = p.rgb[1] * a
          p.colArr[j * 3 + 2] = p.rgb[2] * a
        }
        p.trail.geometry.attributes.position.needsUpdate = true
        p.trail.geometry.attributes.color.needsUpdate = true
        return p.progress >= 1 ? endPos.clone() : null
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        const impact = updateProjectile(m, () => m.from, () => m.target.mesh.position, 0)
        if (impact) {
          spawnExplosion(impact, 0xffa060, 32, 3.2)
          disposeProjectile(m)
          meteors.splice(i, 1)
        }
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        const impact = updateProjectile(r, () => r.src.mesh.position, () => r.target.mesh.position, 4)
        if (impact) {
          spawnExplosion(impact, 0xb79cff, 40, 3.5)
          disposeProjectile(r)
          rockets.splice(i, 1)
        }
      }

      for (let i = explosions.length - 1; i >= 0; i--) {
        const e = explosions[i]
        e.life += projDt
        for (let j = 0; j < e.vel.length; j++) {
          e.arr[j * 3] += e.vel[j].x * projDt
          e.arr[j * 3 + 1] += e.vel[j].y * projDt
          e.arr[j * 3 + 2] += e.vel[j].z * projDt
        }
        e.pts.geometry.attributes.position.needsUpdate = true
        e.pts.material.opacity = Math.max(0, 1 - e.life / e.max)
        if (e.life >= e.max) {
          scene.remove(e.pts)
          e.pts.geometry.dispose()
          e.pts.material.dispose()
          explosions.splice(i, 1)
        }
      }

      nebulae.forEach((n, i) => {
        n.material.rotation += 0.0002 * (i + 1)
      })

      mouse.x += (mouse.tx - mouse.x) * 0.03
      mouse.y += (mouse.ty - mouse.y) * 0.03
      camera.position.x = mouse.x * 8
      camera.position.y = 35 + mouse.y * -4
      camera.lookAt(0, 0, 0)

      sun.lookAt(camera.position)

      stars.rotation.y = t * 0.005

        renderer.render(scene, camera)
        raf = requestAnimationFrame(tick)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[cosmos] tick threw, raf halted:', err)
      }
    }
    tick()

    return () => {
      clearInterval(watchdog)
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMove)
      renderer.dispose()
      starGeo.dispose()
      starMat.dispose()
      sunShader.dispose()
      planets.forEach(p => { p.mesh.geometry.dispose(); p.mesh.material.dispose() })
      meteors.forEach(disposeProjectile)
      rockets.forEach(disposeProjectile)
      explosions.forEach(e => {
        scene.remove(e.pts)
        e.pts.geometry.dispose()
        e.pts.material.dispose()
      })
      if (galactus) {
        galactus.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose()
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => m?.dispose?.())
          }
        })
      }
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} aria-hidden="true" />
}

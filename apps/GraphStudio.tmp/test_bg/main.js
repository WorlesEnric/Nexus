import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, PerspectiveCamera, Points, RawShaderMaterial, Scene, WebGLRenderer, Clock } from "https://cdn.skypack.dev/three@0.136.0"
import { OrbitControls } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls"
import GUI from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/libs/lil-gui.module.min.js"
import { TWEEN } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/libs/tween.module.min.js"

console.clear()

// ------------------------ //
// SETUP

const count = 5000;
const canvas = document.querySelector('canvas') || document.createElement('canvas');
if (!document.querySelector('canvas')) document.body.appendChild(canvas);

const scene = new Scene()
// Dark tech background
scene.background = new Color("#000205")

const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 0, 4) // Centered view

const renderer = new WebGLRenderer({ canvas, antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const orbit = new OrbitControls(camera, canvas)
orbit.enableDamping = true;
orbit.autoRotate = true;
orbit.autoRotateSpeed = 0.5; // Very slow rotation for stability

// ------------------------ //
// TEXTURE (Soft Glow)

const ctx = document.createElement("canvas").getContext("2d")
ctx.canvas.width = ctx.canvas.height = 32
let grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
grd.addColorStop(0.0, "#ffffff")
grd.addColorStop(1.0, "#000000")
ctx.fillStyle = grd
ctx.fillRect(0, 0, 32, 32)
const alphaMap = new CanvasTexture(ctx.canvas)

// ------------------------ //
// THE NEXUS CORE (Modified Geometry)

const nexusGeometry = new BufferGeometry()
const nexusPosition = new Float32Array(count * 3)
const nexusRandomness = new Float32Array(count * 3)
const nexusSize = new Float32Array(count)

// Create a Galaxy Spiral
const branches = 3;
const spin = 10; // How much it curls

for (let i = 0; i < count; i++) {
    // 1. Choose a branch
    const branchAngle = (i % branches) / branches * Math.PI * 2;

    // 2. Distance from center (Power 2/3 favors center but leaves trails)
    const radius = Math.pow(Math.random(), 3) * 5;

    // 3. Spin angle based on radius
    const spinAngle = radius * spin;

    // 4. Random offset for "cloud" effect
    // Gaussian-ish distribution for randomness
    const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + radius / 2);
    const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + radius / 2);
    const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + radius / 2);

    // 5. Calculate position
    // x/z plane is the disk, y is the thickness
    nexusPosition[i * 3 + 0] = Math.cos(branchAngle + spinAngle) * radius + randomX;
    nexusPosition[i * 3 + 1] = randomY * 0.5; // Flattened slightly
    nexusPosition[i * 3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    // Store random offsets for the animation volatility
    nexusRandomness[i * 3 + 0] = (Math.random() - 0.5) * 2;
    nexusRandomness[i * 3 + 1] = (Math.random() - 0.5) * 2;
    nexusRandomness[i * 3 + 2] = (Math.random() - 0.5) * 2;

    // Size variety
    nexusSize[i] = Math.random() * Math.random();
}

nexusGeometry.setAttribute("position", new BufferAttribute(nexusPosition, 3))
nexusGeometry.setAttribute("aRandom", new BufferAttribute(nexusRandomness, 3))
nexusGeometry.setAttribute("size", new BufferAttribute(nexusSize, 1))

// ------------------------ //
// NEXUS COLORS (Cyan/Blue Tech Theme)

const colorCore = new Color("#ffffff") // White Center
const colorEdge = new Color("#888888") // Grey Edge

const nexusMaterial = new RawShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uSize: { value: renderer.getPixelRatio() * 2.0 }, // slightly larger particles
        uExpansion: { value: 0 }, // THE EXPLOSION FACTOR
        uAlphaMap: { value: alphaMap },
        uColorCore: { value: colorCore },
        uColorEdge: { value: colorEdge },
    },
    vertexShader: `
        precision highp float;
        attribute vec3 position;
        attribute vec3 aRandom;
        attribute float size;
        
        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        uniform float uTime;
        uniform float uSize;
        uniform float uExpansion;

        varying float vDistance;

        void main() {
            vec3 pos = position;

            // EXPLOSION LOGIC:
            // 1. Start at 0,0,0 (uExpansion = 0)
            // 2. Expand outwards based on original sphere position
            // 3. Add 'aRandom' noise as it expands to make it look volatile
            
            float expansion = uExpansion;
            
            // The "Blast" function
            // We multiply the position by the expansion factor
            vec3 explodedPos = pos * (1.0 + (aRandom * 0.5 * expansion)); 
            
            // Apply expansion scale
            explodedPos *= expansion * 4.0; 

            // Add a subtle "breathing" motion when stable
            float breathe = sin(uTime * 0.5 + length(pos) * 5.0) * 0.05 * expansion;
            explodedPos += normalize(pos) * breathe;

            vec4 mvp = modelViewMatrix * vec4(explodedPos, 1.0);
            gl_Position = projectionMatrix * mvp;

            // Distance from center for coloring
            vDistance = length(explodedPos) / 4.0; 

            // Size attenuation (points get smaller when further away)
            gl_PointSize = (10.0 * size * uSize) / -mvp.z;
            
            // Hide points when expansion is 0 (prevent single bright pixel at start)
            gl_PointSize *= step(0.01, expansion); 
        }
    `,
    fragmentShader: `
        precision highp float;
        uniform vec3 uColorCore;
        uniform vec3 uColorEdge;
        uniform sampler2D uAlphaMap;
        varying float vDistance;

        void main() {
            vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
            float alpha = texture2D(uAlphaMap, uv).g;
            if (alpha < 0.1) discard;

            // Tech Gradient: Core is bright, edges are deep blue
            vec3 color = mix(uColorCore, uColorEdge, smoothstep(0.0, 1.0, vDistance));
            
            // Add a subtle sparkle based on coordinate
            // float sparkle = sin(gl_FragCoord.x * 10.0 + gl_FragCoord.y * 10.0) * 0.1;
            
            gl_FragColor = vec4(color, alpha); // * (0.8 + sparkle));
        }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
})

const nexus = new Points(nexusGeometry, nexusMaterial)
scene.add(nexus)

// ------------------------ //
// ANIMATION SEQUENCE

// 1. The Big Bang
new TWEEN.Tween({ value: 0 })
    .to({ value: 1 }, 8000) // 8 seconds expansion
    .easing(TWEEN.Easing.Exponential.Out) // Smooth explosion effect
    .onUpdate((obj) => {
        nexusMaterial.uniforms.uExpansion.value = obj.value;
    })
    .start();

// ------------------------ //
// LOOP

const clock = new Clock(); // Use Three.js clock for smooth time

renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    nexusMaterial.uniforms.uTime.value += dt;

    TWEEN.update()
    orbit.update()
    renderer.render(scene, camera)
})

// ------------------------ //
// RESIZE
window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
})
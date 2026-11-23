import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { JarvisStatus } from '../hooks/useJarvis';
import { Orb } from './Orb';

// "Galaxy" look: the classic orb (Orb.tsx, unchanged) sits at the heart of a distant spiral
// galaxy with nebula clouds and a twinkling star field. Settings › Orb style switches back.

interface Props {
  status: JarvisStatus;
  audioLevel: number;
}

// core, arms, outer rim — per status
const PALETTE: Record<JarvisStatus, [string, string, string]> = {
  idle: ['#fff1d6', '#6fb8ff', '#9a7bff'],
  listening: ['#e8fbff', '#3fc8ff', '#4f7dff'],
  processing: ['#eafff4', '#3dffb0', '#2fb8ff'],
  speaking: ['#fff4dc', '#ffb35c', '#ff5f9e'],
  error: ['#ffe9e4', '#ff6257', '#ff9f43'],
};

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function glowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* --------------------------------------------------------------------------
   Spiral disk: rotation happens on the GPU (no per-frame CPU loop)
   -------------------------------------------------------------------------- */

const DISK_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform float uAudio;
  uniform float uPixelRatio;
  attribute float aRadius;
  attribute float aAngle;
  attribute float aHeight;
  attribute float aSize;
  attribute float aPhase;
  attribute float aRim;
  varying float vRadius;
  varying float vRim;
  varying float vAlpha;

  void main() {
    // Differential rotation: inner stars orbit faster, which keeps the arms winding
    float ang = aAngle + uSpin * (0.6 / (0.3 + aRadius));
    float r = aRadius * (1.0 + uAudio * 0.06 * sin(aPhase * 30.0 + uTime * 6.0));
    vec3 p = vec3(cos(ang) * r, aHeight, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float twinkle = 0.7 + 0.3 * sin(uTime * (1.0 + aPhase * 2.5) + aPhase * 50.0);
    gl_PointSize = aSize * uPixelRatio * twinkle * (1.0 + uAudio * 0.7) * (4.3 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vRadius = aRadius;
    vRim = aRim;
    vAlpha = twinkle * (1.0 - smoothstep(1.3, 1.78, aRadius));
  }
`;

const DISK_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uArm;
  uniform vec3 uRim;
  uniform float uAudio;
  uniform float uOpacity;
  uniform float uCoreDot;
  varying float vRadius;
  varying float vRim;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    vec3 col = mix(uCore, uArm, smoothstep(0.12, 0.85, vRadius));
    col = mix(col, uRim, smoothstep(0.8, 1.65, vRadius) * vRim);
    col += smoothstep(0.16, 0.0, d) * 0.55 * uCoreDot; // hot white star centre
    gl_FragColor = vec4(col * (1.0 + uAudio * 0.5), a * vAlpha * uOpacity);
  }
`;

function SpiralDisk({ status, audio, dust = false }: { status: JarvisStatus; audio: React.MutableRefObject<number>; dust?: boolean }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const spin = useRef(0);
  const { gl } = useThree();
  // Stars: many small points. Dust: fewer, large, faint points that blur into glowing arms.
  const count = dust ? 1100 : 10000;

  const geometry = useMemo(() => {
    const radius = new Float32Array(count);
    const angle = new Float32Array(count);
    const height = new Float32Array(count);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const rim = new Float32Array(count);
    const arms = 3;
    for (let i = 0; i < count; i++) {
      const arm = i % arms;
      let r = 0.2 + Math.pow(Math.random(), dust ? 1.2 : 1.7) * 1.6;
      r = Math.max(0.16, r + gauss() * 0.05);
      // Stars scatter more between the arms near the centre and hug the arms further out
      const scatter = gauss() * ((dust ? 0.32 : 0.55) / (r * 1.6 + 0.45));
      radius[i] = r;
      angle[i] = (arm / arms) * Math.PI * 2 + r * 2.5 + scatter;
      height[i] = gauss() * 0.045 * (1.9 - r);
      size[i] = dust
        ? 16 + Math.random() * 26
        : 1.5 + Math.pow(Math.random(), 4) * 6 + (r < 0.45 ? 1.4 : 0);
      phase[i] = Math.random();
      rim[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    g.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
    g.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
    return g;
  }, [count, dust]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSpin: { value: 0 },
    uAudio: { value: 0 },
    uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
    uOpacity: { value: dust ? 0.085 : 1 },
    uCoreDot: { value: dust ? 0 : 1 },
    uCore: { value: new THREE.Color(PALETTE.idle[0]) },
    uArm: { value: new THREE.Color(PALETTE.idle[1]) },
    uRim: { value: new THREE.Color(PALETTE.idle[2]) },
  }), [gl, dust]);

  const targets = useMemo(() => ({
    core: new THREE.Color(), arm: new THREE.Color(), rim: new THREE.Color(),
  }), []);

  useFrame((state, delta) => {
    const m = matRef.current;
    if (!m) return;
    const speed = status === 'processing' ? 0.9 : status === 'listening' || status === 'speaking' ? 0.45 + audio.current * 1.6 : 0.22;
    spin.current += delta * speed;
    m.uniforms.uTime.value = state.clock.getElapsedTime();
    m.uniforms.uSpin.value = spin.current;
    m.uniforms.uAudio.value = audio.current;
    const [c, a, r] = PALETTE[status] || PALETTE.idle;
    m.uniforms.uCore.value.lerp(targets.core.set(c), 0.05);
    m.uniforms.uArm.value.lerp(targets.arm.set(a), 0.05);
    m.uniforms.uRim.value.lerp(targets.rim.set(r), 0.05);
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={DISK_VERT}
        fragmentShader={DISK_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* --------------------------------------------------------------------------
   Distant star field
   -------------------------------------------------------------------------- */

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aPhase;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.5 + aPhase * 1.5) + aPhase * 40.0), 2.0);
    gl_PointSize = aSize * uPixelRatio * tw;
    gl_Position = projectionMatrix * mv;
    vA = tw;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.82, 0.9, 1.0), a * a * vA * 0.9);
  }
`;

function StarField() {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const count = 900;

  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const rad = 2.2 + Math.random() * 2.2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = s * Math.cos(th) * rad;
      pos[i * 3 + 1] = u * rad;
      pos[i * 3 + 2] = s * Math.sin(th) * rad - 1.2;
      size[i] = 0.8 + Math.pow(Math.random(), 5) * 3.2;
      phase[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) } }), [gl]);

  useFrame((state, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    if (ref.current) ref.current.rotation.y += delta * 0.008;
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* --------------------------------------------------------------------------
   Nebula clouds and core glow (soft additive sprites)
   -------------------------------------------------------------------------- */

const NEBULAE = [
  { pos: [0.8, 0, 0.35], scale: 2.2, color: '#3a7bff', opacity: 0.24, spin: 0.02 },
  { pos: [-0.75, 0, -0.45], scale: 2.4, color: '#8b5cff', opacity: 0.22, spin: -0.015 },
  { pos: [-0.3, 0, 0.9], scale: 1.7, color: '#ff4fa3', opacity: 0.14, spin: 0.025 },
  { pos: [0.5, 0, -0.95], scale: 1.8, color: '#2fd6ff', opacity: 0.17, spin: -0.02 },
] as const;

export function OrbGalaxy({ status, audioLevel }: Props) {
  const texture = useMemo(() => glowTexture(), []);
  const audio = useRef(0);
  const diskRef = useRef<THREE.Group>(null);
  const nebulaMats = useRef<(THREE.SpriteMaterial | null)[]>([]);
  const coreGlowMat = useRef<THREE.SpriteMaterial>(null);
  const glowTarget = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    audio.current = THREE.MathUtils.lerp(audio.current, audioLevel, 0.15);
    if (diskRef.current) {
      diskRef.current.rotation.z = 0.32 + Math.sin(t * 0.12) * 0.04;
      diskRef.current.rotation.x = -0.92 + Math.sin(t * 0.09) * 0.03;
    }
    nebulaMats.current.forEach((m, i) => {
      if (!m) return;
      m.rotation += delta * NEBULAE[i].spin;
      m.opacity = NEBULAE[i].opacity * (1 + Math.sin(t * 0.4 + i * 1.7) * 0.18 + audio.current * 0.9);
    });
    if (coreGlowMat.current) {
      coreGlowMat.current.color.lerp(glowTarget.set(PALETTE[status]?.[1] || PALETTE.idle[1]), 0.05);
      coreGlowMat.current.opacity = 0.32 + audio.current * 0.35 + Math.sin(t * 1.6) * 0.03;
    }
  });

  return (
    <group>
      <StarField />

      <group ref={diskRef} rotation={[-0.92, 0, 0.32]}>
        {NEBULAE.map((n, i) => (
          <sprite key={i} position={n.pos as unknown as [number, number, number]} scale={[n.scale, n.scale, 1]}>
            <spriteMaterial
              ref={(m) => { nebulaMats.current[i] = m; }}
              map={texture}
              color={n.color}
              transparent
              opacity={n.opacity}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        ))}
        <SpiralDisk status={status} audio={audio} dust />
        <SpiralDisk status={status} audio={audio} />
      </group>

      <sprite scale={[2.5, 2.5, 1]}>
        <spriteMaterial
          ref={coreGlowMat}
          map={texture}
          color={PALETTE.idle[1]}
          transparent
          opacity={0.32}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* The original orb, slightly smaller so the galaxy reads around it */}
      <group scale={0.8}>
        <Orb status={status} audioLevel={audioLevel} />
      </group>
    </group>
  );
}

export default OrbGalaxy;

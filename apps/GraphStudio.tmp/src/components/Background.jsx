import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import useStudioStore from '../context/StudioContext';

function Galaxy({ count = 5000, theme }) {
    const points = useRef();

    // Texture generation (Soft Glow) - Theme agnostic
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 32;
        canvas.height = 32;

        const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grd.addColorStop(0.0, "#ffffff");
        grd.addColorStop(1.0, "#000000"); // Alpha map, keeps black as transparent logic

        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 32, 32);

        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }, []);

    // Geometry generation
    const [positions, randomness, sizes] = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const randomness = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        const branches = 3;
        const spin = 10;

        for (let i = 0; i < count; i++) {
            const branchAngle = (i % branches) / branches * Math.PI * 2;
            const radius = Math.pow(Math.random(), 3) * 5;
            const spinAngle = radius * spin;

            const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + radius / 2);
            const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + radius / 2);
            const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + radius / 2);

            positions[i * 3 + 0] = Math.cos(branchAngle + spinAngle) * radius + randomX;
            positions[i * 3 + 1] = randomY * 0.5;
            positions[i * 3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

            randomness[i * 3 + 0] = (Math.random() - 0.5) * 2;
            randomness[i * 3 + 1] = (Math.random() - 0.5) * 2;
            randomness[i * 3 + 2] = (Math.random() - 0.5) * 2;

            sizes[i] = Math.random() * Math.random();
        }

        return [positions, randomness, sizes];
    }, [count]);

    // Colors based on theme
    const colors = useMemo(() => ({
        core: theme === 'dark' ? new THREE.Color("#ffffff") : new THREE.Color("#000000"),
        edge: theme === 'dark' ? new THREE.Color("#888888") : new THREE.Color("#444444")
    }), [theme]);

    // Shader Uniforms
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uSize: { value: 2.0 },
        uExpansion: { value: 0 },
        uAlphaMap: { value: texture },
        uColorCore: { value: colors.core },
        uColorEdge: { value: colors.edge },
    }), [texture, colors]);

    // Animation State
    const timeRef = useRef(0);
    const duration = 8.0;

    useFrame((state, delta) => {
        if (!points.current) return;

        // Update uniforms that might change
        points.current.material.uniforms.uColorCore.value = colors.core;
        points.current.material.uniforms.uColorEdge.value = colors.edge;

        points.current.material.uniforms.uSize.value = state.gl.getPixelRatio() * 2.0;
        points.current.material.uniforms.uTime.value += delta;

        // Expansion Animation
        if (timeRef.current < duration) {
            timeRef.current += delta;
            const progress = Math.min(timeRef.current / duration, 1.0);
            const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            points.current.material.uniforms.uExpansion.value = ease;
        } else {
            points.current.material.uniforms.uExpansion.value = 1.0;
        }
    });

    return (
        <points ref={points}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aRandom" count={count} array={randomness} itemSize={3} />
                <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
            </bufferGeometry>
            <rawShaderMaterial
                uniforms={uniforms}
                vertexShader={`
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
                float expansion = uExpansion;
                
                vec3 explodedPos = pos * (1.0 + (aRandom * 0.5 * expansion)); 
                explodedPos *= expansion * 4.0; 

                float breathe = sin(uTime * 0.5 + length(pos) * 5.0) * 0.05 * expansion;
                explodedPos += normalize(pos) * breathe;

                vec4 mvp = modelViewMatrix * vec4(explodedPos, 1.0);
                gl_Position = projectionMatrix * mvp;

                vDistance = length(explodedPos) / 4.0; 

                gl_PointSize = (10.0 * size * uSize) / -mvp.z;
                gl_PointSize *= step(0.01, expansion); 
            }
        `}
                fragmentShader={`
            precision highp float;
            uniform vec3 uColorCore;
            uniform vec3 uColorEdge;
            uniform sampler2D uAlphaMap;
            varying float vDistance;

            void main() {
                vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
                float alpha = texture2D(uAlphaMap, uv).g;
                if (alpha < 0.1) discard;

                // Tech Gradient
                vec3 color = mix(uColorCore, uColorEdge, smoothstep(0.0, 1.0, vDistance));
                
                gl_FragColor = vec4(color, alpha);
            }
        `}
                transparent
                depthTest={false}
                depthWrite={false}
                blending={THREE.NormalBlending} // Changed from Additive to Normal for dark stars on light bg
            />
        </points>
    );
}

export default function Background() {
    const { theme } = useStudioStore();

    return (
        <div className="absolute inset-0 z-0 bg-primary transition-colors duration-500">
            <Canvas camera={{ position: [0, 0, 4], fov: 60 }} dpr={[1, 2]}>
                <Galaxy count={5000} theme={theme} />

                <OrbitControls
                    enableDamping
                    autoRotate
                    autoRotateSpeed={0.5}
                    enableZoom={false}
                    enablePan={false}
                />
            </Canvas>
            {/* Gradient overlay - adaptive */}
            <div className={`absolute inset-0 pointer-events-none transition-colors duration-500
                ${theme === 'dark'
                    ? 'bg-gradient-to-b from-transparent via-[#050505]/20 to-[#050505]/70'
                    : 'bg-gradient-to-b from-transparent via-white/20 to-white/70'
                }`}
            />
        </div>
    );
}

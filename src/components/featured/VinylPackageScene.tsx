import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createWearMarks, PACKAGE_DEPTH, vinylBulgeHeight } from './featured-three-materials';

export interface VinylLabControls {
  thickness: number;
  bulge: number;
  wear: number;
  keyLight: number;
  background: number;
}

export interface VinylLabDiagnostics {
  status: 'loading' | 'ready' | 'failed' | 'context-lost';
  reason?: string;
  fps: number;
  width: number;
  height: number;
  dpr: number;
  calls: number;
  triangles: number;
  textures: number;
}

interface Props {
  coverUrl?: string;
  packageId: string;
  controls: VinylLabControls;
  onDiagnostics: (value: VinylLabDiagnostics) => void;
}

const EMPTY: VinylLabDiagnostics = {
  status: 'loading', fps: 0, width: 0, height: 0, dpr: 1, calls: 0, triangles: 0, textures: 0,
};

function backgroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.fillStyle = '#080a0d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const light = (x: number, y: number, radius: number, color: string) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(8,10,13,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  };
  light(850, 112, 390, 'rgba(220,226,228,0.34)');
  light(122, 620, 580, 'rgba(120,132,140,0.22)');
  light(460, 30, 430, 'rgba(160,170,177,0.13)');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function faceTexture(cover: HTMLImageElement, id: string, wear: number) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  const crop = Math.min(cover.naturalWidth, cover.naturalHeight);
  context.drawImage(cover, (cover.naturalWidth - crop) / 2, (cover.naturalHeight - crop) / 2, crop, crop, 0, 0, size, size);
  context.save();
  context.globalCompositeOperation = 'destination-out';
  const amplitude = wear / 100;
  for (const mark of createWearMarks(id, 72)) {
    const along = mark.along * size;
    const depth = Math.max(1, mark.depth * size * amplitude * 2.2);
    const width = Math.max(1, mark.width * size * amplitude * 1.6);
    if (mark.edge === 0) context.fillRect(along, 0, width, depth);
    if (mark.edge === 1) context.fillRect(size - depth, along, depth, width);
    if (mark.edge === 2) context.fillRect(along, size - depth, width, depth);
    if (mark.edge === 3) context.fillRect(0, along, depth, width);
  }
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cover image could not be loaded'));
    image.src = url;
  });
}

function bulgedGeometry(height: number) {
  const geometry = new THREE.PlaneGeometry(1, 1, 48, 48);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setZ(index, vinylBulgeHeight(positions.getX(index), positions.getY(index)) * height / 0.35);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export default function VinylPackageScene({ coverUrl, packageId, controls, onDiagnostics }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef(controls);
  useEffect(() => { controlsRef.current = controls; }, [controls]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !coverUrl) {
      onDiagnostics({ ...EMPTY, status: 'failed', reason: 'No cover image is available.' });
      return undefined;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
      if (!context) throw new Error('WebGL 2 is unavailable');
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      onDiagnostics({ ...EMPTY, status: 'failed', reason: error instanceof Error ? error.message : 'WebGL initialization failed' });
      return undefined;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene();
    const background = backgroundTexture();
    scene.background = background;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0, 3.1);
    const orbit = new THREE.Group();
    scene.add(orbit);
    const ambient = new THREE.HemisphereLight(0xd9dfe1, 0x111419, 1.45);
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(2.7, 3.5, 4.5);
    const fill = new THREE.DirectionalLight(0x89949b, 0.9);
    fill.position.set(-3, -2, 2.5);
    scene.add(ambient, key, fill);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.86 });
    const faceMaterial = new THREE.MeshStandardMaterial({ roughness: 0.76, metalness: 0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, PACKAGE_DEPTH), bodyMaterial);
    const face = new THREE.Mesh(bulgedGeometry(controlsRef.current.bulge), faceMaterial);
    face.position.z = PACKAGE_DEPTH / 2 + 0.001;
    orbit.add(body, face);

    let frame = 0;
    let last = performance.now();
    let lastReport = 0;
    let loaded = false;
    let contextLost = false;
    const updateGeometry = (next: VinylLabControls) => {
      const depth = PACKAGE_DEPTH * (next.thickness / 2);
      body.geometry.dispose();
      body.geometry = new THREE.BoxGeometry(1, 1, depth);
      face.geometry.dispose();
      face.geometry = bulgedGeometry(next.bulge);
      face.position.z = depth / 2 + 0.001;
      key.intensity = 2.8 * (next.keyLight / 100);
      renderer.toneMappingExposure = 1.05 * (next.background / 100);
    };
    let previous = { ...controlsRef.current };
    const render = (now: number) => {
      if (contextLost || document.hidden) { frame = requestAnimationFrame(render); return; }
      const next = controlsRef.current;
      if (next.thickness !== previous.thickness || next.bulge !== previous.bulge) updateGeometry(next);
      if (next.wear !== previous.wear && loaded) {
        faceMaterial.map?.dispose();
        loadImage(coverUrl).then((image) => { faceMaterial.map = faceTexture(image, packageId, next.wear); faceMaterial.needsUpdate = true; });
      }
      if (next.keyLight !== previous.keyLight || next.background !== previous.background) updateGeometry(next);
      previous = { ...next };
      orbit.rotation.y = now * 0.00016;
      orbit.rotation.x = -0.08;
      renderer.render(scene, camera);
      if (now - lastReport > 250) {
        const elapsed = Math.max(now - last, 1);
        const size = renderer.getSize(new THREE.Vector2());
        onDiagnostics({
          status: 'ready', fps: Math.round(1000 / elapsed), width: Math.round(size.x), height: Math.round(size.y),
          dpr: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          textures: renderer.info.memory.textures,
        });
        lastReport = now;
      }
      last = now;
      frame = requestAnimationFrame(render);
    };
    const resize = () => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      onDiagnostics({ ...EMPTY, status: 'context-lost', reason: 'The browser lost its WebGL context.' });
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    resize();
    loadImage(coverUrl).then((image) => {
      if (contextLost) return;
      faceMaterial.map = faceTexture(image, packageId, controlsRef.current.wear);
      faceMaterial.needsUpdate = true;
      loaded = true;
      onDiagnostics({ ...EMPTY, status: 'ready' });
      frame = requestAnimationFrame(render);
    }).catch((error: unknown) => {
      onDiagnostics({ ...EMPTY, status: 'failed', reason: error instanceof Error ? error.message : 'Cover image could not be loaded' });
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      faceMaterial.map?.dispose();
      faceMaterial.dispose();
      bodyMaterial.dispose();
      body.geometry.dispose();
      face.geometry.dispose();
      background.dispose();
      renderer.dispose();
    };
  }, [coverUrl, onDiagnostics, packageId]);

  return <canvas ref={canvasRef} data-testid="vinyl-lab-scene" className="absolute inset-0 size-full" />;
}

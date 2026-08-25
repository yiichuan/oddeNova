import { useEffect, useRef, useState } from 'react';

interface FeaturedWebglLightFieldProps {
  active: boolean;
}

interface RendererController {
  setActive: (active: boolean) => void;
}

interface ShaderResources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  resolution: WebGLUniformLocation;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 u_resolution;

out vec4 out_color;

float hash21(vec2 value) {
  value = fract(value * vec2(123.34, 456.21));
  value += dot(value, value + 45.32);
  return fract(value.x * value.y);
}

float softEllipse(vec2 point, vec2 centre, vec2 radius, float falloff) {
  vec2 offset = (point - centre) / radius;
  return exp(-dot(offset, offset) * falloff);
}

void main() {
  vec2 point = (2.0 * gl_FragCoord.xy - u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);

  vec3 colour = vec3(0.008, 0.010, 0.013);

  // The exact five-source state previously approved: lights 1, 2, 3, 4 and 6.
  float silverKey = softEllipse(point, vec2(0.72, 0.40), vec2(0.82, 0.44), 1.42);
  float silverFill = softEllipse(point, vec2(-0.56, -0.34), vec2(1.28, 0.82), 1.70);
  float overhead = softEllipse(point, vec2(-0.12, 1.08), vec2(1.62, 0.52), 2.05);
  float silverLeft = softEllipse(point, vec2(-1.34, 0.26), vec2(0.72, 1.20), 1.48);
  float lowerShelf = softEllipse(point, vec2(0.48, -0.92), vec2(1.24, 0.44), 1.54);
  colour += vec3(0.205, 0.220, 0.230) * silverKey * 0.62;
  colour += vec3(0.112, 0.124, 0.134) * silverFill * 0.68;
  colour += vec3(0.125, 0.137, 0.143) * overhead * 0.30;
  colour += vec3(0.105, 0.110, 0.114) * silverLeft * 0.30;
  colour += vec3(0.050, 0.056, 0.061) * lowerShelf * 0.34;

  colour = max(colour, vec3(0.0));
  colour = colour / (colour + vec3(0.82));
  colour = pow(colour, vec3(0.90));
  float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  colour = clamp(colour + dither, 0.0, 1.0);

  out_color = vec4(colour, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create Featured background shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(gl: WebGL2RenderingContext): ShaderResources {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error('Unable to create Featured background shader program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown shader link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  const vao = gl.createVertexArray();
  const resolution = gl.getUniformLocation(program, 'u_resolution');
  if (!vao || !resolution) {
    if (vao) gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error('Featured background shader uniforms are unavailable.');
  }

  return { program, vao, resolution };
}

function disposeResources(gl: WebGL2RenderingContext, resources: ShaderResources | null) {
  if (!resources || gl.isContextLost()) return;
  gl.deleteVertexArray(resources.vao);
  gl.deleteProgram(resources.program);
}

export default function FeaturedWebglLightField({ active }: FeaturedWebglLightFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<RendererController | null>(null);
  const activeRef = useRef(active);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    controllerRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return undefined;

    let resources: ShaderResources | null = null;

    /**
     * Sizes the drawing buffer to the canvas, and says whether there is a
     * canvas to draw into at all. The Featured page stays mounted behind
     * `display: none` while you are elsewhere in the app, and an element with
     * no box measures zero; sizing to 1x1 there would bake one stretched pixel
     * as the whole light field.
     */
    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.round(canvas.clientWidth * pixelRatio);
      const height = Math.round(canvas.clientHeight * pixelRatio);
      if (width < 1 || height < 1) return false;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      return true;
    };

    const draw = () => {
      if (!resources || !activeRef.current || document.hidden) return;
      if (!resize()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(resources.program);
      gl.bindVertexArray(resources.vao);
      gl.uniform2f(resources.resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const setActive = (nextActive: boolean) => {
      if (nextActive) draw();
    };

    const onVisibilityChange = () => {
      if (!document.hidden && activeRef.current) draw();
    };

    const initialiseResources = () => {
      disposeResources(gl, resources);
      resources = createResources(gl);
      setWebglReady(true);
      if (activeRef.current) draw();
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      resources = null;
      setWebglReady(false);
    };

    const onContextRestored = () => {
      try {
        initialiseResources();
      } catch {
        resources = null;
        setWebglReady(false);
      }
    };

    try {
      resources = createResources(gl);
      setWebglReady(true);
    } catch {
      resources = null;
      return undefined;
    }

    controllerRef.current = { setActive };
    setActive(activeRef.current);

    // One frame is drawn and then left standing, so the moment that matters
    // most is the canvas gaining its size — which happens when the page is
    // first shown, long after this effect ran. A window resize never fires for
    // that, so without an observer the field stays dark until something else
    // happens to resize the window.
    const sizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => draw());
    sizeObserver?.observe(canvas);

    window.addEventListener('resize', draw);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      controllerRef.current = null;
      sizeObserver?.disconnect();
      window.removeEventListener('resize', draw);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      disposeResources(gl, resources);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="featured-space-background"
      data-active={active}
      data-testid="featured-webgl-light-field"
      data-webgl-ready={webglReady}
    >
      <canvas ref={canvasRef} className="featured-space-canvas" />
    </div>
  );
}

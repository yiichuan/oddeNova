import { useEffect, useRef, useState } from 'react';

/**
 * Which palette the field is lit in.
 *
 * `space` is the collection room the Featured shelf stands in: near-black,
 * with five silver sources bloomed across it. `paper` is the same five sources
 * added the same way, on a ground lowered far enough to leave a light somewhere
 * to stand — see the fragment shader for what that costs and what it buys.
 */
export type LightFieldVariant = 'space' | 'paper';

interface FeaturedWebglLightFieldProps {
  active: boolean;
  variant?: LightFieldVariant;
}

interface RendererController {
  setActive: (active: boolean) => void;
  /** Paint the one frame again — what a palette change needs and nothing more. */
  redraw: () => void;
}

interface ShaderResources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  resolution: WebGLUniformLocation;
  /**
   * Nullable on purpose: a uniform a driver has folded away reports no
   * location, and `uniform1f(null, …)` is a defined no-op. The field is worth
   * more in the wrong palette than not at all.
   */
  paper: WebGLUniformLocation | null;
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
uniform float u_paper;

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

  // One five-source composition, lit twice. Both grounds below add these the
  // same way; what differs is where the ramp they are added onto begins, and
  // how hard the key and the fill are driven into it.
  float silverKey = softEllipse(point, vec2(0.79, 0.54), vec2(0.82, 0.44), 1.42);
  float silverFill = softEllipse(point, vec2(-0.56, -0.34), vec2(1.28, 0.82), 1.70);
  float overhead = softEllipse(point, vec2(-0.12, 1.08), vec2(1.62, 0.52), 2.05);
  float silverLeft = softEllipse(point, vec2(-1.34, 0.26), vec2(0.72, 1.20), 1.48);
  float lowerShelf = softEllipse(point, vec2(0.48, -0.92), vec2(1.24, 0.44), 1.54);

  vec3 colour;

  if (u_paper > 0.5) {
    /* Paper, lit the way the dark room is: a ground with the five sources
       added on top of it, saturating towards a ceiling.

       This is the second answer this branch has given, and the first one is
       worth keeping in view. The page used to be #F3F3F3 with the sources
       spent the other way — each one pooling a cool grey into the paper —
       because a light is a thing brighter than its ground, and an off-white
       page has nothing left for one to be brighter than. That is still true.
       What changed is the ground: it was lowered until there was room above
       it for a light to stand in.

       Which is the whole of the design here. The headroom is 1 - ground, and
       everything the light is — its brightness and its colour together — has
       to fit inside it, since the bloom below saturates towards that ceiling
       and never past it. At the old #F3F3F3 the whole budget was twelve
       levels, which is not a light. At #D4D4D6 it is forty-three, which is.

       That ground is two levels cool rather than a plain grey, which is a
       change of principle and not only of value. The subtractive page kept
       every bit of its colour in the light — a reading room lit cool rather
       than a cool room — because an unlit corner there was simply paper. Here
       the paper is faintly cool itself and the light adds to it, so the page
       reads cool everywhere and more so where a source lands. The corners are
       the tell: they hold their two levels with no light on them at all.

       Two things about the dark room do not survive the crossing, and both are
       the same fact about that budget.

       Its colours cannot be copied. Those five vectors are spent over the
       whole of a 0-to-1 ramp and then pulled open again by the shoulder and
       the 0.90 gamma below. Multiplied into paper's 0.161 of headroom they
       light the page by eight levels and their hue lands at one. What crosses
       over is the ratio between the channels, never the numbers.

       And no source can keep a colour of its own. Standing the five apart by
       those same ratios gives each of them one or two levels here, a
       difference nothing reads. So they are summed to a scalar and the page
       takes one gradient of colour across it instead — the one thing the dark
       room, with a whole ramp to spend, does not have to give up.

       The colour is held in red and green rather than added to blue, which
       reads as a detail and is not. A cool light added to a near-white page
       drives blue into the ceiling first with the other two catching up
       behind it, so exactly where the light is strongest the separation
       flattens: fourteen levels of intent arrive as one. Holding blue at the
       light's own value and taking the other two down spends the colour where
       there is still room for it, and keeps the two dials this branch has
       always had, and names them: value is the depth, spread is the hue, and
       neither reaches into the other.

       The key and the fill carry between two and three times what the other
       three do, and that is the page being asked for something it had not
       been asked for before: that the middle of it arrive at white. The gain
       of 2.4 is what it always was — what changed is how much light is thrown
       into it. The two pools now sit at ninety-eight hundredths of the
       headroom and the centre between them at ninety-two, so the middle is
       flat to within two levels and every gradient the page has left is in
       the fall from there out to the edges. The other three are deliberately
       not raised with them: they are what keeps that fall, and lifting them
       would light the corners the middle is meant to be measured against.

       What the reader sees: #D8D8DB in the top right corner and #E1E1E3 in the
       bottom left, which is still very nearly unlit paper; #F8F8FB through the
       middle; #FCFCFE where the fill light gathers under the reading, and
       #F6F6FC under the script window's top right corner — six levels of cool
       there and seven in the key pool above it, which is now the page's most
       coloured point. Thirty-nine levels from darkest corner to brightest
       pool.

       Which is the ground being spent the only way it can be. It has been
       moved twice now, nine levels down and five back up, and the middle of
       the page has never felt more than one of them: the bloom is already at
       ninety-two hundredths there, so almost everything the ground gives up
       is handed straight back by the light, and almost everything it takes
       back comes out of the corners. A ground is not the page's colour on
       this branch. It is only how far down the unlit parts of it reach, which
       is to say how deep the vignette is: forty-eight levels of it at
       #CFCFD1, thirty-nine at #D4D4D6, and the pools standing at the same
       #FCFCFE either way.

       The cost was known and taken, and has now been taken twice. The script
       window is a 35% fill of #F7F7FA: over the first field it stood eleven
       levels above what it is cut into, over the last one two, and over this
       one it lands a level below the page, its white border catching four
       levels where it once caught nine (see .favorites-panel in index.css,
       whose note was written for the first field of all). So the window has
       crossed over by itself, and what it wants now is to be told to: a fill
       darker than the page it sits on, which is what an opening in a lit wall
       actually is, rather than a white one holding on by its edge. */
    float pooled = silverKey * 1.45
      + silverFill * 1.70
      + overhead * 0.30
      + silverLeft * 0.30
      + lowerShelf * 0.34;
    float bloom = 1.0 - exp(-pooled * 2.4);
    float spread = mix(0.010, 0.028, smoothstep(-0.05, 0.80, point.x));
    vec3 ground = vec3(0.831, 0.831, 0.839);
    colour = ground + (vec3(1.0) - ground) * bloom;
    colour -= vec3(spread * bloom, spread * bloom, 0.0);
  } else {
    colour = vec3(0.008, 0.010, 0.013);
    colour += vec3(0.205, 0.220, 0.230) * silverKey * 0.62;
    colour += vec3(0.112, 0.124, 0.134) * silverFill * 0.68;
    colour += vec3(0.125, 0.137, 0.143) * overhead * 0.30;
    colour += vec3(0.105, 0.110, 0.114) * silverLeft * 0.30;
    colour += vec3(0.050, 0.056, 0.061) * lowerShelf * 0.34;

    // The shoulder belongs to this half alone: these five are spent over a
    // whole ramp and would clip where they overlap. Paper adds the same five
    // but saturates inside its own headroom, so it needs no ceiling put on it.
    colour = max(colour, vec3(0.0));
    colour = colour / (colour + vec3(0.82));
    colour = pow(colour, vec3(0.90));
  }

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

  return { program, vao, resolution, paper: gl.getUniformLocation(program, 'u_paper') };
}

function disposeResources(gl: WebGL2RenderingContext, resources: ShaderResources | null) {
  if (!resources || gl.isContextLost()) return;
  gl.deleteVertexArray(resources.vao);
  gl.deleteProgram(resources.program);
}

export default function FeaturedWebglLightField({
  active,
  variant = 'space',
}: FeaturedWebglLightFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<RendererController | null>(null);
  const activeRef = useRef(active);
  const variantRef = useRef(variant);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    controllerRef.current?.setActive(active);
  }, [active]);

  /* A palette change is one uniform and one more frame — the program, the
     context and the triangle are the same in both. Nothing is torn down, so
     flipping the theme cannot cost a context. */
  useEffect(() => {
    variantRef.current = variant;
    controllerRef.current?.redraw();
  }, [variant]);

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
      // The root theme is the final authority. A paper prop can briefly be
      // stale while the Favorites page follows a theme flip; never let that
      // one-frame handover paint a white field inside the dark room.
      const rootIsDark = document.documentElement.dataset.theme === 'dark';
      gl.uniform1f(resources.paper, variantRef.current === 'paper' && !rootIsDark ? 1 : 0);
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

    controllerRef.current = { setActive, redraw: draw };
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
      data-variant={variant}
      data-webgl-ready={webglReady}
    >
      <canvas ref={canvasRef} className="featured-space-canvas" />
    </div>
  );
}

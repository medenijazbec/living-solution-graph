/* Decorative, dependency-free orbital renderer. No graph or database access. */
const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform sampler2D earthMap;
uniform float rotation;
const float PI = 3.14159265359;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

vec3 stars(vec2 pixel) {
  vec2 cell = floor(pixel / 5.0);
  float seed = hash(cell);
  vec2 local = fract(pixel / 5.0) - vec2(hash(cell+13.0),hash(cell+31.0));
  float point = exp(-dot(local,local)*70.0) * step(.943,seed);
  float band = exp(-pow((pixel.x/resolution.x-.47 + pixel.y/resolution.y*.18) * 5.0,2.0));
  vec3 tint = mix(vec3(.62,.76,1.0),vec3(1.0,.91,.78),hash(cell+5.0));
  float brightStar = exp(-dot(local,local)*13.0)*step(.997,seed);
  return tint*(point*(.65+1.0*hash(cell+7.0))*(.65+.35*band)+brightStar*.36);
}

void main() {
  vec2 p = (gl_FragCoord.xy - resolution * .5) / resolution.y;
  // Large sphere clipped below the frame: horizon at approximately 61% height.
  float radius = 4.1;
  vec2 q = p - vec2(0.0, -radius-.11);
  float distanceToLimb = length(q)-radius;
  vec3 color = vec3(.001,.003,.008) + stars(gl_FragCoord.xy);
  // Stacked white/cyan/blue atmosphere with distinct falloff widths.
  if (distanceToLimb > 0.0) {
    color += vec3(.015,.11,.38)*exp(-distanceToLimb*30.0);
    color += vec3(.025,.25,.8)*exp(-distanceToLimb*95.0);
    color += vec3(.38,.72,1.0)*exp(-distanceToLimb*360.0);
  } else {
    vec3 normal = vec3(q/radius, sqrt(max(0.0,1.0-dot(q,q)/(radius*radius))));
    // Tilt the sphere to frame the Atlantic/Caribbean beneath the cloud layer.
    float tilt = 1.0;
    vec3 mapped = vec3(normal.x, normal.y*cos(tilt)-normal.z*sin(tilt),
                      normal.y*sin(tilt)+normal.z*cos(tilt));
    float longitude = atan(mapped.z,mapped.x) / (2.0*PI) + .5 + rotation;
    vec2 uv = vec2(fract(longitude), asin(clamp(mapped.y,-1.0,1.0))/PI+.5);
    vec3 surface = texture2D(earthMap,uv).rgb;
    float light = .72 + .28*max(dot(normal,normalize(vec3(-.2,.6,1.0))),0.0);
    color = surface * light;
    float ocean = smoothstep(.005,.04,surface.b-max(surface.r,surface.g));
    color = mix(color,vec3(.025,.19,.38),ocean*.55);
    color = mix(color,vec3(.09,.29,.53),.12*(1.0-normal.z));
    float rim = exp(distanceToLimb*78.0);
    color = mix(color,vec3(.22,.55,.95),rim*.65);
    color += vec3(.12,.38,.72)*exp(distanceToLimb*230.0);
  }
  gl_FragColor = vec4(color,1.0);
}
`;

function initializeOrbit(canvas, button) {
  const listeners = new AbortController();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let gl, program, buffer, texture;
  let ready = false, failed = false, disposed = false, frame = 0;
  let lastTime = 0, elapsed = 0, paused = false;
  try { paused = localStorage.getItem('lsg-orbit-paused') === 'true'; } catch {}

  const stop = () => { cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
  const moving = () => ready && !failed && !disposed && !paused && !media.matches && !document.hidden;
  const state = () => {
    canvas.dataset.state = failed ? 'fallback' : moving() ? 'running' : ready ? 'paused' : 'loading';
    button.disabled = failed || media.matches || !ready;
    button.textContent = failed ? 'Earth unavailable' : media.matches ? 'Earth · still' : paused ? 'Resume Earth' : 'Pause Earth';
    button.setAttribute('aria-pressed', String(paused || media.matches));
    button.title = failed ? 'Decorative scene unavailable; workspace remains functional' : media.matches ? 'Animation disabled by your reduced-motion preference' : 'Pause or resume decorative Earth rotation';
  };
  const fallback = () => { failed = true; stop(); state(); };
  const draw = () => {
    if (!ready || failed || disposed) return;
    gl.uniform1f(gl.getUniformLocation(program,'rotation'), -.475 + elapsed / 300000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const tick = now => {
    frame = 0;
    if (!moving()) return;
    if (!lastTime || now-lastTime >= 1000/30) {
      if (lastTime) elapsed += Math.min(100,now-lastTime);
      lastTime = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => { stop(); state(); draw(); if (moving()) frame = requestAnimationFrame(tick); };
  const resize = () => {
    if (!gl || failed || disposed) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5, 1600/innerWidth, 1000/innerHeight);
    canvas.width = Math.max(1,Math.round(innerWidth*ratio));
    canvas.height = Math.max(1,Math.round(innerHeight*ratio));
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform2f(gl.getUniformLocation(program,'resolution'),canvas.width,canvas.height);
    draw();
  };
  const dispose = () => {
    disposed = true; stop(); listeners.abort();
    if (gl) { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); }
  };

  state();
  try {
    gl = canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
    if (!gl) throw new Error('WebGL unavailable');
    const compile = (kind,source) => {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message);
      }
      return shader;
    };
    program = gl.createProgram();
    const vertex = compile(gl.VERTEX_SHADER,vertexSource), fragment = compile(gl.FRAGMENT_SHADER,fragmentSource);
    gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Shader link failed');
    gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program,'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program,'earthMap'),0);
    resize();
    const image = new Image();
    image.onload = () => {
      if (disposed || failed) return;
      try {
        const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        let source = image;
        if (image.width > limit || image.height > limit) {
          const size = 2 ** Math.floor(Math.log2(limit));
          const reduced = document.createElement('canvas');
          reduced.width = size;
          reduced.height = Math.max(1,Math.round(image.height*size/image.width));
          reduced.getContext('2d').drawImage(image,0,0,reduced.width,reduced.height);
          source = reduced;
        }
        gl.bindTexture(gl.TEXTURE_2D,texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture upload failed');
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
        const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
        if (anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture configuration failed');
        ready = true; sync();
      } catch { fallback(); }
    };
    image.onerror = fallback;
    image.src = '/assets/earth/earth-viirs.webp';
  } catch { fallback(); }

  const options = {signal:listeners.signal};
  button.addEventListener('click',() => {
    paused = !paused;
    try { localStorage.setItem('lsg-orbit-paused',String(paused)); } catch {}
    sync();
  },options);
  document.addEventListener('visibilitychange',sync,options);
  media.addEventListener('change',sync,options);
  window.addEventListener('resize',resize,options);
  canvas.addEventListener('webglcontextlost',event => { event.preventDefault(); fallback(); },options);
  window.addEventListener('pagehide',event => { if (!event.persisted) dispose(); else stop(); },options);
  window.addEventListener('pageshow',sync,options);
}

const canvas = document.getElementById('orbitalBackground');
const button = document.getElementById('toggleOrbit');
if (canvas && button) initializeOrbit(canvas,button);

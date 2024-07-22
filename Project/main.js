let _gl, gl; // Variabili per la gestione del contesto WebGL

let _node; // Variabile globale per l'accesso a RenderSystemSet, sistema di rendering.

let accell = 0; //Variabili per gestire l'accelerazione 
let properFrameCount = 0; //Variabile per gestire il conteggio dei frame.

const TEX_SIZE = 512; // 512x512 particelle

let ext = {}; // Oggetto per memorizzare estensioni WebGL.

const MONOTONE_PATTERN = 0;
const NOISE_PATTERN = 1;
const CHECK_PATTERN = 2;
const CLOUD_PATTERN = 3;
const TRIANGLE_PATTERN = 4;
const SEIGAIHA_PATTERN = 5;
const KOJI_PATTERN = 6;
const ASANOHA_PATTERN = 7;

const MONOTONE_GRADATION = 0;

const AUTO_SIZE = 0;
const MANUAL_SIZE = 1;


let config = {
  PARTICLE_COLOR:{r:32,g:64,b:255}, // Colore delle particelle
  AUTO_COLOR:false, // Se true, il colore cambia con il passare del tempo
  MIRROR_X:false, // mirror_x 
  MIRROR_Y:false, // mirror_y
  MAIN_COLOR:{r:0,g:0,b:0}, // Colore della parte nera della texture
  BASE_COLOR:{r:60,g:60,b:60}, // Colore della parte bianca della texture
  BGPATTERN:MONOTONE_PATTERN,
  GRADATION:MONOTONE_GRADATION,
  SIZETYPE:AUTO_SIZE, 
  WIDTH:1024,
  HEIGHT:768,
  BLOOM: false,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  BLOOM_COLOR: "#fff",
};

//Variabili per la gestione delle texture.
let textureTableSource;
let textureTable; 


//Variabili per memorizzare la larghezza e 
//l'altezza correnti della finestra di rendering.
let currentWidth; 
let currentHeight;



// dat.GUI
(function(){ 
  window.onload = function() {
    var gui = new dat.GUI({ width: 280 });
    
    gui.addColor(config, 'PARTICLE_COLOR').name('particleColor');
    gui.add(config, 'AUTO_COLOR').name('autoColor');
    gui.add(config, 'MIRROR_X').name('mirrorX');
    gui.add(config, 'MIRROR_Y').name('mirrorY');

    let bgFolder = gui.addFolder('bg');
    bgFolder.addColor(config, 'MAIN_COLOR').name('mainColor');
    bgFolder.addColor(config, 'BASE_COLOR').name('baseColor');
    bgFolder.add(config, 'BGPATTERN', {'MONOTONE':MONOTONE_PATTERN, 'NOISE':NOISE_PATTERN, 'CHECK':CHECK_PATTERN, 'CLOUD':CLOUD_PATTERN, 'TRIANGLE':TRIANGLE_PATTERN, 'SEIGAIHA':SEIGAIHA_PATTERN, 'KOJI':KOJI_PATTERN, 'ASANOHA':ASANOHA_PATTERN}).name('pattern');
    bgFolder.add(config, 'GRADATION', {'MONOTONE':MONOTONE_GRADATION}).name('gradation');

    let sizeFolder = gui.addFolder('size');
    sizeFolder.add(config, 'SIZETYPE', {'AUTO':AUTO_SIZE, 'MANUAL':MANUAL_SIZE}).name('sizeType');
    sizeFolder.add(config, 'WIDTH', 256, 1280, 1).name('width');
    sizeFolder.add(config, 'HEIGHT', 256, 768, 1).name('height');

    let bloomFolder = gui.addFolder('bloom');
    bloomFolder.add(config, 'BLOOM').name('bloom');
    bloomFolder.add(config, 'BLOOM_ITERATIONS', 1, 8, 1).name('iterations');
    bloomFolder.add(config, 'BLOOM_INTENSITY', 0, 5, 0.1).name('intensity');
    bloomFolder.add(config, 'BLOOM_THRESHOLD', 0, 1, 0.1).name('threshold');
    bloomFolder.add(config, 'BLOOM_SOFT_KNEE', 0, 1, 0.1).name('soft_knee');
    bloomFolder.addColor(config, 'BLOOM_COLOR').name('bloom_color');
    
  };
})();




// shader
// dataShader. Imposta la posizione e la velocità iniziale.
// Vertex Shader
const dataVert = `
precision mediump float;
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Fragment Shader
const dataFrag = `
precision mediump float;
uniform float uTexSize;
void main() {
  vec2 p = gl_FragCoord.xy / uTexSize; // Normalizza tra 0.0 e 1.0
  vec2 pos = (p - 0.5) * 2.0; // La posizione è tra -1 e 1.
  gl_FragColor = vec4(pos, 0.0, 0.0); // La velocità iniziale è 0.
}`;


// moveShader. Aggiorna la posizione e la velocità con il rendering off-screen.
// Vertex Shader
const moveVert = `
precision mediump float;
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Fragment Shader
const moveFrag = `
precision mediump float;
uniform sampler2D uTex;
uniform float uTexSize;
uniform vec2 uMouse;
uniform bool uMouseFlag;
uniform float uAccell;
const float SPEED = 0.05;
void main() {
  vec2 p = gl_FragCoord.xy / uTexSize; // Posizione del pixel
  vec4 t = texture2D(uTex, p);
  vec2 pos = t.xy;
  vec2 velocity = t.zw;
  // Processo di aggiornamento
  vec2 v = normalize(uMouse - pos) * 0.2;
  vec2 w = normalize(velocity + v); // La grandezza è sempre 1
  vec4 destColor = vec4(pos + w * SPEED * uAccell, w);
  // Se il mouse non è premuto, la velocità si riduce per attrito
  if (!uMouseFlag) { destColor.zw = velocity; }
  gl_FragColor = destColor;
}`;


const pointVert = `
precision mediump float;
attribute float aIndex;
uniform sampler2D uTex;
uniform vec2 uResolution; // Risoluzione
uniform float uTexSize; // Per il fetch della texture
uniform float uPointScale;
void main() {
  // Disposizione dei punti di uTexSize * uTexSize
  // 0.5 aggiunto per accedere correttamente alla griglia
  float indX = mod(aIndex, uTexSize);
  float indY = floor(aIndex / uTexSize);
  float x = (indX + 0.5) / uTexSize;
  float y = (indY + 0.5) / uTexSize;
  vec4 t = texture2D(uTex, vec2(x, y));
  vec2 p = t.xy;
  p *= vec2(min(uResolution.x, uResolution.y)) / uResolution;
  gl_Position = vec4(p, 0.0, 1.0);
  // La dimensione dei punti dipende dalla distanza dal centro.
  gl_PointSize = 0.1 + uPointScale; 
}`;


// Fragment Shader
const pointFrag = `
precision mediump float;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}`;


// Vertex Shader
const copyVert = `
precision mediump float;
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;


// Fragment Shader
const copyFrag = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTex;
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}`;


// Fragment Shader
const mirrorFrag = `
precision mediump float;
precision mediump sampler2D;
varying highp vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uMirror;
void main() {
  vec2 p = vUv;
  vec2 p1 = vec2(1.0 - p.x, p.y);
  vec2 p2 = vec2(p.x, 1.0 - p.y);
  vec2 p3 = vec2(1.0 - p.x, 1.0 - p.y);
  vec4 result = texture2D(uTex, p);
  if (uMirror.x > 0.0) { result += texture2D(uTex, p1); }
  if (uMirror.y > 0.0) { result += texture2D(uTex, p2); }
  if (uMirror.x > 0.0 && uMirror.y > 0.0) { result += texture2D(uTex, p3); }
  gl_FragColor = result;
}`;



// Vertex Shader
const patternVert = `
precision mediump float;
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// texture
const forTexture = `
vec2 prepareForTexture(vec2 p) {
  if (uTextureId == 6.0) { // Koji pattern
    p *= mat2(0.5, -sqrt(3.0) * 0.5, 0.5, sqrt(3.0) * 0.5);
    p = fract(p * 4.0); // Moltiplica per 4
  } else if (uTextureId == 7.0) { // Asanoha pattern
    p.y = fract(p.y * 2.0 / sqrt(3.0)); // Modifica y
    p = fract(p); // fract
  } else {
    p = fract(p);
  }
  return p;
}
// Campionamento della texture
float getAmount(vec2 tex) {
  float offsetX = mod(uTextureId, 4.0) * 0.25;
  float offsetY = floor(uTextureId / 4.0) * 0.25;
  float delta = 1.0 / uTextureSize;
  // Per eliminare l'artificialità delle giunture.
  tex.x = clamp(tex.x, delta, 1.0 - delta);
  tex.y = clamp(tex.y, delta, 1.0 - delta);
  vec2 _tex = vec2(offsetX, offsetY) + tex * 0.25;
  float amt = texture2D(uTextureTable, _tex).r;
  return amt;
}`;
 
// Fragment Shader
const patternFrag = `
precision mediump float;
uniform vec2 uResolution;
uniform vec3 uMainColor;
uniform vec3 uBaseColor;
uniform float uTextureId;
uniform float uTextureSize;
uniform sampler2D uTextureTable;
uniform int uGradationId;
${forTexture}
float check(vec2 st) {
  vec2 f = vec2(floor(st.x / 25.0), floor(st.y / 25.0));
  return mod(f.x + f.y, 2.0);
}
void main() {
  vec2 st = gl_FragCoord.xy; 
  vec2 tex = st / uTextureSize; 
  tex.y = 1.0 - tex.y; // Invertiamo
  vec2 q = st / uResolution;
  vec3 col;
  tex = prepareForTexture(tex); 
  float amt = getAmount(tex);
  if (uGradationId == 0) { col = uMainColor; }
  col = (1.0 - amt) * col + amt * uBaseColor;
  gl_FragColor = vec4(col, 1.0);
}`;



// Shader relativo al bloom


// Shader di vertice di base
const baseVertexShader = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL; // sinistra 
varying vec2 vR; // destra
varying vec2 vT; // sopra
varying vec2 vB; // sotto
uniform vec2 uTexelSize;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexelSize.x, 0.0);
  vR = vUv + vec2(uTexelSize.x, 0.0);
  vT = vUv + vec2(0.0, uTexelSize.y);
  vB = vUv - vec2(0.0, uTexelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// simple vertex shader.
const simpleVertexShader = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Per il display
const displayShaderSource = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
// Vari flag
uniform bool uBloomFlag;
vec3 linearToGamma (vec3 color) { 
  color = max(color, vec3(0));
  return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
}
void main () {
  vec4 tex = texture2D(uTexture, vUv);
  vec3 c = tex.rgb;
  vec3 bloom;
  if (uBloomFlag) {
    bloom = texture2D(uBloom, vUv).rgb;
    bloom = linearToGamma(bloom);
    c += bloom;
  }
  gl_FragColor = vec4(c, tex.a);
}`;



const bloomPrefilterShader = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec3 uCurve;
uniform float uThreshold;
void main () {
  vec3 c = texture2D(uTexture, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uCurve.x, 0.0, uCurve.y);
  rq = uCurve.z * rq * rq;
  c *= max(rq, br - uThreshold) / max(br, 0.0001);
  gl_FragColor = vec4(c, 0.0);
}`;



const bloomBlurShader = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
void main () {
  vec4 sum = vec4(0.0);
  sum += texture2D(uTexture, vL);
  sum += texture2D(uTexture, vR);
  sum += texture2D(uTexture, vT);
  sum += texture2D(uTexture, vB);
  sum *= 0.25;
  gl_FragColor = sum;
}`;



const bloomFinalShader = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
uniform float uIntensity;
uniform vec3 uBloomColor;
void main () {
  vec4 sum = vec4(0.0);
  sum += texture2D(uTexture, vL);
  sum += texture2D(uTexture, vR);
  sum += texture2D(uTexture, vT);
  sum += texture2D(uTexture, vB);
  sum *= 0.25;
  gl_FragColor = sum * uIntensity * vec4(uBloomColor, 1.0);
}`;


function preload(){
  textureTableSource = loadImage("texture/textureTable.png");
}


// setup.

function setup(){
  // _gl rappresenta il contesto WebGL di p5, mentre gl è il contesto di rendering WebGL.
  createCanvas(windowWidth, windowHeight, WEBGL);
  //l'unico modo di far funzionare le estensioni sennò non me le supporta
	setAttributes('version', 1);
	_gl = this._renderer;
	
  currentWidth = windowWidth;
  currentHeight = windowHeight;
  pixelDensity(1); // Imposta la densità dei pixel per evitare problemi di alta risoluzione.
  gl = _gl.GL;
  

  _node = new RenderNode();
  // Controlla le estensioni 
  confirmExtensions();
	initFramebuffers();

  const positions = [-1, -1, -1, 1, 1, -1, 1, 1]; 

  let sh;
	
  sh = createShader(patternVert, patternFrag);
  _node.regist('pattern', sh, 'board')
       .registAttribute('aPosition', positions, 2);
	

  // dataShader: configurazione iniziale delle posizioni e delle velocità dei punti
  sh = createShader(dataVert, dataFrag);
  _node.regist('input', sh, 'board')
       .registAttribute('aPosition', positions, 2);
  
  // moveShader: aggiornamento delle posizioni e delle velocità dei punti
  sh = createShader(moveVert, moveFrag);
  _node.regist('move', sh, 'board')
       .registAttribute('aPosition', positions, 2)
       .registUniformLocation('uTex');

  // Array per memorizzare gli indici per il disegno dei punti

  let indices = [];
  for(let i = 0; i < TEX_SIZE * TEX_SIZE; i++){ indices.push(i); }
  
  // Shader per il disegno dei punti
  sh = createShader(pointVert, pointFrag);
  _node.regist('point', sh, 'display')
       .registAttribute('aIndex', indices, 1)
       .registUniformLocation('uTex');
  
  sh = createShader(copyVert, mirrorFrag);
  _node.regist('mirror', sh, 'board')
       .registAttribute('aPosition', positions, 2)
       .registUniformLocation('uTex');
	
  sh = createShader(simpleVertexShader, bloomPrefilterShader);
  _node.regist('bloomPrefilter', sh, 'simple')
       .registAttribute('aPosition', positions, 2)
       .registUniformLocation('uTexture');


  sh = createShader(baseVertexShader, bloomBlurShader);
  _node.regist('bloomBlur', sh, 'board')
       .registAttribute('aPosition', positions, 2)
       .registUniformLocation('uTexture');

 
  sh = createShader(baseVertexShader, bloomFinalShader);
  _node.regist('bloomFinal', sh, 'board')
       .registAttribute('aPosition', positions, 2)
       .registUniformLocation('uTexture');
	

  sh = createShader(baseVertexShader, displayShaderSource);
  _node.regist('display', sh, 'board')
       .registAttribute('aPosition', positions, 2)
       .registUniformLocation('uTexture')
       .registUniformLocation('uBloom')
  
  _node.registDoubleFBO('data', 11, TEX_SIZE, TEX_SIZE, gl.FLOAT, gl.NEAREST);

  _node.registFBO('particle', 13, width, height, gl.FLOAT, gl.NEAREST);

  dataInput();

  textureTable = new p5.Texture(_gl, textureTableSource);
	
}


// initFramebuffers.
function initFramebuffers(){
  const halfFloat = ext.textureHalfFloat.HALF_FLOAT_OES;
  const linearFilterParam = (ext.textureHalfFloatLinear ? gl.LINEAR : gl.NEAREST);

  gl.disable(gl.BLEND);
	
  _node.registDoubleFBO("dye", 0, width, height, halfFloat, linearFilterParam);

  initBloomFramebuffers();
  
}

function initBloomFramebuffers(){
  let res = getResolution(config.BLOOM_RESOLUTION);
  const halfFloat = ext.textureHalfFloat.HALF_FLOAT_OES;
  const linearFilterParam = (ext.textureHalfFloatLinear ? gl.LINEAR : gl.NEAREST);
  _node.registFBO('bloom_0', 2, res.frameWidth, res.frameHeight, halfFloat, linearFilterParam);
  for(let i = 1; i <= config.BLOOM_ITERATIONS; i++){
    let fw = (res.frameWidth >> i);
    let fh = (res.frameHeight >> i);
    _node.registFBO('bloom_' + i, 2 + i, fw, fh, halfFloat, linearFilterParam);
  }
}

// main loop.
 
function draw(){
  // Processo di ridimensionamento

  resizeCheck();
  
  //Regola i valori del mouse per adattarli all'intero schermo
  const _size = min(width, height);
  const mouse_x = (mouseX / width - 0.5) * 2.0 * width / _size;
  const mouse_y = (mouseY / height - 0.5) *2.0 * height / _size;
  const mouse_flag = mouseIsPressed;
  
  // Qui vengono aggiornate le posizioni e le velocità
  moveRendering(mouse_x, mouse_y, mouse_flag);

  _node.bindFBO(null);
  _node.setViewport(0, 0, width, height);

  clear();
  drawBackground();

	// Specifica del colore per il disegno dei punti

	let {r, g, b} = getProperColor(config.PARTICLE_COLOR);

	if(config.AUTO_COLOR){ // Variazione nel tempo
		const col = _HSV((properFrameCount%720)/720, 0.8, 1);
		r = col.r; g = col.g; b = col.b;
	}else{
		r /= 255; g /= 255; b /= 255;
	}

  _node.bindFBO('particle')
        .clearFBO();

  // Abilita il blend per il disegno dei punti
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);  

  // Disegno dei punti
  _node.use('point', 'display')
        .setAttribute()
        .setFBO('uTex', 'data')
        .setUniform("uTexSize", TEX_SIZE)
        .setUniform("uColor", [r, g, b])
        .setUniform("uPointScale", accell)
        .setUniform("uResolution", [width, height])
        .drawArrays(gl.POINTS)
        .clear();
  
  // Disabilita temporaneamente il blend
  gl.disable(gl.BLEND);

  _node.bindFBO('dye');
  _node.use('mirror', 'board')
        .setAttribute()
        .setFBO('uTex', 'particle')
        .setUniform("uMirror", [config.MIRROR_X, config.MIRROR_Y])
        .drawArrays(gl.TRIANGLE_STRIP)
        .swapFBO('dye')
        .clear();
  
  applyBloom();  
  drawDisplay(); 

  // Regolazione dell'accelerazione
  if(mouse_flag){ accell = 1.0; }else{ accell *= 0.95; }
  properFrameCount++;
}

function resizeCheck(){
  if(config.SIZETYPE == MANUAL_SIZE){
    currentWidth = config.WIDTH;
    currentHeight = config.HEIGHT;
  }else{
    currentWidth = windowWidth;
    currentHeight = windowHeight;
  }
  if(currentWidth == width && currentHeight == height){ return; }
  resizeCanvas(currentWidth, currentHeight);

  // Sovrascrivi e aggiorna particle e sfondo
  _node.registFBO('particle', 2, currentWidth, currentHeight, gl.FLOAT, gl.NEAREST);

  const halfFloat = ext.textureHalfFloat.HALF_FLOAT_OES;
  const linearFilterParam = (ext.textureHalfFloatLinear ? gl.LINEAR : gl.NEAREST);
  _node.registDoubleFBO("dye", 0, width, height, halfFloat, linearFilterParam);
}


// offscreen rendering.

// Imposta posizioni e velocità iniziali tramite rendering off-screen
function dataInput(){
  _node.bindFBO('data')  
       .setViewport(0, 0, TEX_SIZE, TEX_SIZE) 
       .clearFBO() 
       .use('input', 'board') 
       .setAttribute()
       .setUniform('uTexSize', TEX_SIZE)
       .drawArrays(gl.TRIANGLE_STRIP)
       .swapFBO('data') 
       .clear();
       
}

// Aggiorna la posizione e la velocità tramite rendering offscreen.
function moveRendering(mx, my, mFlag){
  _node.bindFBO('data') 
       .setViewport(0, 0, TEX_SIZE, TEX_SIZE) 
       .clearFBO()  
       .use('move', 'board') 
       .setAttribute()
       .setFBO('uTex', 'data')
       .setUniform("uTexSize", TEX_SIZE)
       .setUniform("uAccell", accell)
       .setUniform("uMouseFlag", mFlag)
       .setUniform("uMouse", [mx, my])
       .drawArrays(gl.TRIANGLE_STRIP)
       .swapFBO('data') 
       .clear();
       
}

// background.
function drawBackground(){
  const mainColor = getProperColor(config.MAIN_COLOR);
  const baseColor = getProperColor(config.BASE_COLOR);
  
  _node.use('pattern', 'board')
       .setAttribute()
       .setUniform('uResolution', [width, height])
       .setTexture('uTextureTable', textureTable.glTex, 0)
       .setUniform('uTextureId', config.BGPATTERN)
       .setUniform('uTextureSize', 256)
       .setUniform('uMainColor', [mainColor.r/255, mainColor.g/255, mainColor.b/255])
       .setUniform('uBaseColor', [baseColor.r/255, baseColor.g/255, baseColor.b/255])
       .setUniform('uGradationId', config.GRADATION)
       .drawArrays(gl.TRIANGLE_STRIP)
       .clear();
}

function drawCheckerBoard(){
  _node.use('pattern', 'board')
       .setAttribute()
       .setUniform('uResolution', [width, height])
       .setTexture('uTextureTable', textureTable.glTex, 0)
       .setUniform('uTextureId', 2)
       .setUniform('uTextureSize', 256)
       .setUniform('uMainColor', [0.8, 0.8, 0.8])
       .setUniform('uBaseColor', [0.9, 0.9, 0.9])
       .setUniform('uGradationId', 0)
       .drawArrays(gl.TRIANGLE_STRIP)
       .clear();
}


// applyBloom.
function applyBloom(){
  gl.disable(gl.BLEND);
  let res = getResolution(256);
  let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
  let curve0 = config.BLOOM_THRESHOLD - knee;
  let curve1 = knee * 2;
  let curve2 = 0.25 / knee;
  _node.bindFBO('bloom_0');
  _node.use('bloomPrefilter', 'simple')
       .setAttribute()
       .setFBO('uTexture', 'dye')
       .setUniform('uCurve', [curve0, curve1, curve2])
       .setUniform('uThreshold', config.BLOOM_THRESHOLD)
       .drawArrays(gl.TRIANGLE_STRIP)
       .clear(); 


  _node.use('bloomBlur', 'board')
       .setAttribute();

  for(let i = 1; i <= config.BLOOM_ITERATIONS; i++){
    // Configura da i-1 a i
    const w = (res.frameWidth >> (i-1));
    const h = (res.frameHeight >> (i-1));
    _node.bindFBO('bloom_' + i);
    _node.setUniform('uTexelSize', [1/w, 1/h])
         .setFBO('uTexture', 'bloom_' + (i-1))
         .drawArrays(gl.TRIANGLE_STRIP);
  }

  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.BLEND);

  for(let i = config.BLOOM_ITERATIONS; i >= 2; i--){
    const w = (res.frameWidth >> i);
    const h = (res.frameHeight >> i);
    _node.bindFBO('bloom_' + (i-1));
    _node.setUniform('uTexelSize', [1/w, 1/h])
         .setFBO('uTexture', 'bloom_' + i)
         .drawArrays(gl.TRIANGLE_STRIP);
  }

  _node.clear();
  gl.disable(gl.BLEND);

  const w1 = (res.frameWidth >> 1);
  const h1 = (res.frameHeight >> 1);
  const col = getProperColor(config.BLOOM_COLOR);
  _node.bindFBO('bloom_0');
  _node.use('bloomFinal', 'board')
       .setAttribute()
       .setFBO('uTexture', 'bloom_1')
       .setUniform('uTexelSize', [1/w1, 1/h1])
       .setUniform('uIntensity', config.BLOOM_INTENSITY)
       .setUniform('uBloomColor', [col.r/255, col.g/255, col.b/255])
       .drawArrays(gl.TRIANGLE_STRIP)
       .clear();
  
}


// drawDisplay.
function drawDisplay(){
	// Disegno sullo schermo
  _node.bindFBO(null);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  _node.use('display', 'board')
       .setAttribute()
       .setFBO('uTexture', 'dye')
       .setUniform('uBloomFlag', config.BLOOM)
       .setFBO('uBloom', 'bloom_0')
       .drawArrays(gl.TRIANGLE_STRIP)
       .clear();
  
  gl.disable(gl.BLEND);
}


// extension check.

function confirmExtensions(){
  ext.textureFloat = gl.getExtension('OES_texture_float');
  ext.textureHalfFloat = gl.getExtension('OES_texture_half_float');
  ext.textureHalfFloatLinear = gl.getExtension('OES_texture_half_float_linear');
  ext.elementIndexUint = gl.getExtension('OES_element_index_uint');
  if(ext.textureFloat == null || ext.textureHalfFloat == null){
    alert('float texture not supported');
  }
  if(ext.elementIndexUint == null){
    alert('Your web browser does not support the WebGL Extension OES_element_index_uint.');
  }
}





// Funzione per generare framebuffer
// Funzione per creare FBO
function create_fbo(name, texId, w, h, textureFormat, filterParam){
 
  if(!textureFormat){
    textureFormat = gl.UNSIGNED_BYTE;
  }
  if(!filterParam){
    filterParam = gl.NEAREST;
  }

  // Creazione del framebuffer
  let framebuffer = gl.createFramebuffer();

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  // Creazione e associazione del renderbuffer per il depth buffer
  let depthRenderBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);

  // Imposta il renderbuffer come depth buffer
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);

  // Associa il renderbuffer al framebuffer
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderBuffer);

  // Generazione della texture per il framebuffer
  let fTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + texId);

  // Associazione della texture per il framebuffer
  gl.bindTexture(gl.TEXTURE_2D, fTexture);

  // Allocazione di memoria per il colore nella texture per il framebuffer
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, textureFormat, null);

  // Parametri della texture
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterParam);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterParam);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Collegare la texture al framebuffer
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fTexture, 0);
  // Cancellare il contenuto 
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

  // Unbind di tutti gli oggetti necessari
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {f:framebuffer, d:depthRenderBuffer, t:fTexture, id:texId, name:name, frameWidth:w, frameHeight:h, texelSizeX:1/w, texelSizeY:1/h};
}

// Creare una coppia di FBO
function create_double_fbo(name, texId, w, h, textureFormat, filterParam){
  // Incrementa texId di 1 per una delle due parti
  let fbo1 = create_fbo(name, texId, w, h, textureFormat, filterParam);
  let fbo2 = create_fbo(name, texId + 1, w, h, textureFormat, filterParam);
  let doubleFbo = {};
  doubleFbo.read = fbo1;
  doubleFbo.write = fbo2;
  doubleFbo.swap = function(){
    let tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }
  doubleFbo.frameWidth = w;
  doubleFbo.frameHeight = h;
  doubleFbo.texelSizeX = 1/w;
  doubleFbo.texelSizeY = 1/h;
  doubleFbo.name = name; 
  return doubleFbo;
}

// Creazione del VBO
function create_vbo(data){
  // Generazione dell'oggetto buffer
  let vbo = gl.createBuffer();

  // Binding del buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  // Impostazione dei dati nel buffer
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

  // Disabilitazione del binding del buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Restituisci il VBO generato
  return vbo;
}


// Function to create IBO (Index Buffer Object)
function create_ibo(data, type){
  // Creazione dell'oggetto buffer
  var ibo = gl.createBuffer();

  // Effettuare il binding del buffer
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

  // Inserire i dati nel buffer
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new (type)(data), gl.STATIC_DRAW);

  // Annullare il binding del buffer
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  // Restituisci l'IBO generato e termina
  return ibo;
}


// Registra gli attributi
function set_attribute(attributes){
  // Itera sull'array ricevuto come argomento
  for(let name of Object.keys(attributes)){
    const attr = attributes[name];
    // Effettua il binding del buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, attr.vbo);

    // Abilita l'attributo attributeLocation
    gl.enableVertexAttribArray(attr.location);

    // Specifica e registra l'attributo attributeLocation
    gl.vertexAttribPointer(attr.location, attr.stride, gl.FLOAT, false, 0, 0);
  }
}



// Utility per il bloom.
function getResolution(resolution){
  let aspectRatio = width / height;
  if(aspectRatio < 1){ aspectRatio = 1.0 / aspectRatio; }
  let _min = Math.round(resolution);
  let _max = Math.round(resolution * aspectRatio);

  if(width > height){
    return {frameWidth: _max, frameHeight: _min};
  }
  return {frameWidth: _min, frameHeight: _max};
}


// Utility.
function _RGB(r, g, b){
  if(arguments.length === 1){
    g = r;
    b = r;
  }
  return {r:r, g:g, b:b};
}

function _HSV(h, s, v){
  h = constrain(h, 0, 1);
  s = constrain(s, 0, 1);
  v = constrain(v, 0, 1);
  let _r = constrain(abs(((6 * h) % 6) - 3) - 1, 0, 1);
  let _g = constrain(abs(((6 * h + 4) % 6) - 3) - 1, 0, 1);
  let _b = constrain(abs(((6 * h + 2) % 6) - 3) - 1, 0, 1);
  _r = _r * _r * (3 - 2 * _r);
  _g = _g * _g * (3 - 2 * _g);
  _b = _b * _b * (3 - 2 * _b);
  let result = {};
  result.r = v * (1 - s + s * _r);
  result.g = v * (1 - s + s * _g);
  result.b = v * (1 - s + s * _b);
  return result;
}


function getProperColor(col){
  if(typeof(col) == "object"){
    return {r:col.r, g:col.g, b:col.b};
  }else if(typeof(col) == "string"){
    col = color(col);
    return {r:red(col), g:green(col), b:blue(col)};
  }
  return {r:255, g:255, b:255};
}


// Classe RenderSystem.
// Imposta shader, program e topology, oltre alla posizione della texture.
// Topology si riferisce al gruppo di attributi.
class RenderSystem{
  constructor(name, _shader){
    this.name = name;
    this.shader = _shader;
    shader(_shader);
    this.program = _shader._glProgram;
    this.topologies = {};
    this.uniformLocations = {};
  }
  getName(){
    return this.name;
  }
  registTopology(topologyName){
    if(this.topologies[topologyName] !== undefined){ return; }
    this.topologies[topologyName] = new Topology(topologyName);
  }
  getProgram(){
    return this.program;
  }
  getShader(){
    return this.shader;
  }
  getTopology(topologyName){
    return this.topologies[topologyName];
  }
  registUniformLocation(uniformName){
    if(this.uniformLocations[uniformName] !== undefined){ return; }
    this.uniformLocations[uniformName] = gl.getUniformLocation(this.program, uniformName);
  }
  setTexture(uniformName, _texture, locationID){
    gl.activeTexture(gl.TEXTURE0 + locationID);
    gl.bindTexture(gl.TEXTURE_2D, _texture);
    gl.uniform1i(this.uniformLocations[uniformName], locationID);
  }
}

// Classe RenderNode
class RenderNode{
  constructor(){
    this.renderSystems = {};
    this.framebufferObjects = {}; 
    this.currentRenderSystem = undefined;
    this.currentShader = undefined;
    this.currentTopology = undefined;
    this.useTextureFlag = false;
    this.uMV = new p5.Matrix(); // Matrice 4x4 predefinita
  }
  registRenderSystem(renderSystemName, _shader){
    if(this.renderSystems[renderSystemName] !== undefined){ return this; }
    this.renderSystems[renderSystemName] = new RenderSystem(renderSystemName, _shader);
    // l'immagine che viene automaticamente utilizzata al momento della registrazione
    this.useRenderSystem(renderSystemName);
    return this;
  }
  useRenderSystem(renderSystemName){
    this.currentRenderSystem = this.renderSystems[renderSystemName];
    this.currentShader = this.currentRenderSystem.getShader();
    this.currentShader.useProgram();
    return this;
  }
  registTopology(topologyName){
    this.currentRenderSystem.registTopology(topologyName);
    this.useTopology(topologyName);
    return this;
  }
  useTopology(topologyName){
    this.currentTopology = this.currentRenderSystem.getTopology(topologyName);
    return this;
  }
  regist(renderSystemName, _shader, topologyName){
    this.registRenderSystem(renderSystemName, _shader);
    this.registTopology(topologyName);
    return this;
  }
  use(renderSystemName, topologyName){
    this.useRenderSystem(renderSystemName);
    this.useTopology(topologyName);
    return this;
  }
  existFBO(target){
    // Funzione per verificare se esiste. Se il target è un fbo, controlla utilizzando il nome che possiede.
    if(typeof(target) == 'string'){
      return this.framebufferObjects[target] !== undefined;
    }
    return this.framebufferObjects[target.name] !== undefined;
  }
  registFBO(target, texId, w, h, textureFormat, filterParam){
  // Imposta l'fbo (crea uno nuovo e sovrascrive se ha lo stesso nome)
  // Se il target è una stringa, crea un fbo.
  // Se il target è già un fbo, lo imposta direttamente.

    if(typeof(target) == 'string'){
      let fbo = create_fbo(target, texId, w, h, textureFormat, filterParam);
      this.framebufferObjects[target] = fbo;
      return this;
    }
    // Se il target è un fbo, utilizza il nome che dovrebbe avere il target. Inseriscilo direttamente.
    this.framebufferObjects[target.name] = target;
    return this;
  }
  registDoubleFBO(targetName, texId, w, h, textureFormat, filterParam){
    // Imposta doubleFBO (crea uno nuovo e sovrascrive se ha lo stesso nome)
    let fbo = create_double_fbo(targetName, texId, w, h, textureFormat, filterParam);
    this.framebufferObjects[targetName] = fbo;
    return this;
  }
  resizeFBO(targetName, texId, w, h, textureFormat, filterParam){
    let fbo = this.framebufferObjects[targetName];
    this.framebufferObjects[targetName] = resize_fbo(fbo, texId, w, h, textureFormat, filterParam);
  }
  resizeDoubleFBO(targetName, texId, w, h, textureFormat, filterParam){
    let fbo = this.framebufferObjects[targetName];
    this.framebufferObjects[targetName] = resize_double_fbo(fbo, texId, w, h, textureFormat, filterParam);
  }
  bindFBO(target){
    if(typeof(target) == 'string'){
      let fbo = this.framebufferObjects[target];
      if(!fbo){ return this; }
      if(fbo.write){
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.write.f);
        gl.viewport(0, 0, fbo.frameWidth, fbo.frameHeight);
        return this;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.f);
      gl.viewport(0, 0, fbo.frameWidth, fbo.frameHeight);
      return this;
    }
    if(target == null){
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height); // nel caso di null, si applica globalmente
      return this;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.f);
    gl.viewport(0, 0, target.frameWidth, target.frameHeight);
    return this;
  }
  clearFBO(){
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    return this; 
  }
  setFBO(uniformName, FBOName){
    // Imposta l'FBO tramite il nome. Per il doppio, imposta il read.
    if(FBOName === undefined || (typeof FBOName !== 'string')){
      alert("Inappropriate name setting.");
      noLoop();
      return this;
    }
    let fbo = this.framebufferObjects[FBOName];
    if(!fbo){
      alert("The corresponding framebuffer does not exist.");
      noLoop();
      return this;
    }
    if(!!fbo.read){
      this.setTexture(uniformName, fbo.read.t, fbo.read.id);
      return this;
    }
    this.setTexture(uniformName, fbo.t, fbo.id);
    return this;
  }
  swapFBO(FBOName){
    if(FBOName == null){ return this; }
    let fbo = this.framebufferObjects[FBOName];
    if(fbo.read && fbo.write){ fbo.swap(); }
    return this;
  }
  registAttribute(attributeName, data, stride){
    this.currentTopology.registAttribute(this.currentRenderSystem.getProgram(), attributeName, data, stride);
    return this;
  }
  registAttributes(attrData){
    for(let attrName of Object.keys(attrData)){
      const attr = attrData[attrName];
      this.registAttribute(attrName, attr.data, attr.stride);
    }
    return this;
  }
  setAttribute(){
    this.currentTopology.setAttribute();
    return this;
  }
  registIndexBuffer(data){
    let type = Uint16Array;
    if(data.length > 65535){ type = Uint32Array; }
    this.currentTopology.registIndexBuffer(data, type);
    return this;
  }
  bindIndexBuffer(){
    this.currentTopology.bindIndexBuffer();
    return this;
  }
  registUniformLocation(uniformName){
    this.currentRenderSystem.registUniformLocation(uniformName);
    return this;
  }
  setTexture(uniformName, _texture, locationID){
    this.currentRenderSystem.setTexture(uniformName, _texture, locationID);
    this.useTextureFlag = true; // true se è stato usato almeno una volta
    return this;
  }
  setUniform(uniformName, data){
    this.currentShader.setUniform(uniformName, data);
    return this;
  }
  clear(){
    this.currentTopology.clear();
    if(this.useTextureFlag){
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.useTextureFlag = false;
    }
    return this;
  }
  setViewport(x, y, w, h){
    gl.viewport(x, y, w, h);
    return this;
  }
  setMatrixStandard(){
    const sh = this.currentShader;
    sh.setUniform('uProjectionMatrix', _gl.uPMatrix.mat4);
    sh.setUniform('uModelViewMatrix', this.uMV.mat4);
    sh.setUniform('uViewMatrix', _gl._curCamera.cameraMatrix.mat4);
    _gl.uNMatrix.inverseTranspose(this.uMV);
    sh.setUniform('uNormalMatrix', _gl.uNMatrix.mat3);
  }
  setMatrix(tf){

    for(let i = 0; i < 16; i++){
      this.uMV.mat4[i] = _gl.uMVMatrix.mat4[i];
    }
    if(tf !== undefined){
      this.transform(tf); // tf è un array. tr, rotX, rotY, rotZ, scale
    }
    this.setMatrixStandard();
    return this;
  }
  transform(tf){
    for(let command of tf){
      const name = Object.keys(command)[0];
      const value = command[name];
      switch(name){
        case "tr":
          if(value.length === 1){ value.push(value[0], value[0]); }
          this.uMV.translate(value);
          break;
        // rotX a rotZ sono tutti valori scalari
        case "rotX":
          this.uMV.rotateX(value); break;
        case "rotY":
          this.uMV.rotateY(value); break;
        case "rotZ":
          this.uMV.rotateZ(value); break;
        case "rotAxis":
          this.uMV.rotate(...value); break;
        case "scale":
          // Se la lunghezza è 1, impostare tutti gli elementi con lo stesso valore.
          if(value.length === 1){ value.push(value[0], value[0]); }
          this.uMV.scale(...value); break;
      }
    }
  }
  setVertexColor(){
    const sh = this.currentShader;
    sh.setUniform('uUseColorFlag', 0);
    return this;
  }
  setMonoColor(col, a = 1){
    const sh = this.currentShader;
    sh.setUniform('uUseColorFlag', 1);
    sh.setUniform('uMonoColor', [col.r, col.g, col.b, a]);
    return this;
  }
  setUVColor(){
    const sh = this.currentShader;
    sh.setUniform("uUseColorFlag", 2);
    return this;
  }
  setDirectionalLight(col, x, y, z){
    const sh = this.currentShader;
    sh.setUniform('uUseDirectionalLight', true);
    sh.setUniform('uDirectionalDiffuseColor', [col.r, col.g, col.b]);
    sh.setUniform('uLightingDirection', [x, y, z]);
    return this;
  }
  setAmbientLight(col){
    const sh = this.currentShader;
    sh.setUniform('uAmbientColor', [col.r, col.g, col.b]);
    return this;
  }
  setPointLight(col, x, y, z, att0 = 1, att1 = 0, att2 = 0){

    const sh = this.currentShader;
    sh.setUniform('uUsePointLight', true);
    sh.setUniform('uPointLightDiffuseColor', [col.r, col.g, col.b]);
    sh.setUniform('uPointLightLocation', [x, y, z]);
    sh.setUniform('uAttenuation', [att0, att1, att2]);
    return this;
  }
  drawArrays(mode, first, count){
    if(arguments.length == 1){
      first = 0;
      count = this.currentTopology.getAttrSize();
    }
    gl.drawArrays(mode, first, count);
    return this;
  }
  drawElements(mode, count){
    const _type = this.currentTopology.getIBOType();
    const type = (_type === Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT);
    if(count === undefined){ count = this.currentTopology.getIBOSize(); }
    gl.drawElements(mode, count, type, 0);
    return this;
  }
  flush(){
    gl.flush();
    return this;
  }
}


// Topology class.
class Topology{
  constructor(name){
    this.name = name;
    this.attributes = {}; 
    this.attrSize = 0;
    this.ibo = undefined;
    this.iboType = undefined;
    this.iboSize = 0;
  }
  getName(){
    return this.name;
  }
  getAttrSize(){
    return this.attrSize;
  }
  getIBOType(){
    return this.iboType;
  }
  getIBOSize(){
    return this.iboSize;
  }
  registAttribute(program, attributeName, data, stride){
    let attr = {};
    attr.vbo = create_vbo(data);
    attr.location = gl.getAttribLocation(program, attributeName);
    attr.stride = stride;
    this.attrSize = Math.floor(data.length / stride); 
    this.attributes[attributeName] = attr;
  }
  setAttribute(){
    set_attribute(this.attributes);
  }
  registIndexBuffer(data, type){
    this.ibo = create_ibo(data, type);
    this.iboType = type;
    this.iboSize = data.length; 
  }
  bindIndexBuffer(){
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
  }
  clear(){
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if(this.ibo !== undefined){ gl.bindBuffer(gl.ELEMENT_BUFFER, null); }
    return this;
  }
}

// keyAction.
// Reset with the R key
function keyTyped(){
  if(keyCode == 82){ dataInput(); }
}

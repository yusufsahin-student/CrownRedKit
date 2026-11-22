import { mountModuleLibrary } from "./module-library.js";
import { missions, missionById } from "./missions.js";
import { SurfaceArt, paintKitArtwork } from "./surface-art.js";
import { compileSketch, SketchRuntime } from "./execution.js";
import { hardware, allPins, HARDWARE_NOTICE } from "./hardware.js";
import { parseProgram, checkConnections, computeFrame, runMissionTests } from "./simulator.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = "canopy-biocore-v1";
const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
const state = {
  missionId: Number(saved.missionId || 1),
  completed: new Set(saved.completed || []),
  notes: saved.notes || "",
  motionReduced: Boolean(saved.motionReduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  connections: saved.connections || {},
  code: saved.code || {},
  env: { light: 62, temperature: 24, distance: 80 },
  running: false,
  runtime: null,
  speed: 1,
  traceKey: '',
  wireAnimations: new Map(),
  startTime: performance.now(),
  hint: 0,
  view3d: true,
  serial: [],
  chart: [],
  pendingPin: null,
  showLabels: true,
  showCallouts: true,
  multimeter: false,
  sim: { led: false, fan: false, count: 0, wasInside: false, tankLevel: 20, wired: false }
};

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ missionId: state.missionId, completed: [...state.completed], notes: state.notes, motionReduced: state.motionReduced, connections: state.connections, code: state.code }));
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function currentMission() { return missionById(state.missionId); }
function currentConnections() { return state.connections[state.missionId] || []; }
function currentCode() { return state.code[state.missionId] ?? currentMission().starter; }

function setView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}View`));
  $$('[data-nav]').forEach((button) => button.classList.toggle("active", button.dataset.nav === name));
  if (name === "missions") renderMissions();
  if (name === "lab") loadMission();
  if (name === "kit") renderHardware();
  if (name === "journal") renderJournal();
  window.scrollTo({ top: 0, behavior: state.motionReduced ? "auto" : "smooth" });
}

function renderProgress() {
  const count = state.completed.size;
  const percent = count * 10;
  $("#progressPill").textContent = `${count} / 10`;
  $("#continueBar").style.width = `${percent}%`;
  $("#missionRing").style.background = `conic-gradient(var(--leaf) ${percent}%, rgba(16,42,34,.08) ${percent}%)`;
  $("#missionRing strong").textContent = `${percent}%`;
  $("#completedCount").textContent = `${count} / 10`;
  $("#journalBar").style.width = `${percent}%`;
  $("#continueTitle").textContent = currentMission().title;
}

function renderMissions() {
  $("#missionGrid").innerHTML = missions.map((m) => `
    <article class="mission-card ${state.completed.has(m.id) ? "completed" : ""}">
      <span class="number">${String(m.id).padStart(2, "0")}</span>
      <span class="tag">${state.completed.has(m.id) ? "✓ Tamamlandı" : m.difficulty}</span>
      <h3>${m.title}</h3><p>${m.story}</p>
      <div class="chips">${m.components.map((c) => `<span>${c}</span>`).join("")}</div>
      <footer><small>${m.minutes} dk · ${m.skill.split(",")[0]}</small><button data-open-mission="${m.id}">${state.completed.has(m.id) ? "Yeniden Aç" : "Görevi Aç"}</button></footer>
    </article>`).join("");
  $$('[data-open-mission]').forEach((button) => button.addEventListener("click", () => { state.missionId = Number(button.dataset.openMission); persist(); setView("lab"); }));
  renderProgress();
}

function loadMission() {
  const m = currentMission();
  state.hint = 0;
  state.pendingPin = null;
  state.running = false;
  state.runtime = null;
  $("#executionCode").replaceChildren();$("#variableWatch").replaceChildren();
  $("#executionStatus").textContent="Devreni bağla, ardından Çalıştır veya Adım seç.";
  $("#executionClock").textContent="0 ms";
  state.sim = { led: false, fan: false, count: 0, wasInside: false, tankLevel: 20, wired: false };
  $("#labTitle").textContent = m.title;
  $("#missionStory").textContent = m.story;
  $("#missionDifficulty").textContent = m.difficulty;
  $("#missionMinutes").textContent = `${m.minutes} dakika`;
  $("#missionSkill").textContent = m.skill;
  $("#componentChips").innerHTML = m.components.map((c) => `<span>${c}</span>`).join("");
  $("#connectionGuide").innerHTML = m.connections.map(([a, b]) => `<li><b>${a}</b> ile <b>${b}</b> uçlarını bağla.</li>`).join("");
  $("#hintText").textContent = m.hints[0];
  $("#hintLevel").textContent = "1/3";
  $("#modelHint").innerHTML = `<i style="background:#2f82b7"></i>Model üzerindeki iki uca tıklayarak bağla`;
  $("#codeEditor").value = currentCode();
  updateLineNumbers();
  renderWires();
  updateEnvironment();
  showCodeTab("editor");
  renderProgress();
  document.dispatchEvent(new Event('canopy-mission'));
}

function renderWires() {
  const wires=currentConnections(),result=checkConnections(currentMission(),wires);
  state.sim.wired=result.ok;
  if(!result.ok){state.running=false;state.sim.led=false;state.sim.fan=false;updateOutputs();}
  const list=$("#wireList");list.replaceChildren();
  wires.forEach(([a,b],index)=>{const button=document.createElement('button');button.className='wire'+(result.unexpected.some(pair=>pair.includes(a)&&pair.includes(b))?' invalid':'');button.textContent=`${a} — ${b} · Sök`;button.setAttribute('aria-label',`${a} ile ${b} arasındaki kabloyu sök`);button.addEventListener('click',()=>{currentConnections().splice(index,1);state.pendingPin=null;persist();renderWires();});list.append(button);});
  if(!wires.length)list.textContent='Henüz kablo yok. Modelde iki ucu seç veya aşağıdaki listeleri kullan.';
  const label=$("#connectionStatus");label.className=`status ${result.ok?'ok':'warn'}`;
  label.textContent=result.shortCircuit?'Kısa devre: 5V ile GND bağlı':result.unexpected.length?`${result.unexpected.length} görev dışı / hatalı bağlantı`:result.ok?'Devre hazır':`${result.missing.length} bağlantı eksik`;
  $$('#connectionGuide li').forEach((row,i)=>{const pair=currentMission().connections[i],done=wires.some(w=>w.includes(pair[0])&&w.includes(pair[1]));row.classList.toggle('done',done);row.classList.toggle('next',!done&&result.missing[0]===pair);});
  updateMultimeter();
}

function updateMultimeter() {
  const value=$("#multimeterValue"),hint=$("#multimeterHint");if(!value||!hint)return;
  const result=checkConnections(currentMission(),currentConnections());
  value.textContent=result.shortCircuit?'KISA DEVRE':'5.00 V';
  hint.textContent=result.shortCircuit?'Besleme–toprak yolunu sök.':'5V / GND · ideal kaynak modeli';
}

function addWire() {
  const a = $("#pinA").value, b = $("#pinB").value;
  if (a === b) return toast("İki farklı uç seçmelisin.");
  const list = currentConnections();
  if (list.some((wire) => wire.includes(a) && wire.includes(b))) return toast("Bu bağlantı zaten var.");
  list.push([a, b]); state.connections[state.missionId] = list; persist(); renderWires();
}

function handleModelPin(pin) {
  if (!allPins.includes(pin)) return;
  if (!state.pendingPin) {
    state.pendingPin = pin;
    $("#pinA").value = pin;
    $("#modelHint").innerHTML = `<i></i>${pin} seçildi · ikinci ucu seç`;
    toast(`${pin} seçildi. Şimdi bağlanacak ikinci uca tıkla.`);
    return;
  }
  if (state.pendingPin === pin) {
    state.pendingPin = null;
    $("#modelHint").innerHTML = `<i></i>Model üzerindeki iki uca tıklayarak bağla`;
    toast("Uç seçimi iptal edildi.");
    return;
  }
  $("#pinA").value = state.pendingPin;
  $("#pinB").value = pin;
  addWire();
  state.pendingPin = null;
  $("#modelHint").innerHTML = `<i></i>Model üzerindeki iki uca tıklayarak bağla`;
}

function updateLineNumbers() {
  const lines = $("#codeEditor").value.split("\n").length;
  $("#lineNumbers").textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
}

function showCodeTab(name) {
  $$('[data-code-tab]').forEach((b) => b.classList.toggle("active", b.dataset.codeTab === name));
  ["editor", "serial", "tests"].forEach((tab) => $(`#${tab}Pane`).classList.toggle("active", tab === name));
}

function compile() {
  const code = $("#codeEditor").value;
  state.code[state.missionId] = code; persist();
  const program = parseProgram(code);
  const sketch=compileSketch(code);
  if(!sketch.ok){toast(sketch.error);return sketch;}
  if (!program.ok) { toast(program.error); state.serial.push(`[HATA] ${program.error}`); renderSerial(); }
  return program;
}

function checkCircuit(showToast = true) {
  const result = checkConnections(currentMission(), currentConnections());
  if(result.shortCircuit||result.unexpected.length){if(showToast)toast(result.shortCircuit?'5V ile GND arasında kısa devre var.':'Görev dışı bağlantıları söküp rehberdeki uçları kullan.');renderWires();return false;}
  if (showToast) toast(result.ok ? "Devre doğrulandı; tüm gerekli sanal bağlantılar hazır." : `Eksik: ${result.missing.map((x) => x.join("—")).join(", ")}`);
  renderWires(); return result.ok;
}

function prepareRuntime() {
  const code=$("#codeEditor").value;
  state.code[state.missionId]=code;persist();
  if(state.runtime?.program.source===code)return true;
  const program=compileSketch(code);
  if(!program.ok){toast(program.error);$("#executionStatus").textContent=program.error;return false;}
  state.runtime=new SketchRuntime(program);state.traceKey='';
  state.signalHistory=[];
  const trace=$("#executionCode");trace.replaceChildren();
  code.split("\n").forEach((line,i)=>{const row=document.createElement('div');row.dataset.line=i+1;const number=document.createElement('span');number.textContent=i+1;const text=document.createElement('code');text.textContent=line||' ';row.append(number,text);trace.append(row);});
  return true;
}
function run() {
  if(!checkCircuit(false)||!prepareRuntime()){if(!state.sim.wired)toast("Önce devrenin eksik veya hatalı bağlantılarını düzelt.");return;}
  state.running=true;loop.lastTick=performance.now();loop.accumulator=0;
  $("#executionStatus").textContent="Çalışıyor";
}
function stop() {
  state.running=false;$("#executionStatus").textContent="Duraklatıldı";
}
function publishExecution(event) {
  if(state.lastRenderedEvent===event){$("#executionClock").textContent=`${Math.round(state.runtime.time)} ms · ${Math.round(state.runtime.wait)} ms bekleme`;return;}
  state.lastRenderedEvent=event;
  state.sim=state.runtime.frame(state.sim,checkConnections(currentMission(),currentConnections()).ok);
  updateOutputs();
  $("#executionStatus").textContent=event.detail;
  state.signalHistory.push({time:state.runtime.time,high:state.sim.led});state.signalHistory=state.signalHistory.slice(-160);drawSignalTrace();
  $("#executionClock").textContent=`${Math.round(state.runtime.time)} ms · döngü ${state.runtime.cycles}`;
  $("#flowReadout").textContent=`LED ${state.sim.led?'HIGH':'LOW'} · Fan ${state.sim.fan?'AÇIK':'KAPALI'}`;
  $$('[data-flow]').forEach(node=>node.classList.toggle('active',node.dataset.flow===(event.kind==='output'?'output':event.kind==='wait'?'wait':event.kind==='serial'?'serial':'compute')));
  const active=$(`[data-line="${event.line}"]`,$("#executionCode"));
  $$('#executionCode .executing').forEach(row=>row.classList.remove('executing'));
  if(active){active.classList.add('executing');const panel=$("#executionCode");if(active.offsetTop<panel.scrollTop||active.offsetTop+active.offsetHeight>panel.scrollTop+panel.clientHeight)panel.scrollTop=active.offsetTop-panel.clientHeight/2;}
  $("#variableWatch").replaceChildren();
  Object.entries(state.runtime.vars).forEach(([name,value])=>{const chip=document.createElement('span');chip.textContent=`${name}: ${value}`;$("#variableWatch").append(chip);});
  if(state.runtime.events.length){state.serial.push(...state.runtime.events.splice(0).map(value=>`[${Math.round(state.runtime.time)} ms] ${value}`));state.serial=state.serial.slice(-120);renderSerial();}
}
function stepSimulation() {
  stop();if(!checkCircuit(false)){toast("Adım için devre bağlantılarını tamamla.");return;}
  if(!prepareRuntime())return;
  try{publishExecution(state.runtime.step(state.env));}catch(error){$("#executionStatus").textContent=error.message;toast(error.message);state.runtime=null;}
}
function drawSignalTrace(){
  const canvas=$("#signalTrace"),ctx=canvas.getContext('2d'),w=canvas.clientWidth||400,h=100,dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const samples=state.signalHistory||[];if(!samples.length)return;
  const first=samples[0].time,last=Math.max(first+1,samples.at(-1).time);
  ctx.font='12px Consolas, monospace';ctx.fillStyle='#afc8ba';ctx.fillText('HIGH',4,22);ctx.fillText('LOW',4,69);
  ctx.strokeStyle='#3a5145';for(const y of [18,65]){ctx.beginPath();ctx.moveTo(46,y);ctx.lineTo(w-10,y);ctx.stroke();}
  const x=time=>46+(time-first)/(last-first)*Math.max(1,w-60),y=high=>high?18:65;
  ctx.strokeStyle='#c4eb94';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(first),y(samples[0].high));
  for(let i=1;i<samples.length;i++){ctx.lineTo(x(samples[i].time),y(samples[i-1].high));ctx.lineTo(x(samples[i].time),y(samples[i].high));}ctx.stroke();
  ctx.fillText(`${Math.round(first)} ms`,46,92);ctx.textAlign='right';ctx.fillText(`${Math.round(last)} ms`,w-10,92);
}
function updateOutputs() {
  $("#ledState").textContent = state.sim.led ? "AÇIK" : "KAPALI";
  $("#ledState").style.color = state.sim.led ? "#bde881" : "#a7aaa8";
  $("#fanState").textContent = state.sim.fan ? "AÇIK" : "KAPALI";
  $("#countState").textContent = state.sim.count;
}

function renderSerial() { $("#serialPane").textContent = state.serial.slice(-60).join("\n") || "Seri monitör hazır. Simülasyonu çalıştır veya adım at."; }

function testMission() {
  const program = compile();
  const wired = checkConnections(currentMission(), currentConnections()).ok;
  const results = runMissionTests(currentMission(), program, wired);
  $("#testsPane").innerHTML = results.map((r) => `<div class="test-row ${r.pass ? "pass" : "fail"}"><b>${r.pass ? "✓" : "×"}</b><strong>${r.name}</strong><span>${r.detail}</span></div>`).join("");
  showCodeTab("tests");
  if (results.length && results.every((r) => r.pass)) {
    state.completed.add(state.missionId); persist(); renderProgress(); toast("Görev doğrulandı ve günlüğüne kaydedildi!");
  } else toast("Bazı testler henüz geçmedi. Ayrıntıları incele.");
}

function updateEnvironment() {
  state.env.light = Number($("#lightRange").value);
  state.env.temperature = Number($("#tempRange").value);
  state.env.distance = Number($("#distanceRange").value);
  $("#lightOutput").textContent = `${state.env.light}%`;
  $("#tempOutput").textContent = `${state.env.temperature.toFixed(1)} °C`;
  $("#distanceOutput").textContent = `${state.env.distance} cm`;
  $("#heroLight").textContent = `${state.env.light}%`;
  $("#heroTemp").textContent = `${state.env.temperature.toFixed(1)} °C`;
  state.chart.push({ ...state.env }); if (state.chart.length > 45) state.chart.shift();
  drawChart();
  updateMultimeter();
}

function drawChart() {
  const canvas = $("#chartCanvas"), ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#f9f7ef"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(16,42,34,.08)"; ctx.lineWidth = 1;
  for (let y = 25; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const series = [{ key: "light", color: "#8daa66", max: 100 }, { key: "temperature", color: "#d94b43", max: 50 }, { key: "distance", color: "#4b7990", max: 150 }];
  for (const s of series) { ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath(); state.chart.forEach((p, i) => { const x = (i / 44) * w, y = h - (p[s.key] / s.max) * h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
}

function renderHardware() {
  $("#hardwareNotice").textContent = HARDWARE_NOTICE;
  const items = [hardware.board, ...hardware.components];
  $("#hardwareList").innerHTML = items.map((item) => `<article class="hardware-item"><h3>${item.name}</h3><span class="verify-tag">${item.status}</span><p><b>Ne işe yarar?</b> ${item.description || item.purpose}</p>${item.nature ? `<p><b>Doğada nerede?</b> ${item.nature}</p>` : ""}<footer><small>${item.pins.join(" · ")}</small><button data-hardware="${item.id}">Modelde göster</button></footer></article>`).join("");
  $$('[data-hardware]').forEach((b) => b.addEventListener("click", () => selectHardware(b.dataset.hardware)));
}

function selectHardware(id) {
  const item = id === hardware.board.id ? hardware.board : hardware.components.find((x) => x.id === id);
  $("#selectedComponent").textContent = item.name;
  $("#selectedDescription").textContent = item.description || item.purpose;
  toast(`${item.name} modelde vurgulandı.`);
  renderers.forEach((r) => r.selected = id);
}

function renderJournal() {
  $("#journalNotes").value = state.notes;
  const completed = missions.filter((m) => state.completed.has(m.id));
  $("#skillList").innerHTML = completed.length ? [...new Set(completed.flatMap((m) => m.skill.split(", ")))].map((s) => `<span>${s}</span>`).join("") : "<span>İlk görevi tamamlayınca becerilerin burada görünecek.</span>";
  const badges = [{ n: 1, icon: "✦", text: "İlk Işık" }, { n: 3, icon: "☾", text: "Gece Kaşifi" }, { n: 7, icon: "⌁", text: "Veri İzci" }, { n: 10, icon: "❋", text: "BioCore Araştırmacısı" }];
  $("#badgeList").innerHTML = badges.map((b) => `<div class="badge ${state.completed.size < b.n ? "locked" : ""}"><i>${b.icon}</i>${b.text}</div>`).join("");
  $("#journalMissions").innerHTML = missions.map((m) => `<div class="journal-row"><span>${String(m.id).padStart(2, "0")} · ${m.title}</span><b>${state.completed.has(m.id) ? "Tamamlandı" : "Bekliyor"}</b></div>`).join("");
  renderProgress();
}

class DetailedKitRenderer {
  constructor(canvas, scale = 1) {
    this.canvas=canvas;this.scale=scale;this.rx=-.95;this.ry=-.12;this.zoom=7.5;this.drag=null;this.pointerStart=null;this.selected="";
    this.pinPoints={D2:[1.765,.42,-1.25],D3:[1.67,.42,-1.25],D5:[1.48,.42,-1.25],D6:[1.385,.42,-1.25],D9:[.86,.42,-1.25],A0:[1.35,.42,-.11],A1:[1.445,.42,-.11],A2:[1.54,.42,-.11],"5V":[.86,.42,-.11],GND:[.955,.42,-.11],"LED+":[-2.15,.32,-.66],"LED-":[-2.15,.32,-.565],"L-SIG":[-.94,.32,-1.2],"L-VCC":[-.845,.32,-1.2],"L-GND":[-.6,.32,-1.2],"T-SIG":[-1.92,.32,-1.2],"T-VCC":[-1.825,.32,-1.2],"T-GND":[-1.73,.32,-1.2],TRIG:[-2.105,.32,2.95],ECHO:[-2.01,.32,2.95],"D-VCC":[-2.2,.32,2.95],"D-GND":[-1.915,.32,2.95],"M-IN":[-.24,.32,.22],"M-VCC":[-.24,.32,-.66],"M-GND":[-.24,.32,-.22],"M-OUT":[-.24,.32,.315],"M+":[-.85,.15,2.6],"M-":[-.85,.15,2.8]};
    this.gl=canvas.getContext("webgl",{antialias:true,alpha:true,depth:true,stencil:false,premultipliedAlpha:false,powerPreference:"high-performance"});if(!this.gl)return;try{this.init();this.bind()}catch(error){console.error("RED Kit 3B görüntüleyici başlatılamadı",error);this.gl=null}
  }
  init(){
    const gl=this.gl,vs=`attribute vec3 p;attribute vec3 n;uniform mat4 m;uniform mat3 r;uniform vec2 projectionScale;varying vec3 normal;varying vec3 viewPos;varying vec3 grainPos;void main(){normal=r*n;grainPos=p;vec4 clip=m*vec4(p,1.0);viewPos=vec3(clip.x*projectionScale.x,clip.y*projectionScale.y,-clip.w);gl_Position=clip;}`,fs=`precision highp float;
 uniform vec4 c;uniform float shine;uniform float finish;varying vec3 normal;varying vec3 viewPos;varying vec3 grainPos;
 void main(){
 vec3 N=normalize(normal),V=normalize(-viewPos),L=normalize(vec3(-.45,.8,1.2)),L2=normalize(vec3(.7,.2,.4));
 float ndl=max(dot(N,L),0.0),fill=max(dot(N,L2),0.0),nv=max(dot(N,V),0.0);
 vec3 R=reflect(-V,N);float fresnel=pow(1.0-nv,5.0);
 float box1=pow(max(dot(R,normalize(vec3(-.4,.75,1.0))),0.0),mix(18.0,80.0,shine));
 float box2=pow(max(dot(R,normalize(vec3(.9,.25,.65))),0.0),mix(14.0,110.0,shine));
 float strip=exp(-pow((R.x+.12)*15.0,2.0))*smoothstep(-.15,.8,R.y);
 float micro=sin(grainPos.x*210.0+grainPos.z*13.0)*.008*shine;
 vec3 environment=mix(vec3(.07,.13,.14),vec3(.7,.83,.88),smoothstep(-.4,.9,R.y));
 vec3 base=c.rgb*(.32+.63*ndl+.16*fill);
 vec3 reflection=environment*(.12+.55*fresnel)+vec3(box1*.8+box2*.5+strip*.2);
 vec3 lit=mix(base,base*.55+reflection,finish*.65)+vec3(box1*.36+box2*.2)*shine+micro;
 lit+=vec3(.48,.66,.57)*fresnel*.12;
 gl_FragColor=vec4(pow(max(lit,vec3(0.0)),vec3(.92)),c.a);
 }`;

    const shader=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x)||"Shader derlenemedi");return x},program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"Shader programı bağlanamadı");this.program=program;
    this.locP=gl.getAttribLocation(program,"p");this.locN=gl.getAttribLocation(program,"n");this.locM=gl.getUniformLocation(program,"m");this.locR=gl.getUniformLocation(program,"r");this.locC=gl.getUniformLocation(program,"c");this.locShine=gl.getUniformLocation(program,"shine");this.locFinish=gl.getUniformLocation(program,"finish");this.locProjectionScale=gl.getUniformLocation(program,"projectionScale");
    const tri=(o,a,b,c,n)=>[a,b,c].forEach(v=>o.push(...v,...n)),triN=(o,a,b,c)=>[a,b,c].forEach(v=>o.push(...v,...v)),cube=[],faces=[[[ -1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1]],[[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],[ 1,-1,-1]],[[-1, 1,-1],[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1]],[[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1]],[[ 1,-1,-1],[ 1, 1,-1],[ 1, 1, 1],[ 1,-1, 1]],[[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1]]],norms=[[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0]];
    faces.forEach((f,i)=>{tri(cube,f[0],f[1],f[2],norms[i]);tri(cube,f[0],f[2],f[3],norms[i])});
    const cyl=[],segments=24;for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,p1=[Math.cos(a),-1,Math.sin(a)],p2=[Math.cos(b),-1,Math.sin(b)],p3=[Math.cos(b),1,Math.sin(b)],p4=[Math.cos(a),1,Math.sin(a)],sn=[Math.cos((a+b)/2),0,Math.sin((a+b)/2)];tri(cyl,p1,p3,p2,sn);tri(cyl,p1,p4,p3,sn);tri(cyl,[0,1,0],p3,p4,[0,1,0]);tri(cyl,[0,-1,0],p1,p2,[0,-1,0])}
    const sphere=[],lat=14,lon=24;for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){const a0=y/lat*Math.PI-Math.PI/2,a1=(y+1)/lat*Math.PI-Math.PI/2,b0=x/lon*Math.PI*2,b1=(x+1)/lon*Math.PI*2,v=(a,b)=>[Math.cos(a)*Math.cos(b),Math.sin(a),Math.cos(a)*Math.sin(b)],v00=v(a0,b0),v10=v(a0,b1),v11=v(a1,b1),v01=v(a1,b0);triN(sphere,v00,v11,v10);triN(sphere,v00,v01,v11)}
    this.meshes={cube:this.mesh(cube),cylinder:this.mesh(cyl),sphere:this.mesh(sphere)};
    const bevel=[],steps=[0,.06,.94,1];
    const rounded=v=>{const core=v.map(a=>Math.max(-.88,Math.min(.88,a))),d=v.map((a,i)=>a-core[i]),len=Math.hypot(...d),n=d.map(a=>a/len);return [...core.map((a,i)=>a+n[i]*.12),...n];};
    for(const face of faces){const sample=(u,v)=>rounded(face[0].map((a,i)=>a+(face[1][i]-a)*u+(face[3][i]-a)*v));for(let i=0;i<3;i++)for(let j=0;j<3;j++){const a=sample(steps[i],steps[j]),b=sample(steps[i+1],steps[j]),c=sample(steps[i+1],steps[j+1]),d=sample(steps[i],steps[j+1]);bevel.push(...a,...b,...c,...a,...c,...d);}}
    this.meshes.bevel=this.mesh(bevel);
    this.art=new SurfaceArt(gl);paintKitArtwork(this.art);
  }
  mesh(data){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return{buffer:b,count:data.length/6}}
  bind(){
    const c=this.canvas,wrap=a=>((a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
    c.addEventListener("pointerdown",e=>{this.drag=[e.clientX,e.clientY];this.pointerStart=[e.clientX,e.clientY];c.style.cursor="grabbing";c.setPointerCapture(e.pointerId)});
    c.addEventListener("pointermove",e=>{if(!this.drag){this.updateHover(e);return;}this.clearHover();this.ry=wrap(this.ry+(e.clientX-this.drag[0])*.008);this.rx=wrap(this.rx+(e.clientY-this.drag[1])*.008);this.drag=[e.clientX,e.clientY]});
    c.addEventListener("pointerup",e=>{const start=this.pointerStart,moved=start?Math.hypot(e.clientX-start[0],e.clientY-start[1]):99;this.drag=null;this.pointerStart=null;c.style.cursor="grab";if(moved<7&&c.id==="labCanvas")this.hitPin(e)});
    c.addEventListener("pointerleave",()=>this.clearHover());
    c.addEventListener("keydown",e=>{if(e.key==="Escape")this.clearHover();});
    c.addEventListener("pointercancel",()=>{this.drag=null;this.pointerStart=null;c.style.cursor="grab"});c.style.cursor="grab";
    c.addEventListener("wheel",e=>{e.preventDefault();this.zoom=Math.max(this.focus?1.8:4.2,Math.min(10,this.zoom+e.deltaY*.004))},{passive:false})
  }
  group(id,draw){this.currentGroup=id;draw();this.currentGroup='';}
  hoverRegions(){return [
    {id:'uno',title:'Arduino UNO · kontrol merkezi',text:'Kare SMD işlemci, USB bağlantısı ve giriş/çıkış pinleri.',x:1.45,z:-.68,y:.56,sx:1.05,sz:.68},
    {id:'breadboard',title:'Boş breadboard',text:'170 bağlantı noktası. Deneyini kendi kablolarınla kur.',x:-1.18,z:-.34,y:.36,sx:.82,sz:.57},
    {id:'led',title:'LED dizisi',text:'Altı renkli LED ve RGB gösterge. Kodun çıkışını ışıkla izle.',x:-2.45,z:-.08,y:.5,sx:.16,sz:1.23},
    {id:'controls',title:'Butonlar, anahtar ve pot',text:'Dört buton, açma/kapama anahtarı ve döner potansiyometre.',x:-1.2,z:1.2,y:.5,sx:1.45,sz:.4},
    {id:'lcd',title:'LCD ekran',text:'Metal çerçeve, cam yüzey ve nokta matrisli gösterim alanı.',x:1.65,z:.87,y:.34,sx:.65,sz:.63},
    {id:'ports',title:'Renkli bağlantı soketleri',text:'Sensörleri bağlamak için gruplanmış bağlantı alanı.',x:-1.15,z:-1.2,y:.32,sx:.85,sz:.12}
  ];}
  pickRegion(x,y){if(this.onlyAccessory||Math.sin(this.rx)>=-.04)return null;return this.hoverRegions().find(r=>{const polygon=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>this.project([r.x+a*r.sx,r.y,r.z+b*r.sz]));let inside=false;for(let i=0,j=3;i<4;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;})||null;}
  clearHover(){this.hovered='';if(this.hoverTip)this.hoverTip.hidden=true;}
  updateHover(event){const rect=this.canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,r=this.pickRegion(x,y);if(!r){this.clearHover();return;}this.hovered=r.id;
    if(!this.hoverTip){const el=document.createElement('div');el.className='model-hover-tip';el.setAttribute('role','tooltip');el.append(document.createElement('strong'),document.createElement('span'));this.canvas.parentElement.append(el);this.hoverTip=el;}
    this.hoverTip.firstChild.textContent=r.title;this.hoverTip.lastChild.textContent=r.text;this.hoverTip.hidden=false;const parent=this.canvas.parentElement.getBoundingClientRect();this.hoverTip.style.left=Math.max(8,Math.min(event.clientX-parent.left+16,parent.width-280))+'px';this.hoverTip.style.top=Math.max(8,Math.min(event.clientY-parent.top+20,parent.height-115))+'px';
  }
  mul(A,B){const O=new Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)O[c*4+r]+=A[k*4+r]*B[c*4+k];return O}
  scene(){const a=this.rx,b=this.ry,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),aspect=Math.max(.2,this.canvas.width/this.canvas.height),f=1/Math.tan(.48),near=.1,far=40,rx=[1,0,0,0,0,ca,-sa,0,0,sa,ca,0,0,0,0,1],ry=[cb,0,-sb,0,0,1,0,0,sb,0,cb,0,0,0,0,1],view=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,-this.zoom,1],proj=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,(2*far*near)/(near-far),0];return this.mul(proj,this.mul(view,this.mul(rx,this.mul(ry,[1,0,0,0,0,1,0,0,0,0,1,0,-(this.focus?.[0]||0)*this.scale,-(this.focus?.[1]||0)*this.scale,-(this.focus?.[2]||0)*this.scale,1]))))}
  matrix(x,y,z,sx,sy,sz){const t=[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],s=[sx,0,0,0,0,sy,0,0,0,0,sz,0,0,0,0,1];return new Float32Array(this.mul(this.scene(),this.mul(t,s)))}
  rotation(){const a=this.rx,b=this.ry,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);return new Float32Array([cb,-sa*sb,-ca*sb,0,ca,-sa,sb,sa*cb,ca*cb])}
  part(mesh,x,y,z,sx,sy,sz,color,id=""){if(this.captureBounds&&mesh==="cube"&&sx*sy*sz>.00008)this.solidBounds.push([x-sx,y-sy,z-sz,x+sx,y+sy,z+sz]);const gl=this.gl,obj=this.meshes[mesh==='cube'&&sx>.1&&sy>.02&&sz>.1?'bevel':mesh],boost=(id&&this.selected===id?.12:0)+(this.hovered&&this.hovered===this.currentGroup?(state.motionReduced?.065:.065+Math.sin((this.time||0)/220)*.025):0),neutral=Math.abs(color[0]-color[1])+Math.abs(color[1]-color[2])<.12,metal=/usb|silver|lcd-frame/.test(id)||(neutral&&color[0]>.45&&color[0]<.84),gloss=id==='led'||(this.currentGroup==='led')||this.currentGroup==='controls';gl.bindBuffer(gl.ARRAY_BUFFER,obj.buffer);gl.enableVertexAttribArray(this.locP);gl.vertexAttribPointer(this.locP,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(this.locN);gl.vertexAttribPointer(this.locN,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(this.locM,false,this.matrix(x*this.scale,y*this.scale,z*this.scale,sx*this.scale,sy*this.scale,sz*this.scale));const normal=this.rotation();for(let i=0;i<9;i++)normal[i]/=[sx,sy,sz][Math.floor(i/3)];gl.uniformMatrix3fv(this.locR,false,normal);gl.uniform4fv(this.locC,[Math.min(1,color[0]+boost),Math.min(1,color[1]+boost),Math.min(1,color[2]+boost),1]);gl.uniform1f(this.locShine,metal?.92:gloss?.7:.22);gl.uniform1f(this.locFinish,metal?1:gloss?.26:.04);gl.drawArrays(gl.TRIANGLES,0,obj.count)}
  box(...a){this.part("cube",...a)} cylinder(...a){this.part("cylinder",...a)} sphere(...a){this.part("sphere",...a)}
  cableBetween(a,b,radius,color){
    const ax=a[0]*this.scale,ay=a[1]*this.scale,az=a[2]*this.scale,bx=b[0]*this.scale,by=b[1]*this.scale,bz=b[2]*this.scale,dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dy,dz);if(!len)return;
    const ux=dx/len,uy=dy/len,uz=dz/len,ref=Math.abs(uy)>.92?[1,0,0]:[0,1,0],rx=ref[1]*uz-ref[2]*uy,ry=ref[2]*ux-ref[0]*uz,rz=ref[0]*uy-ref[1]*ux,rl=Math.hypot(rx,ry,rz),nx=rx/rl,ny=ry/rl,nz=rz/rl,zx=uy*nz-uz*ny,zy=uz*nx-ux*nz,zz=ux*ny-uy*nx,s=radius*this.scale;
    const model=[nx*s,ny*s,nz*s,0,ux*len/2,uy*len/2,uz*len/2,0,zx*s,zy*s,zz*s,0,(ax+bx)/2,(ay+by)/2,(az+bz)/2,1],obj=this.meshes.cylinder,gl=this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER,obj.buffer);gl.enableVertexAttribArray(this.locP);gl.vertexAttribPointer(this.locP,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(this.locN);gl.vertexAttribPointer(this.locN,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(this.locM,false,new Float32Array(this.mul(this.scene(),model)));gl.uniformMatrix3fv(this.locR,false,this.rotation());gl.uniform4fv(this.locC,[...color,1]);gl.uniform1f(this.locShine,.48);gl.uniform1f(this.locFinish,.3);gl.drawArrays(gl.TRIANGLES,0,obj.count);
  }
  project(point){const m=this.scene(),x=point[0]*this.scale,y=point[1]*this.scale,z=point[2]*this.scale,cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],cw=m[3]*x+m[7]*y+m[11]*z+m[15],rect=this.canvas.getBoundingClientRect();return[(cx/cw*.5+.5)*rect.width,(-cy/cw*.5+.5)*rect.height]}
  hitPin(event){if(Math.sin(this.rx)>=-.04)return toast("Bağlantı uçları kartın üst yüzündedir; modeli üstten çevir.");const rect=this.canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let best=null,bestDistance=26;for(const [pin,point] of Object.entries(this.pinPoints)){if(!this.pointVisible(point))continue;const p=this.project(point),d=Math.hypot(x-p[0],y-p[1]);if(d<bestDistance){bestDistance=d;best=pin}}if(best)handleModelPin(best);else toast("Bir bağlantı ucuna daha yakın tıkla.")}
  drawConnections(){
    const colors=[[.85,.16,.12],[.15,.48,.82],[.92,.66,.08],[.2,.65,.36],[.6,.3,.8]];
    const now=performance.now(),live=new Set();
    currentConnections().forEach(([a,b],index)=>{
      const start=this.pinPoints[a],end=this.pinPoints[b];if(!start||!end)return;
      const key=[a,b].sort().join('::');live.add(key);if(!state.wireAnimations.has(key))state.wireAnimations.set(key,now);
      const reveal=state.motionReduced?1:Math.min(1,(now-state.wireAnimations.get(key))/450);
      const color=a==='GND'||b==='GND'?[.18,.2,.23]:a==='5V'||b==='5V'?[.86,.12,.1]:colors[index%colors.length];
      const height=Math.max(start[1],end[1],.8)+.35+(index%4)*.11;
      const point=t=>{const u=1-t;return[u*u*u*start[0]+3*u*u*t*start[0]+3*u*t*t*end[0]+t*t*t*end[0],u*u*u*start[1]+3*u*u*t*height+3*u*t*t*height+t*t*t*end[1],u*u*u*start[2]+3*u*u*t*start[2]+3*u*t*t*end[2]+t*t*t*end[2]];};
      for(let i=1;i<=36;i++){const t=Math.min(i/36,reveal),previous=Math.min((i-1)/36,reveal);if(t<=previous)break;this.cableBetween(point(previous),point(t),.024,color);}
      for(const p of [start,end]){this.box(p[0],p[1]+.055,p[2],.04,.06,.04,[.08,.09,.1]);this.cylinder(p[0],p[1]-.025,p[2],.012,.025,.012,[.8,.64,.24]);}
      const active=state.running&&state.sim.wired&&((a==='LED+'||b==='LED+')&&state.sim.led||(a==='M-IN'||b==='M-IN')&&state.sim.fan);
      if(active&&!state.motionReduced&&reveal===1){const p=point((now%1400)/1400);this.sphere(...p,.045,.045,.045,[.9,1,.45]);}
    });
    for(const key of state.wireAnimations.keys())if(!live.has(key))state.wireAnimations.delete(key);
    for(const [pin,p] of Object.entries(this.pinPoints)){
      if(!currentMission().connections.some(pair=>pair.includes(pin)))continue;
      const active=state.pendingPin===pin;this.cylinder(p[0],p[1],p[2],active?.055:.025,.014,active?.055:.025,active?[.1,.7,1]:[.8,.61,.2]);
    }
  }
  updatePinLabels(){
    const overlay=$("#pinOverlay");if(!overlay)return;const topVisible=Math.sin(this.rx)<-.04;overlay.hidden=!state.showLabels||!topVisible;if(!state.showLabels||!topVisible)return;const pins=[...new Set(currentMission().connections.flat())],signature=`${state.missionId}:${pins.join("|")}`;
    if(overlay.dataset.signature!==signature){overlay.dataset.signature=signature;overlay.innerHTML=pins.map(pin=>`<span class="pin-label" data-pin-label="${pin}">${pin}</span>`).join("")}
    $$('[data-pin-label]',overlay).forEach(label=>{const point=this.pinPoints[label.dataset.pinLabel];if(!point)return;label.hidden=!this.pointVisible(point);const [x,y]=this.project(point);label.style.left=`${x}px`;label.style.top=`${y}px`;label.classList.toggle("selected",state.pendingPin===label.dataset.pinLabel)});
  }
  pointVisible(point){
    if(Math.sin(this.rx)>=-.04)return false;
    const distance=this.zoom/this.scale,focus=this.focus||[0,0,0];
    const eye=[focus[0]-Math.sin(this.ry)*Math.cos(this.rx)*distance,focus[1]-Math.sin(this.rx)*distance,focus[2]+Math.cos(this.ry)*Math.cos(this.rx)*distance];
    const direction=point.map((v,i)=>v-eye[i]),length=Math.hypot(...direction);
    for(const box of this.solidBounds||[]){
      let near=0,far=1;
      for(let axis=0;axis<3;axis++){
        if(Math.abs(direction[axis])<1e-9){if(eye[axis]<box[axis]||eye[axis]>box[axis+3]){near=2;break;}continue;}
        const a=(box[axis]-eye[axis])/direction[axis],b=(box[axis+3]-eye[axis])/direction[axis];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
      }
      if(near<=far&&near<1-.09/length&&far>0)return false;
    }
    const [x,y]=this.project(point),rect=this.canvas.getBoundingClientRect();return x>=0&&x<=rect.width&&y>=0&&y<=rect.height;
  }
  updateCallouts(){
    const layer=$("#modelCallouts"),svg=$("#calloutLeaders");if(!layer||!svg)return;const topVisible=Math.sin(this.rx)<-.04;layer.hidden=!state.showCallouts||!topVisible;if(!state.showCallouts||!topVisible)return;
    const targets={digital:[1.48,.43,-1.25],usb:[2.49,.54,-.49],controller:[1.17,.35,-.68],power:[.86,.43,-.11]},wrap=this.canvas.getBoundingClientRect();
    svg.setAttribute("viewBox",`0 0 ${wrap.width} ${wrap.height}`);
    Object.entries(targets).forEach(([name,point])=>{const card=$(`[data-callout="${name}"]`,layer),line=$(`[data-callout-line="${name}"]`,svg),dot=$(`[data-callout-dot="${name}"]`,svg);if(!card||!line||!dot)return;const visible=this.pointVisible(point);card.hidden=!visible;line.style.display=dot.style.display=visible?"":"none";if(!visible)return;const rect=card.getBoundingClientRect(),[x,y]=this.project(point),cx=rect.left-wrap.left+rect.width/2,cy=rect.top-wrap.top+rect.height/2;line.setAttribute("x1",cx);line.setAttribute("y1",cy);line.setAttribute("x2",x);line.setAttribute("y2",y);dot.setAttribute("cx",x);dot.setAttribute("cy",y)});
  }
  plate(y,h,color){
    // Outline traced from the overhead reference: shallow shoulder above breadboard.
    if(!this.meshes.plate){const outline=[[-2.72,-1.29],[-2.66,-1.36],[-.8,-1.36],[-.61,-1.59],[-.5,-1.64],[2.64,-1.64],[2.72,-1.56],[2.72,1.55],[2.65,1.63],[-2.65,1.63],[-2.72,1.55]],data=[];
      const tri=(a,b,c,n)=>[a,b,c].forEach(v=>data.push(...v,...n));
      outline.forEach((v,i)=>{const w=outline[(i+1)%outline.length],a=[...v],dx=w[0]-v[0],dz=w[1]-v[1],len=Math.hypot(dx,dz);tri([0,1,0],[w[0],1,w[1]],[v[0],1,v[1]],[0,1,0]);tri([0,-1,0],[v[0],-1,v[1]],[w[0],-1,w[1]],[0,-1,0]);const n=[dz/len,0,-dx/len];tri([v[0],-1,v[1]],[v[0],1,v[1]],[w[0],1,w[1]],n);tri([v[0],-1,v[1]],[w[0],1,w[1]],[w[0],-1,w[1]],n);});this.meshes.plate=this.mesh(data);}
    this.part('plate',0,y,0,1,h,1,color);
  }
  screw(x,y,z,p){this.cylinder(x,y,z,.042,.018,.042,p.dark);this.box(x,y+.02,z,.025,.003,.005,p.metal);}
  header(x,z,n,color,p,axis='x',y=.24){for(let i=0;i<n;i++){const px=x+(axis==='x'?i*.095:0),pz=z+(axis==='z'?i*.095:0);this.box(px,y,pz,.047,.065,.047,color);this.box(px,y+.067,pz,.028,.002,.028,p.hole);this.box(px-.02,y+.069,pz,.003,.002,.023,p.gold);}}
  drawKitBase(p){this.plate(-.08,.055,p.red);this.plate(.09,.015,p.silk);this.plate(.11,.015,p.panel);for(const [x,z]of[[-2.55,-1.18],[2.52,-1.45],[-2.55,1.43],[2.52,1.43]]){this.cylinder(x,-.01,z,.075,.07,.075,p.dark);this.screw(x,.145,z,p);} }
  drawLedBank(p){const colors=[p.yellow,p.blue,p.red,p.red,p.red,p.red];colors.forEach((col,i)=>{const z=-1.1+i*.31;for(const dx of[-.034,.034])this.box(-2.45+dx,.21,z,.009,.075,.009,p.metal);this.cylinder(-2.45,.24,z,.115,.025,.115,col);this.cylinder(-2.45,.33,z,.095,.075,.095,col,'led');this.sphere(-2.45,.405,z,.095,.085,.095,i===0&&(state.sim.led||this.demoLed)?p.glow:col,'led');});this.cylinder(-2.45,.29,.96,.115,.1,.115,p.silk,'led');this.sphere(-2.45,.4,.96,.115,.11,.115,p.silk,'led');}
  drawBreadboard(p){const cx=-1.18,cz=-.34;this.box(cx,.23,cz,.82,.075,.57,p.red);for(const side of[-1,1])this.box(cx,.33,cz+side*.29,.82,.025,.26,[.95,.16,.12]);this.box(cx,.326,cz,.8,.02,.022,[.38,.035,.025]);for(let row=0;row<10;row++)for(let col=0;col<17;col++){const x=cx-.735+col*.091,z=cz+(row<5?-.47+row*.084:.14+(row-5)*.084);this.box(x,.357,z,.023,.002,.025,[.35,.055,.035]);this.box(x-.024,.358,z,.004,.003,.025,[1,.31,.22]);}for(const x of[-1.87,-.49])this.cylinder(x,.355,cz,.045,.004,.045,[.4,.06,.035]);}

  socket(x,y,z,r,p){this.box(x,y,z,r,.008,r,p.hole);for(const dx of[-r,r])this.box(x+dx,y+.005,z,.004,.009,r,p.socket);}
  drawUno(p){const cx=1.45,cz=-.68;this.box(cx,.25,cz,1.05,.018,.68,p.uno,'uno');this.box(cx,.273,cz,1.025,.004,.65,p.uno);for(const x of[.48,2.3])for(const z of[-1.24,-.12]){this.cylinder(x,.19,z,.04,.05,.04,p.dark);this.screw(x,.29,z,p);}
    this.header(.48,-1.25,8,p.socket,p,'x',.35);this.header(1.29,-1.25,6,p.socket,p,'x',.35);this.header(.48,-.11,8,p.socket,p,'x',.35);this.header(1.35,-.11,6,p.socket,p,'x',.35);
    // Photographed UNO uses a square surface-mounted controller, not a DIP chip.
    this.box(1.17,.31,-.68,.16,.027,.16,p.chip,'controller');for(let i=0;i<8;i++){const d=-.132+i*.038;for(const sign of[-1,1]){this.box(1.17+d,.3,-.68+sign*.182,.009,.008,.028,p.metal);this.box(1.17+sign*.182,.3,-.68+d,.028,.008,.009,p.metal);}}
    this.box(2.49,.405,-.49,.2,.13,.19,p.metal,'usb');this.box(2.697,.405,-.49,.003,.095,.15,p.hole);this.box(2.701,.39,-.49,.005,.035,.1,p.silk);for(let i=0;i<4;i++)this.box(2.708,.43,-.57+i*.05,.006,.008,.01,p.gold);
    this.box(2.34,.36,-1.13,.17,.09,.13,p.dark,'power');this.cableBetween([2.35,.38,-1.13],[2.62,.38,-1.13],.09,p.dark);this.cableBetween([2.62,.38,-1.13],[2.625,.38,-1.13],.055,p.metal);this.cableBetween([2.625,.38,-1.13],[2.63,.38,-1.13],.038,p.hole);
    for(const x of[1.89,2.07]){this.cylinder(x,.35,-1.02,.065,.075,.065,p.metal,'silver');this.box(x,.428,-1.02,.04,.002,.004,p.dark);}
    for(const [x,z]of[[1.23,-.98],[2.06,-.46]]){this.box(x,.3,z,.12,.025,.045,p.metal,'silver');this.sphere(x,.326,z,.11,.009,.04,p.metal);}
    this.box(2.31,.3,-.17,.065,.018,.065,p.metal);this.cylinder(2.31,.335,-.17,.033,.016,.033,[.9,.28,.12]);
    for(const [x,z]of[[1.84,-.66],[1.9,-.32],[.64,-.82]]){this.box(x,.3,z,.09,.02,.045,p.chip);for(let i=0;i<6;i++)for(const sign of[-1,1])this.box(x-.075+i*.03,.29,z+sign*.058,.008,.008,.016,p.metal);}
    for(let i=0;i<38;i++){const x=.55+(i%10)*.167,z=-1.07+Math.floor(i/10)*.24;if(x>1&&x<1.4&&z>-.9)continue;this.box(x,.29,z,.025,.009,.014,i%3?p.resistor:p.chip);for(const d of[-.029,.029])this.box(x+d,.29,z,.006,.01,.016,p.metal);}
    for(let i=0;i<6;i++){this.box(.55+(i%3)*.09,.35,-.42+Math.floor(i/3)*.09,.017,.07,.017,p.gold);}
  }
  drawControlDeck(p){const buttons=[[-2.4,1.4,p.red],[-1.86,1.4,p.blue],[-1.32,1.4,p.red],[-1.86,.96,p.yellow]];buttons.forEach(([x,z,col])=>{this.box(x,.2,z,.15,.06,.15,p.dark);for(const dx of[-.135,.135])for(const dz of[-.135,.135])this.cylinder(x+dx,.27,z+dz,.018,.008,.018,p.metal);this.cylinder(x,.31,z,.14,.065,.14,col);this.sphere(x,.38,z,.14,.035,.14,col);});this.cylinder(-.65,.27,1.35,.19,.13,.19,p.dark);this.cylinder(-.65,.411,1.35,.155,.017,.155,p.red);this.box(-.65,.433,1.29,.009,.003,.038,p.silk);this.cylinder(-.65,.433,1.4,.028,.003,.028,p.silk);this.cylinder(-.65,.437,1.4,.018,.003,.018,p.red);
    this.cylinder(.03,.22,1.35,.19,.07,.19,p.metal);this.cylinder(.03,.44,1.35,.145,.17,.145,p.dark);for(let i=0;i<36;i++){const a=i*Math.PI/18;this.cylinder(.03+Math.cos(a)*.145,.44,1.35+Math.sin(a)*.145,.007,.165,.007,[.21,.22,.21]);}this.cylinder(.03,.619,1.35,.125,.008,.125,p.dark);this.cylinder(.03,.63,1.35,.075,.005,.075,p.red);const a=this.knob||0;this.box(.03+Math.sin(a)*.06,.64,1.35-Math.cos(a)*.06,.012,.003,.045,p.silk);
    this.cylinder(.13,.21,.58,.05,.07,.05,[.08,.4,.12]);this.sphere(.13,.28,.58,.05,.055,.05,[.18,.65,.25]);}
  drawDisplay(p){const x=1.65,z=.87;this.box(x,.23,z,.65,.025,.63,p.uno,'lcd');this.box(x,.285,z,.57,.03,.51,p.metal,'lcd-frame');this.box(x,.32,z,.5,.008,.43,[.43,.48,.18],'lcd');for(const dx of[-.56,.56])for(const dz of[-.53,.53]){this.cylinder(x+dx,.26,z+dz,.046,.01,.046,p.metal);this.cylinder(x+dx,.273,z+dz,.028,.003,.028,p.hole);}for(let i=0;i<8;i++)this.cylinder(1.29+i*.09,.275,1.46,.014,.012,.014,p.gold);}
  drawModules(p){this.cylinder(.12,.23,-1.13,.16,.1,.16,p.dark);this.cylinder(.12,.334,-1.13,.035,.004,.035,p.hole);
    this.header(-1.92,-1.2,3,p.green,p);this.header(-1.46,-1.2,4,p.yellow,p);this.header(-.94,-1.2,2,p.red,p);this.header(-.6,-1.2,3,p.green,p);
    for(let i=0;i<5;i++)this.header(-1.95+i*.37,-.97,2,p.red,p);
    this.header(-2.15,-.66,6,p.blue,p,'z');this.header(-2.15,.1,3,p.green,p,'z');this.header(-.24,-.66,2,p.red,p,'z');this.header(-.24,-.22,2,p.red,p,'z');this.header(-.24,.22,2,p.red,p,'z');
    this.header(-1.94,.38,4,p.yellow,p);this.header(-1.46,.38,2,p.red,p);this.header(-1.12,.38,2,p.red,p);this.header(-.74,.38,6,p.blue,p);
  }
  hasAccessory(id){return Boolean(this.accessories||this.moduleIds?.has(id));}
  ring(x,y,z,r,color){for(let i=0;i<32;i++){const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;this.cableBetween([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],.004,color);}}
  drawAccessories(p){
    const z=2.7,t=state.motionReduced?0:(this.time||0)/1000,active=id=>(this.moduleEvents?.[id]||0)>(this.time||0),v=this.moduleValues||{};
    if(this.hasAccessory('distance')){this.box(-2.05,.15,z,.48,.025,.22,p.uno,'distance');for(const x of[-2.3,-1.8]){this.cylinder(x,.29,z,.185,.11,.185,p.metal,'distance');this.cylinder(x,.405,z,.15,.003,.15,p.hole);for(let row=-5;row<=5;row++)for(let col=-5;col<=5;col++)if(row*row+col*col<25)this.cylinder(x+row*.026,.41,z+col*.026,.006,.002,.006,p.metal);this.ring(x,.415,z,.165,p.silk);}this.header(-2.2,2.95,4,p.socket,p);for(const x of[-2.47,-1.63])this.screw(x,.18,z-.16,p);const distance=v.distance??80;this.box(-2.05,.12,z+.7+distance/180,.16,.12,.025,p.green);for(let j=0;j<3;j++){const r=.17+((t*.35+j*.13)%.4);this.ring(-2.05,.18,z+.4,r,[.25,.65,.63]);}}
    if(this.hasAccessory('servo')){this.box(-.85,.2,z,.23,.18,.14,[.055,.15,.51],'motor');this.box(-.85,.4,z,.15,.035,.12,p.blue);for(const x of[-1.12,-.58]){this.box(x,.3,z,.055,.025,.14,p.blue);this.cylinder(x,.329,z,.022,.003,.022,p.hole);}this.cylinder(-.92,.46,z,.045,.035,.045,p.silk);const target=((v.servo??90)-90)*Math.PI/180;this.servoAngle=state.motionReduced?target:(this.servoAngle??0)+(target-(this.servoAngle??0))*.09;const a=this.servoAngle;this.cableBetween([-.92-Math.cos(a)*.15,.51,z-Math.sin(a)*.15],[-.92+Math.cos(a)*.15,.51,z+Math.sin(a)*.15],.03,p.silk);this.screw(-.92,.55,z,p);for(let i=0;i<12;i++){const a=i/12*Math.PI,b=(i+1)/12*Math.PI;for(const [off,col]of[[0,p.red],[.025,p.gold],[-.025,p.dark]])this.cableBetween([-.65+Math.sin(a)*.23,.16,z-.2-i*.015+off],[-.65+Math.sin(b)*.23,.16,z-.2-(i+1)*.015+off],.009,col);}}
    if(this.hasAccessory('pir')){this.box(.15,.13,z,.28,.02,.28,p.green);this.cylinder(.15,.23,z,.23,.08,.23,p.silk);this.sphere(.15,.29,z,.23,.16,.23,p.silk);for(let ring=1;ring<4;ring++){const a=ring*Math.PI/8,r=.23*Math.cos(a),y=.29+.16*Math.sin(a);this.ring(.15,y+.002,z,r,[.7,.74,.7]);for(let i=0;i<12;i++){const b=i/12*Math.PI*2;this.sphere(.15+Math.cos(b)*r,y,z+Math.sin(b)*r,.017,.008,.017,[.96,.97,.92]);}}for(const x of[-.08,.38])this.screw(x,.16,z+.22,p);this.header(.04,3.02,3,p.socket,p);this.sphere(.36,.18,z-.22,.025,.018,.025,active('pir')?p.glow:p.red);if(active('pir'))this.ring(.15,.16,z,.33+(t*.2%.15),p.green);}
    if(this.hasAccessory('rfid')){this.box(1.15,.13,z,.35,.02,.48,p.uno);for(let i=0;i<6;i++)this.ring(1.15,.154,z,.12+i*.035,p.silk);this.box(1.15,.17,z-.36,.08,.018,.055,p.chip);for(let i=0;i<8;i++)this.box(.88+i*.075,.15,z+.58,.012,.012,.09,p.metal);for(const x of[.85,1.45])for(const zz of[z-.41,z+.41]){this.cylinder(x,.158,zz,.028,.006,.028,p.metal);this.cylinder(x,.167,zz,.017,.002,.017,p.hole);}if(active('rfid')){const y=.35+(state.motionReduced?0:Math.sin(t*3)*.04);this.box(1.15,y,z,.24,.009,.34,p.silk);this.ring(1.15,.17,z,.36,p.green);}}
    if(this.accessories){this.box(2.15,.18,z,.22,.04,.57,p.dark);for(let row=0;row<7;row++)for(let col=0;col<3;col++)this.cylinder(2.0+col*.15,.23,z-.43+row*.14,.05,.01,.05,row<2?p.blue:p.silk);}
    if(this.hasAccessory('ir')){const x=-2,z=-2.35;this.box(x,.14,z,.16,.02,.25,p.dark);this.box(x,.22,z-.02,.09,.06,.06,p.metal);this.sphere(x,.24,z+.04,.065,.055,.025,p.dark);for(let i=0;i<3;i++)this.box(x-.09+i*.09,.14,z+.35,.012,.012,.11,p.metal);this.cylinder(x+.1,.17,z+.13,.025,.015,.025,active('ir')?p.glow:p.red);if(active('ir'))this.ring(x,.16,z,.25+(t*.3%.2),p.red);}
    if(this.hasAccessory('red-module')){const x=-.85,z=-2.35;this.box(x,.15,z,.17,.02,.35,p.red);this.box(x,.22,z,.08,.05,.09,p.blue);this.cylinder(x,.278,z,.025,.003,.025,p.gold);this.box(x,.28,z,.018,.002,.004,p.dark);this.box(x,.185,z+.2,.065,.015,.04,p.chip);for(let i=0;i<4;i++)this.box(x-.12+i*.08,.15,z+.45,.012,.012,.09,p.metal);for(let i=0;i<6;i++){this.box(x-.13+(i%2)*.26,.18,z-.23+Math.floor(i/2)*.14,.018,.008,.035,p.resistor);}}
    if(this.hasAccessory('light')){const x=.3,z=-2.35;this.box(x,.13,z,.17,.02,.27,p.green);for(const dx of[-.04,.04])this.box(x+dx,.24,z,.009,.1,.009,p.metal);this.cylinder(x,.34,z,.105,.012,.105,p.resistor);for(let i=0;i<5;i++){this.box(x,.355,z-.07+i*.034,.07,.002,.005,[.33,.18,.1]);this.box(x+(i%2?.07:-.07),.355,z-.053+i*.034,.005,.002,.017,[.33,.18,.1]);}this.header(x-.095,z+.3,3,p.socket,p);this.cylinder(x+.12,.17,z-.17,.022,.015,.022,(v.light??62)<30?p.red:p.glow);}
    if(this.hasAccessory('climate')){const x=1.45,z=-2.35;this.box(x,.14,z,.18,.02,.28,p.green);this.box(x,.25,z,.13,.09,.2,[.2,.55,.75]);for(let row=0;row<7;row++)for(const dx of[-.07,0,.07])this.box(x+dx,.342,z-.16+row*.05,.02,.002,.012,p.hole);this.header(x-.095,z+.32,3,p.socket,p);this.cylinder(x+.14,.18,z-.23,.02,.008,.02,(v.climate??24)>30?p.red:p.green);}
  }
  drawFineDetails(p){
    // Countersunk hardware, solder joints, PCB edge vias and breadboard contacts.
    for(const [x,z]of[[-2.55,-1.18],[2.52,-1.45],[-2.55,1.43],[2.52,1.43]]){this.ring(x,.15,z,.052,p.metal);this.box(x,.166,z,.004,.003,.025,p.metal);}
    for(let i=0;i<28;i++){const x=.45+i*.073;this.cylinder(x,.273,-1.31,.012,.004,.012,p.gold);this.cylinder(x,.273,-.045,.012,.004,.012,p.gold);}
    for(let row=0;row<10;row++)for(let col=0;col<17;col++){const x=-1.18-.735+col*.091,z=-.34+(row<5?-.47+row*.084:.14+(row-5)*.084);this.box(x+.021,.358,z,.003,.003,.024,[.6,.07,.04]);this.box(x,.358,z+.023,.023,.003,.003,[.65,.09,.04]);this.box(x,.359,z,.006,.002,.015,[.55,.34,.23]);}
    for(const x of[1.09,2.21])for(const z of[.34,1.4])this.ring(x,.28,z,.046,p.gold);
    // LCD retaining tabs and connector solder pads.
    for(const x of[1.1,2.2])for(const z of[.6,1.12])this.box(x,.32,z,.02,.01,.055,p.metal);
    for(let i=0;i<8;i++){this.ring(1.29+i*.09,.277,1.46,.024,p.metal);}
  }
  drawAccessoryDetails(p){
    const z=-3.7;
    // 9V battery, snap contacts and two-colour lead.
    this.box(-.9,.26,z,.36,.16,.22,p.dark);this.box(-.9,.26,z-.19,.36,.16,.03,p.metal);this.cylinder(-1.03,.445,z,.035,.025,.035,p.metal);this.cylinder(-.78,.445,z,.05,.025,.05,p.metal);
    for(const [off,color] of[[0,p.red],[.05,p.dark]])for(let i=0;i<20;i++){const t=i/20,u=(i+1)/20,at=v=>[-.78+v*.9,.46-Math.sin(v*Math.PI)*.25,z+off+Math.sin(v*Math.PI)*.35];this.cableBetween(at(t),at(u),.012,color);}
    // Braided-looking blue USB cable, two plugs, and RFID fob.
    for(let i=0;i<70;i++){const a=i/70*Math.PI*1.8,b=(i+1)/70*Math.PI*1.8;this.cableBetween([1.1+Math.cos(a)*.72,.15,z+Math.sin(a)*.35],[1.1+Math.cos(b)*.72,.15,z+Math.sin(b)*.35],.035,p.blue);}
    this.box(1.83,.15,z,.13,.055,.08,p.metal);this.box(1.63,.15,z,.09,.065,.085,p.blue);this.box(1.52,.15,z-.22,.1,.075,.07,p.metal);
    this.cylinder(1.1,.14,z,.2,.035,.2,p.blue);this.cylinder(1.1,.179,z,.15,.004,.15,[.12,.28,.72]);for(let i=0;i<24;i++){const a=i/24*Math.PI*2,b=(i+1)/24*Math.PI*2;this.cableBetween([1.33+Math.cos(a)*.1,.18,z+Math.sin(a)*.1],[1.33+Math.cos(b)*.1,.18,z+Math.sin(b)*.1],.008,p.metal);}
    this.box(2.24,.12,z,.25,.012,.38,p.silk);

  }
  drawHighDetailModel(){const p={base:[.01,.01,.01],panel:[.025,.028,.03],dark:[.04,.045,.05],hole:[.012,.012,.013],red:[.79,.065,.035],yellow:[.95,.78,.03],blue:[.035,.19,.65],uno:[.025,.12,.34],green:[.13,.35,.14],metal:[.72,.75,.73],gold:[.67,.57,.32],silk:[.91,.92,.87],socket:[.025,.03,.035],chip:[.07,.075,.08],resistor:[.55,.44,.3],glow:[1,.92,.22]};if(this.onlyAccessory){this.drawAccessories(p);return;}this.drawKitBase(p);this.group('led',()=>this.drawLedBank(p));this.group('breadboard',()=>this.drawBreadboard(p));this.group('uno',()=>this.drawUno(p));this.group('controls',()=>this.drawControlDeck(p));this.group('lcd',()=>this.drawDisplay(p));this.group('ports',()=>this.drawModules(p));this.drawFineDetails(p);if(this.accessories||this.canvas.id==='labCanvas')this.drawAccessories(p);if(this.accessories)this.drawAccessoryDetails(p);}
  drawSurfaceArt(){if(this.onlyAccessory)return;this.art.draw(this,'base',0,.128,0,2.72,1.63);this.art.draw(this,'uno',1.45,.279,-.68,1.025,.65);this.art.draw(this,'chip',1.17,.34,-.68,.15,.15);this.art.draw(this,'lcd',1.65,.33,.87,.5,.43);this.gl.useProgram(this.program);}
  draw(){
    this.time=performance.now();
    const gl=this.gl;if(!gl||!this.canvas.offsetParent)return;const dpr=Math.min(2,devicePixelRatio||1),w=this.canvas.clientWidth||400,h=this.canvas.clientHeight||400;if(this.canvas.width!==Math.floor(w*dpr)||this.canvas.height!==Math.floor(h*dpr)){this.canvas.width=Math.floor(w*dpr);this.canvas.height=Math.floor(h*dpr)}gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.depthMask(true);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniform2f(this.locProjectionScale,(this.canvas.width/this.canvas.height)*Math.tan(.48),Math.tan(.48));if(!state.motionReduced&&!this.drag&&!this.hovered&&(this.canvas.id==="heroCanvas"||this.autoRotate))this.ry+=.00065;
    this.captureBounds=!this.solidBounds;if(this.captureBounds)this.solidBounds=[];
    this.drawHighDetailModel();this.captureBounds=false;
    this.drawSurfaceArt();
    if(this.canvas.id==="labCanvas"){this.drawConnections();this.updatePinLabels();this.updateCallouts()}
  }
}

const renderers = [new DetailedKitRenderer($("#heroCanvas"), .88), new DetailedKitRenderer($("#labCanvas"), .92), new DetailedKitRenderer($("#kitCanvas"), 1)].filter((r) => r.gl);
if (!renderers.length) { $("#labCanvas").hidden = true; $("#fallbackBoard").hidden = false; $("#viewMode").textContent = "WebGL kullanılamıyor"; }

function loop(time) {
  const delta=Math.min(100,Math.max(0,time-(loop.lastTick??time)));loop.lastTick=time;
  if(state.running&&state.runtime){
    loop.accumulator=(loop.accumulator||0)+delta*state.speed;
    if(loop.accumulator>=90||state.runtime.wait){
      try{
        const elapsed=loop.accumulator;loop.accumulator=0;
        publishExecution(state.runtime.advance(elapsed,state.env));
      }catch(error){stop();$("#executionStatus").textContent=error.message;toast(error.message);state.runtime=null;}
    }
  }
  renderers.forEach(r=>r.draw(time));
  requestAnimationFrame(loop);
}

function init() {
  $("#executionSpeed").addEventListener('change',e=>state.speed=Number(e.target.value));
  $("#restartExecution").addEventListener('click',()=>{stop();state.runtime=null;state.sim.led=false;state.sim.fan=false;updateOutputs();prepareRuntime();$("#executionClock").textContent='0 ms';$("#variableWatch").replaceChildren();$("#executionStatus").textContent='Yürütme sıfırlandı.';});
  $("#codeEditor").addEventListener('input',()=>{stop();state.runtime=null;$("#executionStatus").textContent='Kod değişti; çalıştırınca baştan başlayacak.';});
  $("#partFocus").addEventListener("change",event=>{
    const views={all:[null,6.4],uno:[[1.45,.3,-.68],3.1],breadboard:[[-1.18,.3,-.34],2.9],led:[[-2.4,.3,-.3],3.1],controls:[[-1.1,.3,1.3],4],lcd:[[1.65,.3,.87],2.5],distance:[[-2.05,.3,2.7],2.3]};
    const [focus,zoom]=views[event.target.value];
    const renderer=renderers.find(r=>r.canvas.id==='labCanvas');if(!renderer)return;
    renderer.focus=focus;renderer.zoom=zoom;renderer.rx=-1.05;renderer.ry=-.12;
    state.showCallouts=event.target.value==='all';
    $("#identifyToggle").classList.toggle('active',state.showCallouts);$("#identifyToggle").setAttribute('aria-pressed',state.showCallouts);
  });
  const options = allPins.map((p) => `<option value="${p}">${p}</option>`).join(""); $("#pinA").innerHTML = options; $("#pinB").innerHTML = options; $("#pinB").selectedIndex = 1;
  $$('[data-nav]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.nav)));
  $("#continueButton").addEventListener("click", () => setView("lab"));
  $("#motionToggle").addEventListener("click", () => { state.motionReduced = !state.motionReduced; document.body.classList.toggle("reduced-motion", state.motionReduced); $("#motionToggle").setAttribute("aria-pressed", state.motionReduced); persist(); toast(state.motionReduced ? "Hareket azaltıldı." : "Hareket etkinleştirildi."); });
  document.body.classList.toggle("reduced-motion", state.motionReduced);
  $("#addWire").addEventListener("click", addWire); $("#undoWire").addEventListener("click", () => { currentConnections().pop(); persist(); renderWires(); });
  $("#codeEditor").addEventListener("input", () => { state.code[state.missionId] = $("#codeEditor").value; updateLineNumbers(); persist(); });
  $$('[data-code-tab]').forEach((b) => b.addEventListener("click", () => showCodeTab(b.dataset.codeTab)));
  $("#runButton").addEventListener("click", run); $("#stopButton").addEventListener("click", stop); $("#stepButton").addEventListener("click", stepSimulation); $("#checkCircuit").addEventListener("click", () => checkCircuit()); $("#runTests").addEventListener("click", testMission);
  $("#resetMission").addEventListener("click", () => { state.connections[state.missionId] = []; state.code[state.missionId] = currentMission().starter; persist(); loadMission(); toast("Görev başlangıç durumuna döndü."); });
  ["light", "temp", "distance"].forEach((name) => $(`#${name}Range`).addEventListener("input", updateEnvironment));
  $("#nextHint").addEventListener("click", () => { state.hint = (state.hint + 1) % 3; $("#hintText").textContent = currentMission().hints[state.hint]; $("#hintLevel").textContent = `${state.hint + 1}/3`; });
  $("#viewMode").addEventListener("click", () => { state.view3d = !state.view3d;if(state.view3d&&!renderers.some(r=>r.canvas.id==='labCanvas')){state.view3d=false;toast("Bu tarayıcıda 3B görüntüleyici kullanılamıyor.");}$("#pinOverlay").hidden=!state.view3d;$("#modelCallouts").hidden=!state.view3d||!state.showCallouts; $("#labCanvas").hidden = !state.view3d; $("#fallbackBoard").hidden = state.view3d; $("#viewMode").textContent = state.view3d ? "2D Görünüm" : "3D Görünüm"; });
  $("#guideToggle").addEventListener("click", () => { const list=$("#connectionGuide");list.hidden=!list.hidden;$("#guideToggle").textContent=list.hidden?"Rehberi Aç":"Rehber Açık"; });
  $("#resetCamera").addEventListener("click", () => renderers.filter(r=>r.canvas.id==='labCanvas').forEach((r) => { r.focus=null;$("#partFocus").value="all";r.rx=-.62;r.ry=-.58;r.zoom=6.4; })); $("#topView").addEventListener("click", () => renderers.filter(r=>r.canvas.id==='labCanvas').forEach((r) => { r.focus=null;$("#partFocus").value="all";r.rx=-1.48;r.ry=0;r.zoom=6.7; }));
  $("#labelToggle").addEventListener("click", () => { state.showLabels=!state.showLabels;$("#labelToggle").classList.toggle("active",state.showLabels);$("#labelToggle").setAttribute("aria-pressed",state.showLabels);toast(state.showLabels?"Bağlantı etiketleri açıldı.":"Bağlantı etiketleri gizlendi."); });
  $("#identifyToggle").addEventListener("click", () => { state.showCallouts=!state.showCallouts;$("#identifyToggle").classList.toggle("active",state.showCallouts);$("#identifyToggle").setAttribute("aria-pressed",state.showCallouts); });
  $("#autoWire").addEventListener("click", () => { state.connections[state.missionId]=currentMission().connections.map((wire)=>[...wire]);persist();renderWires();toast("Görev bağlantıları fiziksel kablolarla oluşturuldu."); });
  $("#clearWires").addEventListener("click", () => { state.connections[state.missionId]=[];state.pendingPin=null;persist();renderWires();toast("Tüm kablolar söküldü."); });
  $("#multimeterToggle").addEventListener("click", () => { state.multimeter=!state.multimeter;$("#multimeterPanel").hidden=!state.multimeter;$("#multimeterToggle").classList.toggle("active",state.multimeter);$("#multimeterToggle").setAttribute("aria-pressed",state.multimeter);updateMultimeter(); });
  $("#journalNotes").addEventListener("input", () => { state.notes = $("#journalNotes").value; persist(); });
  $("#resetProgress").addEventListener("click", () => { if (confirm("Yerel görev ilerlemesi ve notlar silinsin mi?")) { localStorage.removeItem(STORAGE_KEY); location.reload(); } });
  renderMissions(); loadMission(); renderHardware(); renderJournal(); updateEnvironment(); renderSerial(); requestAnimationFrame(loop);
}

init();


const referenceRenderer=renderers.find(r=>r.canvas.id==='kitCanvas');
if(referenceRenderer){
 const r=referenceRenderer; r.zoom=window.innerWidth<700?7.5:5.3; const views={all:[null,window.innerWidth<700?7.5:5.3],uno:[[1.45,.3,-.68],3.3],breadboard:[[-1.18,.3,-.34],2.8],led:[[-2.45,.3,0],3.2],controls:[[-1.1,.3,1.3],4],lcd:[[1.65,.3,.87],2.8]};
 $('#referenceFocus').addEventListener('change',e=>{[r.focus,r.zoom]=views[e.target.value];r.rx=-1.15;r.ry=0;$('#referenceCaption').textContent=e.target.selectedOptions[0].textContent+' · fotoğraf referanslı geometri';});
 $('#referencePhotoToggle').addEventListener('click',e=>{const photo=$('#referencePhoto');photo.hidden=!photo.hidden;e.currentTarget.setAttribute('aria-expanded',!photo.hidden);});
 $('#referenceLedDemo').addEventListener('click',e=>{r.demoLed=!r.demoLed;e.currentTarget.setAttribute('aria-pressed',r.demoLed);e.currentTarget.textContent=r.demoLed?'LED’i söndür':'LED’i yak';});
 $('#referenceKnob').addEventListener('input',e=>{r.knob=Number(e.target.value)*Math.PI/180;$('#referenceKnobValue').textContent=e.target.value+'°';});
 $('#referenceTop').addEventListener('click',()=>{r.rx=-Math.PI/2;r.ry=0;});
 $('#referenceAngle').addEventListener('click',()=>{r.rx=-.8;r.ry=-.25;});
 $('#referenceRotate').addEventListener('click',e=>{r.autoRotate=!r.autoRotate;e.currentTarget.setAttribute('aria-pressed',r.autoRotate);});
 $('#referenceAccessories').addEventListener('click',e=>{r.accessories=!r.accessories;r.solidBounds=null;r.focus=null;r.zoom=r.accessories?11:(window.innerWidth<700?7.5:5.3);$('#referenceFocus').value='all';e.currentTarget.setAttribute('aria-pressed',r.accessories);});
 $('#referenceZoomIn').addEventListener('click',()=>r.zoom=Math.max(2,r.zoom-.6));$('#referenceZoomOut').addEventListener('click',()=>r.zoom=Math.min(12,r.zoom+.6));
 r.canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')r.ry-=.12;if(e.key==='ArrowRight')r.ry+=.12;if(e.key==='ArrowUp')r.rx-=.12;if(e.key==='ArrowDown')r.rx+=.12;});
}

let modulePreviewRenderer;
mountModuleLibrary($('#moduleLibrary'),{
 preview:canvas=>{modulePreviewRenderer=new DetailedKitRenderer(canvas,1);modulePreviewRenderer.onlyAccessory=true;if(modulePreviewRenderer.gl)renderers.push(modulePreviewRenderer);},
 previewSelect:(id,focus)=>{const r=modulePreviewRenderer;if(!r)return;r.moduleIds=new Set([id]);r.focus=focus;r.zoom=id==='distance'?2.2:1.8;r.rx=-1.05;r.ry=-.2;r.solidBounds=null;},
 mission:()=>currentMission(),
 modules:ids=>{const r=renderers.find(r=>r.canvas.id==='labCanvas');if(!r)return;r.moduleIds=new Set(ids);r.solidBounds=null;r.focus=null;r.zoom=ids.length?9:7.5;},
 focus:point=>{const r=renderers.find(r=>r.canvas.id==='labCanvas');if(!r)return;r.focus=point;r.rx=-1.15;r.ry=0;r.zoom=point?2.6:9;state.showCallouts=false;$('#identifyToggle').setAttribute('aria-pressed','false');$('#identifyToggle').classList.remove('active');$('#labCanvas').scrollIntoView({block:'center',behavior:'auto'});},
 value:id=>renderers.find(r=>r.canvas.id==='labCanvas')?.moduleValues?.[id],
 input:(id,value)=>{const r=renderers.find(r=>r.canvas.id==='labCanvas');if(!r)return;(r.moduleValues??={})[id]=value;if(modulePreviewRenderer)(modulePreviewRenderer.moduleValues??={})[id]=value;},
 trigger:id=>{const r=renderers.find(r=>r.canvas.id==='labCanvas');if(!r)return;(r.moduleEvents??={})[id]=performance.now()+2500;if(modulePreviewRenderer)(modulePreviewRenderer.moduleEvents??={})[id]=performance.now()+2500;}
});

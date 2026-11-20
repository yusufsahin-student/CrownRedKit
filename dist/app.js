import { missions, missionById } from "./missions.js";
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
  motionReduced: Boolean(saved.motionReduced),
  connections: saved.connections || {},
  code: saved.code || {},
  env: { light: 62, temperature: 24, distance: 80 },
  running: false,
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
}

function renderWires() {
  const wires = currentConnections();
  $("#wireList").innerHTML = wires.length ? wires.map(([a, b]) => `<span class="wire">${a} — ${b}</span>`).join("") : '<span class="wire">Henüz bağlantı yok</span>';
  const result = checkConnections(currentMission(), wires);
  state.sim.wired = result.ok;
  const label = $("#connectionStatus");
  label.className = `status ${result.ok ? "ok" : "warn"}`;
  label.textContent = result.ok ? "Devre hazır" : `${result.missing.length} bağlantı eksik`;
  updateMultimeter();
}

function updateMultimeter() {
  const value = $("#multimeterValue"), hint = $("#multimeterHint");
  if (!value || !hint) return;
  const powered = currentConnections().some((wire) => wire.includes("5V")) && currentConnections().some((wire) => wire.includes("GND"));
  value.textContent = powered ? `${(4.96 + state.env.light / 2500).toFixed(2)} V` : "0.00 V";
  hint.textContent = powered ? "Devre beslemesi · 5V ↔ GND" : "Ölçüm için 5V ve GND bağla";
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
  if (!program.ok) { toast(program.error); state.serial.push(`[HATA] ${program.error}`); renderSerial(); }
  return program;
}

function checkCircuit(showToast = true) {
  const result = checkConnections(currentMission(), currentConnections());
  if (showToast) toast(result.ok ? "Devre doğrulandı; tüm gerekli sanal bağlantılar hazır." : `Eksik: ${result.missing.map((x) => x.join("—")).join(", ")}`);
  renderWires(); return result.ok;
}

function run() {
  const program = compile();
  if (!program.ok) return;
  if (!checkCircuit(false)) { toast("Kod çalışmadı: önce gerekli sanal bağlantıları tamamla."); return; }
  state.running = true; state.startTime = performance.now();
  state.serial.push(`[BAŞLAT] Görev ${state.missionId}: ${currentMission().title}`);
  toast("Simülasyon çalışıyor.");
}

function stop() { state.running = false; state.serial.push("[DURDUR] Simülasyon durduruldu."); renderSerial(); }

function stepSimulation() {
  const program = compile(); if (!program.ok) return;
  state.sim.wired = checkConnections(currentMission(), currentConnections()).ok;
  state.sim = computeFrame({ mission: currentMission(), env: state.env, program, previous: state.sim, elapsed: performance.now() - state.startTime });
  updateOutputs();
  state.serial.push(`[ADIM] ${state.sim.serialValue} · LED=${state.sim.led ? "AÇIK" : "KAPALI"} · FAN=${state.sim.fan ? "AÇIK" : "KAPALI"}`);
  renderSerial();
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

// Küçük, bağımlılıksız WebGL temsili model.
class KitRenderer {
  constructor(canvas, scale = 1) {
    this.canvas = canvas; this.scale = scale; this.rx = -.55; this.ry = -.6; this.zoom = 5.5; this.drag = null; this.selected = "";
    this.gl = canvas.getContext("webgl", { antialias: true, alpha: true });
    if (!this.gl) return;
    this.init(); this.bind();
  }
  init() {
    const gl = this.gl;
    const vs = `attribute vec3 p;uniform mat4 m;void main(){gl_Position=m*vec4(p,1.0);}`;
    const fs = `precision mediump float;uniform vec4 c;void main(){gl_FragColor=c;}`;
    const shader = (type, src) => { const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s; };
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);this.program=program;
    const v=[-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1];
    const idx=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4];
    this.buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
    this.ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);this.count=idx.length;
    this.locP=gl.getAttribLocation(program,"p");this.locM=gl.getUniformLocation(program,"m");this.locC=gl.getUniformLocation(program,"c");
  }
  bind() {
    const c=this.canvas;
    c.addEventListener("pointerdown",e=>{this.drag=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId)});
    c.addEventListener("pointermove",e=>{if(!this.drag)return;this.ry+=(e.clientX-this.drag[0])*.008;this.rx+=(e.clientY-this.drag[1])*.008;this.drag=[e.clientX,e.clientY]});
    c.addEventListener("pointerup",()=>this.drag=null);c.addEventListener("wheel",e=>{e.preventDefault();this.zoom=Math.max(3,Math.min(9,this.zoom+e.deltaY*.004))},{passive:false});
  }
  mat(x,y,z,sx,sy,sz){const a=this.rx,b=this.ry,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),aspect=this.canvas.width/this.canvas.height,f=1/Math.tan(.55),near=.1,far=30;const model=[cb*sx,sa*sb*sx,-ca*sb*sx,0,0,ca*sy,sa*sy,0,sb*sz,-sa*cb*sz,ca*cb*sz,0,x,y,z,1];const view=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,-this.zoom,1];const proj=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,(2*far*near)/(near-far),0];const mul=(A,B)=>{const O=new Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)O[c*4+r]+=A[k*4+r]*B[c*4+k];return O};return new Float32Array(mul(proj,mul(view,model)))}
  box(x,y,z,sx,sy,sz,color,id=""){const gl=this.gl;gl.uniformMatrix4fv(this.locM,false,this.mat(x,y,z,sx,sy,sz));const boost=this.selected===id?.18:0;gl.uniform4fv(this.locC,[Math.min(1,color[0]+boost),Math.min(1,color[1]+boost),Math.min(1,color[2]+boost),1]);gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0)}
  draw(time=0){const gl=this.gl;if(!gl)return;const dpr=Math.min(2,devicePixelRatio||1),w=this.canvas.clientWidth||400,h=this.canvas.clientHeight||400;if(this.canvas.width!==w*dpr||this.canvas.height!==h*dpr){this.canvas.width=w*dpr;this.canvas.height=h*dpr}gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);gl.enableVertexAttribArray(this.locP);gl.vertexAttribPointer(this.locP,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ib);if(!state.motionReduced&&!this.drag)this.ry+=.0012;this.box(0,0,0,2.35,.13,1.45,[.72,.13,.14],"red-board");this.box(-1.35,.27,-.75,.48,.18,.38,[.08,.13,.12],"driver");this.box(.2,.3,-.65,.55,.22,.45,[.12,.2,.17],"temp");this.box(1.35,.28,-.6,.34,.2,.42,[.16,.28,.18],"light");this.box(-.8,.3,.55,.48,.22,.38,[.12,.19,.17],"distance");this.box(.75,.31,.55,.55,.23,.36,[.08,.13,.12],"motor");this.box(1.75,.27,.75,.12,.13,.12,state.sim.led?[.74,.91,.35]:[.25,.2,.18],"led");}
}

class DetailedKitRenderer {
  constructor(canvas, scale = 1) {
    this.canvas=canvas;this.scale=scale;this.rx=-.62;this.ry=-.58;this.zoom=6.4;this.drag=null;this.pointerStart=null;this.selected="";
    this.pinPoints={
      D2:[.22,.51,-1.22],D3:[.4,.51,-1.22],D5:[.58,.51,-1.22],D6:[.76,.51,-1.22],D9:[.94,.51,-1.22],
      A0:[.34,.51,-.08],A1:[.54,.51,-.08],A2:[.74,.51,-.08],"5V":[1.2,.51,-.08],GND:[1.42,.51,-.08],
      "LED+":[-2.38,.56,-.72],"LED-":[-2.22,.34,-.72],"L-SIG":[-1.76,.52,-1.35],"L-VCC":[-1.9,.36,-1.2],"L-GND":[-1.62,.36,-1.2],
      "T-SIG":[-1.1,.52,-1.38],"T-VCC":[-.94,.38,-1.22],"T-GND":[-.78,.38,-1.22],TRIG:[1.9,.58,-.08],ECHO:[2.28,.58,-.08],"D-VCC":[1.8,.36,.1],"D-GND":[2.38,.36,.1],
      "M-IN":[2.18,.56,.3],"M-VCC":[2.02,.45,.47],"M-GND":[2.38,.45,.47],"M-OUT":[2.2,.46,.12],"M+":[2.46,.46,.05],"M-":[2.52,.46,.28]
    };
    this.gl=canvas.getContext("webgl",{antialias:true,alpha:true,depth:true,stencil:false,premultipliedAlpha:false,powerPreference:"high-performance"});if(!this.gl)return;try{this.init();this.bind()}catch(error){console.error("RED Kit 3B görüntüleyici başlatılamadı",error);this.gl=null}
  }
  init(){
    const gl=this.gl,vs=`attribute vec3 p;attribute vec3 n;uniform mat4 m;uniform mat3 r;varying vec3 normal;void main(){normal=normalize(r*n);gl_Position=m*vec4(p,1.0);}`,fs=`precision highp float;uniform vec4 c;uniform float shine;varying vec3 normal;void main(){vec3 n=normalize(normal);vec3 key=normalize(vec3(.46,.82,.38));vec3 fill=normalize(vec3(-.72,.35,-.44));float d1=max(dot(n,key),0.0);float d2=max(dot(n,fill),0.0);float rim=pow(1.0-max(n.z,0.0),2.2);float spec=pow(max(dot(n,normalize(key+vec3(0.0,0.0,1.0))),0.0),32.0)*shine;vec3 lit=c.rgb*(.31+d1*.57+d2*.16)+vec3(spec*.55)+c.rgb*rim*.08;gl_FragColor=vec4(pow(lit,vec3(.92)),c.a);}`;
    const shader=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x)||"Shader derlenemedi");return x},program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"Shader programı bağlanamadı");this.program=program;
    this.locP=gl.getAttribLocation(program,"p");this.locN=gl.getAttribLocation(program,"n");this.locM=gl.getUniformLocation(program,"m");this.locR=gl.getUniformLocation(program,"r");this.locC=gl.getUniformLocation(program,"c");this.locShine=gl.getUniformLocation(program,"shine");
    const tri=(o,a,b,c,n)=>[a,b,c].forEach(v=>o.push(...v,...n)),triN=(o,a,b,c)=>[a,b,c].forEach(v=>o.push(...v,...v)),cube=[],faces=[[[ -1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1]],[[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],[ 1,-1,-1]],[[-1, 1,-1],[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1]],[[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1]],[[ 1,-1,-1],[ 1, 1,-1],[ 1, 1, 1],[ 1,-1, 1]],[[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1]]],norms=[[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0]];
    faces.forEach((f,i)=>{tri(cube,f[0],f[1],f[2],norms[i]);tri(cube,f[0],f[2],f[3],norms[i])});
    const cyl=[],segments=24;for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,p1=[Math.cos(a),-1,Math.sin(a)],p2=[Math.cos(b),-1,Math.sin(b)],p3=[Math.cos(b),1,Math.sin(b)],p4=[Math.cos(a),1,Math.sin(a)],sn=[Math.cos((a+b)/2),0,Math.sin((a+b)/2)];tri(cyl,p1,p3,p2,sn);tri(cyl,p1,p4,p3,sn);tri(cyl,[0,1,0],p3,p4,[0,1,0]);tri(cyl,[0,-1,0],p1,p2,[0,-1,0])}
    const sphere=[],lat=14,lon=24;for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){const a0=y/lat*Math.PI-Math.PI/2,a1=(y+1)/lat*Math.PI-Math.PI/2,b0=x/lon*Math.PI*2,b1=(x+1)/lon*Math.PI*2,v=(a,b)=>[Math.cos(a)*Math.cos(b),Math.sin(a),Math.cos(a)*Math.sin(b)],v00=v(a0,b0),v10=v(a0,b1),v11=v(a1,b1),v01=v(a1,b0);triN(sphere,v00,v11,v10);triN(sphere,v00,v01,v11)}
    this.meshes={cube:this.mesh(cube),cylinder:this.mesh(cyl),sphere:this.mesh(sphere)};
  }
  mesh(data){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return{buffer:b,count:data.length/6}}
  bind(){
    const c=this.canvas,wrap=a=>((a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
    c.addEventListener("pointerdown",e=>{this.drag=[e.clientX,e.clientY];this.pointerStart=[e.clientX,e.clientY];c.style.cursor="grabbing";c.setPointerCapture(e.pointerId)});
    c.addEventListener("pointermove",e=>{if(!this.drag)return;this.ry=wrap(this.ry+(e.clientX-this.drag[0])*.008);this.rx=wrap(this.rx+(e.clientY-this.drag[1])*.008);this.drag=[e.clientX,e.clientY]});
    c.addEventListener("pointerup",e=>{const start=this.pointerStart,moved=start?Math.hypot(e.clientX-start[0],e.clientY-start[1]):99;this.drag=null;this.pointerStart=null;c.style.cursor="grab";if(moved<7&&c.id==="labCanvas")this.hitPin(e)});
    c.addEventListener("pointercancel",()=>{this.drag=null;this.pointerStart=null;c.style.cursor="grab"});c.style.cursor="grab";
    c.addEventListener("wheel",e=>{e.preventDefault();this.zoom=Math.max(4.2,Math.min(10,this.zoom+e.deltaY*.004))},{passive:false})
  }
  mul(A,B){const O=new Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)O[c*4+r]+=A[k*4+r]*B[c*4+k];return O}
  scene(){const a=this.rx,b=this.ry,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),aspect=Math.max(.2,this.canvas.width/this.canvas.height),f=1/Math.tan(.48),near=.1,far=40,rx=[1,0,0,0,0,ca,sa,0,0,-sa,ca,0,0,0,0,1],ry=[cb,0,-sb,0,0,1,0,0,sb,0,cb,0,0,0,0,1],view=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,-this.zoom,1],proj=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,(2*far*near)/(near-far),0];return this.mul(proj,this.mul(view,this.mul(rx,ry)))}
  matrix(x,y,z,sx,sy,sz){const t=[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],s=[sx,0,0,0,0,sy,0,0,0,0,sz,0,0,0,0,1];return new Float32Array(this.mul(this.scene(),this.mul(t,s)))}
  rotation(){const a=this.rx,b=this.ry,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);return new Float32Array([cb,sa*sb,-ca*sb,0,ca,sa,sb,-sa*cb,ca*cb])}
  part(mesh,x,y,z,sx,sy,sz,color,id=""){const gl=this.gl,obj=this.meshes[mesh],boost=this.selected===id?.22:0,metal=/usb|power|silver|lcd-frame/.test(id);gl.bindBuffer(gl.ARRAY_BUFFER,obj.buffer);gl.enableVertexAttribArray(this.locP);gl.vertexAttribPointer(this.locP,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(this.locN);gl.vertexAttribPointer(this.locN,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(this.locM,false,this.matrix(x*this.scale,y*this.scale,z*this.scale,sx*this.scale,sy*this.scale,sz*this.scale));gl.uniformMatrix3fv(this.locR,false,this.rotation());gl.uniform4fv(this.locC,[Math.min(1,color[0]+boost),Math.min(1,color[1]+boost),Math.min(1,color[2]+boost),1]);gl.uniform1f(this.locShine,metal?.9:.24);gl.drawArrays(gl.TRIANGLES,0,obj.count)}
  box(...a){this.part("cube",...a)} cylinder(...a){this.part("cylinder",...a)} sphere(...a){this.part("sphere",...a)}
  cableBetween(a,b,radius,color){
    const ax=a[0]*this.scale,ay=a[1]*this.scale,az=a[2]*this.scale,bx=b[0]*this.scale,by=b[1]*this.scale,bz=b[2]*this.scale,dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dy,dz);if(!len)return;
    const ux=dx/len,uy=dy/len,uz=dz/len,ref=Math.abs(uy)>.92?[1,0,0]:[0,1,0],rx=ref[1]*uz-ref[2]*uy,ry=ref[2]*ux-ref[0]*uz,rz=ref[0]*uy-ref[1]*ux,rl=Math.hypot(rx,ry,rz),nx=rx/rl,ny=ry/rl,nz=rz/rl,zx=uy*nz-uz*ny,zy=uz*nx-ux*nz,zz=ux*ny-uy*nx,s=radius*this.scale;
    const model=[nx*s,ny*s,nz*s,0,ux*len/2,uy*len/2,uz*len/2,0,zx*s,zy*s,zz*s,0,(ax+bx)/2,(ay+by)/2,(az+bz)/2,1],obj=this.meshes.cylinder,gl=this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER,obj.buffer);gl.enableVertexAttribArray(this.locP);gl.vertexAttribPointer(this.locP,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(this.locN);gl.vertexAttribPointer(this.locN,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(this.locM,false,new Float32Array(this.mul(this.scene(),model)));gl.uniformMatrix3fv(this.locR,false,this.rotation());gl.uniform4fv(this.locC,[...color,1]);gl.uniform1f(this.locShine,.48);gl.drawArrays(gl.TRIANGLES,0,obj.count);
  }
  project(point){const m=this.scene(),x=point[0]*this.scale,y=point[1]*this.scale,z=point[2]*this.scale,cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],cw=m[3]*x+m[7]*y+m[11]*z+m[15],rect=this.canvas.getBoundingClientRect();return[(cx/cw*.5+.5)*rect.width,(-cy/cw*.5+.5)*rect.height]}
  hitPin(event){if(Math.sin(this.rx)>=-.04)return toast("Bağlantı uçları kartın üst yüzündedir; modeli üstten çevir.");const rect=this.canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let best=null,bestDistance=26;for(const [pin,point] of Object.entries(this.pinPoints)){const p=this.project(point),d=Math.hypot(x-p[0],y-p[1]);if(d<bestDistance){bestDistance=d;best=pin}}if(best)handleModelPin(best);else toast("Bir bağlantı ucuna daha yakın tıkla.")}
  drawConnections(){
    const colors=[[.9,.16,.12],[.12,.52,.86],[.93,.62,.08],[.18,.7,.34],[.66,.25,.82],[.95,.38,.1],[.2,.76,.72],[.76,.18,.4],[.48,.7,.12]];
    currentConnections().forEach(([a,b],wireIndex)=>{const p0=this.pinPoints[a],p1=this.pinPoints[b];if(!p0||!p1)return;const height=Math.max(p0[1],p1[1])+.52+(wireIndex%3)*.08,color=colors[wireIndex%colors.length],segments=28,points=[];for(let i=0;i<=segments;i++){const t=i/segments,u=1-t;points.push([u*u*p0[0]+2*u*t*((p0[0]+p1[0])/2)+t*t*p1[0],u*u*p0[1]+2*u*t*height+t*t*p1[1],u*u*p0[2]+2*u*t*((p0[2]+p1[2])/2)+t*t*p1[2]])}for(let i=1;i<points.length;i++)this.cableBetween(points[i-1],points[i],.035,color)});
    for(const [pin,point] of Object.entries(this.pinPoints)){const active=state.pendingPin===pin;this.cylinder(point[0],point[1],point[2],active?.075:.045,active?.1:.065,active?.075:.045,active?[.1,.65,1]:[.9,.66,.16])}
  }
  updatePinLabels(){
    const overlay=$("#pinOverlay");if(!overlay)return;const topVisible=Math.sin(this.rx)<-.04;overlay.hidden=!state.showLabels||!topVisible;if(!state.showLabels||!topVisible)return;const pins=[...new Set(currentMission().connections.flat())],signature=`${state.missionId}:${pins.join("|")}`;
    if(overlay.dataset.signature!==signature){overlay.dataset.signature=signature;overlay.innerHTML=pins.map(pin=>`<span class="pin-label" data-pin-label="${pin}">${pin}</span>`).join("")}
    $$('[data-pin-label]',overlay).forEach(label=>{const point=this.pinPoints[label.dataset.pinLabel];if(!point)return;const [x,y]=this.project(point);label.style.left=`${x}px`;label.style.top=`${y}px`;label.classList.toggle("selected",state.pendingPin===label.dataset.pinLabel)});
  }
  updateCallouts(){
    const layer=$("#modelCallouts"),svg=$("#calloutLeaders");if(!layer||!svg)return;const topVisible=Math.sin(this.rx)<-.04;layer.hidden=!state.showCallouts||!topVisible;if(!state.showCallouts||!topVisible)return;
    const targets={digital:[.78,.51,-1.22],usb:[1.94,.45,-.69],controller:[.82,.49,-.66],power:[1.34,.51,-.08]},wrap=this.canvas.getBoundingClientRect();
    svg.setAttribute("viewBox",`0 0 ${wrap.width} ${wrap.height}`);
    Object.entries(targets).forEach(([name,point])=>{const card=$(`[data-callout="${name}"]`,layer),line=$(`[data-callout-line="${name}"]`,svg),dot=$(`[data-callout-dot="${name}"]`,svg);if(!card||!line||!dot)return;const rect=card.getBoundingClientRect(),[x,y]=this.project(point),cx=rect.left-wrap.left+rect.width/2,cy=rect.top-wrap.top+rect.height/2;line.setAttribute("x1",cx);line.setAttribute("y1",cy);line.setAttribute("x2",x);line.setAttribute("y2",y);dot.setAttribute("cx",x);dot.setAttribute("cy",y)});
  }
  drawKitBase(p){
    this.box(0,-.05,0,2.82,.1,1.76,p.base);this.box(0,.075,0,2.76,.055,1.7,p.panel);this.box(0,.145,-1.62,2.69,.017,.025,p.red);this.box(0,.145,1.62,2.69,.017,.025,p.red);
    this.box(-2.7,.145,0,.025,.017,1.55,p.red);this.box(2.7,.145,0,.025,.017,1.55,p.red);
    [[-2.53,-1.46],[2.53,-1.46],[-2.53,1.46],[2.53,1.46]].forEach(([x,z])=>{this.cylinder(x,.17,z,.075,.027,.075,p.metal,"silver");this.box(x,.2,z,.038,.01,.009,p.dark)});
    for(let i=0;i<5;i++)this.box(-.4+i*.3,.157,1.57,.1,.007,.012,p.silk);
  }
  drawLedBank(p){
    const colors=[p.lime,p.yellow,p.red,p.red,p.red,p.red];
    colors.forEach((color,i)=>{const z=-1.18+i*.32,on=i===0&&state.sim.led;this.box(-2.45,.24,z,.16,.045,.13,p.dark);this.cylinder(-2.45,.34,z,.105,.07,.105,on?p.glow:color,"led");this.sphere(-2.45,.455,z,.105,.12,.105,on?p.glow:color,"led");this.box(-2.2,.16,z,.1,.007,.011,p.silk)});
    this.box(-2.45,.23,.82,.16,.045,.13,p.dark);this.cylinder(-2.45,.34,.82,.105,.07,.105,p.silk);this.sphere(-2.45,.455,.82,.105,.12,.105,[.82,.86,.86]);
  }
  drawBreadboard(p){
    const cx=-1.22,cz=-.62;this.box(cx,.25,cz,.84,.085,.62,p.yellow,"breadboard");this.box(cx,.35,cz,.055,.025,.58,[.66,.4,.025]);
    this.box(cx,.348,cz-.54,.74,.012,.012,p.red);this.box(cx,.348,cz+.54,.74,.012,.012,p.blue);
    for(let row=0;row<6;row++)for(let col=0;col<14;col++){const x=cx-.7+col*.108,z=cz-.39+row*.156;this.cylinder(x,.365,z,.018,.013,.018,p.hole)}
    for(let col=0;col<14;col++){const x=cx-.7+col*.108;this.cylinder(x,.365,cz-.55,.018,.013,.018,p.hole);this.cylinder(x,.365,cz+.55,.018,.013,.018,p.hole)}
    this.sphere(cx+.42,.57,cz+.1,.075,.11,.075,p.red,"led");this.cylinder(cx+.42,.45,cz+.1,.05,.09,.05,p.red);
    this.box(cx-.14,.49,cz+.1,.23,.04,.04,p.resistor);[-.26,-.12,.02].forEach((d,i)=>this.box(cx+d,.495,cz+.1,.018,.047,.047,[p.red,p.dark,p.gold][i]));
    this.box(cx-.5,.435,cz+.1,.13,.012,.012,p.metal);this.box(cx+.18,.435,cz+.1,.13,.012,.012,p.metal);
  }
  drawUno(p){
    const cx=.87,cz=-.66;this.box(cx,.235,cz,.96,.075,.64,p.uno,"uno");this.box(cx,.32,cz,.92,.015,.6,[.035,.32,.58]);
    this.box(1.94,.4,cz-.03,.24,.17,.25,p.metal,"usb");this.box(2.16,.4,cz-.03,.035,.125,.2,[.3,.33,.33]);this.box(1.94,.4,cz-.03,.15,.09,.15,[.72,.76,.75]);
    this.cylinder(1.73,.39,cz+.49,.145,.15,.145,p.dark,"power");this.cylinder(1.73,.39,cz+.49,.075,.16,.075,[.16,.18,.17]);
    this.box(.82,.4,cz,.28,.08,.2,p.chip,"controller");
    for(let i=0;i<7;i++){const d=-.22+i*.073;this.box(.82+d,.39,cz-.23,.022,.015,.055,p.metal);this.box(.82+d,.39,cz+.23,.022,.015,.055,p.metal)}
    this.box(1.35,.37,cz-.28,.13,.05,.08,p.metal,"silver");this.box(.25,.37,cz+.25,.12,.055,.09,p.dark);
    for(let i=0;i<10;i++){const x=.2+i*.16;this.box(x,.39,cz-.57,.06,.075,.045,p.socket);this.cylinder(x,.485,cz-.57,.018,.035,.018,p.gold)}
    for(let i=0;i<8;i++){const x=.3+i*.17;this.box(x,.39,cz+.57,.06,.075,.045,p.socket);this.cylinder(x,.485,cz+.57,.018,.035,.018,p.gold)}
    for(let i=0;i<5;i++){this.box(.27+i*.22,.337,cz-.34,.07,.008,.01,p.silk);this.box(.38+i*.22,.337,cz+.34,.07,.008,.01,p.silk)}
    [[.05,cz-.46],[1.56,cz-.46],[.05,cz+.46],[1.56,cz+.46]].forEach(([x,z])=>this.cylinder(x,.34,z,.045,.015,.045,p.metal,"silver"));
  }
  drawControlDeck(p){
    const controls=[[-1.9,p.red],[-1.42,p.yellow],[-.94,p.red],[-.46,p.red]];controls.forEach(([x,color])=>{this.box(x,.24,1.22,.23,.075,.23,p.dark);this.cylinder(x,.38,1.22,.18,.1,.18,color);this.sphere(x,.48,1.22,.16,.055,.16,color)});
    this.box(.08,.24,1.22,.22,.075,.22,p.dark);this.cylinder(.08,.38,1.22,.18,.1,.18,p.red);this.sphere(.08,.48,1.22,.16,.055,.16,p.red);
    this.box(.55,.24,1.2,.2,.075,.2,p.dark);this.cylinder(.55,.4,1.2,.15,.15,.15,p.dark);this.box(.55,.6,1.2,.06,.08,.09,p.metal);
    this.box(1.02,.24,1.2,.21,.075,.21,p.dark);this.cylinder(1.02,.42,1.2,.16,.16,.16,[.15,.16,.15]);this.cylinder(1.02,.61,1.2,.09,.08,.09,p.metal);
    for(let i=0;i<4;i++){const x=-1.5+i*.34;this.box(x,.25,.67,.14,.055,.14,p.silk);this.box(x,.36,.67,.085,.055,.085,p.dark);this.cylinder(x,.43,.67,.055,.025,.055,[.25,.27,.26])}
  }
  drawDisplay(p){
    const cx=1.92,cz=.92;this.box(cx,.25,cz,.62,.075,.5,p.uno,"lcd");this.box(cx,.36,cz,.51,.04,.37,[.58,.65,.54],"lcd-frame");this.box(cx,.415,cz,.42,.012,.28,[.12,.22,.18],"lcd");
    for(let row=0;row<2;row++)for(let col=0;col<8;col++)this.box(cx-.32+col*.09,.43,cz-.1+row*.13,.025,.007,.04,[.22,.34,.25]);
    [[cx-.5,cz-.38],[cx+.5,cz-.38],[cx-.5,cz+.38],[cx+.5,cz+.38]].forEach(([x,z])=>this.cylinder(x,.37,z,.037,.018,.037,p.metal,"silver"));
    for(let i=0;i<8;i++)this.cylinder(cx-.42+i*.12,.37,cz-.47,.018,.04,.018,p.gold);
  }
  drawModules(p){
    this.cylinder(-.2,.34,-1.3,.2,.13,.2,p.dark);this.cylinder(-.2,.485,-1.3,.13,.02,.13,[.025,.03,.03]);
    this.box(1.98,.24,.05,.48,.065,.26,p.green,"distance");this.cylinder(1.73,.42,.05,.19,.14,.19,p.metal,"distance");this.cylinder(2.23,.42,.05,.19,.14,.19,p.metal,"distance");
    for(let i=0;i<6;i++){const x=-1.95+i*.44;this.box(x,.25,-1.42,.16,.09,.11,i<3?p.red:p.green);this.box(x-.07,.39,-1.42,.03,.035,.03,p.gold);this.box(x+.07,.39,-1.42,.03,.035,.03,p.gold)}
    this.box(1.72,.24,.32,.63,.065,.13,p.socket);for(let i=0;i<9;i++)this.cylinder(1.28+i*.11,.38,.32,.018,.075,.018,p.gold);
    this.box(2.38,.3,.33,.17,.15,.22,p.green,"driver");this.box(2.38,.47,.33,.1,.03,.14,p.chip);
  }
  drawHighDetailModel(){
    const p={base:[.012,.017,.016],panel:[.035,.043,.041],dark:[.055,.065,.062],hole:[.035,.03,.022],red:[.78,.045,.055],yellow:[.95,.68,.035],blue:[.08,.3,.68],uno:[.025,.28,.52],green:[.035,.36,.16],metal:[.7,.74,.73],gold:[.82,.56,.12],silk:[.86,.88,.84],socket:[.035,.045,.043],chip:[.025,.03,.03],resistor:[.78,.61,.34],lime:[.62,.86,.05],glow:[.78,1,.12]};
    this.drawKitBase(p);this.drawLedBank(p);this.drawBreadboard(p);this.drawUno(p);this.drawControlDeck(p);this.drawDisplay(p);this.drawModules(p);
  }
  draw(){
    const gl=this.gl;if(!gl||!this.canvas.offsetParent)return;const dpr=Math.min(2,devicePixelRatio||1),w=this.canvas.clientWidth||400,h=this.canvas.clientHeight||400;if(this.canvas.width!==Math.floor(w*dpr)||this.canvas.height!==Math.floor(h*dpr)){this.canvas.width=Math.floor(w*dpr);this.canvas.height=Math.floor(h*dpr)}gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.depthMask(true);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);if(!state.motionReduced&&!this.drag&&this.canvas.id!=="labCanvas")this.ry+=.00065;
    this.drawHighDetailModel();if(this.canvas.id==="labCanvas"){this.drawConnections();this.updatePinLabels();this.updateCallouts()}return;
    const black=[.035,.045,.042],red=[.78,.08,.09],blue=[.04,.27,.5],yellow=[.92,.67,.08],silver=[.68,.72,.7],green=[.09,.35,.18],gold=[.78,.52,.12],dark=[.08,.1,.09],white=[.86,.88,.82];
    this.box(0,-.035,0,2.79,.11,1.74,[.018,.023,.022],"red-board");this.box(0,.095,0,2.74,.055,1.68,black,"red-board");
    this.box(0,.155,-1.6,2.68,.018,.025,red);this.box(0,.155,1.6,2.68,.018,.025,red);this.box(-2.67,.155,0,.025,.018,1.53,red);this.box(2.67,.155,0,.025,.018,1.53,red);
    [[-2.48,-1.42],[2.48,-1.42],[-2.48,1.42],[2.48,1.42]].forEach(([x,z])=>{this.cylinder(x,.17,z,.07,.028,.07,[.48,.5,.49],"silver");this.cylinder(x,.2,z,.025,.012,.025,dark)});
    /* UNO tabanlı denetleyici: PCB, USB, güç jakı, işlemci, kristal ve pin sıraları. */
    this.box(-1.46,.24,-.48,.9,.075,.67,blue,"red-board");
    this.box(-1.49,.37,-.48,.3,.085,.17,dark,"controller");
    for(let i=0;i<7;i++){this.box(-1.74+i*.085,.465,-.64,.018,.018,.018,silver);this.box(-1.74+i*.085,.465,-.32,.018,.018,.018,silver)}
    this.box(-2.24,.39,-.72,.25,.16,.25,silver,"usb");this.box(-2.46,.39,-.72,.04,.125,.2,[.32,.35,.34]);
    this.cylinder(-2.12,.39,.02,.14,.15,.14,dark,"power");this.cylinder(-2.12,.39,.02,.075,.16,.075,[.18,.2,.19]);
    this.box(-1.02,.36,-.7,.14,.055,.075,silver);this.box(-.98,.37,-.18,.13,.05,.09,[.12,.18,.16]);
    for(let i=0;i<12;i++){this.box(-2.06+i*.14,.39,-1.02,.052,.08,.04,dark);this.cylinder(-2.06+i*.14,.48,-1.02,.018,.035,.018,gold)}
    for(let i=0;i<8;i++){this.box(-1.96+i*.14,.39,.08,.052,.08,.04,dark);this.cylinder(-1.96+i*.14,.48,.08,.018,.035,.018,gold)}
    /* Sarı RED Kit breadboard: güç rayları, orta kanal ve yoğun bağlantı delikleri. */
    this.box(.18,.24,-.34,.92,.085,.68,yellow,"temp");
    this.box(.18,.34,-.34,.055,.026,.65,[.72,.46,.04]);
    this.box(.18,.343,-.93,.82,.01,.012,red);this.box(.18,.343,.25,.82,.01,.012,[.1,.35,.78]);
    for(let row=0;row<6;row++)for(let col=0;col<14;col++){const x=-.57+col*.115,z=-.78+row*.175;this.cylinder(x,.36,z,.017,.012,.017,dark)}
    for(let col=0;col<14;col++){const x=-.57+col*.115;this.cylinder(x,.36,-.98,.017,.012,.017,dark);this.cylinder(x,.36,.31,.017,.012,.017,dark)}
    /* Breadboard üzerindeki LED, direnç ve fiziksel bacaklar. */
    this.cylinder(.63,.45,-.22,.055,.09,.055,state.sim.led?[1,.22,.08]:[.62,.08,.06],"led");this.sphere(.63,.58,-.22,.075,.11,.075,state.sim.led?[1,.3,.1]:[.62,.08,.06],"led");
    this.box(.58,.39,-.22,.012,.15,.012,silver);this.box(.69,.39,-.22,.012,.15,.012,silver);
    this.box(.02,.47,-.22,.25,.045,.045,[.82,.68,.42]);this.box(-.12,.475,-.22,.018,.052,.052,red);this.box(.02,.475,-.22,.018,.052,.052,[.15,.1,.05]);this.box(.16,.475,-.22,.018,.052,.052,gold);
    this.box(-.34,.43,-.22,.12,.012,.012,silver);this.box(.38,.43,-.22,.12,.012,.012,silver);
    const colors=[[.86,.08,.08],[.92,.42,.04],[.95,.78,.08],[.22,.7,.2],[.08,.48,.88],[.66,.18,.82]];colors.forEach((c,i)=>{const x=-1.82+i*.26;this.box(x,.25,.66,.11,.035,.11,dark);this.cylinder(x,.35,.66,.07,.07,.07,i===0&&state.sim.led?[.75,1,.3]:c,"led");this.sphere(x,.46,.66,.075,.105,.075,i===0&&state.sim.led?[.82,1,.38]:c,"led");this.box(x,.2,.84,.055,.008,.01,white)});
    for(let i=0;i<4;i++){this.box(.1+i*.34,.27,.7,.14,.06,.14,white);this.box(.1+i*.34,.37,.7,.085,.055,.085,[.18,.22,.2])}this.cylinder(1.72,.38,.68,.18,.15,.18,[.2,.22,.2],"light");this.box(2.16,.32,.67,.2,.13,.13,red);
    /* Gerçek RED Kit düzenindeki alt kumandalar ve sağ LCD modülü. */
    const buttonColors=[[.86,.08,.08],[.95,.72,.04],[.86,.08,.08],[.85,.08,.08]];buttonColors.forEach((c,i)=>{const x=-1.55+i*.48;this.box(x,.27,1.25,.23,.08,.23,dark);this.cylinder(x,.39,1.25,.18,.1,.18,c);this.sphere(x,.48,1.25,.16,.055,.16,c)});
    this.box(.6,.27,1.22,.22,.08,.22,dark);this.cylinder(.6,.39,1.22,.18,.1,.18,[.75,.08,.08]);this.sphere(.6,.48,1.22,.16,.055,.16,[.82,.1,.08]);
    this.box(1.15,.27,1.2,.21,.08,.21,dark);this.cylinder(1.15,.43,1.2,.16,.16,.16,[.14,.16,.15]);this.cylinder(1.15,.61,1.2,.09,.08,.09,[.48,.49,.46]);
    this.box(1.92,.29,.88,.6,.075,.51,blue,"lcd");this.box(1.92,.395,.88,.49,.038,.36,[.55,.63,.5],"lcd-frame");this.box(1.92,.438,.88,.4,.012,.27,[.17,.25,.2],"lcd");
    [[1.44,.48],[2.4,.48],[1.44,1.28],[2.4,1.28]].forEach(([x,z])=>this.cylinder(x,.405,z,.035,.018,.035,silver,"silver"));
    this.cylinder(.75,.34,-1.2,.2,.13,.2,[.12,.14,.13]);this.cylinder(.75,.48,-1.2,.13,.02,.13,[.04,.05,.05]);
    this.cylinder(-2.28,.34,.85,.11,.08,.11,white);this.sphere(-2.28,.46,.85,.1,.09,.1,[.88,.91,.9]);
    this.box(1.65,.24,-.64,.62,.07,.4,green,"distance");this.cylinder(1.38,.42,-.64,.2,.14,.2,silver,"distance");this.cylinder(1.92,.42,-.64,.2,.14,.2,silver,"distance");
    for(let i=0;i<7;i++){this.box(-1.8+i*.57,.27,-1.3,.2,.11,.13,i<3?red:green,i===6?"motor":"");this.box(-1.9+i*.57,.39,-1.3,.035,.035,.035,gold)}this.box(1.75,.24,.08,.72,.07,.18,dark);for(let i=0;i<10;i++)this.box(1.15+i*.13,.35,.08,.025,.09,.025,gold);this.box(2.23,.3,-.02,.18,.16,.25,[.08,.16,.12],"driver");
    if(this.canvas.id==="labCanvas"){this.drawConnections();this.updatePinLabels();this.updateCallouts()}
  }
}

const renderers = [new DetailedKitRenderer($("#heroCanvas"), .88), new DetailedKitRenderer($("#labCanvas"), .92), new DetailedKitRenderer($("#kitCanvas"), 1)].filter((r) => r.gl);
if (!renderers.length) { $("#labCanvas").hidden = true; $("#fallbackBoard").hidden = false; $("#viewMode").textContent = "WebGL kullanılamıyor"; }

function loop(time) {
  if (state.running) {
    const program = parseProgram(currentCode());
    if (program.ok) {
      state.sim.wired = checkConnections(currentMission(), currentConnections()).ok;
      state.sim = computeFrame({ mission: currentMission(), env: state.env, program, previous: state.sim, elapsed: time - state.startTime });
      updateOutputs();
      if (!loop.lastLog || time - loop.lastLog > 1000) { state.serial.push(`[${new Date().toLocaleTimeString("tr-TR")}] ${state.sim.serialValue}`); renderSerial(); loop.lastLog = time; }
    }
  }
  renderers.forEach((r) => r.draw(time));
  requestAnimationFrame(loop);
}

function init() {
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
  $("#viewMode").addEventListener("click", () => { state.view3d = !state.view3d; $("#labCanvas").hidden = !state.view3d; $("#fallbackBoard").hidden = state.view3d; $("#viewMode").textContent = state.view3d ? "2D Görünüm" : "3D Görünüm"; });
  $("#guideToggle").addEventListener("click", () => { const list=$("#connectionGuide");list.hidden=!list.hidden;$("#guideToggle").textContent=list.hidden?"Rehberi Aç":"Rehber Açık"; });
  $("#resetCamera").addEventListener("click", () => renderers.forEach((r) => { r.rx=-.62;r.ry=-.58;r.zoom=6.4; })); $("#topView").addEventListener("click", () => renderers.forEach((r) => { r.rx=-1.48;r.ry=0;r.zoom=6.7; }));
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

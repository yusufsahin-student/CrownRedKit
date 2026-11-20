import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { missions } from "./dist/missions.js";
import { parseProgram, checkConnections, computeFrame, runMissionTests } from "./dist/simulator.js";

assert.equal(missions.length, 10, "Tam olarak 10 görev bulunmalı");
assert.deepEqual(missions.map((m) => m.id), [1,2,3,4,5,6,7,8,9,10], "Görev kimlikleri sıralı olmalı");
for (const mission of missions) {
  assert.ok(mission.story && mission.skill && mission.starter, `Görev ${mission.id} eğitim içeriği eksik`);
  assert.equal(mission.hints.length, 3, `Görev ${mission.id} üç ipucu içermeli`);
  assert.ok(mission.connections.length > 0, `Görev ${mission.id} bağlantı modeli içermeli`);
}

assert.equal(parseProgram("while(true){}").ok, false, "Sonsuz döngü reddedilmeli");
assert.equal(parseProgram("eval('x')").ok, false, "eval reddedilmeli");
assert.equal(parseProgram("int lightThreshold = 42;").config.lightThreshold, 42, "Eşik koddan ayrıştırılmalı");

const mission7 = missions[6];
assert.equal(checkConnections(mission7, []).ok, false, "Eksik devre reddedilmeli");
assert.equal(checkConnections(mission7, mission7.connections).ok, true, "Doğru devre kabul edilmeli");

const p7 = parseProgram(mission7.solution);
let sim = { led:false, fan:false, count:0, wasInside:false, tankLevel:0, wired:true };
sim = computeFrame({ mission: mission7, env:{light:50,temperature:24,distance:20}, program:p7, previous:sim, elapsed:0 });
sim = computeFrame({ mission: mission7, env:{light:50,temperature:24,distance:20}, program:p7, previous:sim, elapsed:20 });
assert.equal(sim.count, 1, "Sensör önünde bekleyen nesne bir kez sayılmalı");
sim = computeFrame({ mission: mission7, env:{light:50,temperature:24,distance:80}, program:p7, previous:sim, elapsed:30 });
sim = computeFrame({ mission: mission7, env:{light:50,temperature:24,distance:20}, program:p7, previous:sim, elapsed:40 });
assert.equal(sim.count, 2, "Yeni geçiş yeniden sayılmalı");

const mission8 = missions[7];
const p8 = parseProgram(mission8.solution);
assert.ok(p8.config.fanOnTemp > p8.config.fanOffTemp, "Histerezis eşikleri doğru sıralanmalı");
const test8 = runMissionTests(mission8, p8, true);
assert.ok(test8.every((test) => test.pass), "Görev 8 çözümü bütün testleri geçmeli");

const html = await readFile(new URL("./dist/index.html", import.meta.url), "utf8");
const refinements = await readFile(new URL("./dist/refinements.css", import.meta.url), "utf8");
const app = await readFile(new URL("./dist/app.js", import.meta.url), "utf8");
assert.match(html, /3D Laboratuvar/);
assert.match(html, /Doğa Günlüğüm/);
assert.match(html, /refinements\.css/);
assert.match(refinements, /nav button::after \{ display: none; \}/, "Navigasyon aktif durumu alt çizgi kullanmamalı");
assert.match(refinements, /pointer-events: none/, "Üst katmanlar model hitbox'ını engellememeli");
assert.match(app, /class DetailedKitRenderer/, "Ayrıntılı RED Kit WebGL modeli bulunmalı");
assert.match(app, /this\.cylinder\(1\.38/, "Ultrasonik sensör geometrisi bulunmalı");
assert.match(app, /this\.rx=wrap\(/, "Dikey eksen tam 360 derece dönebilmelidir");
assert.doesNotMatch(app, /this\.rx=Math\.max\(-1\.48/, "Dikey dönüş yarım küreyle sınırlandırılmamalı");
assert.match(app, /drawConnections\(\)/, "Bağlantılar 3B sahnede çizilmelidir");
assert.match(app, /hitPin\(event\)/, "Model uçları doğrudan seçilebilir olmalıdır");
assert.doesNotMatch(html, /Karta yükle/i, "Gerçek donanım olmadan karta yükleme sunulmamalı");

console.log("✓ 10 görev ve veri yapısı");
console.log("✓ Güvenli kod ayrıştırma sınırları");
console.log("✓ Bağlantı doğrulama");
console.log("✓ Tek geçiş / tek kayıt durum mantığı");
console.log("✓ Histerezis ve görev testleri");
console.log("✓ Arayüz ve donanım kapsamı");
console.log("✓ Alt çizgisiz aktif durumlar ve güvenli model hitbox'ları");
console.log("✓ Ayrıntılı WebGL RED Kit geometrisi");
console.log("✓ 360° × 360° model dönüşü");
console.log("✓ Model üzerinde seçilebilir uçlar ve görünür 3B kablolar");
console.log("Canopy BioCore doğrulaması başarıyla tamamlandı.");

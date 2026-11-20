const numberPattern = (name) => new RegExp(`(?:int|float|double)\\s+${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, "i");

export function parseProgram(code) {
  const forbidden = [/\beval\b/i, /new\s+Function/i, /while\s*\(\s*true\s*\)/i, /for\s*\(\s*;\s*;/i, /#include/i, /\bmalloc\b/i, /\bdelete\b/i];
  const hit = forbidden.find((pattern) => pattern.test(code));
  if (hit) return { ok: false, error: "Desteklenmeyen veya güvenli olmayan bir yapı kullanıldı." };
  if (code.length > 6000) return { ok: false, error: "Program eğitim yorumlayıcısının 6000 karakter sınırını aşıyor." };

  const read = (name, fallback) => {
    const match = code.match(numberPattern(name));
    return match ? Number(match[1]) : fallback;
  };
  return {
    ok: true,
    config: {
      blinkMs: Math.max(100, Math.min(5000, read("blinkMs", 500))),
      lightThreshold: Math.max(0, Math.min(100, read("lightThreshold", 38))),
      minTemp: read("minTemp", 16),
      maxTemp: read("maxTemp", 30),
      nearCm: Math.max(1, Math.min(300, read("nearCm", 35))),
      fanOnTemp: read("fanOnTemp", 30),
      fanOffTemp: read("fanOffTemp", 27),
      tankDepth: Math.max(10, Math.min(300, read("tankDepth", 100)))
    },
    features: {
      led: /digitalWrite\s*\(\s*LED/i.test(code) || /\bled\s*=\s*true/i.test(code),
      light: /\blight\b|LIGHT|analogRead/i.test(code),
      temperature: /temperature|readTemperature/i.test(code),
      distance: /\bdistance\b|nearCm/i.test(code),
      serial: /Serial\.println/i.test(code),
      state: /wasInside|\bcount\+\+/i.test(code),
      fan: /\bfan\b|fanOnTemp|MOTOR/i.test(code),
      level: /\blevel\b|tankDepth|constrain/i.test(code)
    }
  };
}

export function normalizeConnection(a, b) {
  return [String(a), String(b)].sort().join("::");
}

export function checkConnections(mission, connections) {
  const actual = new Set(connections.map(([a, b]) => normalizeConnection(a, b)));
  const missing = mission.connections.filter(([a, b]) => !actual.has(normalizeConnection(a, b)));
  return { ok: missing.length === 0, missing };
}

export function computeFrame({ mission, env, program, previous, elapsed }) {
  const c = program.config;
  const wired = previous.wired;
  const blinkOn = Math.floor(elapsed / c.blinkMs) % 2 === 0;
  const lightDark = env.light < c.lightThreshold;
  const outOfRange = env.temperature < c.minTemp || env.temperature > c.maxTemp;
  let fan = previous.fan;
  if (env.temperature >= c.fanOnTemp) fan = true;
  else if (env.temperature <= c.fanOffTemp) fan = false;
  const inside = env.distance < c.nearCm;
  let count = previous.count;
  if (inside && !previous.wasInside && program.features.state) count += 1;
  const tankLevel = Math.max(0, Math.min(100, Math.round((1 - env.distance / c.tankDepth) * 100)));

  let led = false;
  if (mission.id === 1) led = blinkOn;
  if (mission.id === 3) led = lightDark;
  if (mission.id === 5) led = outOfRange;
  if (mission.id === 9) led = tankLevel < 25;
  if (mission.id === 10) led = lightDark;
  if (!program.features.led || !wired) led = false;
  if (![8, 10].includes(mission.id) || !program.features.fan || !wired) fan = false;

  const serialValue = mission.id <= 3 ? `Işık: ${env.light}%` : mission.id <= 5 ? `Sıcaklık: ${env.temperature.toFixed(1)} °C` : mission.id === 9 ? `Depo: %${tankLevel}` : `Mesafe: ${env.distance} cm`;
  return { ...previous, led, fan, count, wasInside: inside, tankLevel, serialValue };
}

export function runMissionTests(mission, program, wired) {
  const results = [];
  const add = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail });
  add("Devre bağlantısı", wired, wired ? "Gerekli sanal bağlantılar tamamlandı." : "Eksik bağlantılar davranışı engelliyor.");
  add("Kod ayrıştırma", program.ok, program.ok ? "Program güvenli eğitim alt kümesiyle uyumlu." : program.error);
  if (!program.ok) return results;
  const f = program.features;
  const c = program.config;
  if ([1, 3, 5, 9, 10].includes(mission.id)) add("LED davranışı", f.led, f.led ? "LED çıktısı kodda bulundu." : "digitalWrite(LED, ...) veya led durumu eksik.");
  if ([2, 3, 10].includes(mission.id)) add("Işık girdisi", f.light, f.light ? "Işık değeri kullanılıyor." : "Işık sensörü değeri kodda kullanılmıyor.");
  if ([4, 5, 8, 10].includes(mission.id)) add("Sıcaklık girdisi", f.temperature, f.temperature ? "Sıcaklık değeri kullanılıyor." : "Sıcaklık girdisi eksik.");
  if ([6, 7, 9, 10].includes(mission.id)) add("Mesafe girdisi", f.distance, f.distance ? "Mesafe değeri kullanılıyor." : "Mesafe girdisi eksik.");
  if (mission.id === 1) add("Zamanlama", c.blinkMs >= 100 && c.blinkMs <= 2000, `blinkMs = ${c.blinkMs}`);
  if (mission.id === 3) add("Karanlık eşiği", c.lightThreshold > 10 && c.lightThreshold < 80, `Eşik = ${c.lightThreshold}%`);
  if (mission.id === 5) add("Sıcaklık aralığı", c.minTemp < c.maxTemp, `${c.minTemp}–${c.maxTemp} °C`);
  if (mission.id === 7) add("Tekil geçiş durumu", f.state, f.state ? "Önceki durum/sayaç mantığı bulundu." : "wasInside veya count++ mantığı eksik.");
  if ([8, 10].includes(mission.id)) {
    add("Motor sürücü mantığı", f.fan, f.fan ? "Fan durumu sıcaklıkla ilişkilendirildi." : "Fan kontrolü eksik.");
    add("Histerezis", c.fanOnTemp > c.fanOffTemp, `Aç: ${c.fanOnTemp} °C / Kapat: ${c.fanOffTemp} °C`);
  }
  if (mission.id === 9) add("Seviye hesabı", f.level, f.level ? "Mesafeden doluluk türetiliyor." : "level/constrain hesabı eksik.");
  if ([2, 4, 6].includes(mission.id)) add("Seri gözlem", f.serial, f.serial ? "Seri monitör çıktısı bulundu." : "Serial.println eksik.");
  return results;
}

import assert from 'node:assert/strict';
import {compileSketch,SketchRuntime} from '../dist/execution.js';
import {checkConnections} from '../dist/simulator.js';
import {missions} from '../dist/missions.js';
import {readFile} from 'node:fs/promises';
const env={light:62,temperature:24,distance:80};
const create=code=>{const program=compileSketch(code);assert.ok(program.ok,program.error);return new SketchRuntime(program);};
for(const m of missions)for(const code of [m.starter,m.solution]){const runtime=create(code);for(let i=0;i<60;i++)runtime.step(env);}
const blink=create('int blinkMs=250;\nvoid loop(){\ndigitalWrite(LED,HIGH);\ndelay(blinkMs);\ndigitalWrite(LED,LOW);\ndelay(blinkMs);\n}');
blink.step(env);assert.equal(blink.step(env).line,3);assert.equal(blink.vars.led,true);
blink.step(env);assert.equal(blink.wait,250);
blink.advance(100,env);assert.equal(blink.vars.led,true);assert.equal(blink.wait,150);
blink.advance(150,env);assert.equal(blink.vars.led,false);assert.equal(blink.last.line,5);
const reverse=create('void loop(){digitalWrite(LED,LOW);delay(100);digitalWrite(LED,HIGH);delay(100);}');
reverse.step(env);assert.equal(reverse.vars.led,false);reverse.step(env);reverse.step(env);assert.equal(reverse.vars.led,true);
const condition=create('if(light < 40) digitalWrite(LED,HIGH); else digitalWrite(LED,LOW);');
assert.equal(condition.step(env).value,false);condition.step(env);assert.equal(condition.vars.led,false);
condition.step(env);condition.step({...env,light:10});condition.step({...env,light:10});assert.equal(condition.vars.led,true);
const count=create(missions[6].solution);for(let i=0;i<30;i++)count.step({...env,distance:10});assert.equal(count.vars.count,1);
for(let i=0;i<15;i++)count.step({...env,distance:80});for(let i=0;i<15;i++)count.step({...env,distance:10});assert.equal(count.vars.count,2);
const serial=create('int light=analogRead(LIGHT); Serial.println(light);');serial.step(env);serial.step(env);assert.deepEqual(serial.events,['634']);
for(const code of ['while(true){}','eval("x");','if (true {','digitalWrite(LED, HIGH)'])assert.equal(compileSketch(code).ok,false);
assert.throws(()=>create('Serial.println(missing);').step(env),/Tanımsız/);
const mission=missions[0];assert.equal(checkConnections(mission,mission.connections).ok,true);
assert.equal(checkConnections(mission,[...mission.connections,['5V','GND']]).ok,false);
assert.equal(checkConnections(mission,[['5V','A0'],['A0','GND']]).shortCircuit,true);
assert.equal(checkConnections(mission,[...mission.connections,['D2','D5']]).unexpected.length,1);
assert.equal(blink.frame({led:true},false).led,false);
for(const file of ['index.html','app.js','missions.js','execution.js','surface-art.js']){
  const bytes=await readFile(new URL(`../dist/${file}`,import.meta.url));
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert.ok(!/[\uFFFD\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text),`${file}: broken text`);
}
console.log('Execution checks passed: 20 sketches, real branches, edited blink, delay, source lines, counter, serial output and wiring faults.');

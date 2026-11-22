import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the actual mesh generation and projection math without a GPU.
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const buffers=[];
const gl=new Proxy({COMPILE_STATUS:1,LINK_STATUS:2,bufferData:(_,data)=>buffers.push([...data]),getShaderParameter:()=>true,getProgramParameter:()=>true,createProgram:()=>({}),createShader:()=>({}),getAttribLocation:()=>0,getUniformLocation:()=>({})},{get:(target,key)=>target[key]??(()=>({}))});
const context=vm.createContext({console,Float32Array,SurfaceArt:class {},paintKitArtwork:()=>{},state:{sim:{led:false}}});
const start=source.indexOf('class DetailedKitRenderer');
const end=source.indexOf('\nconst renderers',start);
vm.runInContext(source.slice(start,end)+'\nglobalThis.Renderer=DetailedKitRenderer;',context);
const renderer=new context.Renderer({getContext:()=>gl,addEventListener:()=>{},style:{},width:1000,height:700,getBoundingClientRect:()=>({width:1000,height:700})},1);
assert.ok(renderer.gl,'Renderer initialization failed');
for(const [meshIndex,mesh] of buffers.entries()){
  for(let i=0;i<mesh.length;i+=18){
    const a=mesh.slice(i,i+3),b=mesh.slice(i+6,i+9),c=mesh.slice(i+12,i+15),n=mesh.slice(i+3,i+6);
    const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert.ok(cross.reduce((sum,val,j)=>sum+val*n[j],0)>=-1e-7,`Inward-facing triangle in mesh ${meshIndex}`);
  }
}
renderer.focus=[.87,.3,-.66];renderer.zoom=3.1;
const center=renderer.project(renderer.focus);
assert.ok(renderer.rotation()[5]>0,'Default camera must see the top surface, not the underside');
renderer.focus=null;renderer.rx=-Math.PI/2;renderer.ry=0;renderer.solidBounds=[[-1,-.1,-1,1,.1,1]];
assert.equal(renderer.pointVisible([0,.3,0]),true,'Top pin must be visible');
assert.equal(renderer.pointVisible([0,-.3,0]),false,'Board must hide a pin behind it');
renderer.focus=[.87,.3,-.66];
assert.ok(Math.abs(center[0]-500)<.001&&Math.abs(center[1]-350)<.001,'Focused part must project to viewport center');
let parts=0; const solids=[];
renderer.part=(mesh,...args)=>{assert.ok(args.slice(0,6).every(Number.isFinite),'Invalid geometry transform');assert.ok(args.slice(3,6).every(v=>v>0),'Degenerate solid');parts++;solids.push({mesh,args});};
renderer.drawHighDetailModel();
assert.ok(parts>600,'Reference model geometry missing');
assert.equal(solids.filter(s=>s.mesh==='sphere'&&s.args[0]===-2.45&&s.args[1]===.405).length,6,'Six LED domes must follow the reference');
assert.equal(solids.filter(s=>s.mesh==='sphere'&&s.args[1]===.38).length,4,'Reference has four push buttons');
assert.ok(solids.some(s=>s.mesh==='cube'&&s.args[0]===1.17&&s.args[3]===.16&&s.args[5]===.16),'UNO needs square SMD processor');
assert.ok(solids.some(s=>s.mesh==='plate'),'Shaped main board is missing');
console.log(`Renderer checks passed: outward faces, focus projection, ${parts} finite solid parts.`);

let breadboardWires=0;
renderer.cableBetween=()=>{breadboardWires++;};
renderer.drawBreadboard({red:[1,0,0],metal:[1,1,1]});
assert.equal(breadboardWires,0,'Breadboard must start without pre-drawn jumper wires');
renderer.moduleIds=new Set(['pir']);renderer.accessories=false;
assert.equal(renderer.hasAccessory('pir'),true);
assert.equal(renderer.hasAccessory('rfid'),false);
renderer.moduleIds.delete('pir');assert.equal(renderer.hasAccessory('pir'),false);
renderer.accessories=true;assert.equal(renderer.hasAccessory('rfid'),true);

renderer.rx=-Math.PI/2;renderer.ry=0;renderer.focus=null;renderer.zoom=7;
for(const id of ['uno','breadboard','lcd']){const region=renderer.hoverRegions().find(r=>r.id===id);const point=renderer.project([region.x,region.y,region.z]);assert.equal(renderer.pickRegion(...point)?.id,id,'Hover must follow projected '+id);}
assert.equal(renderer.pickRegion(-100,-100),null);
renderer.rx=Math.PI/2;assert.equal(renderer.pickRegion(500,350),null,'Back face must not expose top component hover');

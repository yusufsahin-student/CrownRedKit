// Original, locally drawn PCB silkscreen and display artwork. No remote assets.
export class SurfaceArt {
  constructor(gl) {
    this.gl = gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    this.program = gl.createProgram();
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, `attribute vec2 p; uniform mat4 m; varying vec2 uv; void main(){uv=vec2((p.x+1.0)*.5,(p.y+1.0)*.5);gl_Position=m*vec4(p.x,0.0,p.y,1.0);}`));
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D art; varying vec2 uv; void main(){vec4 c=texture2D(art,uv);if(c.a<.5)discard;gl_FragColor=c;}`));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    this.p = gl.getAttribLocation(this.program, 'p'); this.m = gl.getUniformLocation(this.program, 'm');
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,-1,1,1,1,-1,-1,1,1,1,-1]),gl.STATIC_DRAW);
    this.textures = new Map();
  }
  create(key, painter, width=1024, height=512) {
    const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d'); painter(ctx,width,height);
    const gl=this.gl, texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);
    this.textures.set(key,texture);
  }
  draw(renderer,key,x,y,z,sx,sz) {
    const gl=this.gl;gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.enableVertexAttribArray(this.p);gl.vertexAttribPointer(this.p,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures.get(key));
    const s=renderer.scale;gl.uniformMatrix4fv(this.m,false,renderer.matrix(x*s,y*s,z*s,sx*s,1,sz*s));
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
}

export function paintKitArtwork(art) {
  const text=(ctx,label,x,y,size=24,color='#e5e9dc')=>{ctx.fillStyle=color;ctx.font=`600 ${size}px monospace`;ctx.textAlign='center';ctx.fillText(label,x,y);};
  art.create('base',(c,w,h)=>{
    c.scale(w/1024,h/512);
    c.strokeStyle='#61776d';c.lineWidth=2;
    // Labels occupy the clear areas between physical components.
    for(let i=0;i<6;i++)text(c,`LED ${i+1}`,115,96+i*45,15);
    text(c,'RGB',67,390,18);text(c,'RED KIT',520,342,56);text(c,'ROBOTİK DENEY PLATFORMU',520,370,17);
    text(c,'BREADBOARD',280,300,21);text(c,'BUZZER',474,35,16);
    ['BUTON 1','BUTON 2','BUTON 3','BUTON 4','ANAHTAR','POT'].forEach((s,i)=>text(c,s,162+i*90,486,15));
    text(c,'LCD EKRAN',864,485,22);
    for(let i=0;i<6;i++){c.strokeRect(160+i*80,10,58,32);text(c,['LDR','ISI','IR','SERVO','MOTOR','GÜÇ'][i],189+i*80,31,13);}
  },2048,1024);
  // Draw in a fixed logical coordinate system, so all lettering remains crisp.
  // Base artwork uses a 1024 x 512 logical board.
  // The larger texture is rescaled below by its drawing context where needed.
  art.create('uno',(c,w,h)=>{
    c.scale(w/1000,h/650);
    c.strokeStyle='#4db5ba';c.lineWidth=2;
    for(let i=0;i<18;i++){const x=60+i*47;c.beginPath();c.moveTo(x,100);c.lineTo(x,170+(i%4)*20);c.lineTo(x+30,200+(i%4)*20);c.lineTo(x+30,410);c.stroke();}
    text(c,'UNO',710,420,70);text(c,'ARDUINO',720,475,25);
    text(c,'DIGITAL  (PWM ~)',410,130,20);text(c,'ANALOG IN',270,540,22);text(c,'POWER',655,540,22);
    for(let i=0;i<14;i++)text(c,String(13-i),90+i*51,75,19);
    ['A0','A1','A2','A3','A4','A5','3V3','5V','GND','VIN'].forEach((v,i)=>text(c,v,90+i*75,600,18));
    text(c,'RESET',125,410,18);text(c,'ON',770,225,18);text(c,'TX',770,265,16);text(c,'RX',770,300,16);
    c.strokeStyle='#fff';c.lineWidth=5;c.beginPath();c.ellipse(715,350,36,18,0,0,Math.PI*2);c.ellipse(778,350,36,18,0,0,Math.PI*2);c.stroke();
  });
  art.create('chip',(c,w,h)=>{text(c,'ATMEL',w/2,h*.3,52);text(c,'ATMEGA328P-PU',w/2,h*.56,74);text(c,'16 MHz · MCU',w/2,h*.8,42);},1024,256);
  art.create('breadboard',(c,w,h)=>{
    c.scale(w/1000,h/600);
    for(let i=0;i<17;i++)text(c,String(i+1),62+i*55,34,18,'#73520c');
    'ABCDE'.split('').forEach((s,i)=>text(c,s,25,90+i*43,19,'#73520c'));
    'FGHIJ'.split('').forEach((s,i)=>text(c,s,25,370+i*43,19,'#73520c'));
    c.strokeStyle='#b9851b';c.lineWidth=2;c.strokeRect(12,48,976,236);c.strokeRect(12,316,976,270);
  });
  art.create('lcd',(c,w,h)=>{c.fillStyle='#a1b58a';c.fillRect(0,0,w,h);c.strokeStyle='#728761';c.lineWidth=1;for(let x=0;x<w;x+=8){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=8){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}text(c,'RED KIT',w/2,h*.35,68,'#263b26');text(c,'DENEY EKRANI',w/2,h*.62,45,'#263b26');text(c,'HAZIR',w/2,h*.85,38,'#263b26');});
  art.create('dial',(c,w,h)=>{c.translate(w/2,h/2);c.strokeStyle='#f4efe2';c.lineWidth=5;for(let i=0;i<11;i++){const a=(.2+i*.26)*Math.PI;c.beginPath();c.moveTo(Math.cos(a)*170,Math.sin(a)*170);c.lineTo(Math.cos(a)*210,Math.sin(a)*210);c.stroke();}},512,512);
}

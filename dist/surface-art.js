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
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D art; varying vec2 uv; void main(){vec4 c=texture2D(art,uv);if(c.a<.02)discard;gl_FragColor=c;}`));
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
    const anisotropic=gl.getExtension("EXT_texture_filter_anisotropic");if(anisotropic)gl.texParameterf(gl.TEXTURE_2D,anisotropic.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.textures.set(key,texture);
  }
  draw(renderer,key,x,y,z,sx,sz) {
    const gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.enableVertexAttribArray(this.p);gl.vertexAttribPointer(this.p,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures.get(key));
    const s=renderer.scale;gl.uniformMatrix4fv(this.m,false,renderer.matrix(x*s,y*s,z*s,sx*s,1,sz*s));
    gl.drawArrays(gl.TRIANGLES,0,6);gl.depthMask(true);gl.disable(gl.BLEND);
  }
}

export function paintKitArtwork(art) {
 const text=(c,s,x,z,size=16,color='#ecebe3')=>{c.font=`600 ${size}px Arial`;c.fillStyle=color;c.textAlign='center';c.fillText(s,(x+2.72)/5.44*2048,(z+1.63)/3.26*1024);};
 art.create('base',(c)=>{
  c.strokeStyle='#f2f1e9';c.lineWidth=6;c.beginPath();[[-2.68,-1.26],[-.8,-1.26],[-.57,-1.58],[2.65,-1.58],[2.65,1.56],[-2.65,1.56],[-2.68,-1.26]].forEach(([x,z],i)=>{const px=(x+2.72)/5.44*2048,py=(z+1.63)/3.26*1024;i?c.lineTo(px,py):c.moveTo(px,py)});c.stroke();
  for(let i=0;i<6;i++)text(c,'LED '+(i+1),-2.12,-1.06+i*.31,21);
  text(c,'RGB',-2.15,1.0,19);text(c,'BUTON 1',-2.4,1.57,15);text(c,'BUTON 2',-1.86,1.57,15);text(c,'BUTON 3',-1.32,1.57,15);text(c,'BUTON 4',-1.86,.77,15);text(c,'ANAHTAR',-.65,1.04,18);text(c,'POT',.03,1.04,18);
  text(c,'ULTRASONİK',-1.3,-1.08,15);text(c,'IŞIK',-.89,-1.08,15);text(c,'PIR',-.49,-1.08,15);text(c,'BUZZER',.12,-.86,17);text(c,'BUTONLAR',-1.8,.57,14);text(c,'ANAHTAR',-1.4,.57,14);text(c,'POT',-1.07,.57,14);text(c,'ENERJİ',.13,.78,14);text(c,'LED PINLERI',-2.16,-.8,13);
  c.save();c.translate((.57+2.72)/5.44*2048,(.92+1.63)/3.26*1024);c.rotate(-Math.PI/2);c.font='bold 62px Arial';c.fillStyle='#fff';c.fillText('RED•KIT',0,0);c.font='21px Arial';c.fillText('www.red-kit.com',0,28);c.restore();
 },2048,1024);
 art.create('uno',(c,w,h)=>{c.scale(w/1024,h/512);c.strokeStyle='#527496';c.lineWidth=1;for(let i=0;i<28;i++){c.beginPath();c.moveTo(50+i*31,55);c.lineTo(50+i*31,115+(i%4)*15);c.lineTo(80+i*30,165+(i%4)*15);c.lineTo(80+i*30,420);c.stroke();}const t=(s,x,y,size=15)=>{c.fillStyle='#e4e7dc';c.font=`${size}px Arial`;c.textAlign='center';c.fillText(s,x,y);};t('UNO',450,340,54);t('DIGITAL (PWM ~)',450,92,18);t('POWER',230,439,17);t('ANALOG IN',680,439,17);for(let i=0;i<14;i++)t(String(13-i),60+i*60,60,13);for(let i=0;i<6;i++)t('A'+i,670+i*42,471,13);for(let i=0;i<24;i++)t(['R','C','D'][i%3]+(i+1),80+(i%8)*105,135+Math.floor(i/8)*125,10);},2048,1024);
 art.create('chip',(c,w,h)=>{c.fillStyle='#acb3a9';c.textAlign='center';c.font='64px monospace';c.fillText('ATMEL',w/2,h*.36);c.font='44px monospace';c.fillText('MEGA328P',w/2,h*.58);},512,512);
 art.create('lcd',(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#7e8a3e');g.addColorStop(.5,'#a1a75c');g.addColorStop(1,'#6e7b34');c.fillStyle=g;c.fillRect(0,0,w,h);},512,512);
}

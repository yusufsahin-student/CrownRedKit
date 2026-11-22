// Small deterministic Arduino teaching interpreter. No eval or dynamic JS.
const precedence={'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
const functions=new Set(['digitalWrite','analogRead','digitalRead','readTemperature','delay','constrain','Serial.println','Serial.begin','pinMode']);
export function compileSketch(source){
  try {
    if(source.length>6000)throw Error('Kod en fazla 6000 karakter olabilir.');
    const tokens=[];let pos=0,line=1;
    const pattern=/\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|\d+(?:\.\d+)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\+\+|--|<=|>=|==|!=|&&|\|\||[{}();,+\-*/%<>=!]/y;
    while(pos<source.length){pattern.lastIndex=pos;const m=pattern.exec(source);if(!m)throw Error(`Satır ${line}: desteklenmeyen karakter.`);const value=m[0];if(!/^\s|^\/\//.test(value)&&!value.startsWith('/*'))tokens.push({value,line});line+=(value.match(/\n/g)||[]).length;pos=pattern.lastIndex;}
    tokens.push({value:'EOF',line});let i=0;
    const peek=()=>tokens[i].value;
    const take=(v)=>{const t=tokens[i];if(v&&t.value!==v)throw Error(`Satır ${t.line}: '${v}' bekleniyor, '${t.value}' bulundu.`);i++;return t;};
    function expression(min=0){
      let left;const t=take();
      if(['!','-','+'].includes(t.value))left={kind:'unary',op:t.value,arg:expression(7)};
      else if(t.value==='('){left=expression();take(')');}
      else if(/^\d/.test(t.value))left={kind:'literal',value:Number(t.value)};
      else if(t.value.startsWith('"'))left={kind:'literal',value:JSON.parse(t.value)};
      else if(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?$/.test(t.value)){
        if(peek()==='('){if(!functions.has(t.value))throw Error(`Satır ${t.line}: ${t.value} desteklenmiyor.`);take('(');const args=[];if(peek()!==')'){do{args.push(expression());if(peek()!==',')break;take(',');}while(true);}take(')');left={kind:'call',name:t.value,args};}
        else left={kind:'variable',name:t.value};
      }else throw Error(`Satır ${t.line}: geçersiz ifade.`);
      while(precedence[peek()]>=min){const op=take().value;left={kind:'binary',op,left,right:expression(precedence[op]+1)};}
      return left;
    }
    function statement(){
      const line=tokens[i].line;
      if(peek()==='{'){take('{');const body=[];while(peek()!=='}'){if(peek()==='EOF')throw Error('Kapanış süslü parantezi eksik.');body.push(statement());}take('}');return{kind:'block',body,line};}
      if(peek()==='if'){take('if');take('(');const test=expression();take(')');const yes=statement();let no=null;if(peek()==='else'){take('else');no=statement();}return{kind:'if',test,yes,no,line};}
      let type=null;if(['int','float','double','bool','unsigned','long'].includes(peek())){type=take().value;if(type==='unsigned'&&peek()==='long')type+=' '+take().value;}
      if(type){const name=take().value;if(!/^[A-Za-z_]\w*$/.test(name))throw Error('Geçersiz değişken adı.');let value={kind:'literal',value:0};if(peek()==='='){take('=');value=expression();}take(';');return{kind:'declare',type,name,value,line};}
      const value=expression();
      if(['=','++','--'].includes(peek())){if(value.kind!=='variable')throw Error('Atamanın solunda değişken olmalı.');const op=take().value;const right=op==='='?expression():{kind:'binary',op:op==='++'?'+':'-',left:value,right:{kind:'literal',value:1}};take(';');return{kind:'assign',name:value.name,value:right,line};}
      take(';');return{kind:'expression',value,line};
    }
    const globals=[],body=[],setup=[];let loop=null;
    while(peek()!=='EOF'){
      if(peek()==='void'){take('void');const name=take().value;if(!['setup','loop'].includes(name))throw Error('Yalnızca setup ve loop fonksiyonları desteklenir.');take('(');take(')');const node=statement();if(node.kind!=='block')throw Error('Fonksiyon gövdesi gerekli.');if(name==='loop')loop=node.body;else setup.push(...node.body);}
      else{const node=statement();if(node.kind==='declare'&&!JSON.stringify(node.value).includes('"call"'))globals.push(node);else body.push(node);}
    }
    if(!globals.length&&!body.length&&!loop?.length&&!setup.length)throw Error('Çalıştırılabilir kod bulunamadı.');
    return{ok:true,globals,setup,body:loop||body,source};
  }catch(error){return{ok:false,error:error.message};}
}

export class SketchRuntime {
  constructor(program){
    if(!program.ok)throw Error(program.error);
    this.program=program;this.vars={count:0,wasInside:false,led:false,fan:false};this.types={};this.outputs={};this.time=0;this.wait=0;this.cycles=0;this.events=[];
    this.env={light:62,temperature:24,distance:80};this.iterator=this.execute();
  }
  evaluate(n){
    if(n.kind==='literal')return n.value;
    if(n.kind==='variable'){
      const constants={HIGH:1,LOW:0,true:true,false:false,LED:'LED',LIGHT:'LIGHT',MOTOR:'MOTOR',OUTPUT:'OUTPUT',INPUT:'INPUT',INPUT_PULLUP:'INPUT_PULLUP'};
      if(n.name in constants)return constants[n.name];
      if(/^[DA]\d+$/.test(n.name))return n.name;
      if(n.name in this.vars)return this.vars[n.name];
      if(n.name==='light')return this.env.light;
      if(n.name==='temperature')return this.env.temperature;
      if(n.name==='distance')return this.env.distance;
      throw Error(`Tanımsız değişken: ${n.name}`);
    }
    if(n.kind==='unary'){const v=this.evaluate(n.arg);return n.op==='!'?!v:n.op==='-'?-v:+v;}
    if(n.kind==='binary'){
      const a=this.evaluate(n.left);if(n.op==='&&')return a&&this.evaluate(n.right);if(n.op==='||')return a||this.evaluate(n.right);
      const b=this.evaluate(n.right);if(['/','%'].includes(n.op)&&b===0)throw Error('Sıfıra bölme.');
      switch(n.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;case '==':return a===b;case '!=':return a!==b;}
    }
    const args=n.args.map(v=>this.evaluate(v));
    const arity={digitalWrite:2,analogRead:1,digitalRead:1,readTemperature:0,delay:1,constrain:3,'Serial.println':1,'Serial.begin':1,pinMode:2};
    if(args.length!==arity[n.name])throw Error(`${n.name}: ${arity[n.name]} parametre bekleniyor.`);
    switch(n.name){
      case 'digitalWrite':this.outputs[args[0]]=Boolean(args[1]);if(['LED','D3',3].includes(args[0]))this.vars.led=Boolean(args[1]);if(['MOTOR','D9',9].includes(args[0]))this.vars.fan=Boolean(args[1]);return args[1];
      case 'analogRead':if(!['LIGHT','A0',0].includes(args[0]))throw Error('Bu modelde analogRead için LIGHT veya A0 kullan.');return Math.round(this.env.light*1023/100);
      case 'digitalRead':return this.env.distance<35?1:0;
      case 'readTemperature':return this.env.temperature;
      case 'constrain':return Math.max(args[1],Math.min(args[2],args[0]));
      case 'delay':if(!Number.isFinite(args[0])||args[0]<0||args[0]>60000)throw Error('delay 0–60000 ms aralığında olmalı.');this.wait=args[0];return args[0];
      case 'Serial.println':this.events.push(String(args[0]??''));return args[0];
      case 'pinMode':case 'Serial.begin':return 0;
    }
  }
  *nodes(nodes){
    for(const n of nodes){
      if(n.kind==='block'){yield* this.nodes(n.body);continue;}
      if(n.kind==='if'){const decision=Boolean(this.evaluate(n.test));yield{line:n.line,kind:'condition',detail:decision?'Koşul doğru; bu dal çalışacak.':'Koşul yanlış; alternatif dal seçildi.',value:decision};if(decision)yield* this.nodes([n.yes]);else if(n.no)yield* this.nodes([n.no]);continue;}
      const value=this.evaluate(n.value);
      if(n.kind==='declare')this.types[n.name]=n.type;
      if(n.kind==='assign'&&!(n.name in this.vars)&&!['led','fan','count','wasInside'].includes(n.name))throw Error(`Tanımsız değişkene atama: ${n.name}`);
      if(['declare','assign'].includes(n.kind))this.vars[n.name]=this.types[n.name]==='bool'?Boolean(value):['int','long','unsigned long'].includes(this.types[n.name])?Math.trunc(value):value;
      const name=n.value.name;
      yield{line:n.line,kind:name==='delay'?'wait':name==='digitalWrite'?'output':name==='Serial.println'?'serial':'compute',detail:n.name?`${n.name} = ${this.vars[n.name]}`:name==='delay'?`${value} ms bekleme`:name==='digitalWrite'?`LED çıkışı: ${value?'HIGH':'LOW'}`:name==='Serial.println'?`Seri çıktı: ${value}`:'İfade yürütüldü.',value};
    }
  }
  *execute(){yield* this.nodes(this.program.globals);yield* this.nodes(this.program.setup);while(true){yield* this.nodes(this.program.body);this.cycles++;yield{line:0,kind:'cycle',detail:`Döngü ${this.cycles} tamamlandı.`};}}
  step(env){
    this.env={...env};if(this.wait){this.time+=this.wait;this.wait=0;}
    const result=this.iterator.next().value;this.last={...result,time:this.time};return this.last;
  }
  advance(ms,env){
    if(this.wait){const used=Math.min(this.wait,ms);this.wait-=used;this.time+=used;ms-=used;if(this.wait)return this.last;}
    this.time+=ms;return this.step(env);
  }
  frame(previous,wired){return{...previous,wired,led:wired&&Boolean(this.vars.led),fan:wired&&Boolean(this.vars.fan),count:Number(this.vars.count)||0,wasInside:Boolean(this.vars.wasInside),tankLevel:Number(this.vars.level)||0};}
}

function beta12PdfLatin1(bytes){const parts=[];const step=0x8000;for(let i=0;i<bytes.length;i+=step)parts.push(String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length))));return parts.join('');}
function beta12PdfObjectTable(bytes){
  /* Percorre objetos de topo sem interpretar bytes binários de streams como marcadores obj/endobj. */
  const s=beta12PdfLatin1(bytes),objects=new Map();
  const re=/(\d+)\s+(\d+)\s+obj\b/g;let m,guard=0;
  while((m=re.exec(s))&&guard++<200000){
    const start=m.index,bodyStart=re.lastIndex,firstEnd=s.indexOf('endobj',bodyStart);
    const prefixEnd=firstEnd<0?s.length:firstEnd,prefix=s.slice(bodyStart,prefixEnd);
    const sm=/\bstream(?:\r\n|\n|\r)/.exec(prefix);let end=firstEnd;
    if(sm){
      const dict=s.slice(bodyStart,bodyStart+sm.index),dataStart=bodyStart+sm.index+sm[0].length;
      const lm=dict.match(/\/Length\s+(\d+)\b(?!\s+\d+\s+R)/);let endStream=-1;
      if(lm){
        const dataEnd=dataStart+Number(lm[1]);
        if(Number.isSafeInteger(dataEnd)&&dataEnd>=dataStart&&dataEnd<=s.length){
          let token=dataEnd;
          if(s.slice(token,token+2)==='\r\n')token+=2;
          else if(s[token]==='\r'||s[token]==='\n')token++;
          if(s.slice(token,token+9)==='endstream')endStream=token;
          else {const fallback=s.indexOf('endstream',dataEnd);if(fallback>=0)endStream=fallback;}
        }
      }else endStream=s.indexOf('endstream',dataStart);
      if(endStream>=0)end=s.indexOf('endobj',endStream+9);
    }
    if(end<0)break;
    const num=Number(m[1]),gen=Number(m[2]);
    objects.set(num,{num,gen,raw:s.slice(start,end),body:s.slice(bodyStart,end),start,end});
    re.lastIndex=end+6;
  }
  return {s,objects};
}
function beta12PdfRefs(text){const out=[];const re=/(\d+)\s+(\d+)\s+R\b/g;let m;while((m=re.exec(text)))out.push(Number(m[1]));return out;}
function beta12PdfDict(text,key){const re=new RegExp('\\/'+key+'\\s+([^\\r\\n]+)');const m=text.match(re);return m?m[1].trim():'';}
function beta12PdfStreamBytes(obj,objects){
  const marker=/\bstream\r?\n/.exec(obj.body);if(!marker)return null;
  const dataStart=marker.index+marker[0].length,endMarker=obj.body.indexOf('endstream',dataStart);if(endMarker<0)return null;
  let byteLength=null;const lm=obj.body.match(/\/Length\s+(\d+)\b(?!\s+\d+\s+R)/);
  if(lm)byteLength=Number(lm[1]);
  else {const lr=obj.body.match(/\/Length\s+(\d+)\s+\d+\s+R/);if(lr&&objects){const lenObj=objects.get(Number(lr[1]));const n=lenObj?.body.match(/^\s*(\d+)\s*$/);if(n)byteLength=Number(n[1]);}}
  let raw;
  if(Number.isFinite(byteLength)&&byteLength>=0&&dataStart+byteLength<=obj.body.length)raw=obj.body.slice(dataStart,dataStart+byteLength);
  else {let dataEnd=endMarker;while(dataEnd>dataStart&&(obj.body[dataEnd-1]==='\n'||obj.body[dataEnd-1]==='\r'))dataEnd--;raw=obj.body.slice(dataStart,dataEnd);}
  if(!raw.length)return null;const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i)&255;return bytes;
}
function beta12Ascii85Decode(bytes){
  const s=beta12PdfLatin1(bytes).replace(/\s+/g,'').replace(/^<~/,'').replace(/~>$/,'');const out=[];let group=[];
  for(let i=0;i<s.length;i++){const c=s[i];if(c==='z'&&group.length===0){out.push(0,0,0,0);continue;}if(c==='~')break;const v=c.charCodeAt(0)-33;if(v<0||v>84)continue;group.push(v);if(group.length===5){let n=0;for(const x of group)n=n*85+x;out.push((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);group=[];}}
  if(group.length>1){const n0=group.length;while(group.length<5)group.push(84);let n=0;for(const x of group)n=n*85+x;for(let i=0;i<n0-1;i++)out.push((n>>>(24-8*i))&255);}return new Uint8Array(out);
}
function beta12AsciiHexDecode(bytes){
  let hex=beta12PdfLatin1(bytes).replace(/%[^\r\n]*/g,'').replace(/\s+/g,'');
  const end=hex.indexOf('>');if(end>=0)hex=hex.slice(0,end);if(hex.length%2)hex+='0';
  return beta12HexBytes(hex);
}
function beta12RunLengthDecode(bytes){
  const out=[];for(let i=0;i<bytes.length;){const n=bytes[i++];if(n===128)break;if(n<=127){const count=n+1;for(let j=0;j<count&&i<bytes.length;j++)out.push(bytes[i++]);}else{const count=257-n;if(i>=bytes.length)break;const value=bytes[i++];for(let j=0;j<count;j++)out.push(value);}}
  return new Uint8Array(out);
}
function beta12LzwDecode(bytes,earlyChange=1){
  let bit=0,width=9,next=258,prev=null;const dict=[];const reset=()=>{dict.length=4096;for(let i=0;i<256;i++)dict[i]=new Uint8Array([i]);dict[256]=null;dict[257]=null;next=258;width=9;prev=null;};
  reset();const read=()=>{if(bit+width>bytes.length*8)return -1;let value=0;for(let j=0;j<width;j++,bit++)value=(value<<1)|((bytes[bit>>3]>>(7-(bit&7)))&1);return value;};
  const out=[];let guard=0,code;
  while((code=read())>=0&&guard++<bytes.length*8){if(code===256){reset();continue;}if(code===257)break;let entry=dict[code];if(!entry&&code===next&&prev)entry=new Uint8Array([...prev,prev[0]]);if(!entry)break;for(const b of entry)out.push(b);
    if(prev&&next<4096){dict[next++]=new Uint8Array([...prev,entry[0]]);if(width<12&&next+earlyChange===(1<<width))width++;}prev=entry;
  }
  return new Uint8Array(out);
}
function beta12ApplyPdfPredictor(bytes,dictText){
  const val=(name,fallback)=>{const m=String(dictText||'').match(new RegExp('\\/'+name+'\\s+(\\d+)'));return m?Number(m[1]):fallback;};
  const predictor=val('Predictor',1),colors=Math.max(1,val('Colors',1)),columns=Math.max(1,val('Columns',1)),bits=val('BitsPerComponent',8);
  if(predictor<=1||bits!==8)return bytes;
  const rowBytes=Math.ceil(colors*columns*bits/8),bpp=Math.max(1,Math.ceil(colors*bits/8));
  if(predictor===2){const out=new Uint8Array(bytes);for(let row=0;row+bpp<out.length;row+=rowBytes)for(let i=bpp;i<Math.min(rowBytes,out.length-row);i++)out[row+i]=(out[row+i]+out[row+i-bpp])&255;return out;}
  if(predictor<10||predictor>15||bytes.length%(rowBytes+1)!==0)return bytes;
  const rows=bytes.length/(rowBytes+1),out=new Uint8Array(rows*rowBytes);let src=0,dst=0,prior=new Uint8Array(rowBytes);
  for(let y=0;y<rows;y++){const filter=bytes[src++],row=new Uint8Array(rowBytes);for(let x=0;x<rowBytes;x++){const raw=bytes[src++],left=x>=bpp?row[x-bpp]:0,up=prior[x]||0,ul=x>=bpp?(prior[x-bpp]||0):0;let add=0;
      if(filter===1)add=left;else if(filter===2)add=up;else if(filter===3)add=Math.floor((left+up)/2);else if(filter===4){const p=left+up-ul,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-ul);add=pa<=pb&&pa<=pc?left:(pb<=pc?up:ul);}row[x]=(raw+add)&255;}
    out.set(row,dst);dst+=rowBytes;prior=row;
  }return out;
}
async function beta12DecodePdfStream(obj,objects){
  let bytes=beta12PdfStreamBytes(obj,objects);if(!bytes)return null;
  const filterMatch=obj.body.match(/\/Filter\s*(\[[\s\S]*?\]|\/[^\s<>\[\]()]+|[A-Za-z]+)/);
  const filterNames=filterMatch?[...filterMatch[1].matchAll(/\/([A-Za-z0-9]+)\b/g)].map(x=>x[1]):[];
  const supportedFilters=new Set(['ASCII85Decode','ASCIIHexDecode','FlateDecode','RunLengthDecode','LZWDecode']);
  const unsupportedFilters=filterNames.filter(name=>!supportedFilters.has(name));
  if(unsupportedFilters.length)throw new Error(`Este PDF usa filtro(s) de stream não suportado(s) na extração local: ${[...new Set(unsupportedFilters)].join(', ')}. Exporte uma cópia com texto selecionável e compactação compatível.`);
  const filters=filterNames;
  const params=obj.body.match(/\/DecodeParms\s*(<<[\s\S]*?>>)/),paramText=params?params[1]:obj.body;
  for(const filter of filters){
    if(filter==='ASCII85Decode')bytes=beta12Ascii85Decode(bytes);
    else if(filter==='ASCIIHexDecode')bytes=beta12AsciiHexDecode(bytes);
    else if(filter==='FlateDecode')bytes=await beta12Inflate(bytes);
    else if(filter==='RunLengthDecode')bytes=beta12RunLengthDecode(bytes);
    else if(filter==='LZWDecode'){const ec=Number((paramText.match(/\/EarlyChange\s+(\d+)/)||[])[1]??1);bytes=beta12LzwDecode(bytes,ec===0?0:1);}
  }
  if(/\/Predictor\s+(?:[2-9]|1[0-5])\b/.test(paramText))bytes=beta12ApplyPdfPredictor(bytes,paramText);
  return bytes;
}
async function beta12Inflate(bytes){
  if(!('DecompressionStream' in window))throw new Error('Este navegador não oferece descompressão local necessária para este PDF. Use uma versão atual do Chrome, Edge ou Firefox.');
  let lastError=null;
  for(const format of ['deflate','deflate-raw']){
    try{const ds=new DecompressionStream(format);const stream=new Blob([bytes]).stream().pipeThrough(ds);return new Uint8Array(await new Response(stream).arrayBuffer());}
    catch(err){lastError=err;}
  }
  const detail=String(lastError?.message||'fluxo FlateDecode inválido').replace(/Failed to fetch/gi,'falha na descompressão local');
  throw new Error(`Não foi possível descompactar uma parte deste PDF (${detail}). Tente exportar novamente o PDF como PDF com texto selecionável.`);
}
function beta12HexBytes(hex){hex=hex.replace(/\s+/g,'');if(hex.length%2)hex+='0';const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);return out;}
function beta12PdfDecodeLiteral(src){
  const out=[];for(let i=0;i<src.length;i++){let c=src.charCodeAt(i)&255;if(c!==92){out.push(c);continue;}if(++i>=src.length)break;c=src.charCodeAt(i)&255;
    if(c===110)out.push(10);else if(c===114)out.push(13);else if(c===116)out.push(9);else if(c===98)out.push(8);else if(c===102)out.push(12);else if(c===10){}else if(c===13){if(src.charCodeAt(i+1)===10)i++;}else if(c>=48&&c<=55){let oct=String.fromCharCode(c);for(let j=0;j<2&&i+1<src.length&&/[0-7]/.test(src[i+1]);j++)oct+=src[++i];out.push(parseInt(oct,8)&255);}else out.push(c);
  }return new Uint8Array(out);
}
function beta12ParseToUnicode(cmap){
  const map=new Map(), clean=cmap.replace(/%[^\r\n]*/g,'');
  const decodeHex=hex=>{const b=beta12HexBytes(hex);if(!b.length)return '';try{let str=new TextDecoder('utf-16be').decode(b);return str.replace(/\u0000/g,'');}catch(_){return '';}};
  let m, re=/beginbfchar([\s\S]*?)endbfchar/g;while((m=re.exec(clean))){const rr=/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g;let x;while((x=rr.exec(m[1])))map.set(x[1].toUpperCase(),decodeHex(x[2]));}
  re=/beginbfrange([\s\S]*?)endbfrange/g;while((m=re.exec(clean))){const lines=m[1].split(/\r?\n/);for(const line of lines){let x=line.match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+(.+)/);if(!x)continue;const a=parseInt(x[1],16),b=parseInt(x[2],16),dst=x[3].trim();if(dst.startsWith('[')){const vals=[...dst.matchAll(/<([0-9A-Fa-f]+)>/g)];for(let i=0;i<vals.length;i++)map.set((a+i).toString(16).padStart(x[1].length,'0').toUpperCase(),decodeHex(vals[i][1]));}else if(/^<[^>]+>$/.test(dst)){const base=beta12HexBytes(dst.slice(1,-1));for(let code=a;code<=b;code++){const d=new Uint8Array(base);if(d.length>=2){let carry=code-a;for(let k=d.length-1;k>=0&&carry;k--){const v=d[k]+(carry&255);d[k]=v&255;carry=(carry>>8)+(v>>8);}}map.set(code.toString(16).padStart(x[1].length,'0').toUpperCase(),new TextDecoder('utf-16be').decode(d));}}}}
  return map;
}
function beta12ExtractFontMaps(objects){
  const maps=new Map(),toUnicodeObjects=new Map();
  for(const [num,obj] of objects){const ref=beta12PdfDict(obj.body,'ToUnicode');if(/^\d+\s+\d+\s+R$/.test(ref)){const n=Number(ref.match(/\d+/)[0]);toUnicodeObjects.set(num,n);}}
  for(const [fontNum,cmapNum] of toUnicodeObjects){const cmapObj=objects.get(cmapNum);if(!cmapObj)continue;maps.set(cmapNum,{obj:cmapObj});}
  return maps;
}
async function beta12PrepareCMaps(objects){const maps=beta12ExtractFontMaps(objects);for(const v of maps.values()){const b=await beta12DecodePdfStream(v.obj,objects);v.text=b?beta12PdfLatin1(b):'';v.map=beta12ParseToUnicode(v.text||'');}return maps;}
function beta12PageFonts(pageBody,objects){
  const out=new Map();let resourcesText='';const direct=pageBody.match(/\/Resources\s*(<<[\s\S]*?>>)/);if(direct)resourcesText=direct[1];else{const n=pageBody.match(/\/Resources\s+(\d+)\s+\d+\s+R/);if(n)resourcesText=objects.get(Number(n[1]))?.body||'';}
  let fm=resourcesText.match(/\/Font\s*(<<[\s\S]*?>>)/);if(fm)resourcesText=fm[1];else{const n=resourcesText.match(/\/Font\s+(\d+)\s+\d+\s+R/);if(n)resourcesText=objects.get(Number(n[1]))?.body||'';else resourcesText='';}
  const re=/\/(\S+)\s+(\d+)\s+\d+\s+R/g;let m;while((m=re.exec(resourcesText)))out.set(m[1],Number(m[2]));return out;
}
function beta12DecodePdfBytes(bytes,map){
  if(map&&map.size){let out='';for(let i=0;i<bytes.length;){let hit=null;for(const len of [4,3,2,1]){if(i+len<=bytes.length){const key=Array.from(bytes.slice(i,i+len),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();if(map.has(key)){hit=[len,map.get(key)];break;}}}if(hit){out+=hit[1];i+=hit[0];}else{out+=String.fromCharCode(bytes[i]);i++;}}return out;}
  const cp1252={0x80:'€',0x82:'‚',0x83:'ƒ',0x84:'„',0x85:'…',0x86:'†',0x87:'‡',0x88:'ˆ',0x89:'‰',0x8A:'Š',0x8B:'‹',0x8C:'Œ',0x8E:'Ž',0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x95:'•',0x96:'–',0x97:'—',0x98:'˜',0x99:'™',0x9A:'š',0x9B:'›',0x9C:'œ',0x9E:'ž',0x9F:'Ÿ'};let out='';for(const b of bytes)out+=cp1252[b]||String.fromCharCode(b);return out;
}
function beta12ReadPdfStrings(streamText,fontMaps){
  let currentFont=null,buffer='',inArray=false;const lines=[];
  const push=()=>{const t=buffer.replace(/[ \t]+/g,' ').trim();if(t)lines.push(t);buffer='';};
  const tokens=[];let i=0;
  while(i<streamText.length){while(i<streamText.length&&/\s/.test(streamText[i]))i++;if(i>=streamText.length)break;const c=streamText[i];
    if(c==='('){let j=i+1,depth=1;for(;j<streamText.length&&depth;j++){if(streamText[j]==='\\'){j++;continue;}if(streamText[j]==='(')depth++;else if(streamText[j]===')')depth--;}tokens.push({type:'str',value:beta12PdfDecodeLiteral(streamText.slice(i+1,j-1))});i=j;continue;}
    if(c==='<'){if(streamText[i+1]==='<'){i+=2;continue;}let j=streamText.indexOf('>',i+1);if(j<0)break;tokens.push({type:'str',value:beta12HexBytes(streamText.slice(i+1,j))});i=j+1;continue;}
    if(c==='['||c===']'){tokens.push({type:'bracket',value:c});i++;continue;}
    const m=streamText.slice(i).match(/^\S+/);if(!m)break;tokens.push({type:'word',value:m[0]});i+=m[0].length;
  }
  for(let t=0;t<tokens.length;t++){
    const x=tokens[t];
    if(x.type==='bracket'){inArray=x.value==='[';continue;}
    if(x.type==='word'&&x.value==='Tf'){const name=tokens[t-2]?.value||'';currentFont=name.replace(/^\//,'');continue;}
    if(x.type==='str'){
      const map=fontMaps.get(currentFont)||null;const decoded=beta12DecodePdfBytes(x.value,map);
      if(inArray){buffer+=decoded;continue;}
      const next=tokens[t+1]?.value;if(next==='Tj'||next==="'"||next==='"')buffer+=decoded;continue;
    }
    if(x.type==='word'&&(x.value==='T*'||x.value==='TD'||x.value==='Tm'))push();
    if(x.type==='word'&&x.value==='TJ'){
      // TJ arrays frequently encode one visual line as several strings; keep them together.
      continue;
    }
    if(x.type==='word'&&x.value==='ET')push();
  }
  push();return lines;
}

// Layout reader: preserves text x/y so two-column pages can be separated by position.
function beta12ReadPdfLayout(streamText,fontMaps){
  const lines=[];let currentFont=null,buffer='',inArray=false;
  let lineX=0,lineY=0,leading=12;
  const flush=()=>{const text=buffer.replace(/[ \t]+/g,' ').trim();if(text)lines.push({text,x:lineX,y:lineY});buffer='';};
  const num=t=>{const n=Number(t?.value);return Number.isFinite(n)?n:null;};
  const tokens=[];let i=0;
  while(i<streamText.length){
    while(i<streamText.length&&/\s/.test(streamText[i]))i++;
    if(i>=streamText.length)break;
    const c=streamText[i];
    if(c==='('){
      let j=i+1,depth=1;
      for(;j<streamText.length&&depth;j++){if(streamText[j]==='\\'){j++;continue;}if(streamText[j]==='(')depth++;else if(streamText[j]===')')depth--;}
      tokens.push({type:'str',value:beta12PdfDecodeLiteral(streamText.slice(i+1,j-1))});i=j;continue;
    }
    if(c==='<'){
      if(streamText[i+1]==='<'){i+=2;continue;}
      let j=streamText.indexOf('>',i+1);if(j<0)break;tokens.push({type:'str',value:beta12HexBytes(streamText.slice(i+1,j))});i=j+1;continue;
    }
    if(c==='['||c===']'){tokens.push({type:'bracket',value:c});i++;continue;}
    const m=streamText.slice(i).match(/^\S+/);if(!m)break;tokens.push({type:'word',value:m[0]});i+=m[0].length;
  }
  for(let t=0;t<tokens.length;t++){
    const tok=tokens[t];
    if(tok.type==='bracket'){inArray=tok.value==='[';continue;}
    if(tok.type==='word'&&tok.value==='Tf'){currentFont=(tokens[t-2]?.value||'').replace(/^\//,'');continue;}
    if(tok.type==='word'&&tok.value==='TL'){const v=num(tokens[t-1]);if(v!==null)leading=Math.abs(v)||12;continue;}
    if(tok.type==='word'&&tok.value==='Tm'){
      const vals=tokens.slice(Math.max(0,t-6),t).map(num);
      if(vals.length===6&&vals.every(v=>v!==null)){flush();lineX=vals[4];lineY=vals[5];}
      continue;
    }
    if(tok.type==='word'&&(tok.value==='Td'||tok.value==='TD')){
      const tx=num(tokens[t-2]),ty=num(tokens[t-1]);
      if(tx!==null&&ty!==null){flush();lineX+=tx;lineY+=ty;if(tok.value==='TD')leading=Math.abs(ty)||leading;}
      continue;
    }
    if(tok.type==='word'&&tok.value==='T*'){flush();lineY-=leading;continue;}
    if(tok.type==='word'&&tok.value==='BT'){flush();continue;}
    if(tok.type==='word'&&tok.value==='ET'){flush();continue;}
    if(tok.type==='str'){
      const map=fontMaps.get(currentFont)||null;const decoded=beta12DecodePdfBytes(tok.value,map);
      buffer+=decoded;continue;
    }
    if(tok.type==='word'&&(tok.value==="'"||tok.value==='"')){flush();lineY-=leading;continue;}
  }
  flush();
  return lines;
}
function beta12LayoutVisualLines(records){
  const sorted=[...records].sort((a,b)=>b.y-a.y||a.x-b.x);
  const groups=[];
  for(const rec of sorted){
    let group=groups.find(g=>Math.abs(g.y-rec.y)<=3);
    if(!group){group={y:rec.y,parts:[]};groups.push(group);}
    group.parts.push(rec);
  }
  return groups.map(g=>({y:g.y,text:g.parts.sort((a,b)=>a.x-b.x).map(p=>p.text).join(' '),x:Math.min(...g.parts.map(p=>p.x))}));
}
function beta12PageColumnSplit(records){
  const xs=records.map(r=>r.x).filter(x=>Number.isFinite(x)).sort((a,b)=>a-b);
  if(xs.length<6)return null;
  let best=0,bestGap=0;
  for(let i=1;i<xs.length;i++){const gap=xs[i]-xs[i-1];if(gap>bestGap){bestGap=gap;best=i;}}
  if(bestGap<90)return null;
  const left=xs.slice(0,best),right=xs.slice(best);
  if(left.length<3||right.length<3)return null;
  return xs[best-1]+bestGap/2;
}

async function beta12ExtractPdfText(file){
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length<8||beta12PdfLatin1(bytes.slice(0,8)).indexOf('%PDF-')!==0)throw new Error('O arquivo não parece ser um PDF válido.');
  const {objects}=beta12PdfObjectTable(bytes);if(!objects.size)throw new Error('Não foi possível localizar objetos PDF.');
  const cmapRegistry=await beta12PrepareCMaps(objects),pages=[...objects.values()].filter(o=>/\/Type\s*\/Page\b/.test(o.body)).sort((a,b)=>a.num-b.num);if(pages.length>300)throw new Error('O PDF tem mais de 300 páginas. Divida o arquivo antes de importar.');
  const pageTexts=[];
  for(const page of pages){const refs=beta12PdfRefs(beta12PdfDict(page.body,'Contents'));const fonts=beta12PageFonts(page.body,objects),fontMaps=new Map();for(const [name,fontObjNum] of fonts){const fontObj=objects.get(fontObjNum);const tu=fontObj&&beta12PdfDict(fontObj.body,'ToUnicode');if(/^\d+\s+\d+\s+R$/.test(tu)){const cmapNum=Number(tu.match(/\d+/)[0]),entry=cmapRegistry.get(cmapNum);if(entry?.map)fontMaps.set(name,entry.map);}}
    const pageRecords=[];for(const ref of refs){const obj=objects.get(ref);if(!obj)continue;let b=await beta12DecodePdfStream(obj,objects);if(!b)continue;pageRecords.push(...beta12ReadPdfLayout(beta12PdfLatin1(b),fontMaps));}
    if(pageRecords.length){
      const split=beta12PageColumnSplit(pageRecords);
      if(split){
        const left=beta12LayoutVisualLines(pageRecords.filter(line=>line.x<split));
        const right=beta12LayoutVisualLines(pageRecords.filter(line=>line.x>=split));
        if(left.length&&right.length)pageTexts.push('\u200C\n'+left.map(l=>l.text).join('\n')+'\n\u200B\u200B\n'+right.map(l=>l.text).join('\n'));
        else pageTexts.push('\u200C\n'+beta12LayoutVisualLines(pageRecords).map(l=>l.text).join('\n'));
      }else pageTexts.push('\u200C\n'+beta12LayoutVisualLines(pageRecords).map(l=>l.text).join('\n'));
    }}
  const text=pageTexts.join('\n\n').replace(/[\u0000\u0008\u000b\u000c]/g,'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();if(!text)throw new Error('Não foi possível extrair texto selecionável desse PDF. PDFs escaneados exigem OCR e não são suportados nesta versão.');if(text.length<2)throw new Error('O PDF não contém texto suficiente para uma importação confiável.');return text;
}


// Firebase Realtime Database（REST + EventSource）の代わりをするローカルサーバー。動作確認用。
// 使い方: node tools/mock.js → http://localhost:8791/
//   /__net?off=1 で電波断、/__net?off=0 で復帰、/__dump で保存内容
//   RESET_IN=9000 を付けると、9:30のリセットを「ページを開いて9秒後」に置き換える
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=8791,HTML=process.argv[2]||path.join(__dirname,'..','index.html'),RESET_IN=Number(process.env.RESET_IN)||0;
let tree={},subs=[],off=false;
const walk=(p,make)=>{let t=tree;for(const s of p){if(t[s]==null||typeof t[s]!=='object'){if(!make)return undefined;t[s]={}}t=t[s]}return t};
const get=p=>{let t=tree;for(const s of p){if(t==null)return null;t=t[s]}return t===undefined?null:t};
const set=(p,v)=>{const par=walk(p.slice(0,-1),true);if(v===null)delete par[p[p.length-1]];else par[p[p.length-1]]=v};
const send=(ev,p,data)=>subs.forEach(s=>{if(p.join('/').startsWith(s.p.join('/'))){const rel='/'+p.slice(s.p.length).join('/');s.res.write('event: '+ev+'\ndata: '+JSON.stringify({path:rel,data})+'\n\n')}});
function page(){
  let h=fs.readFileSync(HTML,'utf8').replace(/const DB_URL='[^']*';/,"const DB_URL=location.origin+'/db';");
  if(RESET_IN)h=h.replace('new Date(2026,9,11,9,30).getTime()','(Date.now()+'+RESET_IN+')');
  return h;
}
http.createServer((q,r)=>{
  const u=new URL(q.url,'http://x');
  if(u.pathname==='/'){r.writeHead(200,{'content-type':'text/html; charset=utf-8'});return r.end(page())}
  if(u.pathname==='/__net'){off=u.searchParams.get('off')==='1';if(off){subs.forEach(s=>s.res.destroy());subs=[]}return r.end(String(off))}
  if(u.pathname==='/__dump')return r.end(JSON.stringify(tree,null,1));
  if(off)return q.socket.destroy();
  const p=u.pathname.replace(/^\/db\//,'').replace(/\.json$/,'').split('/').filter(Boolean);
  if(q.method==='GET'&&(q.headers.accept||'').includes('text/event-stream')){
    r.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    r.write('event: put\ndata: '+JSON.stringify({path:'/',data:get(p)})+'\n\n');
    const s={p,res:r};subs.push(s);q.on('close',()=>{subs=subs.filter(x=>x!==s)});return;
  }
  let b='';q.on('data',d=>b+=d);q.on('end',()=>setTimeout(()=>{
    const body=b?JSON.parse(b):null;
    if(q.method==='PUT'){
      if(q.headers['if-match']==='null_etag'&&get(p)!==null){r.writeHead(412,{'content-type':'application/json'});return r.end(JSON.stringify(get(p)))}
      set(p,body);send('put',p,body);
    }else if(q.method==='PATCH'){
      Object.assign(walk(p,true),body);send('patch',p,body);
    }
    r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(q.method==='GET'?get(p):body));
  },150));
}).listen(PORT,()=>console.log('mock on http://localhost:'+PORT+'/'));

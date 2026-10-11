import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('read-only chat service',async()=>{
 const dir=await mkdtemp(resolve('.codex-service-test-')),fake=join(dir,'codex'); await writeFile(join(dir,'token'),'test-token');
 await writeFile(fake,`#!/usr/bin/env node
const rl=require('node:readline').createInterface({input:process.stdin});const send=m=>console.log(JSON.stringify(m));let thread='thread',n=0;if(process.env.CODEX_HOME!==process.env.EXPECTED_CODEX_HOME)process.exit(2);
rl.on('line',line=>{const m=JSON.parse(line),p=m.params||{};
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='model/list')send({id:m.id,result:{data:[{model:'catalog-model',displayName:'Catalog Model',inputModalities:['text'],isDefault:true}],nextCursor:null}});
if(m.method==='thread/start'){if(p.sandbox!=='read-only'||p.approvalPolicy!=='never')return send({id:m.id,error:{message:'not read only'}});thread='thread-'+(++n);send({id:m.id,result:{thread:{id:thread}}});}
if(m.method==='thread/resume')send({id:m.id,result:{}});
if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'turn'}}});send({method:'turn/started',params:{threadId:thread,turn:{id:'turn'}}});const text=p.input.find(i=>i.type==='text')?.text||'';if(text.endsWith('approve'))send({id:900,method:'item/tool/call',params:{threadId:thread,tool:'createTask',arguments:{title:'task'}}});else if(text.endsWith('reconnect')){for(let i=1;i<=3;i++)send({method:'error',params:{threadId:thread,willRetry:true,error:{message:'Reconnecting... '+i+'/5'}}});send({method:'item/agentMessage/delta',params:{threadId:thread,itemId:'answer-'+n,delta:'RECOVERED'}});send({method:'turn/completed',params:{threadId:thread,turn:{status:'completed'}}});}else{send({method:'item/agentMessage/delta',params:{threadId:thread,itemId:'answer-'+n,delta:p.input.some(i=>i.type==='localImage')?'IMAGE':'OK'}});send({method:'item/started',params:{threadId:thread,item:{id:'hidden',type:'commandExecution',command:'rg src'}}});send({method:'turn/diff/updated',params:{threadId:thread,diff:'+hidden'}});send({method:'turn/completed',params:{threadId:thread,turn:{status:'completed'}}});}}
if(m.id===900&&m.result)send({method:'turn/completed',params:{threadId:thread,turn:{status:'completed'}}});});`); await chmod(fake,0o700);
 const scope='00000000-0000-4000-8000-000000000002',port=38000+(process.pid%1000);let child;
 const call=(action,body={})=>new Promise((resolveCall,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/'+action,method:'POST',headers:{Authorization:'Bearer test-token'}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolveCall(JSON.parse(text)));});req.on('error',reject);req.end(JSON.stringify({scope,...body}));});
 async function launch(){const codexHome=join(dir,'codex-home');child=spawn(process.execPath,[resolve('scripts/codex-service.mjs')],{env:{...process.env,CODEX_BIN:fake,PROGRESS_CODEX_HOME:codexHome,EXPECTED_CODEX_HOME:codexHome,PROGRESS_CODEX_STATE_DIR:dir,PROGRESS_CODEX_TEST_PORT:String(port)},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await call('health')).ok)return;}catch{}await delay(20);}throw new Error('startup failed');}
 async function settle(){for(let i=0;i<100;i++){const s=await call('state');if(['ready','error'].includes(s.status)||s.requests.length)return s;await delay(20);}throw new Error('turn timed out');}
 try{await launch();assert.equal((await call('health')).version,31);const direct=await call('complete',{text:'hello',instructions:'deep radar'});assert.equal(direct.t,'ok');assert.equal(direct.text,'OK');const recovered=await call('complete',{text:'reconnect',instructions:'deep radar'});assert.equal(recovered.t,'ok');assert.equal(recovered.text,'RECOVERED');await call('init',{messages:[{id:'old',role:'assistant',parts:[{type:'activity',id:'command'}]}]});let s=await call('state');assert.equal(s.messages.length,0);s=await call('directory',{cwd:dir});assert.equal(s.cwd,dir);
 await call('start',{text:'hello',instructions:'read only',tools:[],skills:[{id:'skill-1',name:'diagnose',command:'diagnose'}]});s=await settle();assert.equal(s.messages.at(-1).parts.find(p=>p.type==='text').text,'OK');assert.equal(s.messages.at(-1).parts.find(p=>p.type==='skill').name,'diagnose');assert.equal('items' in s,false);assert.equal('diff' in s,false);assert.equal(s.messages.flatMap(m=>m.parts).some(p=>p.type==='activity'),false);
 const imagePath=join(dir,'image.png');await writeFile(imagePath,'image');await call('start',{text:'',images:[{id:'image.png',name:'image.png',url:'/image',path:imagePath,mimeType:'image/png'}],instructions:'read only',tools:[]});s=await settle();assert.match([...s.messages].reverse().find(m=>m.role==='assistant').parts.find(p=>p.type==='text').text,/IMAGE$/);assert.equal([...s.messages].reverse().find(m=>m.role==='user').parts.find(p=>p.type==='image').path,imagePath);
 await call('start',{text:'approve',instructions:'read only',tools:[]});s=await settle();assert.equal(s.requests[0].params.tool,'createTask');await call('claim',{id:900});await call('respond',{id:900,result:{success:true,contentItems:[]}});s=await settle();assert.equal(s.status,'ready');const count=s.messages.length;child.kill();await once(child,'exit');await launch();s=await call('state');assert.equal(s.messages.length,count);
 }finally{if(child?.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});

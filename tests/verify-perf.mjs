import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { baseUrl, loginAdmin } from './lib/api.mjs';
const BASE = baseUrl();
// 写接口要管理员 token：旧版这里裸 fetch，加了鉴权后必然 401
const token = await loginAdmin(BASE);
const auth = { authorization: `Bearer ${token}` };
// 文档里的示例值带 {{token}}：未定义变量会被前端直接拦下（365d7d9 的刻意行为），先补全局变量
await fetch(BASE + '/api/globals', {
  method: 'PUT',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify({ variables: [{ key: 'token', value: 'smoke-token' }] }),
});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:900},locale:'zh-CN'});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
const R=(id,ok,d='')=>console.log(`[${ok?'PASS':'FAIL'}] ${id}${d?' :: '+d:''}`);

// 导入真实文档
const content=fs.readFileSync('tests/fixtures-real-openapi.json','utf8');
const imp=await (await fetch(BASE+'/api/documents',{method:'POST',headers:{'content-type':'application/json',...auth},body:JSON.stringify({content,format:'json',sourceType:'file'})})).json();
if(!imp.id){console.error('文档导入失败:',JSON.stringify(imp).slice(0,200));process.exit(1);}
const size=Buffer.byteLength(content);
console.log('文档导入:',imp.id,'| 原始大小:',(size/1024).toFixed(0)+'KB');

await p.goto(BASE,{waitUntil:'networkidle'}); await p.waitForTimeout(700);
await p.locator('button',{hasText:'调试此接口'}).first().click().catch(()=>{});
// 若无选中接口，先点树
if(await p.locator('.debug-head').count()===0){
  await p.locator('.viewer-sidebar .node-summary').first().click(); await p.waitForTimeout(400);
  await p.locator('button',{hasText:'调试此接口'}).first().click();
}
await p.waitForTimeout(400);
R('V1-头部单行',await p.locator('.debug-head').count()>0,await p.locator('.debug-head').innerText().then(t=>t.replace(/\s+/g,' ').slice(0,60)));
const titleSize=await p.locator('.debug-title').evaluate(el=>getComputedStyle(el).fontSize);
R('V2-标题16px',titleSize==='16px',titleSize);
const cellPad=await p.locator('.kv-table .el-table__cell').first().evaluate(el=>getComputedStyle(el).paddingTop);
R('V3-KV行紧凑(6px)',parseFloat(cellPad)<=7,cellPad);
await p.screenshot({path:'tests/screenshots/70-compact-debug.png'});

// 大响应：走代理拉取 172KB JSON
const docId=imp.id;
const r=await fetch(BASE+'/api/proxy',{method:'POST',headers:{'content-type':'application/json',...auth},body:JSON.stringify({method:'GET',url:`${BASE}/api/documents/${docId}/export?format=json`})});
const pj=await r.json();
console.log('代理响应体大小:',((pj.body?.length||0)/1024).toFixed(0)+'KB','| truncated:',pj.truncated??false);
// 在页面里发送同样请求
await p.locator('.req-url input').fill(`${BASE}/api/documents/${docId}/export?format=json`);
// 切换方法为 GET（带入的接口是 POST，export 只支持 GET）
await p.locator('.req-method').click(); await p.waitForTimeout(200);
await p.locator('.el-select-dropdown__item',{hasText:'GET'}).first().click(); await p.waitForTimeout(300);
await p.locator('button',{hasText:'发送'}).click(); await p.waitForTimeout(1800);
const activeTab=await p.locator('.resp-tabs .el-tabs__item.is-active').innerText();
R('V4-大响应默认Raw',activeTab.trim()==='Raw',`active=${activeTab}`);
await p.locator('.resp-tabs .el-tabs__item',{hasText:'Pretty'}).click(); await p.waitForTimeout(300);
R('V5-Pretty占位提示',await p.locator('.heavy-placeholder').count()>0,(await p.locator('.heavy-placeholder').innerText().catch(()=>'')).slice(0,50));
await p.screenshot({path:'tests/screenshots/71-heavy-response.png'});
console.log('错误:',errs.length,errs);
await b.close();

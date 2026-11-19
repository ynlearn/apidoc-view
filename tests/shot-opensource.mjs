import { chromium } from 'playwright-core';
import { baseUrl, loginAdmin } from './lib/api.mjs';
const BASE = baseUrl();
// 管理端现在恒需登录：先把 token 塞进 localStorage，否则截到的是登录墙
const token = await loginAdmin(BASE);
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:900},locale:'zh-CN'});
await p.addInitScript((t)=>{ try { localStorage.setItem('bb.adminToken', t); } catch {} }, token);
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
await p.goto(BASE,{waitUntil:'networkidle'}); await p.waitForTimeout(800);
const logo=await p.locator('.af-logo-text').innerText();
console.log('顶栏品牌:',logo);
if(logo.trim()==='API接口文档')console.log('[PASS] 品牌名');else console.log('[FAIL] 品牌名 :: '+logo);
await p.screenshot({path:'tests/screenshots/80-opensource-viewer.png'});
await p.goto(BASE+'/admin',{waitUntil:'networkidle'}); await p.waitForTimeout(500);
await p.screenshot({path:'tests/screenshots/81-opensource-admin.png'});
console.log('错误:',errs.length,errs);
await b.close();

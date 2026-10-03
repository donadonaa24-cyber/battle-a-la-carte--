// Offline Chromium layout probe: anonymous DevTools pipes, no HTTP server or Playwright.
// The isolated fixture loads only the real ADV, data, CSS and local registered art.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/story-readability-20261004/layout');
fs.mkdirSync(out,{recursive:true});
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const browser=process.argv[2]||[path.join(process.env.ProgramFiles||'','Google/Chrome/Application/chrome.exe'),path.join(process.env['ProgramFiles(x86)']||'','Microsoft/Edge/Application/msedge.exe')].find(f=>fs.existsSync(f));
if(!browser)throw Error('Pass an installed Chromium executable. No download is attempted.');
const tutorial=read('story-mode.js').split('    const S = {')[0]+'window.__tutorialEpisodes=EPISODES;})();';
const scripts=['story-data/characters.js','story-data/registry.js',...[4,5,6,7,8,9,10].map(n=>`story-data/episode${n}.js`),'story-adv.js'];
const harness=`
window.fixtureReady=(async()=>{
 window.__allEpisodes=[...__tutorialEpisodes.map((e,i)=>({...e,number:i+1,scenes:['pre','postWin','postLose'].filter(k=>e[k]).map(k=>({id:k,lines:e[k]}))})),...BattleStoryData.all()];
 await StoryAdv.playConversation(__tutorialEpisodes[0],[__tutorialEpisodes[0].postWin.at(-1)],{phase:'post',getActions:()=>[]});
 if(document.getElementById('adv-next').hidden)document.getElementById('adv-dialogue').click();
 const layer=document.getElementById('story-adv'),dialogue=document.getElementById('adv-dialogue'),text=document.getElementById('adv-text');
 const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom};};
 window.measureStory=async()=>{
 const report={viewport:[innerWidth,innerHeight],font:getComputedStyle(text).fontSize,leading:getComputedStyle(text).lineHeight,episodes:[],failures:[]};
 layer.classList.remove('adv-cleared');document.getElementById('adv-ending').hidden=true;dialogue.hidden=false;
 for(const ep of __allEpisodes){let maxLines=0,longest='',maxHeight=0;for(const l of ep.scenes.flatMap(s=>s.lines).filter(l=>l.text)){
  text.textContent=l.text;document.getElementById('adv-name').textContent=l.name||BattleStoryAssets.characters[l.speaker]?.name||'';
  const lines=Math.round(text.getBoundingClientRect().height/parseFloat(getComputedStyle(text).lineHeight));
  // min-height reserves three lines, so use actual glyph rectangles for the wrap count.
  const range=document.createRange();range.selectNodeContents(text);const tops=[...range.getClientRects()].map(r=>Math.round(r.top));const wrapped=new Set(tops).size;
  if(wrapped>maxLines){maxLines=wrapped;longest=l.text;}maxHeight=Math.max(maxHeight,rect(dialogue).height);
  if(text.scrollWidth>text.clientWidth+1||dialogue.scrollHeight>dialogue.clientHeight+1||rect(text).bottom>rect(dialogue).bottom-14||rect(dialogue).x<0||rect(dialogue).bottom>innerHeight)report.failures.push({episode:ep.number,text:l.text});
 }
 report.episodes.push({number:ep.number,maxLines,maxHeight,longest});}
 text.textContent=__tutorialEpisodes[0].postWin.at(-1).text;document.getElementById('adv-name').textContent='舞依';document.getElementById('adv-name').dataset.speaker='mai';
 report.dialogue=rect(dialogue);report.toolbar=rect(layer.querySelector('.adv-toolbar'));
 const log=document.getElementById('adv-log'),rows=document.getElementById('adv-log-lines');rows.innerHTML='<p><strong>舞依</strong>'+text.textContent+'</p>';log.hidden=false;
 report.logFont=getComputedStyle(rows.querySelector('p')).fontSize;report.log=rect(log);log.hidden=true;
 const ending=document.getElementById('adv-ending');ending.innerHTML='<h2>第10話 CLEAR</h2><p class="adv-clear-title">また会おう</p><p class="adv-teaser">NEXT 第9話「六人でやれば」</p><button>ストーリー選択へ戻る</button>';layer.classList.add('adv-cleared');ending.hidden=false;
 report.clear={box:rect(ending),title:rect(ending.querySelector('.adv-clear-title')),button:rect(ending.querySelector('button')),buttonFont:getComputedStyle(ending.querySelector('button')).fontSize};
 ending.hidden=true;layer.classList.remove('adv-cleared');
 return report;
 };
 return true;
})();`;
const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline' file:; font-src file: data:; connect-src 'none'"><style>html,body{margin:0}${read('story-adv.css')}</style>${scripts.map(f=>`<script src="${pathToFileURL(path.join(root,f)).href}"></script>`).join('')}<script>${tutorial}</script><script>${harness}</script>`;
const fixture=path.join(out,'fixture.html');
const controls=`<div id="fixture-controls" style="position:fixed;z-index:900000;right:8px;top:105px;display:flex;gap:4px"><button id="fixture-measure">測定</button><button id="fixture-clear">CLEAR確認</button><button id="fixture-hide">検証UIを隠す</button></div><pre id="fixture-report" hidden></pre><script>
fixtureReady.then(()=>{
 document.getElementById('fixture-measure').onclick=async()=>{const report=await measureStory();document.getElementById('fixture-report').textContent=JSON.stringify(report);};
 document.getElementById('fixture-clear').onclick=()=>{document.getElementById('story-adv').classList.add('adv-cleared');document.getElementById('adv-ending').hidden=false;};
 document.getElementById('fixture-hide').onclick=()=>{document.getElementById('fixture-controls').style.display='none';};
 document.getElementById('fixture-measure').click();
});</script>`;
fs.writeFileSync(fixture,html+controls);
if(process.argv.includes('--fixture-only')){console.log(pathToFileURL(fixture).href);process.exit(0);}
const child=spawn(browser,['--headless=new','--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--metrics-recording-only','--host-resolver-rules=MAP * ~NOTFOUND',`--user-data-dir=${path.join(out,'chromium-profile')}`],{stdio:['ignore','ignore','pipe','pipe','pipe'],windowsHide:true});
let seq=0,buffer='',session;const pending=new Map();let errors='';child.stderr.on('data',d=>errors+=d.toString());
child.stdio[4].on('data',d=>{buffer+=d.toString();let i;while((i=buffer.indexOf('\0'))>=0){const msg=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(!pending.has(msg.id))continue;const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(Error(JSON.stringify(msg.error))):resolve(msg.result);}});
const send=(method,params={},sid=session)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});child.stdio[3].write(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})})+'\0');});
const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
(async()=>{try{
 const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Page.navigate',{url:pathToFileURL(fixture).href});
 // Poll readiness briefly; no network is involved.
 for(let i=0;i<100;i++){if(await evaluate('Boolean(window.fixtureReady)'))break;await new Promise(r=>setTimeout(r,50));}
 await evaluate('window.fixtureReady');const reports=[];
 for(const[width,height]of[[1440,900],[1366,768],[390,844],[360,740],[844,390]]){
 await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const report=await evaluate('measureStory()');reports.push(report);
 const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${width}x${height}.png`),Buffer.from(screenshot.data,'base64'));
 console.log(JSON.stringify(report));
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const reduced=await evaluate(`(()=>{const mark=document.createElement('span');mark.className='adv-emotion-mark';mark.textContent='!';document.getElementById('adv-portraits').firstElementChild.appendChild(mark);return {reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,markAnimation:getComputedStyle(mark).animationName,effectDisplay:getComputedStyle(document.getElementById('adv-line-effects')).display};})()`);
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({reports,reduced},null,2));
 if(reports.some(r=>r.failures.length||r.episodes.some(e=>e.maxLines>3))||!reduced.reduced||reduced.markAnimation!=='none'||reduced.effectDisplay!=='none')throw Error('Layout/reduced-motion assertion failed. See measurements.json.');
 }finally{await send('Browser.close',{},null).catch(()=>{});child.kill();}})().catch(e=>{console.error(e,errors.slice(-1000));process.exitCode=1;});
setTimeout(()=>{child.kill();console.error('Chromium probe timeout');process.exit(1);},60000).unref();

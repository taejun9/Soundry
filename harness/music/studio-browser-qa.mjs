/** Explicit disposable browser QA and local genre export; never calls a music provider other than Mock. */
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../../backend/src/app.ts';
import { MembersService } from '../../backend/src/members/members.service.ts';
import { ProjectsService } from '../../backend/src/projects/projects.service.ts';
import { GenerationsService } from '../../backend/src/generations/generations.service.ts';
import { ArrangementsController } from '../../backend/src/arrangements/arrangements.controller.ts';
import { parseComposition } from '../../backend/src/providers/composition/schema.ts';
import { GENRE_PRESETS } from '../../frontend/src/features/generation/genres.ts';

const origin = 'http://127.0.0.1:5176';
const output = resolve(process.argv[2] ?? 'data/plan022-studio-qa');
const benchmarkPath = process.argv[3] ? resolve(process.argv[3]) : null;
if (!process.env.SOUNDRY_PLAYWRIGHT_MODULE || !process.env.SOUNDRY_CHROME) throw new Error('Explicit local Playwright module and Chrome executable required');
const { chromium } = await import(pathToFileURL(process.env.SOUNDRY_PLAYWRIGHT_MODULE).href);
await mkdir(output, { recursive: true });
const data = await realpath(await mkdtemp(join(tmpdir(), 'soundry-studio-qa-')));
const app = await createApplication({uiPort:'5176',lanHost:undefined,dataDir:data,musicProvider:'mock'});
const browser = await chromium.launch({headless:true,executablePath:process.env.SOUNDRY_CHROME});
const results = { ui: [], signals: [], genreExports: [], mockDelivered: false, listeningPerformed: false };
try {
  await app.listen(31306,'127.0.0.1');
  const member = await app.get(MembersService).register({name:'Studio QA',email:'studio-qa@example.test',password:randomUUID()+randomUUID()});
  const project = app.get(ProjectsService).create('Studio QA synthetic project',member.member.id);
  const generations=app.get(GenerationsService);
  const accepted=generations.create(project.id,{prompt:'Synthetic workflow QA',settings:{},variationCount:1,requestKey:randomUUID()},member.member.id).generation;
  let job=generations.get(accepted.id);
  for(let i=0;i<100&&job.status!=='completed';i++){await delay(100);job=generations.get(accepted.id);}
  assert.equal(job.status,'completed');
  const track=job.tracks[0];
  const arrangement={duration:8,bpm:120,snapBeats:1,masterVolume:0.7,lanes:[{id:randomUUID(),name:'QA Audio',muted:false,clips:[{id:randomUUID(),trackId:track.id,label:'QA Clip',start:0,offset:0,duration:8,volume:0.8,loop:false,fadeIn:0.01,fadeOut:0.5}]}]};
  app.get(ArrangementsController).save(project.id,arrangement);
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addCookies([{name:'soundry_session',value:member.token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(`${origin}/api/**`,async route=>{
    const req=route.request(),url=new URL(req.url());
    const headers={...req.headers(),host:'127.0.0.1:3000'}; delete headers['content-length'];
    const response=await new Promise((resolve,reject)=>{
      const request=httpRequest({hostname:'127.0.0.1',port:31306,path:`${url.pathname}${url.search}`,method:req.method(),headers},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);
      });request.on('error',reject);request.end(req.postDataBuffer()??undefined);
    });
    const outHeaders={...response.headers}; delete outHeaders['transfer-encoding']; delete outHeaders.connection; delete outHeaders['content-length'];
    for(const key of Object.keys(outHeaders)) { if(Array.isArray(outHeaders[key]))outHeaders[key]=outHeaders[key].join('; '); }
    await route.fulfill({status:response.status,headers:outHeaders,body:response.body});
  });
  await page.goto(`${origin}/projects/${project.id}`);
  const studio=page.getByRole('region',{name:'제작 스튜디오'});
  try { await studio.waitFor(); } catch(error) { console.log('UI diagnostic',page.url(),await page.locator('body').innerText(),errors); throw error; } await studio.getByText('저장됨',{exact:true}).waitFor();
  assert.equal(await studio.getByLabel('믹서 행 선택',{exact:true}).inputValue(),arrangement.lanes[0].id);
  await studio.getByRole('button',{name:'클립 QA Clip 선택 및 이동',exact:true}).click();
  await studio.getByRole('button',{name:'복제',exact:true}).click();
  await studio.getByRole('button',{name:'실행 취소'}).click();
  assert.equal(await studio.locator('.arrangement-clip').count(),1);
  await studio.getByRole('button',{name:'다시 실행'}).click();
  assert.equal(await studio.locator('.arrangement-clip').count(),2);
  await studio.getByRole('button',{name:'실행 취소'}).click();
  await studio.getByRole('button',{name:'클립 QA Clip 선택 및 이동',exact:true}).click();
  await studio.locator('#arrangement-position').fill('4');
  await studio.getByRole('button',{name:'재생 위치에서 분할',exact:true}).click();
  assert.equal(await studio.locator('.arrangement-clip').count(),2);
  await studio.getByRole('button',{name:'저장',exact:true}).click();
  await studio.getByText('저장됨',{exact:true}).waitFor();
  await page.reload(); await studio.getByText('저장됨',{exact:true}).waitFor();
  assert.equal(await studio.locator('.arrangement-clip').count(),2);
  results.ui.push('duplicate/undo/redo/split/save/reload PASS');
  await studio.getByRole('button',{name:'클립 QA Clip 선택 및 이동',exact:true}).first().click();
  await studio.getByRole('button',{name:'원본 파형 읽기'}).click();
  await studio.getByRole('img',{name:'실제 원본 오디오의 파형'}).waitFor();
  await studio.getByRole('button',{name:'Session · 클립 런처',exact:true}).click();
  await studio.getByRole('button',{name:'장면 1 실행',exact:true}).click();
  await studio.getByRole('button',{name:'미리듣기 정지',exact:true}).waitFor();
  await studio.getByRole('button',{name:'미리듣기 정지',exact:true}).click();
  await studio.getByRole('button',{name:'WAV 내보내기',exact:true}).click();
  await studio.getByRole('link',{name:'믹스 WAV 다운로드'}).waitFor();
  const downloadPromise=page.waitForEvent('download');
  await studio.getByRole('link',{name:'믹스 WAV 다운로드'}).click();
  await (await downloadPromise).saveAs(join(output,'synthetic-ui-mix.wav'));
  results.ui.push('actual source waveform/Session preview/stereo export download PASS');
  await studio.getByRole('button',{name:'Arrangement · 편곡',exact:true}).click();
  await studio.getByLabel('원본 검색',{exact:true}).fill('missing source');
  assert.equal(await studio.locator('.studio-browser-list button').count(),0);
  await studio.getByLabel('원본 검색',{exact:true}).fill('');
  await studio.getByLabel('Low-pass (Hz)',{exact:true}).fill('12000');
  await studio.getByLabel('Low-pass (Hz)',{exact:true}).blur();
  await studio.getByLabel('Delay (초)',{exact:true}).fill('0.25');
  await studio.getByLabel('Delay (초)',{exact:true}).blur();
  await studio.getByRole('button',{name:'저장',exact:true}).click();
  await studio.getByText('저장됨',{exact:true}).waitFor();
  await page.reload(); await studio.getByText('저장됨',{exact:true}).waitFor();
  assert.equal(await studio.getByLabel('Low-pass (Hz)',{exact:true}).inputValue(),'12000');
  assert.equal(await studio.getByLabel('Delay (초)',{exact:true}).inputValue(),'0.25');
  await studio.focus(); await page.keyboard.press('Space');
  await studio.getByRole('button',{name:'미리듣기 정지',exact:true}).waitFor();
  await page.keyboard.press('Space');
  await studio.getByRole('button',{name:'미리듣기',exact:true}).waitFor();
  results.ui.push('browser search/mixer settings persisted/root Space transport PASS');
  await studio.screenshot({path:join(output,'desktop.png')});
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,'mobile document overflow');
  await studio.screenshot({path:join(output,'mobile.png')});
  results.ui.push('1440px/390px no document overflow PASS');
  assert.deepEqual(errors,[]);

  results.signals = await page.evaluate(async()=>{
    const {scheduleMix,exportHeadroom}=await import('/src/features/arrangement/mix.ts');
    const {pcmWav}=await import('/src/features/arrangement/arrangement.ts');
    const render=async(settings,at=0)=>{
      const ctx=new OfflineAudioContext(2,44100*2,44100);
      const source=ctx.createBuffer(2,44100*2,44100);
      for(let c=0;c<2;c++)for(let i=0;i<source.length;i++)source.getChannelData(c)[i]=Math.sin(i/44100*Math.PI*2*1000)*0.1;
      const clip={id:'c',trackId:'t',label:'tone',start:0,offset:0,duration:2,volume:1,loop:false,fadeIn:0,fadeOut:0};
      const value={duration:2,masterVolume:1,lanes:[{id:'l',name:'test',muted:false,clips:[clip],...settings}]};
      const release=scheduleMix(ctx,value,new Map([['t',source]]),at);
      const result=await ctx.startRendering();release();
      return result;
    };
    const energy=(buffer,c)=>buffer.getChannelData(c).reduce((sum,x)=>sum+x*x,0);
    const baseline=await render({}),left=await render({pan:-1}),filtered=await render({lowpassHz:100}),quiet=await render({volume:0.5}),muted=await render({muted:true});
    if(energy(left,1)>1e-9||energy(left,0)<1)throw new Error('pan signal mismatch');
    if(energy(filtered,0)/energy(baseline,0)>0.02)throw new Error('low-pass signal mismatch');
    if(Math.abs(energy(quiet,0)/energy(baseline,0)-0.25)>0.01)throw new Error('lane gain mismatch');
    if(energy(muted,0)!==0)throw new Error('mute signal mismatch');
    // An impulse has exactly one delayed copy; recurrent echoes would expose an accidental feedback graph.
    const ctx=new OfflineAudioContext(2,44100*2,44100),source=ctx.createBuffer(2,44100,44100);
    source.getChannelData(0)[0]=0.1;source.getChannelData(1)[0]=0.1;
    const value={duration:2,masterVolume:1,lanes:[{id:'l',name:'delay',muted:false,delaySeconds:0.25,delayWet:0.5,clips:[{id:'c',trackId:'t',label:'impulse',start:0,offset:0,duration:1,volume:1,loop:false}]}]};
    const release=scheduleMix(ctx,value,new Map([['t',source]]));const delayed=await ctx.startRendering();release();
    const samples=delayed.getChannelData(0);const sliceEnergy=(start,end)=>samples.slice(Math.floor(start*44100),Math.floor(end*44100)).reduce((sum,x)=>sum+x*x,0);
    if(sliceEnergy(0.24,0.28)<=0||sliceEnergy(0.49,0.53)>1e-10)throw new Error('delay feedback or missing echo');
    exportHeadroom(baseline); const wav=await pcmWav(baseline).arrayBuffer();const view=new DataView(wav);
    if(view.getUint16(22,true)!==2||view.getUint16(34,true)!==16||view.getUint32(24,true)!==44100)throw new Error('WAV format mismatch');
    return ['actual OfflineAudioContext pan/gain/mute/low-pass PASS','single feed-forward delay impulse/no feedback PASS','actual stereo PCM16 WAV header PASS'];
  });
  console.log('Studio browser UI and actual signal QA PASS');

  if(benchmarkPath){
    const report=JSON.parse(await readFile(benchmarkPath,'utf8'));
    assert.equal(report.provider,'llamacpp'); assert.equal(report.tracks.length,GENRE_PRESETS.length);
    assert.deepEqual(report.tracks.map(t=>t.genre),GENRE_PRESETS.map(t=>t.label));
    await mkdir(join(output,'Rendered'),{recursive:true});
    let currentBytes;
    await page.route(`${origin}/__studio_source`,route=>route.fulfill({status:200,contentType:'audio/wav',body:currentBytes}));
    for(const entry of report.tracks){
      const source=join(dirname(benchmarkPath),'artifacts',String(entry.number).padStart(2,'0'),'original.wav');
      currentBytes=await readFile(source);
      assert.equal(createHash('sha256').update(currentBytes).digest('hex'),entry.result.sha256);
      const score=parseComposition(JSON.parse(await readFile(join(dirname(source),'composition.json'),'utf8')),entry.input);
      assert.equal(score.genre,entry.genre);
      const clipId=randomUUID(),trackId=randomUUID();
      const arrangement={duration:120,bpm:score.bpm,snapBeats:1,masterVolume:0.8,lanes:[{id:randomUUID(),name:'Genre master',muted:false,volume:1,pan:0,lowpassHz:18000,delaySeconds:0.25,delayWet:0.08,clips:[{id:clipId,trackId,label:'A',start:0,offset:0,duration:60,volume:1,loop:false,fadeIn:0.01,fadeOut:0},{id:randomUUID(),trackId,label:'B',start:60,offset:60,duration:60,volume:1,loop:false,fadeIn:0,fadeOut:1}]}]};
      const result=await page.evaluate(async value=>{
        const {scheduleMix,exportHeadroom}=await import('/src/features/arrangement/mix.ts');
        const {pcmWav}=await import('/src/features/arrangement/arrangement.ts');
        const ctx=new OfflineAudioContext(2,44100*value.duration,44100);
        const source=await ctx.decodeAudioData(await(await fetch('/__studio_source')).arrayBuffer());
        const release=scheduleMix(ctx,value,new Map([[value.lanes[0].clips[0].trackId,source]]));
        const output=await ctx.startRendering();release();const stats=exportHeadroom(output);
        const bytes=new Uint8Array(await pcmWav(output).arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        return {encoded:btoa(binary),...stats};
      },arrangement);
      const fileName=`${String(entry.number).padStart(2,'0')}_${GENRE_PRESETS[entry.number-1].id}.wav`;
      const bytes=Buffer.from(result.encoded,'base64'); await writeFile(join(output,'Rendered',fileName),bytes,{flag:'wx'});
      results.genreExports.push({number:entry.number,genre:entry.genre,fileName,sourceSha256:entry.result.sha256,sha256:createHash('sha256').update(bytes).digest('hex'),peakDbfs:result.peakDbfs,attenuationDb:result.attenuationDb,arrangement});
      console.log(`EXPORT ${entry.number}/16 ${entry.genre} peak=${result.peakDbfs.toFixed(2)}dBFS`);
    }
  }
  await writeFile(join(output,'verification.json'),JSON.stringify(results,null,2)+'\n');
} finally {await browser.close();await app.close();}

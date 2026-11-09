const state = { timetableFile:null, examFile:null, courses:[], exams:[], noExamCourses:[], ocrDiscarded:[], results:[], filter:'all', query:'' };

const demoCourses = [
  {code:'MATH1201',name:'高等数学 A',classNo:'2',className:'2 班'},
  {code:'ENG2303',name:'大学英语 III',classNo:'3',className:'3 班'},
  {code:'CS1010',name:'Python 程序设计',classNo:'1',className:'1 班'},
  {code:'ECON2102',name:'宏观经济学',classNo:'2',className:'2 班'},
  {code:'STAT2001',name:'概率论与数理统计',classNo:'2',className:'2 班'}
];
const demoExams = [
  {code:'MATH1201',name:'高等数学 A',classNo:'2',className:'2 班',date:'2027-01-05',time:'09:00–11:00',location:'博学楼 B203',page:12,source:'学校期末考试安排.pdf'},
  {code:'CS1010',name:'Python 程序设计',classNo:'1',className:'1 班',date:'2027-01-06',time:'14:00–16:00',location:'信息楼机房 304',page:19,source:'学校期末考试安排.pdf'},
  {code:'ENG2303',name:'大学英语 III',classNo:'3',className:'3 班',date:'2027-01-08',time:'14:00–16:00',location:'求真楼 A106',page:25,source:'学校期末考试安排.pdf'},
  {code:'ENG2303',name:'大学英语 III',classNo:'4',className:'4 班',date:'2027-01-08',time:'14:00–16:00',location:'求真楼 A108',page:25,source:'学校期末考试安排.pdf'},
  {code:'ECON2102',name:'宏观经济学',classNo:'2',className:'2 班',date:'2027-01-12',time:'09:00–11:00',location:'明德楼 C401',page:33,source:'学校期末考试安排.pdf'},
  {code:'STAT2001',name:'概率论与数理统计',classNo:'2',className:'2 班',date:'2027-01-15',time:'09:00–11:00',location:'博学楼 B105',page:41,source:'学校期末考试安排.pdf'}
];

const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
function go(screen){
  $$('.screen').forEach(el=>el.classList.toggle('active',el.id===`screen-${screen}`));
  $$('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.go===screen));
  window.scrollTo({top:0,behavior:'smooth'});
  if(screen==='schedule') renderSchedule();
}
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));

function setFile(type,file){
  if(!file)return;
  const limit=type==='timetable'?20:50;
  if(file.size>limit*1024*1024){toast(`文件超过 ${limit}MB，请选择较小的文件`);return;}
  state[`${type}File`]=file;
  const result=$(`#${type}-result`);result.className='file-result has-file';
  result.innerHTML=`<div><b>${escapeHtml(file.name)}</b><span>${formatBytes(file.size)} · 已准备</span></div><span>✓</span>`;
  $('#start-parse').disabled=!(state.timetableFile&&state.examFile);
}
$('#timetable-input').addEventListener('change',e=>setFile('timetable',e.target.files[0]));
$('#exam-input').addEventListener('change',e=>setFile('exam',e.target.files[0]));
['timetable','exam'].forEach(type=>{
  const card=$(`#${type}-card .dropzone`);
  ['dragenter','dragover'].forEach(ev=>card.addEventListener(ev,e=>{e.preventDefault();card.classList.add('dragging')}));
  ['dragleave','drop'].forEach(ev=>card.addEventListener(ev,e=>{e.preventDefault();card.classList.remove('dragging')}));
  card.addEventListener('drop',e=>setFile(type,e.dataTransfer.files[0]));
});

function loadDemo(){
  state.timetableFile=new File(['示例课程表'],'个人课程表_示例.csv',{type:'text/csv'});
  state.examFile=new File(['示例考试安排'],'学校考试安排_示例.pdf',{type:'application/pdf'});
  ['timetable','exam'].forEach(type=>{const f=state[`${type}File`],result=$(`#${type}-result`);result.className='file-result has-file';result.innerHTML=`<div><b>${f.name}</b><span>示例数据 · 已准备</span></div><span>✓</span>`});
  $('#start-parse').disabled=false;toast('示例文件已放入，可以开始匹配');
}
$('#load-demo').addEventListener('click',loadDemo);
$('#demo-from-home').addEventListener('click',()=>{go('upload');loadDemo()});

$('#start-parse').addEventListener('click',async()=>{
  go('progress');resetProgress();
  try{
    const isDemo=state.timetableFile.name.includes('示例');
    updateProgress(12,0);
    await delay(450);
    if(isDemo){state.courses=structuredClone(demoCourses);state.exams=structuredClone(demoExams);state.noExamCourses=[]}
    else{
      const [courseText,examPages]=await Promise.all([extractFile(state.timetableFile),extractFile(state.examFile,true)]);
      updateProgress(38,1);await delay(350);
      const rawCourses=parseCourses(typeof courseText==='string'?courseText:courseText.map(p=>p.text).join('\n'));
      state.exams=parseExams(examPages,state.examFile.name);
      state.noExamCourses=parseNoExamCourses(examPages);
      const checked=canonicalizeCourses(rawCourses,state.exams,state.noExamCourses);state.courses=checked.courses;state.ocrDiscarded=checked.discarded;
      if(!state.courses.length||!state.exams.length){
        const detail=[];
        if(!state.courses.length)detail.push('课表中没有识别到“课程名（班级号）”');
        if(!state.exams.length)detail.push('考试 PDF 中没有识别到同时包含课程、日期和时间的记录');
        throw new Error(`课表初步读到 ${rawCourses.length} 项，经学校 PDF 校验后保留 ${state.courses.length} 门；考试安排识别 ${state.exams.length} 条。${detail.join('；')}。`);
      }
    }
    updateProgress(62,2);await delay(500);
    state.results=matchCourses(state.courses,state.exams,state.noExamCourses);
    updateProgress(88,3);await delay(450);updateProgress(100,4);
  }catch(err){
    $('#progress-title').textContent='暂时无法完成解析';$('#progress-subtitle').textContent=err.message;
    $('#view-result').classList.remove('hidden');$('#view-result').textContent='返回检查文件';$('#view-result').onclick=()=>go('upload');
  }
});
$('#view-result').addEventListener('click',()=>go('schedule'));

function resetProgress(){
  $('#progress-title').textContent='正在整理你的考试安排';$('#progress-subtitle').textContent='请稍候，文件正在你的浏览器中安全处理。';
  $('#view-result').classList.add('hidden');$('#view-result').textContent='查看我的考试安排 →';$('#view-result').onclick=()=>go('schedule');
  updateProgress(0,0);
}
function updateProgress(value,step){
  $('#progress-ring').style.setProperty('--progress',value);$('#progress-number').textContent=`${value}%`;$('#progress-bar-fill').style.width=`${value}%`;
  $$('.process-row').forEach((row,i)=>{row.classList.toggle('done',i<step||step===4);row.classList.toggle('active',i===step&&step<4);row.querySelector('em').textContent=(i<step||step===4)?'已完成':i===step?'进行中':'等待中';row.querySelector('.process-state').textContent=(i<step||step===4)?'✓':i+1});
  if(value===100){$('#progress-title').textContent='你的个人考试安排已生成';$('#progress-subtitle').textContent='匹配结果已整理完成，请检查待确认项目。';$('#view-result').classList.remove('hidden')}
}

async function extractFile(file,withPages=false){
  if(/\.(txt|csv)$/i.test(file.name))return await file.text();
  if(/\.(jpe?g|png)$/i.test(file.name)){
    if(!window.Tesseract)throw new Error('图片识别组件未能加载，请联网后刷新页面重试。');
    $('#progress-subtitle').textContent='正在按星期逐列识别课表，第一次可能需要约一分钟。';
    return await recognizeTimetableImage(file);
  }
  if(!/\.pdf$/i.test(file.name))throw new Error('当前 MVP 支持 JPG、PNG、PDF、CSV 和 TXT 文件。');
  let pdfjsLib;
  try{pdfjsLib=await import('./vendor/pdfjs/pdf.min.mjs')}catch(e){throw new Error('PDF 解析组件未能加载，请刷新页面后重试，或使用 CSV/TXT 文件。')}
  pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.mjs';
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,pages=[];
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();pages.push({page:i,text:pdfItemsToLines(content.items)})}
  return withPages?pages:pages.map(p=>p.text).join('\n');
}

function parseCourses(text){
  const lines=splitRows(text),out=[];
  for(let i=0;i<lines.length;i++){
    const nearby=lines.slice(i,i+3).join(' ');
    for(const identity of extractCourseIdentities(nearby)){
      const code=(nearby.match(/\b[A-Z]{2,}\s*[-_]?\s*\d{2,}\b/i)||[])[0]?.replace(/\s/g,'')||'';
      const existing=out.find(x=>x.classNo===identity.classNo&&normalize(x.name).includes(normalize(identity.name))||x.classNo===identity.classNo&&normalize(identity.name).includes(normalize(x.name)));
      if(!existing)out.push({code,name:identity.name,classNo:identity.classNo,className:`${identity.classNo} 班`,matchKey:identity.key});
      else if(identity.name.length>existing.name.length&&identity.name.length<100)Object.assign(existing,{name:identity.name,matchKey:identity.key});
    }
  }
  if(out.length)return out;
  for(const line of lines){const cells=splitCells(line);if(cells.length<2)continue;const code=cells.find(c=>/^[A-Z]{2,}\d{2,}$/i.test(c))||'';const name=cells.find(c=>/[\u4e00-\u9fa5]{2,}/.test(c)&&!/班|学院|学期|课程表|星期|周[一二三四五六日]/.test(c))||'';if(name&&!out.some(x=>normalize(x.name)===normalize(name)))out.push({code,name,classNo:'',className:'班级号待核对',matchKey:normalize(name)})}
  return out;
}
function parseExams(raw,fileName){
  const pages=typeof raw==='string'?[{page:1,text:raw}]:raw,out=[];
  for(const pg of pages){
    const lines=String(pg.text||'').replace(/\r/g,'').split('\n').map(normalizeDocumentText).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      const structured=parseStructuredExamRow(lines[i],pg.page,fileName);
      if(structured.length){for(const record of structured)if(!out.some(x=>x.matchKey===record.matchKey&&x.date===record.date&&x.location===record.location))out.push(record);continue}
      const identities=extractCourseIdentities(lines[i]);
      if(!identities.length)continue;
      const windowText=lines.slice(i,Math.min(lines.length,i+6)).join('  ');
      const date=findDate(windowText),time=findTime(windowText);
      if(!date||!time)continue;
      const code=(windowText.match(/\b[A-Z]{2,}\s*[-_]?\s*\d{2,}\b/i)||[])[0]?.replace(/\s/g,'')||'';
      for(const identity of identities){
        const location=findLocation(windowText,identity,date,time);
        const record={code,name:identity.name,classNo:identity.classNo,className:`${identity.classNo} 班`,matchKey:identity.key,date:normalizeDate(date),time:normalizeTime(time),location,page:pg.page,source:fileName};
        if(!out.some(x=>x.matchKey===record.matchKey&&x.date===record.date&&x.time===record.time&&x.location===record.location))out.push(record);
      }
    }
  }
  return out;
}
function matchCourses(courses,exams,noExamCourses=[]){return courses.map((course,index)=>{let candidates=[];let reason='';if(course.classNo){candidates=exams.filter(e=>normalize(e.name)===normalize(course.name)&&String(e.classNo)===String(course.classNo));reason='课程名（班级号）完整精确匹配'}if(!candidates.length&&course.code){candidates=exams.filter(e=>normalize(e.code)===normalize(course.code));reason='课程编号精确匹配'}const noExam=noExamCourses.find(x=>similarity(normalize(baseCourseName(x.name)),normalize(baseCourseName(course.name)))>=.9);if(!candidates.length&&noExam)return{id:`r${index}`,course,status:'no_exam',candidates:[],date:'no-exam',time:'无期末考试',location:'—',page:noExam.page,source:noExam.source,reason:'学校 PDF 的 No Final Examinations 清单'};if(!candidates.length){candidates=exams.filter(e=>similarity(normalize(e.name),normalize(course.name))>=.76);reason='课程名称相似匹配'}if(candidates.length>1&&course.classNo){const exactClass=candidates.filter(e=>String(e.classNo)===String(course.classNo));if(exactClass.length===1){candidates=exactClass;reason+=' + 括号班级号核验'}}const primary=candidates[0];if(!primary)return{id:`r${index}`,course,status:'unmatched',candidates:[],date:'undefined',time:'待核对',location:'待核对',reason:'没有找到对应考试'};return{id:`r${index}`,course,...primary,status:candidates.length===1?'confirmed':'review',candidates,reason}}).sort((a,b)=>(a.date==='no-exam'?1:0)-(b.date==='no-exam'?1:0)||String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time)))}
function canonicalizeCourses(rawCourses,exams,noExamCourses){
  const examCatalog=[...new Map(exams.map(x=>[`${normalize(x.name)}#${x.classNo}`,{name:x.name,classNo:x.classNo,code:x.code,source:'exam'}])).values()];
  const noExamCatalog=[...new Map(noExamCourses.map(x=>[normalize(x.name),{name:x.name,classNo:'',code:'',source:'no_exam'}])).values()];
  const courses=[],discarded=[];
  for(const raw of rawCourses){
    if(isInvalidOcrCourse(raw)){discarded.push(raw);continue}
    const sameSection=examCatalog.filter(x=>String(x.classNo)===String(raw.classNo)),pool=[...sameSection,...noExamCatalog];
    const ranked=pool.map(x=>{const baseScore=courseNameScore(raw.name,x.name);return{...x,baseScore,score:Math.min(1,baseScore+(x.source==='exam'?.1:0))}}).sort((a,b)=>b.score-a.score),best=ranked[0],second=ranked[1];
    const confident=best&&best.score>=.72&&(best.score-(second?.score||0)>=.035||best.baseScore>=.95);
    if(!confident){discarded.push(raw);continue}
    const course={code:best.code||raw.code,name:best.name,classNo:raw.classNo,className:`${raw.classNo} 班`,matchKey:`${normalize(best.name)}#${raw.classNo}`};
    if(!courses.some(x=>x.matchKey===course.matchKey))courses.push(course);
  }
  return{courses,discarded};
}
function courseNameScore(rawName,canonicalName){const raw=baseCourseName(rawName).toLowerCase().replace(/\b11\b/g,'ii'),canonical=baseCourseName(canonicalName).toLowerCase(),a=normalize(raw),b=normalize(canonical);if(a===b)return 1;if(a.length>=5&&(a.includes(b)||b.includes(a))){const ratio=Math.min(a.length,b.length)/Math.max(a.length,b.length);return.78+.2*ratio}const tokens=s=>s.replace(/[^a-z0-9\u4e00-\u9fa5]+/g,' ').split(/\s+/).filter(x=>x.length>1&&!['the','of','and','for','group'].includes(x)),at=tokens(raw),bt=tokens(canonical);if(!at.length||!bt.length)return 0;const common=at.filter(x=>bt.includes(x)).length,precision=common/at.length,recall=common/bt.length;return.74*precision+.26*recall}
function isInvalidOcrCourse(course){const n=normalizeDocumentText(course.name);return n.length<4||/^(?:T\d+-\d+|CC-\d+|SP-\d+)/i.test(n)||!/\p{L}/u.test(n)}

function renderSchedule(){
  const results=state.results,review=results.filter(r=>r.status==='review'||r.status==='unmatched').length,confirmed=results.filter(r=>r.status==='confirmed').length,noExam=results.filter(r=>r.status==='no_exam').length,blocked=state.ocrDiscarded.length;
  $('#stat-total').textContent=confirmed+results.filter(r=>r.status==='review').length;$('#stat-confirmed').textContent=confirmed;$('#stat-review').textContent=review;$('#review-badge').textContent=review;
  $('#schedule-summary').textContent=results.length?`识别到 ${confirmed+results.filter(r=>r.status==='review').length} 场考试${noExam?`，另有 ${noExam} 门课程列入“无期末考试”清单`:''}${blocked?`；已拦截 ${blocked} 条低置信 OCR 片段`:''}。`:'请先上传文件并完成匹配。';
  $('#review-panel').classList.toggle('hidden',!review&&!blocked);if(blocked&&!review){$('#review-panel b').textContent='已拦截低置信 OCR 结果';$('#review-panel p').textContent=`${blocked} 条疑似教室号、残缺课程名或重复文字没有被当作真实课程。请核对是否缺少课程。`;$('#open-first-review').classList.add('hidden')}else{$('#review-panel b').textContent='有课程需要你确认';$('#review-panel p').textContent=blocked?`有 ${review} 门课程待确认，另拦截 ${blocked} 条低置信 OCR 片段。`:'同名课程存在多个考试安排。请选择与你班级一致的一项。';$('#open-first-review').classList.remove('hidden')}const firstExam=results.find(r=>/^20\d{2}-/.test(r.date));$('#stat-countdown').textContent=firstExam?countdownText(firstExam.date):'—';
  const filtered=results.filter(r=>(state.filter==='all'||r.status===state.filter)&&(`${r.course.name} ${r.location} ${r.course.code}`.toLowerCase().includes(state.query.toLowerCase())));
  const groups=Object.groupBy?Object.groupBy(filtered,r=>r.date):filtered.reduce((a,r)=>((a[r.date]??=[]).push(r),a),{});
  $('#exam-list').innerHTML=Object.entries(groups).map(([date,items])=>`<div class="exam-day"><div class="day-marker">${dateParts(date)}</div><div class="exam-items">${items.map(examCard).join('')}</div></div>`).join('');
  $('#empty-state').classList.toggle('hidden',filtered.length>0);$$('.exam-card').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.id)));
}
function examCard(r){const label=r.status==='review'?'待确认':r.status==='no_exam'?'无期末考试':r.status==='unmatched'?'未匹配':'已确认';return `<article class="exam-card ${r.status==='review'||r.status==='unmatched'?'review-item':''}" data-id="${r.id}"><div class="exam-course-icon">${escapeHtml(r.course.name[0])}</div><div class="exam-name"><b>${escapeHtml(displayCourse(r.course))}</b><span>${escapeHtml(r.course.code||'无课程编号')} · ${escapeHtml(r.course.className||'班级待核对')}</span></div><div class="exam-meta"><span>◷ ${escapeHtml(r.time||'待核对')}</span><span>⌖ ${escapeHtml(r.location||'待核对')}</span></div><span class="exam-status ${r.status==='review'||r.status==='unmatched'?'review':''}">${label}</span></article>`}
function dateParts(date){if(date==='no-exam')return`<small>课程</small><b>—</b><span>无笔试</span>`;if(date==='undefined'||!date)return`<small>信息</small><b>?</b><span>待核对</span>`;const d=new Date(`${date}T00:00:00`),week=['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];return `<small>${d.getMonth()+1} 月</small><b>${String(d.getDate()).padStart(2,'0')}</b><span>${week}</span>`}
$$('.tabs button').forEach(b=>b.addEventListener('click',()=>{$$('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;renderSchedule()}));
$('#search-input').addEventListener('input',e=>{state.query=e.target.value;renderSchedule()});
$('#open-first-review').addEventListener('click',()=>{const r=state.results.find(x=>x.status==='review');if(r)openDetail(r.id)});

function openDetail(id){
  const r=state.results.find(x=>x.id===id);if(!r)return;
  const candidates=r.status==='review'?`<div class="candidate-list"><h4>请选择与你班级一致的考试安排</h4>${r.candidates.map((c,i)=>`<div class="candidate"><div><b>${escapeHtml(c.className||'班级未注明')} · ${escapeHtml(c.location)}</b><span>${escapeHtml(c.date)} ${escapeHtml(c.time)} · 原文件第 ${c.page} 页</span></div><button data-choose="${i}" data-id="${r.id}">选择此项</button></div>`).join('')}</div>`:'';
  const statusText=r.status==='review'?'需要你确认':r.status==='no_exam'?'无期末考试':r.status==='unmatched'?'尚未匹配':'匹配已确认',dateText=r.status==='no_exam'?'—':r.date;
  $('#modal-content').innerHTML=`<div class="detail-head"><span class="status-label ${r.status==='review'||r.status==='unmatched'?'review':''}">${statusText}</span><h3 id="modal-title">${escapeHtml(displayCourse(r.course))}</h3><p>${escapeHtml(r.course.code||'无课程编号')} · ${escapeHtml(r.course.className||'班级待核对')}</p></div><div class="detail-main"><div class="detail-box"><small>考试日期</small><b>${escapeHtml(dateText)}</b></div><div class="detail-box"><small>考试时间</small><b>${escapeHtml(r.time)}</b></div><div class="detail-box"><small>考试地点</small><b>${escapeHtml(r.location)}</b></div><div class="detail-box"><small>考试班级</small><b>${escapeHtml(r.className||r.course.className||'待核对')}</b></div></div><div class="source-proof"><span>来源证据</span><p>${escapeHtml(r.source||'学校考试安排 PDF')} · 第 ${r.page||'—'} 页<br>ExamMate 保留原始页码，请在重要考试前回到学校原文件再次核对。</p></div><p class="match-reason">匹配依据：${escapeHtml(r.reason)}</p>${candidates}`;
  $('#detail-modal').classList.remove('hidden');$$('[data-choose]').forEach(b=>b.addEventListener('click',()=>chooseCandidate(b.dataset.id,Number(b.dataset.choose))));
}
function chooseCandidate(id,index){const r=state.results.find(x=>x.id===id),c=r.candidates[index];Object.assign(r,c,{status:'confirmed',candidates:[c],reason:'用户人工确认'});$('#detail-modal').classList.add('hidden');renderSchedule();toast('已保存你的确认结果')}
$('.modal-close').addEventListener('click',()=>$('#detail-modal').classList.add('hidden'));$('#detail-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add('hidden')});document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#detail-modal').classList.add('hidden')});

function splitRows(text){return String(text||'').replace(/\r/g,'').split(/\n|(?=\b[A-Z]{2,}\d{2,}\b)/).map(x=>normalizeDocumentText(x)).filter(Boolean)}
function splitCells(line){return line.split(/\t|,|;|\s{2,}/).map(x=>x.trim()).filter(Boolean)}
function extractCourseIdentity(line=''){return extractCourseIdentities(line)[0]||null}
function extractCourseIdentities(line=''){
  const clean=normalizeDocumentText(line);
  const results=[],pattern=/([A-Za-z\u4e00-\u9fa5][A-Za-z\u4e00-\u9fa50-9·&,'’:\-() ]{1,120}?)\s*\(\s*(\d{4})\s*\)/g;
  for(const match of clean.matchAll(pattern)){
    let name=cleanCourseName(match[1]);
    const classNo=match[2];if(name.length>=2)results.push({name,classNo,key:`${normalize(name)}#${classNo}`});
  }
  return results;
}
function displayCourse(course){return course.classNo?`${course.name}（${course.classNo}）`:course.name}
function pdfItemsToLines(items){const rows=[];for(const item of items){const y=Math.round((item.transform?.[5]||0)/2)*2;let row=rows.find(r=>Math.abs(r.y-y)<=2);if(!row){row={y,items:[]};rows.push(row)}row.items.push({x:item.transform?.[4]||0,text:item.str})}return rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join('  ')).join('\n')}
function normalizeDocumentText(s=''){return String(s).normalize('NFKC').replace(/[—－~～至]/g,'–').replace(/[：]/g,':').replace(/[，]/g,',').replace(/\s+/g,' ').trim()}
function cleanCourseName(s=''){return normalizeDocumentText(s).replace(/^(?:\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\s*)+/,'').replace(/^(?:Time|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/i,'').replace(/^(?:星期[一二三四五六日]|周[一二三四五六日]|课程名称|课程名|课程)+/,'').replace(/^(?:T\d+-\d+|CC-\d+|SP-\d+(?:\s+Zone\s+[A-Z])?)\s+/i,'').replace(/^(?:[A-Z]{2,}\s+)?[A-Z]{2,}\d{2,}\s+/i,'').trim()}
function parseStructuredExamRow(line,page,fileName){const m=normalizeDocumentText(line).match(/^(20\d{2}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2})\s+([A-Z]+)\s+([A-Z0-9]+)\s+(.+?)\s+((?:\(\d{4}(?:-\d{4})?\)\s*)+)(.+)$/i);if(!m)return[];const [,date,time,,code,rawName,rawSections,venue]=m,name=cleanCourseName(rawName),sections=[];for(const token of rawSections.matchAll(/\((\d{4})(?:-(\d{4}))?\)/g)){const start=Number(token[1]),end=Number(token[2]||token[1]);for(let n=start;n<=end&&n-start<50;n++)sections.push(String(n))}return sections.map(classNo=>({code,name,classNo,className:`${classNo} 班`,matchKey:`${normalize(name)}#${classNo}`,date:normalizeDate(date),time:normalizeTime(time),location:venue.trim(),page,source:fileName}))}
function parseNoExamCourses(raw){const pages=typeof raw==='string'?[{page:1,text:raw}]:raw,out=[];for(const pg of pages){if(!/No Final Examinations/i.test(pg.text))continue;const lines=String(pg.text||'').replace(/\r/g,'').split('\n').map(normalizeDocumentText).filter(Boolean);for(const line of lines){const pattern=/\(\d+\)\s+[A-Z]+\s+[A-Z0-9]+\s+(.+?)(?=\s+\(\d+\)\s+[A-Z]+\s+[A-Z0-9]+\s+|$)/gi;for(const m of line.matchAll(pattern)){const name=cleanCourseName(m[1]);if(name&&!out.some(x=>normalize(x.name)===normalize(name)))out.push({name,page:pg.page,source:'学校考试安排 PDF'})}}}return out}
function baseCourseName(name=''){return normalizeDocumentText(name).split('(')[0].trim()}
function findDate(text=''){return (text.match(/20\d{2}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?/)||text.match(/\d{1,2}\s*[-/.]\s*\d{1,2}(?!\s*:)/)||text.match(/\d{1,2}\s*月\s*\d{1,2}\s*日/))?.[0]||''}
function findTime(text=''){return (text.match(/\d{1,2}\s*:\s*\d{2}\s*[-–]\s*\d{1,2}\s*:\s*\d{2}/)||text.match(/(?:上午|下午|晚上)?\s*\d{1,2}\s*:\s*\d{2}/))?.[0]||''}
function findLocation(text='',identity,date,time){const cells=splitCells(text);const known=cells.find(c=>/(教学楼|实验楼|信息楼|博学楼|求真楼|明德楼|体育馆|机房|教室|考场|校区|\b[A-Z]\d{2,4}\b|\d{2,4}室)/i.test(c)&&!c.includes(identity.name));if(known)return known.replace(date,'').replace(time,'').trim().slice(0,50);return'地点待核对'}
function normalizeTime(s=''){return normalizeDocumentText(s).replace(/\s/g,'')}
async function recognizeTimetableImage(file){const crops=await prepareTimetableCrops(file),texts=[],worker=await window.Tesseract.createWorker('eng',1,{workerPath:'./vendor/tesseract/worker.min.js',corePath:'./vendor/tesseract/core',langPath:'./vendor/tesseract/lang',logger:m=>{if(m.status==='recognizing text'&&Number.isFinite(m.progress)){const base=texts.length/Math.max(1,crops.length),p=(base+m.progress/crops.length)*30;$('#progress-number').textContent=`${Math.max(12,Math.round(12+p))}%`}}});try{await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});for(const crop of crops){const result=await worker.recognize(crop);texts.push(result.data.text)}}finally{await worker.terminate()}return texts.join('\n')}
async function prepareTimetableCrops(file){return await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=async()=>{try{const scale=Math.min(3,2600/img.width),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<data.data.length;i+=4){const gray=.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2],v=gray<190?Math.max(0,gray-32):Math.min(255,gray+18);data.data[i]=data.data[i+1]=data.data[i+2]=v}ctx.putImageData(data,0,0);const x0=Math.round(canvas.width*.17),y0=Math.round(canvas.height*.12),y1=Math.round(canvas.height*.92),columnWidth=(canvas.width-x0)/5,crops=[];for(let i=0;i<5;i++){const sx=Math.round(x0+i*columnWidth+4),sw=Math.round(columnWidth-8),sh=y1-y0,crop=document.createElement('canvas');crop.width=sw;crop.height=sh;crop.getContext('2d').drawImage(canvas,sx,y0,sw,sh,0,0,sw,sh);crops.push(await new Promise((res,rej)=>crop.toBlob(b=>b?res(b):rej(new Error('课表分栏失败')),'image/png')))}URL.revokeObjectURL(url);resolve(crops)}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('无法读取课表图片'))};img.src=url})}
function normalize(s=''){return s.toLowerCase().replace(/[\s（）()\-_]/g,'')}
function similarity(a,b){if(!a||!b)return 0;if(a.includes(b)||b.includes(a))return 1;const set=new Set(a),common=[...new Set(b)].filter(x=>set.has(x)).length;return common/Math.max(new Set(a).size,new Set(b).size)}
function normalizeDate(s){const full=String(s).match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);if(full)return`${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}`;const short=String(s).match(/(\d{1,2})\D+(\d{1,2})/);if(!short)return s;const month=Number(short[1]),now=new Date(),year=month<now.getMonth()+1?now.getFullYear()+1:now.getFullYear();return`${year}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`}
function countdownText(date){const n=Math.ceil((new Date(`${date}T00:00:00`)-new Date())/86400000);return n>0?`${n} 天`:n===0?'今天':'已开始'}
function formatBytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add('hidden'),2600)}

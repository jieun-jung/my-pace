import React, { useEffect, useMemo, useRef, useState } from "react";
import { getValidAccessToken, isSupabaseConfigured, loadAccountData, readAuthSession, saveAccountData, signIn, signOut, signUp } from "./supabase.js";

const KEY = "my-pace.data.v1";
const MIGRATION_KEY = "my-pace.cloud-migration-owner.v1";
const THEME_KEY = "my-pace.theme.v1";
const COLOR_KEY = "my-pace.custom-color.v1";
const validThemes = ["blue","mint","sunshine","lavender","custom"];
const readTheme = () => { try { const value=localStorage.getItem(THEME_KEY); return validThemes.includes(value)?value:"blue"; } catch { return "blue"; } };
const readCustomColor = () => { try { return localStorage.getItem(COLOR_KEY)||"#69a9e8"; } catch { return "#69a9e8"; } };
const todayKey = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const dateKey = (year,month,day) => year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
const dateLabel = (key) => new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date(key+"T12:00:00"));
const makeId = () => globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random();
const readData = () => { try { const v=JSON.parse(localStorage.getItem(KEY)||"{}"); return {books:v.books||[],sessions:v.sessions||[]}; } catch { return {books:[],sessions:[]}; } };
const fmt = (value) => { const n=Math.max(0,Math.floor(value||0)); return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"); };
const totalTime = (s) => s.questions.reduce((sum,q)=>sum+q.seconds,0);
const elapsedSeconds = (startedAt,now=Date.now()) => Math.max(0,Math.floor((now-startedAt)/1000));
const bookName = (books,id) => books.find((b)=>b.id===id)?.name||"문제집";
const bookPalette = [{tint:"#f1f7ff",accent:"#4385c5",border:"#d3e3f5"},{tint:"#eff9f4",accent:"#398b69",border:"#cce7d9"},{tint:"#f6f3ff",accent:"#8069ba",border:"#ddd5f1"},{tint:"#fff8eb",accent:"#ad7c27",border:"#eddfbd"},{tint:"#fff3f1",accent:"#bc6258",border:"#f0d7d2"}];
const bookColor = (id) => { let hash=0; for(const char of String(id||"")) hash=(hash*31+char.charCodeAt(0))|0; return bookPalette[Math.abs(hash)%bookPalette.length]; };
const isSolved = (q) => q.seconds>0 || q.result!=="pending";
const rate = (correct,total) => total ? Math.round(correct/total*100) : null;
const accuracyTone = (value) => value===null?"":value<70?"accuracy-low":value<80?"accuracy-medium":"accuracy-high";
function statsForBook(sessions,bookId){
  const questions=sessions.filter((s)=>s.bookId===bookId).flatMap((s)=>s.questions);
  const graded=questions.filter((q)=>q.result==="correct"||q.result==="wrong");
  const correct=graded.filter((q)=>q.result==="correct").length;
  return {total:questions.length,solved:questions.filter(isSolved).length,graded:graded.length,correct,accuracy:rate(correct,graded.length)};
}
function resizePhoto(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/")){reject(new Error("이미지 파일을 골라주세요."));return;}
    if(file.size>12*1024*1024){reject(new Error("사진은 12MB 이하로 선택해주세요."));return;}
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("사진을 읽지 못했어요."));
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>reject(new Error("사진을 열지 못했어요."));
      image.onload=()=>{
        const scale=Math.min(1,720/Math.max(image.width,image.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(image.width*scale));
        canvas.height=Math.max(1,Math.round(image.height*scale));
        canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",0.78));
      };
      image.src=String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function App(){
  const [data,setData]=useState(readData),[page,setPage]=useState("home"),[sessionId,setSessionId]=useState(""),[editingBookId,setEditingBookId]=useState(""),[selectedDate,setSelectedDate]=useState(todayKey()),[planDate,setPlanDate]=useState(todayKey()),[calendarMonth,setCalendarMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);}),[theme,setTheme]=useState(readTheme),[customColor,setCustomColor]=useState(readCustomColor),[modal,setModal]=useState(""),[tick,setTick]=useState(Date.now()),[toast,setToast]=useState("");
  const [authSession,setAuthSession]=useState(readAuthSession),[cloudReady,setCloudReady]=useState(false),[cloudError,setCloudError]=useState(""),[syncStatus,setSyncStatus]=useState("saved"),[loadAttempt,setLoadAttempt]=useState(0);
  const saveQueue=useRef(Promise.resolve());
  useEffect(()=>{
    if(!authSession?.user?.id){setCloudReady(false);return;}
    let cancelled=false;
    setCloudReady(false);setCloudError("");
    loadAccountData(authSession.user.id).then((cloudData)=>{
      if(cancelled)return;
      if(cloudData){setData(cloudData);localStorage.setItem(MIGRATION_KEY,authSession.user.id);}
      else{
        const owner=localStorage.getItem(MIGRATION_KEY);
        setData(owner&&owner!==authSession.user.id?{books:[],sessions:[]}:readData());
      }
      setSyncStatus("saved");setCloudReady(true);
    }).catch((error)=>{if(!cancelled)setCloudError(error.message||"서버에서 기록을 불러오지 못했어요.");});
    return()=>{cancelled=true;};
  },[authSession?.user?.id,loadAttempt]);
  useEffect(()=>{if(cloudReady){try{localStorage.setItem(KEY,JSON.stringify(data));}catch{setToast("기기 저장 공간이 부족해요. 사진을 정리해주세요.");}}},[data,cloudReady]);
  useEffect(()=>{
    const userId=authSession?.user?.id;
    if(!cloudReady||!userId)return;
    const snapshot=data;
    let cancelled=false;
    setSyncStatus("saving");
    const timer=setTimeout(()=>{
      const task=saveQueue.current.catch(()=>{}).then(()=>saveAccountData(snapshot,userId));
      saveQueue.current=task.catch(()=>{});
      task.then(({localData,photosChanged})=>{
        if(cancelled)return;
        localStorage.setItem(MIGRATION_KEY,userId);
        if(photosChanged)setData((current)=>current===snapshot?localData:current);
        setSyncStatus("saved");
      }).catch((error)=>{if(!cancelled){setSyncStatus("error");setToast(`서버 저장 실패: ${error.message}`);}});
    },700);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[data,cloudReady,authSession?.user?.id]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty("--custom-color",customColor);localStorage.setItem(THEME_KEY,theme);localStorage.setItem(COLOR_KEY,customColor);},[theme,customColor]);
  useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),500);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2200);return()=>clearTimeout(t);},[toast]);
  const today=todayKey(),sessions=data.sessions.filter((s)=>s.date===today),current=data.sessions.find((s)=>s.id===sessionId),editingBook=data.books.find((b)=>b.id===editingBookId);
  const wrongs=useMemo(()=>data.sessions.flatMap((s)=>s.questions.filter((q)=>q.result==="wrong").map((q)=>({...q,sessionId:s.id,bookId:s.bookId,book:bookName(data.books,s.bookId),date:s.date,pageStart:s.pageStart,pageEnd:s.pageEnd}))),[data]);
  const todayQuestions=sessions.flatMap((s)=>s.questions),todaySolved=todayQuestions.filter(isSolved).length,todayGraded=todayQuestions.filter((q)=>q.result==="correct"||q.result==="wrong"),todayCorrect=todayGraded.filter((q)=>q.result==="correct").length,todaySeconds=sessions.reduce((sum,s)=>sum+totalTime(s),0);
  const monthKey=today.slice(0,7),monthSessions=data.sessions.filter((s)=>s.date.startsWith(monthKey)),monthSeconds=monthSessions.reduce((sum,s)=>sum+s.questions.reduce((seconds,q)=>seconds+q.seconds+(q.startedAt?elapsedSeconds(q.startedAt,tick):0),0),0),monthStudyDays=new Set(monthSessions.filter((s)=>totalTime(s)>0||s.questions.some((q)=>q.startedAt)).map((s)=>s.date)).size,monthHours=Math.floor(monthSeconds/3600),monthMinutes=Math.floor(monthSeconds%3600/60);
  const message=(x)=>setToast(x);
  const openPlan=(date=today)=>{setPlanDate(date);setModal("plan");};
  const updateSession=(sid,fn)=>setData((old)=>({...old,sessions:old.sessions.map((s)=>s.id===sid?fn(s):s)}));
  function moveSession(sid,newDate){if(!newDate)return;const session=data.sessions.find((s)=>s.id===sid);if(session?.questions.some((q)=>q.startedAt)){message("타이머를 멈춘 뒤 날짜를 바꿔주세요.");return;}updateSession(sid,(s)=>({...s,date:newDate}));setSelectedDate(newDate);const d=new Date(newDate+"T12:00:00");setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1));message("달력 날짜를 변경했어요.");}
  const enter=(s)=>{setSessionId(s.id);setPage(s.status==="grading"||s.status==="done"?"grading":"solve");};
  async function addBook(e){e.preventDefault();const f=new FormData(e.currentTarget);const photoFile=f.get("photo");let photo="";if(photoFile?.size){try{photo=await resizePhoto(photoFile);}catch(error){message(error.message);return;}}const b={id:makeId(),name:String(f.get("name")).trim(),grade:String(f.get("grade")||"").trim(),publisher:String(f.get("publisher")||"").trim(),difficulty:String(f.get("difficulty")||"보통"),photo};if(!b.name)return;setData((d)=>({...d,books:[...d.books,b]}));setModal("");message("문제집을 등록했어요.");}
  function editBook(book){setEditingBookId(book.id);setPage("book-edit");}
  async function saveBook(e){e.preventDefault();if(!editingBook)return;const f=new FormData(e.currentTarget),photoFile=f.get("photo"),removePhoto=f.get("removePhoto")==="on",photoChanged=Boolean(photoFile?.size)||removePhoto;let photo=removePhoto?"":editingBook.photo||"";if(photoFile?.size){try{photo=await resizePhoto(photoFile);}catch(error){message(error.message);return;}}const changes={name:String(f.get("name")).trim(),grade:String(f.get("grade")||"").trim(),publisher:String(f.get("publisher")||"").trim(),difficulty:String(f.get("difficulty")||"보통"),photo,photoPath:photoChanged?"":editingBook.photoPath||""};if(!changes.name){message("문제집 이름을 입력해주세요.");return;}setData((d)=>({...d,books:d.books.map((b)=>b.id===editingBook.id?{...b,...changes}:b)}));setPage("books");setEditingBookId("");message("문제집 정보를 수정했어요.");}
  function addPlan(e){e.preventDefault();const f=new FormData(e.currentTarget),bookId=String(f.get("bookId")),sessionDate=String(f.get("date")||today),ps=Number(f.get("ps")),pe=Number(f.get("pe")),qs=Number(f.get("qs")),qe=Number(f.get("qe"));if(!bookId||[ps,pe,qs,qe].some((n)=>!Number.isInteger(n)||n<1)||pe<ps||qe<qs){message("페이지와 문항 범위를 확인해주세요.");return;}if(qe-qs+1>300){message("한 번에 최대 300문제까지 등록할 수 있어요.");return;}const questions=[];for(let n=qs;n<=qe;n++)questions.push({id:makeId(),page:null,number:n,seconds:0,startedAt:null,result:"pending",reason:"",strategy:""});const s={id:makeId(),bookId,date:sessionDate,pageStart:ps,pageEnd:pe,questionStart:qs,questionEnd:qe,questions,currentIndex:0,status:"planned"};setData((d)=>({...d,sessions:[...d.sessions,s]}));setModal("");setSelectedDate(sessionDate);if(sessionDate===today){setSessionId(s.id);setPage("solve");}else{setSessionId("");const d=new Date(sessionDate+"T12:00:00");setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1));setPage("calendar");message("선택한 날짜에 풀이를 등록했어요.");}}
  function start(){if(!current)return;updateSession(current.id,(s)=>({...s,status:"active",questions:s.questions.map((q,i)=>i===s.currentIndex?{...q,startedAt:Date.now()}:q)}));}
  function stop(){const q=current?.questions[current.currentIndex];if(!q?.startedAt)return;const elapsed=elapsedSeconds(q.startedAt);updateSession(current.id,(s)=>({...s,questions:s.questions.map((x,i)=>i===s.currentIndex?{...x,seconds:x.seconds+elapsed,startedAt:null}:x)}));message("문제 풀이 시간을 기록했어요.");}
  function next(){if(!current)return;if(current.currentIndex===current.questions.length-1){updateSession(current.id,(s)=>({...s,status:"grading"}));setPage("grading");}else updateSession(current.id,(s)=>({...s,currentIndex:s.currentIndex+1}));}
  function answer(qid,result){updateSession(current.id,(s)=>({...s,questions:s.questions.map((q)=>q.id===qid?{...q,result}:q)}));}
  function saveNote(sid,qid,field,value){updateSession(sid,(s)=>({...s,questions:s.questions.map((q)=>q.id===qid?{...q,[field]:value,...(field==="photo"&&q.photo!==value?{photoPath:""}:{})}:q)}));}
  function finish(){if(current.questions.some((q)=>q.result==="pending")){message("모든 문항의 정답 여부를 골라주세요.");return;}updateSession(current.id,(s)=>({...s,status:"done",finishedAt:Date.now()}));setPage("home");setSessionId("");message("풀이와 채점을 저장했어요.");}
  async function handleSignIn(email,password){const next=await signIn(email,password);setAuthSession(next);}
  async function handleSignUp(email,password){const next=await signUp(email,password);if(next)setAuthSession(next);return next;}
  async function handleSignOut(){try{await signOut();}finally{setAuthSession(null);setCloudReady(false);setCloudError("");setData({books:[],sessions:[]});setPage("home");}}
  function retryCloudSave(){setSyncStatus("saving");setData((current)=>({...current}));}
  const nav=[["home","⌂","오늘의 공부"],["calendar","▦","달력"],["books","▤","내 문제집"],["mistakes","↻","오답 노트"],["report","▧","레포트"]];
  if(!isSupabaseConfigured)return <AccountScreen title="서버 저장 설정이 필요해요" subtitle="Supabase 프로젝트를 만들고 앱 환경 변수를 등록해주세요." setup/>;
  if(!authSession)return <AuthView onSignIn={handleSignIn} onSignUp={handleSignUp}/>;
  if(cloudError)return <AccountScreen title="서버에 연결하지 못했어요" subtitle={cloudError} action={<><button className="primary" onClick={()=>{setCloudError("");setLoadAttempt((n)=>n+1);}}>다시 연결</button><button className="auth-secondary" onClick={handleSignOut}>로그아웃</button></>}/>;
  if(!cloudReady)return <AccountScreen title="기록을 불러오는 중이에요" subtitle="계정에 저장된 문제집과 풀이 기록을 확인하고 있어요." loading/>;
  return <div className="shell">
    <aside className="sidebar"><button className="brand" onClick={()=>{setPage("home");setSessionId("");}}><span className="brand-mark">m<span>.</span></span><span><b>my pace</b><small>fast & accurate</small></span></button><div className="side-caption">공부 관리</div><nav>{nav.map(([key,icon,label])=><button key={key} className={"nav-item "+(page===key||(key==="books"&&page==="book-edit")?"active":"")} onClick={()=>{setPage(key);setSessionId("");}}><span>{icon}</span>{label}{key==="mistakes"&&wrongs.length>0&&<i>{wrongs.length}</i>}</button>)}</nav><div className="side-quote"><span>✳</span><p>빠르고 정확하게<br/><b>확실한 한 문제</b>씩.</p><small>시간은 줄이고, 정확도는 높이고</small></div><div className="side-foot">기록은 계정에 저장돼요</div></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand">m<span>.</span> my pace</div><div className="storage">{syncStatus!=="saved"&&<><i className={syncStatus==="error"?"sync-error":"sync-saving"}/>{syncStatus==="saving"?"서버 저장 중":<button className="sync-retry" onClick={retryCloudSave}>저장 재시도</button>}</>}<b>{authSession.user.email?.slice(0,1).toUpperCase()||"MP"}</b><button className="logout-button" onClick={handleSignOut}>로그아웃</button></div></header>
      {page==="home"&&<section className="view">
        <div className="month-focus"><div className="month-focus-copy"><span>{new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long"}).format(new Date())}</span><h2>이번 달 순공 시간</h2><p>문제 풀이에 집중한 시간만 합산해요.</p></div><div className="month-focus-time" aria-label={`${monthHours}시간 ${monthMinutes}분`}><b>{monthHours}<small>시간</small></b><span>{String(monthMinutes).padStart(2,"0")}분</span></div><div className="month-focus-days"><b>{monthStudyDays}</b><span>일 공부</span></div></div>
        <header className="page-heading today-date-heading"><div><div className="eyebrow">{new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long"}).format(new Date())}</div></div></header>
        <div className="section-title today-stats-title"><div><h2>오늘의 공부</h2><p>오늘의 진행 상황과 집중 시간을 모아봤어요.</p></div></div>
        <div className="stats stats-combined"><Stat label="진행률" value={(rate(todaySolved,todayQuestions.length)??0)+"%"} detail={todaySolved+" / "+todayQuestions.length+" 문항"} progress={rate(todaySolved,todayQuestions.length)??0} icon="✎" color="mint"/><Stat label="정답률" tone={accuracyTone(rate(todayCorrect,todayGraded.length))} value={rate(todayCorrect,todayGraded.length)===null?"—":rate(todayCorrect,todayGraded.length)+"%"} detail={todayGraded.length?todayCorrect+" / "+todayGraded.length+" 정답":"채점 후 표시돼요"} progress={rate(todayCorrect,todayGraded.length)??0} icon="✓" color="lilac"/><Stat label="집중 시간" value={fmt(todaySeconds)} detail="문항별 풀이 시간 합계" icon="◷" color="sun"/></div>
        <div className="section-title"><div><h2>오늘 풀 문제</h2><p>문제집과 범위를 정하고 타이머를 시작해요.</p></div>{sessions.length>0&&<button className="subtle" onClick={()=>openPlan(today)}>＋ 새 풀이 추가</button>}</div>
        {!data.books.length?<Empty icon="▤" title="먼저 문제집을 등록해볼까요?" text="문제집을 등록하면 오늘 풀 범위를 바로 만들 수 있어요." action="문제집 등록하기" onClick={()=>setModal("book")}/>:!sessions.length?<Empty icon="◷" title="오늘의 첫 풀이를 계획해봐요" text="페이지와 문항 범위를 한 번에 입력할 수 있어요." action="오늘 풀 범위 정하기" onClick={()=>openPlan(today)}/>:<div className="session-list">{sessions.map((s)=><SessionRow key={s.id} session={s} books={data.books} onClick={()=>enter(s)}/>)}</div>}
        <div className="footnote">ⓘ 풀이 시간은 문항별 합계로 계산해 문제 사이 쉬는 시간은 포함되지 않아요.</div>
      </section>}
      {page==="calendar"&&<CalendarView sessions={data.sessions} books={data.books} selectedDate={selectedDate} month={calendarMonth} onSelect={setSelectedDate} onMonth={setCalendarMonth} onPlan={()=>data.books.length?openPlan(selectedDate):(setPage("books"),message("먼저 문제집을 등록해주세요."))} onOpen={enter} onMove={moveSession}/>}
      {page==="report"&&<ReportView sessions={data.sessions} books={data.books}/>}
      {page==="books"&&<section className="view"><PageHeading eyebrow="MY WORKBOOKS" title="내 문제집" subtitle="문제집별 풀이 기록과 누적 정답률을 확인해요." action={<button className="primary" onClick={()=>setModal("book")}>＋ 문제집 등록</button>}/>{!data.books.length?<Empty icon="▤" title="아직 등록된 문제집이 없어요" text="문제집 이름과 학년을 등록하면 오늘의 풀이를 만들 수 있어요." action="첫 문제집 등록하기" onClick={()=>setModal("book")}/>:<div className="book-grid">{data.books.map((b,i)=><WorkbookCard key={b.id} book={b} index={i} sessions={data.sessions} onEdit={()=>editBook(b)} />)}<button className="add-book" onClick={()=>setModal("book")}><span>＋</span>문제집 추가</button></div>}</section>}
      {page==="book-edit"&&editingBook&&<BookEditView book={editingBook} onBack={()=>{setPage("books");setEditingBookId("");}} onSave={saveBook}/>}
      {page==="mistakes"&&<MistakesView wrongs={wrongs} books={data.books} onSave={saveNote}/>}
      {page==="solve"&&current&&<section className="view focus-view"><button className="back-link" onClick={()=>setPage("home")}>← 오늘의 공부</button><div className="focus-heading"><div><div className="eyebrow">FOCUS MODE · {bookName(data.books,current.bookId)}</div><h1>빠르게 풀고, 정확하게<span>.</span></h1><p>{current.pageStart}–{current.pageEnd}쪽 · 총 {current.questions.length}문제</p></div><div className="focus-count"><b>{current.currentIndex+1}</b> / {current.questions.length}</div></div><div className="focus-progress"><div className="progress"><i style={{width:(current.currentIndex/current.questions.length*100)+"%"}}/></div><span>{current.questions.filter(isSolved).length}개 기록</span></div>
        <div className="timer-card"><div className="timer-top"><span><i className={current.questions[current.currentIndex].startedAt?"pulse":""}/>{current.questions[current.currentIndex].startedAt?"집중하는 중":"현재 문항"}</span><small>{bookName(data.books,current.bookId)}</small></div><div className="q-number"><small>{current.questions[current.currentIndex].page?`${current.questions[current.currentIndex].page}쪽`:"전체 범위"}</small><b>{current.questions[current.currentIndex].number}<i>번</i></b></div><div className={"timer "+(current.questions[current.currentIndex].startedAt?"running":"")}>{fmt(current.questions[current.currentIndex].seconds+(current.questions[current.currentIndex].startedAt?elapsedSeconds(current.questions[current.currentIndex].startedAt,tick):0))}</div><p className="timer-help">{current.questions[current.currentIndex].startedAt?"다 풀면 종료 버튼을 눌러주세요.":"시작 버튼을 누르면 풀이 시간을 재요."}</p><div className="timer-actions">{current.questions[current.currentIndex].startedAt?<button className="stop" onClick={stop}>■　종료</button>:<button className="start" onClick={start}>▶　시작</button>}{!current.questions[current.currentIndex].startedAt&&current.questions[current.currentIndex].seconds>0&&<button className="next" onClick={next}>{current.currentIndex===current.questions.length-1?"채점하기":"다음 문제"}　→</button>}</div><div className="timer-total"><span>지금까지 푼 시간</span><b>{fmt(totalTime(current)+current.questions.reduce((n,q)=>n+(q.startedAt?elapsedSeconds(q.startedAt,tick):0),0))}</b></div></div>
        <div className="q-progress"><h2>문항 진행</h2><p>문항 번호를 눌러 다시 풀 수 있어요. 재풀이 시간은 기존 시간에 누적됩니다. 이동하려면 타이머를 먼저 종료해주세요.</p><div>{current.questions.map((q,i)=><button type="button" key={q.id} className={i===current.currentIndex?"current":q.seconds>0?"timed":""} aria-label={`${q.number}번 문항${q.seconds>0?`, 기록 ${fmt(q.seconds)}`:""}`} aria-pressed={i===current.currentIndex} disabled={current.questions.some((item)=>item.startedAt)&&i!==current.currentIndex} onClick={()=>updateSession(current.id,(session)=>({...session,currentIndex:i}))}>{q.number}</button>)}</div></div></section>}
      {page==="grading"&&current&&<section className={"view grading-view "+(current.status==="done"?"record-view":"")}><button className="back-link" onClick={()=>setPage(current.status==="done"?"home":"solve")}>{current.status==="done"?"← 오늘의 공부":"← 풀이 화면"}</button><PageHeading eyebrow={(current.status==="done"?"PRACTICE RECORD · ":"CHECK YOUR ANSWERS · ")+bookName(data.books,current.bookId)} title="이제 채점해볼까요?" subtitle={current.status==="done"?"문항별 정답과 풀이 시간, 오답 메모를 확인해요.":"문제마다 맞았는지 고르고, 틀린 문제는 이유와 전략을 남겨봐요."} action={<div className="wrong-total">{current.questions.filter((q)=>q.result!=="pending").length}<span>/{current.questions.length} 채점</span></div>}/><div className="grade-summary"><span>문제별 시간 합계 <b>{fmt(totalTime(current))}</b></span><span>평균 풀이 시간 <b>{fmt(Math.round(totalTime(current)/Math.max(current.questions.length,1)))}</b></span><span>전체 문항 <b>{current.questions.length}문제</b></span></div><div className="grade-list">{current.questions.map((q)=><GradeCard key={q.id} question={q} sessionId={current.id} onAnswer={answer} onNote={saveNote}/>)}</div><div className="grade-footer"><span>틀린 문제는 오답 노트에서 다시 볼 수 있어요.</span>{current.status==="done"?<button className="primary" onClick={()=>{setPage("home");setSessionId("");}}>오늘의 공부로 <b>→</b></button>:<button className="primary" onClick={finish}>채점 완료 <b>→</b></button>}</div></section>}
    </main>
    {modal&&<div className="backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setModal("")}><section className="modal" role="dialog" aria-modal="true"><button className="close" onClick={()=>setModal("")}>×</button>{modal==="book"?<><div className="eyebrow">ADD A WORKBOOK</div><h2>문제집 등록하기</h2><p className="modal-sub">이름만 입력해도 바로 등록할 수 있어요.</p><form onSubmit={addBook}><label>문제집 이름 <b>*</b><input autoFocus name="name" placeholder="예: 최상위 수학 5-1" required maxLength="60"/></label><div className="two"><label>학년<input name="grade" placeholder="예: 5학년"/></label><label>출판사<input name="publisher" placeholder="예: 디딤돌"/></label></div><label>문제집 난이도<select name="difficulty" defaultValue="보통"><option>쉬움</option><option>보통</option><option>어려움</option></select><small className="difficulty-help">AI 선생님 코멘트에 참고해요.</small></label><label className="photo-field">문제집 표지 사진 <span>(선택 · 12MB 이하)</span><input name="photo" type="file" accept="image/*"/></label><ModalButtons onClose={()=>setModal("")} submit="등록하기"/></form></>:<><div className="eyebrow">TODAY'S PRACTICE</div><h2>오늘 풀 범위 정하기</h2><p className="modal-sub">여러 쪽을 한 번에 입력할 수 있어요.</p><form onSubmit={addPlan}><label>문제집 선택 <b>*</b><select autoFocus name="bookId" defaultValue="" required><option value="" disabled>문제집을 골라주세요</option>{data.books.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>풀이 날짜<input name="date" type="date" defaultValue={planDate} required/></label><div className="range-title">페이지 범위</div><div className="range"><label><small>시작 쪽</small><input name="ps" type="number" min="1" placeholder="12" required/></label><i>—</i><label><small>끝 쪽</small><input name="pe" type="number" min="1" placeholder="14" required/></label></div><div className="range-title">전체 문항 범위</div><div className="range"><label><small>시작 문항</small><input name="qs" type="number" min="1" placeholder="1" required/></label><i>—</i><label><small>끝 문항</small><input name="qe" type="number" min="1" placeholder="8" required/></label></div><div className="range-example">✳　예: 12~14쪽 범위에서 1~8번을 풀면 총 8문제</div><ModalButtons onClose={()=>setModal("")} submit="풀이 시작하기"/></form></>}</section></div>}
    <div className={"toast "+(toast?"show":"")} role="status" aria-live="polite">{toast}</div>
  </div>;
}

function PageHeading({eyebrow,title,subtitle,action}){return <header className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span>.</span></h1><p>{subtitle}</p></div>{action}</header>;}
function Stat({label,value,unit="",detail,progress,icon,color,tone=""}){return <article className={"stat-card "+tone}><span className={"stat-icon "+color}>{icon}</span><div><small>{label}</small><b>{value}<i>{unit}</i></b>{detail&&<em>{detail}</em>}{progress!==undefined&&<div className="metric-progress"><i style={{width:Math.max(0,Math.min(100,progress))+"%"}}/></div>}</div><span className="spark">✳</span></article>;}
function Empty({icon,title,text,action,onClick}){return <div className="empty-card"><div className="empty-art">{icon}{action&&<i>＋</i>}</div><div><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={onClick}>{action} <span>→</span></button>}</div></div>;}
function SettingsView({theme,customColor,onTheme,onCustomColor}){
  const modes=[{id:"blue",name:"맑은 하늘",note:"산뜻하고 집중되는 블루",swatch:"#e4f0ff",icon:"☁"},{id:"mint",name:"산뜻한 민트",note:"편안하고 싱그러운 그린",swatch:"#e5f3e2",icon:"✿"},{id:"sunshine",name:"포근한 햇살",note:"따뜻하고 밝은 크림",swatch:"#fff1c5",icon:"☼"},{id:"lavender",name:"라벤더",note:"차분하고 부드러운 퍼플",swatch:"#eee9fb",icon:"✦"}];
  return <section className="view settings-view">
    <PageHeading eyebrow="PERSONALIZE YOUR SPACE" title="내 설정" subtitle="원하는 배경색으로 마이 페이스를 꾸며보세요."/>
    <div className="settings-panel"><div className="settings-section-title"><span className="settings-icon">◐</span><div><h2>배경 색상 모드</h2><p>선택한 색은 이 브라우저에 저장돼요.</p></div></div>
      <div className="theme-grid">{modes.map((mode)=><button key={mode.id} className={"theme-option "+(theme===mode.id?"chosen":"")} onClick={()=>onTheme(mode.id)} aria-pressed={theme===mode.id}><span className="theme-swatch" style={{background:mode.swatch}}><i>{mode.icon}</i></span><span className="theme-copy"><b>{mode.name}</b><small>{mode.note}</small></span><span className="theme-check">{theme===mode.id?"✓":""}</span></button>)}</div>
      <div className={"custom-theme-option "+(theme==="custom"?"chosen":"")}><span className="custom-color-preview" style={{background:customColor}}/><div className="theme-copy"><b>직접 색 고르기</b><small>선택한 색을 연한 배경으로 적용해요.</small></div><label className="color-picker-label"><span>{customColor.toUpperCase()}</span><input type="color" value={customColor} onChange={(event)=>onCustomColor(event.target.value)} aria-label="원하는 배경색 선택"/></label></div>
    </div>
    <div className="settings-preview"><span>✦</span><div><b>나만의 공부 공간</b><p>배경색을 바꿔도 글자와 문제 풀이 화면은 읽기 편하게 유지돼요.</p></div></div>
  </section>;
}
function MistakesView({wrongs,books,onSave}){
  const [bookFilter,setBookFilter]=useState("all");
  const filtered=bookFilter==="all"?wrongs:wrongs.filter((item)=>item.bookId===bookFilter);
  const selectedBook=books.find((book)=>book.id===bookFilter);
  return <section className="view">
    <PageHeading eyebrow="LEARN FROM IT" title="오답 노트" subtitle="틀린 이유를 돌아보고, 다음번 풀이 전략을 적어봐요." action={<div className="wrong-total"><b>{filtered.length}</b>개의 오답</div>}/>
    <div className="mistakes-toolbar"><label htmlFor="mistake-book-filter">문제집 선택</label><select id="mistake-book-filter" value={bookFilter} onChange={(event)=>setBookFilter(event.target.value)}><option value="all">전체 문제집</option>{books.map((book)=><option key={book.id} value={book.id}>{book.name}</option>)}</select><span>{bookFilter==="all"?"전체 오답을 모아보고 있어요":selectedBook?selectedBook.name+" 오답만 보고 있어요":"선택한 문제집의 오답"}</span></div>
    {!filtered.length?<Empty icon="↻" title={bookFilter==="all"?"오답이 생기면 여기에 모여요":"이 문제집의 오답은 아직 없어요"} text={bookFilter==="all"?"풀이를 마친 뒤 채점하면 틀린 문제가 자동으로 정리돼요.":"다른 문제집을 선택하거나 풀이 후 채점해보세요."}/>:<div className="wrong-list">{filtered.map((q)=><WrongCard key={q.id} item={q} onSave={onSave}/>)}</div>}
    <div className="encourage"><span>✦</span><div><b>오답은 실력이 자라는 힌트예요</b><p>어디서 생각이 달라졌는지 찾아보면 더 오래 기억할 수 있어요.</p></div></div>
  </section>;
}
function CalendarView({sessions,books,selectedDate,month,onSelect,onMonth,onPlan,onOpen,onMove}){
  const [calendarMode,setCalendarMode]=useState("day");
  const year=month.getFullYear(),monthIndex=month.getMonth(),first=new Date(year,monthIndex,1).getDay(),days=new Date(year,monthIndex+1,0).getDate();
  const title=new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long"}).format(month);
  const keys=Array.from({length:days},(_,i)=>dateKey(year,monthIndex,i+1));
  const selectedSessions=sessions.filter((s)=>s.date===selectedDate);
  const monthPrefix=year+"-"+String(monthIndex+1).padStart(2,"0"),monthly=sessions.filter((s)=>s.date.startsWith(monthPrefix));
  const monthDays={};monthly.forEach((session)=>{const day=monthDays[session.date]||(monthDays[session.date]={date:session.date,seconds:0,total:0,solved:0,graded:0,correct:0,books:[]});day.seconds+=totalTime(session);day.total+=session.questions.length;day.solved+=session.questions.filter(isSolved).length;day.graded+=session.questions.filter((q)=>q.result==="correct"||q.result==="wrong").length;day.correct+=session.questions.filter((q)=>q.result==="correct").length;const name=bookName(books,session.bookId);if(!day.books.includes(name))day.books.push(name);});
  const monthDaysList=Object.values(monthDays).sort((a,b)=>b.date.localeCompare(a.date)),monthTotalSeconds=monthDaysList.reduce((sum,day)=>sum+day.seconds,0),monthTotalSolved=monthDaysList.reduce((sum,day)=>sum+day.solved,0),monthTotal=monthDaysList.reduce((sum,day)=>sum+day.total,0),monthGraded=monthDaysList.reduce((sum,day)=>sum+day.graded,0),monthCorrect=monthDaysList.reduce((sum,day)=>sum+day.correct,0),monthAccuracy=rate(monthCorrect,monthGraded),monthStudyDays=monthDaysList.filter((day)=>day.seconds>0||day.solved>0).length;
  function shiftMonth(offset){const next=new Date(year,monthIndex+offset,1);onMonth(next);const selected=new Date(selectedDate+"T12:00:00");if(selected.getFullYear()!==next.getFullYear()||selected.getMonth()!==next.getMonth())onSelect(dateKey(next.getFullYear(),next.getMonth(),1));}
  return <section className="view calendar-view">
    <PageHeading eyebrow="YOUR STUDY CALENDAR" title="공부 달력" subtitle="날짜별로 어떤 문제집을 풀었는지 모아봐요." action={<button className="primary" onClick={onPlan}>＋ 이 날짜에 계획</button>}/>
    <div className="calendar-card">
      <div className="calendar-toolbar"><button className="month-arrow" onClick={()=>shiftMonth(-1)} aria-label="이전 달">‹</button><h2>{title}</h2><button className="month-arrow" onClick={()=>shiftMonth(1)} aria-label="다음 달">›</button><button className="today-link" onClick={()=>{const d=new Date();onMonth(new Date(d.getFullYear(),d.getMonth(),1));onSelect(todayKey());}}>오늘</button></div>
      <div className="calendar-grid weekday-grid">{["일","월","화","수","목","금","토"].map((day,i)=><span className={i===0?"sunday":""} key={day}>{day}</span>)}</div>
      <div className="calendar-grid day-grid">{Array.from({length:first},(_,i)=><div className="calendar-blank" key={"blank-"+i}/>)}{keys.map((key,index)=>{const daySessions=sessions.filter((s)=>s.date===key);return <button key={key} className={"calendar-day "+(key===selectedDate?"selected ":"")+(key===todayKey()?"today":"")} onClick={()=>onSelect(key)} aria-label={dateLabel(key)+(daySessions.length?" · "+daySessions.length+"개 문제집 풀이":"")}><b>{index+1}</b>{daySessions.length>0&&<div className="calendar-book-names">{daySessions.slice(0,2).map((s)=><span key={s.id}>{bookName(books,s.bookId)}</span>)}{daySessions.length>2&&<small>+{daySessions.length-2}</small>}</div>}</button>;})}</div>
      <div className="calendar-legend"><span><i/> 풀이가 있는 날</span><span>{sessions.filter((s)=>s.date.startsWith(year+"-"+String(monthIndex+1).padStart(2,"0"))).length}개 풀이 계획</span></div>
    </div>
    <div className="selected-day-heading"><div><div className="eyebrow">{calendarMode==="day"?"SELECTED DAY":"MONTHLY SUMMARY"}</div><h2>{calendarMode==="day"?dateLabel(selectedDate):title}</h2></div><div className="calendar-report-controls"><div className="calendar-report-tabs" role="tablist" aria-label="달력 기록 보기"><button className={calendarMode==="day"?"active":""} onClick={()=>setCalendarMode("day")}>선택한 날</button><button className={calendarMode==="month"?"active":""} onClick={()=>setCalendarMode("month")}>이번 달</button></div>{calendarMode==="day"&&<button className="subtle" onClick={onPlan}>＋ 문제집 추가</button>}</div></div>
    {calendarMode==="day"?(!selectedSessions.length?<div className="day-empty"><span>▦</span><div><b>이 날짜에는 등록된 풀이가 없어요.</b><p>문제집과 페이지 범위를 정해 계획을 추가해보세요.</p></div></div>:<div className="calendar-report-wrap"><table className="calendar-report"><thead><tr><th>문제집</th><th>정답률</th><th>풀이시간(평균)</th><th>진행</th></tr></thead><tbody>{selectedSessions.map((session)=><CalendarReportRow key={session.id} session={session} books={books} onOpen={()=>onOpen(session)} onMove={onMove}/>)}</tbody></table></div>):!monthDaysList.length?<div className="day-empty"><span>▦</span><div><b>{title} 풀이 기록이 없어요.</b><p>이 달의 풀이 기록이 생기면 여기에 모아볼 수 있어요.</p></div></div>:<><div className="report-summary-grid calendar-month-summary"><article><span>순공 시간</span><b>{Math.floor(monthTotalSeconds/3600)}<small>시간</small> {String(Math.floor(monthTotalSeconds/60)%60).padStart(2,"0")}<small>분</small></b></article><article><span>공부한 날</span><b>{monthStudyDays}<small>일</small></b></article><article><span>푼 문항</span><b>{monthTotalSolved}<small>/{monthTotal}</small></b></article><article className={accuracyTone(monthAccuracy)}><span>정답률</span><b>{monthAccuracy===null?"—":monthAccuracy+"%"}</b></article></div><div className="calendar-report-wrap"><table className="calendar-report report-daily-table"><thead><tr><th>날짜</th><th>문제집</th><th>푼 문항</th><th>공부 시간</th></tr></thead><tbody>{monthDaysList.map((day)=><tr key={day.date}><td className="report-date"><button className="report-date-link" onClick={()=>{onSelect(day.date);setCalendarMode("day");}}>{Number(day.date.slice(-2))}일</button></td><td className="report-daily-books" title={day.books.join(", ")}>{day.books.join(", ")}</td><td className="report-daily-count">{day.solved}/{day.total}</td><td className="report-time">{fmt(day.seconds)}</td></tr>)}</tbody></table></div></>}
  </section>;
}
function ReportView({sessions,books}){
  const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
  const [aiFeedback,setAiFeedback]=useState(null),[aiLoading,setAiLoading]=useState(false),[aiError,setAiError]=useState("");
  const year=month.getFullYear(),monthIndex=month.getMonth(),monthPrefix=year+"-"+String(monthIndex+1).padStart(2,"0");
  const monthTitle=new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long"}).format(month);
  const monthly=sessions.filter((s)=>s.date.startsWith(monthPrefix)).sort((a,b)=>b.date.localeCompare(a.date));
  const daysInMonth=new Date(year,monthIndex+1,0).getDate();
  const days=Array.from({length:daysInMonth},(_,i)=>({date:dateKey(year,monthIndex,i+1),seconds:0,total:0,solved:0,graded:0,correct:0,books:[]}));
  monthly.forEach((session)=>{const day=days[Number(session.date.slice(-2))-1];if(!day)return;day.seconds+=totalTime(session);day.total+=session.questions.length;day.solved+=session.questions.filter(isSolved).length;day.graded+=session.questions.filter((q)=>q.result==="correct"||q.result==="wrong").length;day.correct+=session.questions.filter((q)=>q.result==="correct").length;const name=bookName(books,session.bookId);if(!day.books.includes(name))day.books.push(name);});
  const daysWithRecords=days.filter((day)=>day.total>0),activeDays=days.filter((day)=>day.seconds>0||day.solved>0),totalSeconds=daysWithRecords.reduce((sum,day)=>sum+day.seconds,0),totalQuestions=daysWithRecords.reduce((sum,day)=>sum+day.total,0),totalSolved=daysWithRecords.reduce((sum,day)=>sum+day.solved,0),graded=daysWithRecords.reduce((sum,day)=>sum+day.graded,0),correct=daysWithRecords.reduce((sum,day)=>sum+day.correct,0),monthlyAccuracy=rate(correct,graded);
  const bookReports=books.map((book)=>{const bookSessions=monthly.filter((s)=>s.bookId===book.id);if(!bookSessions.length)return null;const questions=bookSessions.flatMap((s)=>s.questions),gradedQuestions=questions.filter((q)=>q.result==="correct"||q.result==="wrong"),right=gradedQuestions.filter((q)=>q.result==="correct").length,solved=questions.filter(isSolved).length,seconds=bookSessions.reduce((sum,s)=>sum+totalTime(s),0);return {book,difficulty:book.difficulty||"보통",total:questions.length,solved,graded:gradedQuestions.length,accuracy:rate(right,gradedQuestions.length),averageSeconds:Math.round(seconds/Math.max(questions.length,1)),average:fmt(Math.round(seconds/Math.max(questions.length,1))),studyDays:new Set(bookSessions.filter((s)=>totalTime(s)>0||s.questions.some(isSolved)).map((s)=>s.date)).size};}).filter(Boolean).map((entry,index)=>({...entry,key:`book_${index+1}`}));
  useEffect(()=>{setAiFeedback(null);setAiError("");},[monthPrefix]);
  async function generateAiFeedback(){
    setAiLoading(true);setAiError("");
    try{
      const accessToken=await getValidAccessToken();
      const response=await fetch("/api/report-commentary",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},body:JSON.stringify({month:monthPrefix,summary:{totalSeconds,studyDays:activeDays.length,accuracy:monthlyAccuracy},books:bookReports.map(({key,difficulty,total,solved,graded,accuracy,averageSeconds,studyDays})=>({key,difficulty,total,solved,graded,accuracy,averageSeconds,studyDays}))})});
      let result;
      try{result=await response.json();}catch{throw new Error("AI 코멘트 서버 응답을 읽지 못했어요. 배포 환경 변수와 서버 함수를 확인해주세요.");}
      if(!response.ok)throw new Error(result.error||"AI 코멘트를 불러오지 못했어요.");
      setAiFeedback(result);
    }catch(error){setAiError(error.message||"AI 코멘트를 불러오지 못했어요.");}
    finally{setAiLoading(false);}
  }
  function shiftMonth(offset){setMonth(new Date(year,monthIndex+offset,1));}
  const maxSeconds=Math.max(1,...days.map((day)=>day.seconds));
  return <section className="view report-view">
    <PageHeading eyebrow="STUDY REPORT" title="레포트" subtitle="이번 달 문제집별 성과와 날짜별 공부 기록을 살펴봐요."/>
    <div className="report-month-toolbar"><button className="month-arrow" onClick={()=>shiftMonth(-1)} aria-label="이전 달">‹</button><h2>{monthTitle}</h2><button className="month-arrow" onClick={()=>shiftMonth(1)} aria-label="다음 달">›</button><button className="today-link" onClick={()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1));}}>이번 달</button></div>
    {!monthly.length?<div className="day-empty"><span>▧</span><div><b>{monthTitle} 풀이 기록이 없어요.</b><p>문제 풀이를 시작하면 월간 레포트가 여기에 모여요.</p></div></div>:<>
      <div className="report-summary-grid"><article><span>순공 시간</span><b>{Math.floor(totalSeconds/3600)}<small>시간</small> {String(Math.floor(totalSeconds/60)%60).padStart(2,"0")}<small>분</small></b></article><article><span>공부한 날</span><b>{activeDays.length}<small>일</small></b></article><article><span>푼 문항</span><b>{totalSolved}<small>/{totalQuestions}</small></b></article><article className={accuracyTone(monthlyAccuracy)}><span>정답률</span><b>{monthlyAccuracy===null?"—":monthlyAccuracy+"%"}</b></article></div>
      <section className="report-ai-card"><div className="report-ai-heading"><span className="report-ai-icon">✦</span><div><h2>AI 선생님 코멘트</h2><p>문제집 난이도와 이번 달 풀이 통계를 바탕으로 조언을 받아봐요.</p></div><button className="primary" onClick={generateAiFeedback} disabled={aiLoading||!bookReports.length}>{aiLoading?"코멘트 만드는 중…":aiFeedback?"다시 받기":"코멘트 받기"}</button></div><small className="report-ai-privacy">문제집 이름, 오답 메모, 사진은 AI에 보내지 않아요. 익명 통계와 난이도만 사용해요.</small>{aiError&&<p className="report-ai-error" role="alert">{aiError}</p>}{aiFeedback&&<div className="report-ai-results"><p className="report-ai-overall">{aiFeedback.overall}</p>{bookReports.map((entry)=><article key={entry.key}><b>{entry.book.name}</b><p>{aiFeedback.comments.find((comment)=>comment.key===entry.key)?.comment||"이 문제집은 아직 코멘트가 없어요."}</p></article>)}</div>}</section>
      <section className="report-section"><div className="report-section-heading"><div><h2>날짜별 공부 시간</h2><p>문항별 풀이 시간을 합산했어요.</p></div></div><div className="report-chart"><svg viewBox="0 0 700 170" preserveAspectRatio="none" role="img" aria-label={monthTitle+" 날짜별 공부 시간 그래프"}><line x1="8" y1="142" x2="696" y2="142"/><line x1="8" y1="96" x2="696" y2="96"/><line x1="8" y1="50" x2="696" y2="50"/>{days.map((day,index)=>{const barWidth=14,gap=8,x=12+index*(barWidth+gap),height=day.seconds?Math.max(3,day.seconds/maxSeconds*110):0,y=142-height;return <g key={day.date}><title>{dateLabel(day.date)} · {fmt(day.seconds)} · {day.total}문항</title>{height>0&&<rect x={x} y={y} width={barWidth} height={height} rx="4"/>}{(index===0||(index+1)%5===0||index===days.length-1)&&<text x={x+barWidth/2} y="162" textAnchor="middle">{index+1}</text>}</g>;})}</svg></div></section>
      <section className="report-section"><div className="report-section-heading"><div><h2>문제집별 성과</h2><p>이번 달 풀이 기록을 문제집별로 모았어요.</p></div></div><div className="calendar-report-wrap"><table className="calendar-report report-book-table"><thead><tr><th>문제집</th><th>정답률</th><th>풀이시간(평균)</th><th>진행</th></tr></thead><tbody>{bookReports.map(({book,total,solved,accuracy,average})=><tr key={book.id}><td className="report-main-cell"><div className="report-book-heading"><strong title={book.name}>{book.name}</strong></div><span className="report-book-range">{monthly.filter((s)=>s.bookId===book.id).length}회 풀이</span></td><td className={"report-accuracy "+accuracyTone(accuracy)}>{accuracy===null?"—":accuracy+"%"}</td><td className="report-time">{average}</td><td className="report-progress-cell"><b>{solved}/{total} 문항</b><span className="report-progress-bar"><i style={{width:(solved/Math.max(total,1)*100)+"%"}}/></span></td></tr>)}</tbody></table></div></section>
      <section className="report-section"><div className="report-section-heading"><div><h2>날짜별 기록</h2><p>하루 공부 시간과 푼 문항 수를 확인해요.</p></div></div><div className="calendar-report-wrap"><table className="calendar-report report-daily-table"><thead><tr><th>날짜</th><th>문제집</th><th>푼 문항</th><th>공부 시간</th></tr></thead><tbody>{[...daysWithRecords].reverse().map((day)=><tr key={day.date}><td className="report-date">{Number(day.date.slice(-2))}일</td><td className="report-daily-books" title={day.books.join(", ")}>{day.books.join(", ")}</td><td className="report-daily-count">{day.solved}/{day.total}</td><td className="report-time">{fmt(day.seconds)}</td></tr>)}</tbody></table></div></section>
    </>}
  </section>;
}
function CalendarReportRow({session,books,onOpen,onMove,showDate=false}){
  const finished=session.questions.filter(isSolved).length;
  const correct=session.questions.filter((q)=>q.result==="correct").length,graded=session.questions.filter((q)=>q.result==="correct"||q.result==="wrong").length,accuracy=graded?rate(correct,graded):null;
  const status=session.status==="done"?"✅ 완료":session.status==="grading"?"채점 중":session.status==="active"?"풀이 중":"계획";
  const action=session.status==="done"?"기록 보기":session.status==="grading"?"채점 이어하기":"풀이 열기";
  const averageTime=fmt(Math.round(totalTime(session)/Math.max(session.questions.length,1)));
  const name=bookName(books,session.bookId);
  return <tr><td className="report-main-cell" data-label="문제집"><div className="report-book-heading"><strong title={name} aria-label={name}>{name}</strong></div><span className="report-book-range">{showDate&&<>{dateLabel(session.date)} · </>}{session.pageStart}–{session.pageEnd}쪽 · {session.questionStart}–{session.questionEnd}번</span>{session.status==="planned"&&<div className="report-inline-actions"><label>날짜 변경<input type="date" value={session.date} onChange={(e)=>onMove(session.id,e.target.value)}/></label></div>}</td><td data-label="정답률" className={"report-accuracy "+accuracyTone(accuracy)}>{accuracy===null?"—":accuracy+"%"}</td><td data-label="풀이시간(평균)" className="report-time">{averageTime}</td><td data-label="진행"><div className="report-progress"><b>{finished}/{session.questions.length} {status}</b><button className="outline" onClick={onOpen}>{action} →</button><span className="report-progress-bar"><i style={{width:(finished/Math.max(session.questions.length,1)*100)+"%"}}/></span></div></td></tr>;
}
function WorkbookCard({book,index,sessions,onEdit}){
  const stats=statsForBook(sessions,book.id);
  const dailyStats=sessions.filter((session)=>session.bookId===book.id).reduce((days,session)=>{
    const day=days[session.date]||(days[session.date]={date:session.date,total:0,solved:0,graded:0,correct:0});
    day.total+=session.questions.length;
    day.solved+=session.questions.filter(isSolved).length;
    day.graded+=session.questions.filter((q)=>q.result==="correct"||q.result==="wrong").length;
    day.correct+=session.questions.filter((q)=>q.result==="correct").length;
    return days;
  },{});
  const dailyRows=Object.values(dailyStats).sort((a,b)=>b.date.localeCompare(a.date));
  return <article className={"book-card book-"+(index%4)}>
    <div className="book-design">{book.photo?<img src={book.photo} alt={book.name+" 표지"}/>:<>∑<i>✳</i></>}</div>
    <span className="book-subject">수학</span><h3>{book.name}</h3>
    <p>{[book.grade,book.publisher,`${book.difficulty||"보통"} 난이도`].filter(Boolean).join(" · ")}</p>
    <div className={"book-metrics "+accuracyTone(stats.accuracy)}><div><small>전체 정답률</small><b>{stats.accuracy===null?"—":stats.accuracy+"%"}</b><span>{stats.correct} / {stats.graded} 정답</span></div><div><small>풀이 문항</small><b>{stats.solved}<i> / {stats.total}</i></b><span>{stats.total?"기록된 전체 문항":"아직 풀이 기록 없음"}</span></div></div>
    <div className="book-daily"><h4>날짜별 기록</h4>{dailyRows.length?<div className="book-daily-list">{dailyRows.map((day)=>{const progress=rate(day.solved,day.total)??0,accuracy=rate(day.correct,day.graded);return <div className="book-daily-row" key={day.date}><div className="book-daily-date">{new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",weekday:"short"}).format(new Date(day.date+"T12:00:00"))}</div><div className="book-daily-progress"><div><i style={{width:progress+"%"}}/></div><span>{progress}%</span></div><div className={"book-daily-accuracy "+accuracyTone(accuracy)}>정답률 <b>{accuracy===null?"—":accuracy+"%"}</b></div></div>;})}</div>:<p className="book-daily-empty">풀이 기록이 생기면 날짜별 진행률과 정답률이 표시돼요.</p>}</div>
    <button className="edit-book-button" onClick={onEdit}>문제집 수정 <span>→</span></button>
  </article>;
}
function BookEditView({book,onBack,onSave}){
  return <section className="view">
    <button className="back-link" onClick={onBack}>← 내 문제집</button>
    <PageHeading eyebrow="EDIT WORKBOOK" title="문제집 수정" subtitle="이름과 표지 사진 등 문제집 정보를 업데이트해요."/>
    <form className="book-edit-form" onSubmit={onSave}>
      <div className="edit-photo-preview">{book.photo?<img src={book.photo} alt={book.name+" 표지 미리보기"}/>:<span>∑</span>}</div>
      <label>문제집 이름 <b>*</b><input name="name" defaultValue={book.name} required maxLength="60"/></label>
      <div className="two"><label>학년<input name="grade" defaultValue={book.grade||""} placeholder="예: 5학년"/></label><label>출판사<input name="publisher" defaultValue={book.publisher||""} placeholder="예: 디딤돌"/></label></div>
      <label>문제집 난이도<select name="difficulty" defaultValue={book.difficulty||"보통"}><option>쉬움</option><option>보통</option><option>어려움</option></select><small className="difficulty-help">AI 선생님 코멘트에 참고해요.</small></label>
      <label className="photo-field">표지 사진 바꾸기 <span>(선택 · 12MB 이하)</span><input name="photo" type="file" accept="image/*"/></label>
      {book.photo&&<label className="remove-photo"><input type="checkbox" name="removePhoto"/> 현재 표지 사진 삭제</label>}
      <div className="edit-form-actions"><button type="button" className="cancel" onClick={onBack}>취소</button><button className="primary">변경사항 저장 <span>→</span></button></div>
    </form>
  </section>;
}
function SessionRow({session,books,onClick}){const done=session.questions.filter(isSolved).length,status=session.status==="grading"?"채점하기":session.status==="done"?"완료":session.status==="active"?"풀이 중":"시작 전",label=session.status==="grading"?"채점 이어하기":session.status==="done"?"기록 보기":session.status==="active"?"풀이 이어하기":"풀이 시작",book=books.find((b)=>b.id===session.bookId),color=bookColor(session.bookId);return <article className={"session-card "+(session.status==="done"?"session-card-done":"")} style={{"--book-tint":color.tint,"--book-accent":color.accent,"--book-border":color.border}}><div className="book-cover">{book?.photo?<img src={book.photo} alt=""/>:<>수<i>✳</i></>}</div><div className="session-info"><div className="session-title"><h3>{bookName(books,session.bookId)}</h3><span className={"status "+session.status}>{session.status==="done"?"✓ 완료":status}</span></div><p>{session.pageStart}–{session.pageEnd}쪽 · 문항 {session.questionStart}–{session.questionEnd}번</p><div className="session-meter"><div><i style={{width:(done/session.questions.length*100)+"%"}}/></div><small>{done}/{session.questions.length} 문제</small></div></div><div className="session-time"><small>풀이 시간</small><b>{fmt(totalTime(session))}</b></div><button className="outline" onClick={onClick}>{label} <span>→</span></button></article>;}
function WrongCard({item,onSave}){return <article className="wrong-card"><div className="wrong-head"><span>!</span><div><b>{item.book}</b><small>{item.date} · {item.page?`${item.page}쪽`:item.pageStart===item.pageEnd?`${item.pageStart}쪽 범위`:`${item.pageStart}–${item.pageEnd}쪽 범위`} · {item.number}번</small></div><strong>{fmt(item.seconds)}</strong></div><Notes reason={item.reason||""} strategy={item.strategy||""} photo={item.photo||""} save={(field,value)=>onSave(item.sessionId,item.id,field,value)}/></article>;}
function Notes({reason,strategy,photo,save}){
  const[editing,setEditing]=useState(false),[draftReason,setDraftReason]=useState(reason),[draftStrategy,setDraftStrategy]=useState(strategy),[draftPhoto,setDraftPhoto]=useState(photo),[error,setError]=useState("");
  useEffect(()=>{if(!editing){setDraftReason(reason);setDraftStrategy(strategy);setDraftPhoto(photo);}},[reason,strategy,photo,editing]);
  async function choosePhoto(event){const file=event.target.files?.[0];if(!file)return;try{setDraftPhoto(await resizePhoto(file));setError("");}catch(problem){setError(problem.message);}}
  function cancel(){setDraftReason(reason);setDraftStrategy(strategy);setDraftPhoto(photo);setError("");setEditing(false);}
  function commit(){save("reason",draftReason);save("strategy",draftStrategy);save("photo",draftPhoto);setEditing(false);}
  return <div className="note-editor">
    <div className="note-editor-head"><span>오답 메모</span><button className="note-edit-button" onClick={()=>{setDraftReason(reason);setDraftStrategy(strategy);setDraftPhoto(photo);setEditing(true);}}>{editing?"수정 중":"수정"} ✎</button></div>
    {editing?<><div className="notes"><label><b>틀린 이유</b><textarea rows="2" value={draftReason} onChange={(e)=>setDraftReason(e.target.value)} placeholder="예: 조건을 제대로 읽지 못했어요."/></label><label><b>풀이 전략</b><textarea rows="2" value={draftStrategy} onChange={(e)=>setDraftStrategy(e.target.value)} placeholder="예: 문제의 조건에 밑줄을 긋고 식을 세워요."/></label></div>
      <div className="mistake-photo-edit"><label className="mistake-photo-picker">＋ 문제 사진 추가 또는 변경<input type="file" accept="image/*" onChange={choosePhoto}/></label>{draftPhoto&&<button className="remove-mistake-photo" onClick={()=>setDraftPhoto("")}>사진 삭제</button>}</div>
      {draftPhoto&&<img className="mistake-photo-preview" src={draftPhoto} alt="오답 문제 미리보기"/>}{error&&<p className="photo-error">{error}</p>}
      <div className="note-edit-actions"><button onClick={cancel}>취소</button><button className="save-note" onClick={commit}>저장</button></div>
    </>:<><div className="notes-display"><div><b>틀린 이유</b><p>{reason||"아직 기록이 없어요."}</p></div><div><b>풀이 전략</b><p>{strategy||"아직 기록이 없어요."}</p></div></div>{photo&&<img className="mistake-photo-preview" src={photo} alt="오답 문제 사진"/>}</>}
  </div>;
}
function GradeCard({question,sessionId,onAnswer,onNote}){return <article className={"grade-card "+(question.result==="wrong"?"marked-wrong":"")}><div className="grade-head"><div className="grade-number"><small>{question.page?`${question.page}쪽`:"전체 범위"}</small><b>{question.number}<i>번</i></b></div><div className="grade-time"><small>풀이 시간</small><b>{fmt(question.seconds)}</b></div><div className="answers"><button className={question.result==="correct"?"correct chosen":"correct"} onClick={()=>onAnswer(question.id,"correct")}>✓ 맞았어요</button><button className={question.result==="wrong"?"wrong chosen":"wrong"} onClick={()=>onAnswer(question.id,"wrong")}>× 틀렸어요</button></div></div>{question.result==="wrong"&&<Notes reason={question.reason||""} strategy={question.strategy||""} photo={question.photo||""} save={(field,value)=>onNote(sessionId,question.id,field,value)}/>}</article>;}
function ModalButtons({onClose,submit}){return <div className="modal-actions"><button type="button" className="cancel" onClick={onClose}>취소</button><button className="primary">{submit} <span>→</span></button></div>;}
function AccountScreen({title,subtitle,setup=false,loading=false,action}){
  return <main className="account-screen"><section className="account-card"><div className="account-brand"><span className="brand-mark">m<span>.</span></span><span><b>my pace</b><small>fast & accurate</small></span></div><div className="eyebrow">{setup?"SERVER SETUP":loading?"SYNCING YOUR STUDY DATA":"CONNECTION ERROR"}</div><h1>{title}</h1><p>{subtitle}</p>{setup?<div className="setup-steps"><b>프로젝트 설정 순서</b><ol><li><code>supabase/setup.sql</code> 내용을 Supabase SQL Editor에서 실행</li><li>Vercel 환경 변수에 아래 두 값을 추가</li></ol><pre>VITE_SUPABASE_URL=...<br/>VITE_SUPABASE_ANON_KEY=...</pre><small>환경 변수 추가 후 Vercel에서 다시 배포해주세요. 로컬 개발은 프로젝트 루트의 <code>.env.local</code>에 같은 값을 설정하면 돼요.</small></div>:loading?<span className="account-spinner" aria-label="불러오는 중"/>:action}</section></main>;
}
function AuthView({onSignIn,onSignUp}){
  const [mode,setMode]=useState("signin"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function submit(event){event.preventDefault();setBusy(true);setError("");setNotice("");const form=new FormData(event.currentTarget),email=String(form.get("email")).trim(),password=String(form.get("password"));try{if(mode==="signin")await onSignIn(email,password);else{const session=await onSignUp(email,password);if(!session)setNotice("인증 메일을 보냈어요. 이메일 인증을 마친 뒤 로그인해주세요.");}}catch(problem){setError(problem.message||"요청을 완료하지 못했어요.");}finally{setBusy(false);}}
  return <main className="account-screen"><section className="account-card auth-card"><div className="account-brand"><span className="brand-mark">m<span>.</span></span><span><b>my pace</b><small>fast & accurate</small></span></div><div className="eyebrow">YOUR STUDY, IN SYNC</div><h1>{mode==="signin"?"로그인":"계정 만들기"}</h1><p>로그인하면 문제집과 풀이 기록을 서버에 저장해 어디서든 이어볼 수 있어요.</p><form onSubmit={submit}><label>이메일<input type="email" name="email" autoComplete="email" placeholder="name@example.com" required/></label><label>비밀번호<input type="password" name="password" autoComplete={mode==="signin"?"current-password":"new-password"} minLength="8" placeholder="8자 이상 입력해주세요" required/></label><button className="primary auth-submit" disabled={busy}>{busy?"처리 중…":mode==="signin"?"로그인":"계정 만들기"}</button></form>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}<button className="auth-switch" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");setNotice("");}}>{mode==="signin"?"처음 사용하시나요? 계정 만들기":"이미 계정이 있나요? 로그인"}</button></section></main>;
}

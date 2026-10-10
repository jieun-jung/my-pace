import React, { useEffect, useMemo, useRef, useState } from "react";
import { downloadWorkbookAnswerFile, getValidAccessToken, isSupabaseConfigured, loadAccountData, readAuthSession, removeWorkbookAnswerFile, saveAccountData, signIn, signOut, signUp, uploadWorkbookAnswerFile } from "./supabase.js";
import useHashNavigation from "./hooks/useHashNavigation.js";
import CalendarPage from "./pages/CalendarPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";
import BooksPage, { BookEditPage } from "./pages/BooksPage.jsx";
import MistakesPage from "./pages/MistakesPage.jsx";
import { SolvePage, GradingPage } from "./pages/PracticePage.jsx";
import HomePage from "./pages/HomePage.jsx";
import { resizePhoto } from "./lib/photos.js";
import { bookName, elapsedSeconds, isAttempted, makeId, todayKey, totalTime } from "./lib/study.js";

const KEY = "my-pace.data.v1";
const MIGRATION_KEY = "my-pace.cloud-migration-owner.v1";
const THEME_KEY = "my-pace.theme.v1";
const COLOR_KEY = "my-pace.custom-color.v1";
const validThemes = ["blue","mint","sunshine","lavender","custom"];
const readTheme = () => { try { const value=localStorage.getItem(THEME_KEY); return validThemes.includes(value)?value:"blue"; } catch { return "blue"; } };
const readCustomColor = () => { try { return localStorage.getItem(COLOR_KEY)||"#69a9e8"; } catch { return "#69a9e8"; } };
const readData = () => { try { const v=JSON.parse(localStorage.getItem(KEY)||"{}"); return {books:v.books||[],sessions:v.sessions||[]}; } catch { return {books:[],sessions:[]}; } };

export default function App(){
  const {page,setPage,sessionId,setSessionId,editingBookId,setEditingBookId}=useHashNavigation();
  const [data,setData]=useState(readData),[selectedDate,setSelectedDate]=useState(todayKey()),[planDate,setPlanDate]=useState(todayKey()),[calendarMonth,setCalendarMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);}),[theme,setTheme]=useState(readTheme),[customColor,setCustomColor]=useState(readCustomColor),[modal,setModal]=useState(""),[tick,setTick]=useState(Date.now()),[toast,setToast]=useState("");
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
  const todayQuestions=sessions.flatMap((s)=>s.questions),todaySolved=todayQuestions.filter(isAttempted).length,todaySkipped=todayQuestions.filter((q)=>q.result==="skipped").length,todayGraded=todayQuestions.filter((q)=>q.result==="correct"||q.result==="wrong"),todayCorrect=todayGraded.filter((q)=>q.result==="correct").length,todaySeconds=sessions.reduce((sum,s)=>sum+totalTime(s,tick),0);
  const monthKey=today.slice(0,7),monthSessions=data.sessions.filter((s)=>s.date.startsWith(monthKey)),monthSeconds=monthSessions.reduce((sum,s)=>sum+totalTime(s,tick),0),monthStudyDays=new Set(monthSessions.filter((s)=>totalTime(s,tick)>0).map((s)=>s.date)).size,monthHours=Math.floor(monthSeconds/3600),monthMinutes=Math.floor(monthSeconds%3600/60);
  const message=(x)=>setToast(x);
  const openPlan=(date=today)=>{setPlanDate(date);setModal("plan");};
  const updateSession=(sid,fn)=>setData((old)=>({...old,sessions:old.sessions.map((s)=>s.id===sid?fn(s):s)}));
  function moveSession(sid,newDate){if(!newDate)return;const session=data.sessions.find((s)=>s.id===sid);if(session?.questions.some((q)=>q.startedAt)){message("타이머를 멈춘 뒤 날짜를 바꿔주세요.");return;}updateSession(sid,(s)=>({...s,date:newDate}));setSelectedDate(newDate);const d=new Date(newDate+"T12:00:00");setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1));message("달력 날짜를 변경했어요.");}
  const enter=(s)=>{setSessionId(s.id);setPage(s.status==="grading"||s.status==="done"?"grading":"solve");};
  async function addBook(e){e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get("name")).trim();if(!name){message("문제집 이름을 입력해주세요.");return;}const photoFile=f.get("photo"),answerFile=f.get("answerFile");let photo="";if(photoFile?.size){try{photo=await resizePhoto(photoFile);}catch(error){message(error.message);return;}}const id=makeId();let answer={};if(answerFile?.size){try{answer=await uploadWorkbookAnswerFile(id,answerFile);}catch(error){message(error.message||"정답 파일을 올리지 못했어요.");return;}}const b={id,name,grade:String(f.get("grade")||"").trim(),publisher:String(f.get("publisher")||"").trim(),difficulty:String(f.get("difficulty")||"보통"),photo,...answer};if(!b.name)return;setData((d)=>({...d,books:[...d.books,b]}));setModal("");message("문제집을 등록했어요.");}
  function editBook(book){setEditingBookId(book.id);setPage("book-edit");}
  async function saveBook(e){e.preventDefault();if(!editingBook)return;const f=new FormData(e.currentTarget),photoFile=f.get("photo"),answerFile=f.get("answerFile"),removePhoto=f.get("removePhoto")==="on",removeAnswer=f.get("removeAnswer")==="on",photoChanged=Boolean(photoFile?.size)||removePhoto;let photo=removePhoto?"":editingBook.photo||"",answer={answerFilePath:editingBook.answerFilePath||"",answerFileName:editingBook.answerFileName||"",answerFileType:editingBook.answerFileType||""};if(photoFile?.size){try{photo=await resizePhoto(photoFile);}catch(error){message(error.message);return;}}if(answerFile?.size){try{answer=await uploadWorkbookAnswerFile(editingBook.id,answerFile);}catch(error){message(error.message||"정답 파일을 올리지 못했어요.");return;}}else if(removeAnswer&&answer.answerFilePath){try{await removeWorkbookAnswerFile(answer.answerFilePath);answer={answerFilePath:"",answerFileName:"",answerFileType:""};}catch(error){message(error.message||"정답 파일을 삭제하지 못했어요.");return;}}const changes={name:String(f.get("name")).trim(),grade:String(f.get("grade")||"").trim(),publisher:String(f.get("publisher")||"").trim(),difficulty:String(f.get("difficulty")||"보통"),photo,photoPath:photoChanged?"":editingBook.photoPath||"",...answer};if(!changes.name){message("문제집 이름을 입력해주세요.");return;}setData((d)=>({...d,books:d.books.map((b)=>b.id===editingBook.id?{...b,...changes}:b)}));setPage("books");setEditingBookId("");message("문제집 정보를 수정했어요.");}
  async function openAnswerFile(book){if(!book.answerFilePath)return;try{const blob=await downloadWorkbookAnswerFile(book.answerFilePath),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=book.answerFileName||"정답 파일";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){message(error.message||"정답 파일을 불러오지 못했어요.");}}
  function addPlan(e){e.preventDefault();const f=new FormData(e.currentTarget),bookId=String(f.get("bookId")),sessionDate=String(f.get("date")||today),ps=Number(f.get("ps")),pe=Number(f.get("pe")),qs=Number(f.get("qs")),qe=Number(f.get("qe"));if(!bookId||[ps,pe,qs,qe].some((n)=>!Number.isInteger(n)||n<1)||pe<ps||qe<qs){message("페이지와 문항 범위를 확인해주세요.");return;}if(qe-qs+1>300){message("한 번에 최대 300문제까지 등록할 수 있어요.");return;}const questions=[];for(let n=qs;n<=qe;n++)questions.push({id:makeId(),page:null,number:n,seconds:0,startedAt:null,result:"pending",reason:"",strategy:""});const s={id:makeId(),bookId,date:sessionDate,pageStart:ps,pageEnd:pe,questionStart:qs,questionEnd:qe,questions,currentIndex:0,status:"planned"};setData((d)=>({...d,sessions:[...d.sessions,s]}));setModal("");setSelectedDate(sessionDate);if(sessionDate===today){setSessionId(s.id);setPage("solve");}else{setSessionId("");const d=new Date(sessionDate+"T12:00:00");setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1));setPage("calendar");message("선택한 날짜에 풀이를 등록했어요.");}}
  function start(){if(!current)return;updateSession(current.id,(s)=>({...s,status:"active",questions:s.questions.map((q,i)=>i===s.currentIndex?{...q,startedAt:Date.now(),...(q.result==="skipped"?{result:"pending"}:{})}:q)}));}
  function stop(){const q=current?.questions[current.currentIndex];if(!q?.startedAt)return;const elapsed=elapsedSeconds(q.startedAt);updateSession(current.id,(s)=>({...s,questions:s.questions.map((x,i)=>i===s.currentIndex?{...x,seconds:x.seconds+elapsed,startedAt:null}:x)}));message("문제 풀이 시간을 기록했어요.");}
  function next(){if(!current)return;if(current.currentIndex===current.questions.length-1){updateSession(current.id,(s)=>({...s,status:"grading"}));setPage("grading");}else updateSession(current.id,(s)=>({...s,currentIndex:s.currentIndex+1}));}
  function openGrading(){if(!current)return;if(current.questions.some((q)=>q.startedAt)){message("중간 채점 전에 현재 타이머를 종료해주세요.");return;}updateSession(current.id,(s)=>({...s,status:"grading"}));setPage("grading");}
  function skipQuestion(){const q=current?.questions[current.currentIndex];if(!current||!q)return;if(q.startedAt){message("먼저 타이머를 종료한 뒤 건너뛰어주세요.");return;}if(q.result==="correct"||q.result==="wrong"){message("이미 채점한 문항은 건너뛸 수 없어요.");return;}const isLast=current.currentIndex===current.questions.length-1;updateSession(current.id,(s)=>({...s,status:isLast?"grading":"active",currentIndex:isLast?s.currentIndex:s.currentIndex+1,questions:s.questions.map((item,i)=>i===s.currentIndex?{...item,result:"skipped"}:item)}));if(isLast)setPage("grading");}
  function answer(qid,result){updateSession(current.id,(s)=>({...s,questions:s.questions.map((q)=>q.id===qid?{...q,result}:q)}));}
  function saveNote(sid,qid,field,value){updateSession(sid,(s)=>({...s,questions:s.questions.map((q)=>q.id===qid?{...q,[field]:value,...(field==="photo"&&q.photo!==value?{photoPath:""}:{})}:q)}));}
  function toggleCount(sid,qid,field,index){updateSession(sid,(s)=>({...s,questions:s.questions.map((q)=>{if(q.id!==qid)return q;const marks=Array.from({length:5},(_,i)=>Boolean(q[field]?.[i]));marks[index]=!marks[index];return {...q,[field]:marks};})}));}
  function finish(){const hasUnmarked=current.questions.some((q)=>q.result==="pending");updateSession(current.id,(s)=>({...s,status:"done",finishedAt:Date.now()}));setPage("home");setSessionId("");message(hasUnmarked?"채점 결과를 저장했어요. 남은 문항은 기록 보기에서 이어서 채점할 수 있어요.":"풀이와 채점을 저장했어요.");}
  async function handleSignIn(email,password){const next=await signIn(email,password);setAuthSession(next);}
  async function handleSignUp(email,password){const next=await signUp(email,password);if(next)setAuthSession(next);return next;}
  async function handleSignOut(){try{await signOut();}finally{setAuthSession(null);setCloudReady(false);setCloudError("");setData({books:[],sessions:[]});setPage("home");}}
  function retryCloudSave(){setSyncStatus("saving");setData((current)=>({...current}));}
  const nav=[["home","⌂","오늘의 공부"],["calendar","▦","달력"],["books",<svg className="book-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h13v17H7a2.5 2.5 0 0 0-2.5 2z"/><path d="M4.5 5.5v16.5M8 7h8M8 10.5h8"/></svg>,"내 문제집"],["mistakes","↻","오답 노트"],["report",<svg className="report-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20z"/><path d="M14 3.5V8h4M9 17v-3M12.5 17v-5M16 17v-7"/></svg>,"레포트"]];
  if(!isSupabaseConfigured)return <AccountScreen title="서버 저장 설정이 필요해요" subtitle="Supabase 프로젝트를 만들고 앱 환경 변수를 등록해주세요." setup/>;
  if(!authSession)return <AuthView onSignIn={handleSignIn} onSignUp={handleSignUp}/>;
  if(cloudError)return <AccountScreen title="서버에 연결하지 못했어요" subtitle={cloudError} action={<><button className="primary" onClick={()=>{setCloudError("");setLoadAttempt((n)=>n+1);}}>다시 연결</button><button className="auth-secondary" onClick={handleSignOut}>로그아웃</button></>}/>;
  if(!cloudReady)return <AccountScreen title="기록을 불러오는 중이에요" subtitle="계정에 저장된 문제집과 풀이 기록을 확인하고 있어요." loading/>;
  return <div className="shell">
    <aside className="sidebar"><button className="brand" onClick={()=>{setPage("home");setSessionId("");}}><span className="brand-mark">m<span>.</span></span><span><b>my pace</b><small>fast & accurate</small></span></button><div className="side-caption">공부 관리</div><nav>{nav.map(([key,icon,label])=><button key={key} className={"nav-item "+(page===key||(key==="books"&&page==="book-edit")?"active":"")} onClick={()=>{setPage(key);setSessionId("");}}><span>{icon}</span>{label}{key==="mistakes"&&wrongs.length>0&&<i>{wrongs.length}</i>}</button>)}</nav><div className="side-quote"><span>✳</span><p>빠르고 정확하게<br/><b>확실한 한 문제</b>씩.</p><small>시간은 줄이고, 정확도는 높이고</small></div><div className="side-foot">기록은 계정에 저장돼요</div></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand">m<span>.</span> my pace</div><div className="storage">{syncStatus!=="saved"&&<><i className={syncStatus==="error"?"sync-error":"sync-saving"}/>{syncStatus==="saving"?"서버 저장 중":<button className="sync-retry" onClick={retryCloudSave}>저장 재시도</button>}</>}<b>{authSession.user.email?.slice(0,1).toUpperCase()||"MP"}</b><button className="logout-button" onClick={handleSignOut}>로그아웃</button></div></header>
      {page==="home"&&<HomePage today={today} sessions={sessions} books={data.books} monthHours={monthHours} monthMinutes={monthMinutes} monthStudyDays={monthStudyDays} todaySolved={todaySolved} todaySkipped={todaySkipped} todayQuestions={todayQuestions} todayCorrect={todayCorrect} todayGraded={todayGraded} todaySeconds={todaySeconds} onPlan={()=>openPlan(today)} onRegister={()=>setModal("book")} onOpenSession={enter}/> }
      {page==="calendar"&&<CalendarPage sessions={data.sessions} books={data.books} selectedDate={selectedDate} month={calendarMonth} onSelect={setSelectedDate} onMonth={setCalendarMonth} onPlan={()=>data.books.length?openPlan(selectedDate):(setPage("books"),message("먼저 문제집을 등록해주세요."))} onOpen={enter} onMove={moveSession}/>}
      {page==="report"&&<ReportPage sessions={data.sessions} books={data.books}/>}
      {page==="books"&&<BooksPage books={data.books} sessions={data.sessions} onAdd={()=>setModal("book")} onEdit={editBook} onOpenAnswer={openAnswerFile}/>}
      {page==="book-edit"&&editingBook&&<BookEditPage book={editingBook} onBack={()=>{setPage("books");setEditingBookId("");}} onSave={saveBook} onOpenAnswer={()=>openAnswerFile(editingBook)}/>}
      {page==="mistakes"&&<MistakesPage wrongs={wrongs} books={data.books} onSave={saveNote} onToggleCount={toggleCount}/>}
      {page==="solve"&&current&&<SolvePage current={current} books={data.books} tick={tick} onBack={()=>setPage("home")} onGrade={openGrading} onStart={start} onStop={stop} onNext={next} onSkip={skipQuestion} onSelectQuestion={(index)=>updateSession(current.id,(session)=>({...session,currentIndex:index}))}/>}
      {page==="grading"&&current&&<GradingPage current={current} books={data.books} onBack={()=>setPage(current.status==="done"?"home":"solve")} onHome={()=>{setPage("home");setSessionId("");}} onAnswer={answer} onNote={saveNote} onFinish={finish}/>}
    </main>
    {modal&&<div className="backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setModal("")}><section className="modal" role="dialog" aria-modal="true"><button className="close" onClick={()=>setModal("")}>×</button>{modal==="book"?<><div className="eyebrow">ADD A WORKBOOK</div><h2>문제집 등록하기</h2><p className="modal-sub">이름만 입력해도 바로 등록할 수 있어요.</p><form onSubmit={addBook}><label>문제집 이름 <b>*</b><input autoFocus name="name" placeholder="예: 최상위 수학 5-1" required maxLength="60"/></label><div className="two"><label>학년<input name="grade" placeholder="예: 5학년"/></label><label>출판사<input name="publisher" placeholder="예: 디딤돌"/></label></div><label>문제집 난이도<select name="difficulty" defaultValue="보통"><option>쉬움</option><option>보통</option><option>어려움</option></select><small className="difficulty-help">AI 선생님 코멘트에 참고해요.</small></label><label className="photo-field">문제집 표지 사진 <span>(선택 · 12MB 이하)</span><input name="photo" type="file" accept="image/*"/></label><label className="photo-field">정답 파일 <span>(선택 · PDF/JPG/PNG/WEBP, 15MB 이하)</span><input name="answerFile" type="file" accept=".pdf,image/jpeg,image/png,image/webp"/></label><ModalButtons onClose={()=>setModal("")} submit="등록하기"/></form></>:<><div className="eyebrow">TODAY'S PRACTICE</div><h2>오늘 풀 범위 정하기</h2><p className="modal-sub">여러 쪽을 한 번에 입력할 수 있어요.</p><form onSubmit={addPlan}><label>문제집 선택 <b>*</b><select autoFocus name="bookId" defaultValue="" required><option value="" disabled>문제집을 골라주세요</option>{data.books.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>풀이 날짜<input name="date" type="date" defaultValue={planDate} required/></label><div className="range-title">페이지 범위</div><div className="range"><label><small>시작 쪽</small><input name="ps" type="number" min="1" placeholder="12" required/></label><i>—</i><label><small>끝 쪽</small><input name="pe" type="number" min="1" placeholder="14" required/></label></div><div className="range-title">전체 문항 범위</div><div className="range"><label><small>시작 문항</small><input name="qs" type="number" min="1" placeholder="1" required/></label><i>—</i><label><small>끝 문항</small><input name="qe" type="number" min="1" placeholder="8" required/></label></div><div className="range-example">✳　예: 12~14쪽 범위에서 1~8번을 풀면 총 8문제</div><ModalButtons onClose={()=>setModal("")} submit="풀이 시작하기"/></form></>}</section></div>}
    <div className={"toast "+(toast?"show":"")} role="status" aria-live="polite">{toast}</div>
  </div>;
}

function ModalButtons({onClose,submit}){return <div className="modal-actions"><button type="button" className="cancel" onClick={onClose}>취소</button><button className="primary">{submit} <span>→</span></button></div>;}
function AccountScreen({title,subtitle,setup=false,loading=false,action}){
  return <main className="account-screen"><section className="account-card"><div className="account-brand"><span className="brand-mark">m<span>.</span></span><span><b>my pace</b><small>fast & accurate</small></span></div><div className="eyebrow">{setup?"SERVER SETUP":loading?"SYNCING YOUR STUDY DATA":"CONNECTION ERROR"}</div><h1>{title}</h1><p>{subtitle}</p>{setup?<div className="setup-steps"><b>프로젝트 설정 순서</b><ol><li><code>supabase/setup.sql</code> 내용을 Supabase SQL Editor에서 실행</li><li>Vercel 환경 변수에 아래 두 값을 추가</li></ol><pre>VITE_SUPABASE_URL=...<br/>VITE_SUPABASE_ANON_KEY=...</pre><small>환경 변수 추가 후 Vercel에서 다시 배포해주세요. 로컬 개발은 프로젝트 루트의 <code>.env.local</code>에 같은 값을 설정하면 돼요.</small></div>:loading?<span className="account-spinner" aria-label="불러오는 중"/>:action}</section></main>;
}
function AuthView({onSignIn,onSignUp}){
  const [mode,setMode]=useState("signin"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function submit(event){event.preventDefault();setBusy(true);setError("");setNotice("");const form=new FormData(event.currentTarget),email=String(form.get("email")).trim(),password=String(form.get("password"));try{if(mode==="signin")await onSignIn(email,password);else{const session=await onSignUp(email,password);if(!session)setNotice("인증 메일을 보냈어요. 이메일 인증을 마친 뒤 로그인해주세요.");}}catch(problem){setError(problem.message||"요청을 완료하지 못했어요.");}finally{setBusy(false);}}
  return <main className="account-screen"><section className="account-card auth-card"><div className="account-brand"><span className="brand-mark">m<span>.</span></span><span><b>my pace</b><small>fast & accurate</small></span></div><div className="eyebrow">YOUR STUDY, IN SYNC</div><h1>{mode==="signin"?"로그인":"계정 만들기"}</h1><p>로그인하면 문제집과 풀이 기록을 서버에 저장해 어디서든 이어볼 수 있어요.</p><form onSubmit={submit}><label>이메일<input type="email" name="email" autoComplete="email" placeholder="name@example.com" required/></label><label>비밀번호<input type="password" name="password" autoComplete={mode==="signin"?"current-password":"new-password"} minLength="8" placeholder="8자 이상 입력해주세요" required/></label><button className="primary auth-submit" disabled={busy}>{busy?"처리 중…":mode==="signin"?"로그인":"계정 만들기"}</button></form>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}<button className="auth-switch" onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");setNotice("");}}>{mode==="signin"?"처음 사용하시나요? 계정 만들기":"이미 계정이 있나요? 로그인"}</button></section></main>;
}

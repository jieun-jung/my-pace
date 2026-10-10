import React from "react";
import { Empty, SessionRow, Stat } from "../components/common.jsx";
import { accuracyTone, fmt, questionCount, rate } from "../lib/study.js";
export default function HomePage({today,sessions,books,monthHours,monthMinutes,monthStudyDays,todaySolved,todaySkipped,todayQuestions,todayCorrect,todayGraded,todaySeconds,onPlan,onRegister,onOpenSession}){
  return       <section className="view">
        <div className="month-focus"><div className="month-focus-copy"><span>{new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long"}).format(new Date())}</span><h2>이번 달 순공 시간</h2><p>문제 풀이에 집중한 시간만 합산해요.</p></div><div className="month-focus-time" aria-label={`${monthHours}시간 ${monthMinutes}분`}><b>{monthHours}<small>시간</small></b><span>{String(monthMinutes).padStart(2,"0")}분</span></div><div className="month-focus-days"><b>{monthStudyDays}</b><span>일 공부</span></div></div>
        <header className="page-heading today-date-heading"><div><div className="eyebrow"><span className="math-label">수학 풀이</span>{new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long"}).format(new Date())}</div></div></header>
        <div className="section-title today-stats-title"><div><h2>오늘의 공부</h2><p>오늘의 진행 상황과 집중 시간을 모아봤어요.</p></div></div>
        <div className="stats stats-combined"><Stat label="진행률" value={(rate(todaySolved,todayQuestions.length)??0)+"%"} detail={`${questionCount(todaySolved,todaySkipped,todayQuestions.length)} 문항`} progress={rate(todaySolved,todayQuestions.length)??0} icon="✎" color="mint"/><Stat label="정답률" tone={accuracyTone(rate(todayCorrect,todayGraded.length))} value={rate(todayCorrect,todayGraded.length)===null?"—":rate(todayCorrect,todayGraded.length)+"%"} detail={todayGraded.length?todayCorrect+" / "+todayGraded.length+" 정답":"채점 후 표시돼요"} progress={rate(todayCorrect,todayGraded.length)??0} icon="✓" color="lilac"/><Stat label="집중 시간" value={fmt(todaySeconds)} detail="문항별 풀이 시간 합계" icon="◷" color="sun"/></div>
        <div className="section-title"><div><h2>오늘 풀 문제</h2><p>문제집과 범위를 정하고 타이머를 시작해요.</p></div>{sessions.length>0&&<button className="subtle" onClick={onPlan}>＋ 새 풀이 추가</button>}</div>
        {!books.length?<Empty icon="▤" title="먼저 문제집을 등록해볼까요?" text="문제집을 등록하면 오늘 풀 범위를 바로 만들 수 있어요." action="문제집 등록하기" onClick={onRegister}/>:!sessions.length?<Empty icon="◷" title="오늘의 첫 풀이를 계획해봐요" text="페이지와 문항 범위를 한 번에 입력할 수 있어요." action="오늘 풀 범위 정하기" onClick={onPlan}/>:<div className="session-list">{sessions.map((s)=><SessionRow key={s.id} session={s} books={books} onClick={()=>onOpenSession(s)}/>)}</div>}
        <div className="footnote">ⓘ 풀이 시간은 문항별 합계로 계산해 문제 사이 쉬는 시간은 포함되지 않아요.</div>
      </section>;
}

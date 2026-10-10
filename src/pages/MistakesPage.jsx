import React, { useState } from "react";
import { Empty, PageHeading } from "../components/common.jsx";
import Notes from "../components/Notes.jsx";
import { fmt } from "../lib/study.js";
export default function MistakesPage({wrongs,books,onSave,onToggleCount}){
  const [bookFilter,setBookFilter]=useState("all");
  const filtered=bookFilter==="all"?wrongs:wrongs.filter((item)=>item.bookId===bookFilter);
  const selectedBook=books.find((book)=>book.id===bookFilter);
  return <section className="view">
    <PageHeading eyebrow="LEARN FROM IT" title="오답 노트" subtitle="틀린 이유를 돌아보고, 다음번 풀이 전략을 적어봐요." action={<div className="wrong-total"><b>{filtered.length}</b>개의 오답</div>}/>
    <div className="mistakes-toolbar"><label htmlFor="mistake-book-filter">문제집 선택</label><select id="mistake-book-filter" value={bookFilter} onChange={(event)=>setBookFilter(event.target.value)}><option value="all">전체 문제집</option>{books.map((book)=><option key={book.id} value={book.id}>{book.name}</option>)}</select><span>{bookFilter==="all"?"전체 오답을 모아보고 있어요":selectedBook?selectedBook.name+" 오답만 보고 있어요":"선택한 문제집의 오답"}</span></div>
    {!filtered.length?<Empty icon="↻" title={bookFilter==="all"?"오답이 생기면 여기에 모여요":"이 문제집의 오답은 아직 없어요"} text={bookFilter==="all"?"풀이를 마친 뒤 채점하면 틀린 문제가 자동으로 정리돼요.":"다른 문제집을 선택하거나 풀이 후 채점해보세요."}/>:<div className="wrong-list">{filtered.map((q)=><WrongCard key={q.id} item={q} onSave={onSave} onToggleCount={onToggleCount}/>)}</div>}
    <div className="encourage"><span>✦</span><div><b>오답은 실력이 자라는 힌트예요</b><p>어디서 생각이 달라졌는지 찾아보면 더 오래 기억할 수 있어요.</p></div></div>
  </section>;
}
function WrongCard({item,onSave,onToggleCount}){const retryMarks=Array.from({length:5},(_,i)=>Boolean(item.retryMarks?.[i])),hintMarks=Array.from({length:5},(_,i)=>Boolean(item.hintMarks?.[i]));return <article className="wrong-card"><div className="wrong-head"><span>!</span><div><b>{item.book}</b><small>{item.date} · {item.page?`${item.page}쪽`:item.pageStart===item.pageEnd?`${item.pageStart}쪽 범위`:`${item.pageStart}–${item.pageEnd}쪽 범위`}</small></div><strong className="wrong-question-number">{item.number}<i>번</i></strong><strong className="wrong-time">{fmt(item.seconds)}</strong></div><Notes reason={item.reason||""} strategy={item.strategy||""} photo={item.photo||""} save={(field,value)=>onSave(item.sessionId,item.id,field,value)}/><div className="wrong-counts"><CountToggle label="재시도" field="retryMarks" marks={retryMarks} item={item} onToggle={onToggleCount}/><CountToggle label="힌트" field="hintMarks" marks={hintMarks} item={item} onToggle={onToggleCount}/></div></article>;}
function CountToggle({label,field,marks,item,onToggle}){return <div className={"retry-toggle "+(field==="hintMarks"?"hint-toggle":"")}><b>{label}</b><div role="group" aria-label={`${label} 횟수`} className="retry-circles">{marks.map((selected,index)=><button type="button" key={index} className={selected?"selected":""} aria-label={`${label} ${index+1}회`} aria-pressed={selected} onClick={()=>onToggle(item.sessionId,item.id,field,index)}>{index+1}</button>)}</div><span>{marks.filter(Boolean).length} / 5회</span></div>;}

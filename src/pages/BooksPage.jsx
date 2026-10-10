import React from "react";
import { PageHeading, Empty } from "../components/common.jsx";
import { accuracyTone, bookColor, bookName, fmt, isAttempted, questionCount, rate, statsForBook, totalTime } from "../lib/study.js";
function WorkbookCard({book,index,sessions,onEdit,onOpenAnswer}){
  const stats=statsForBook(sessions,book.id);
  const dailyStats=sessions.filter((session)=>session.bookId===book.id).reduce((days,session)=>{
    const day=days[session.date]||(days[session.date]={date:session.date,total:0,solved:0,skipped:0,graded:0,correct:0});
    day.total+=session.questions.length;
    day.solved+=session.questions.filter(isAttempted).length;
    day.skipped+=session.questions.filter((q)=>q.result==="skipped").length;
    day.graded+=session.questions.filter((q)=>q.result==="correct"||q.result==="wrong").length;
    day.correct+=session.questions.filter((q)=>q.result==="correct").length;
    return days;
  },{});
  const dailyRows=Object.values(dailyStats).sort((a,b)=>b.date.localeCompare(a.date));
  return <article className={"book-card book-"+(index%4)}>
    <div className="book-design">{book.photo?<img src={book.photo} alt={book.name+" 표지"}/>:<>∑<i>✳</i></>}</div>
    <span className="book-subject">수학</span><h3>{book.name}</h3>
    <p>{[book.grade,book.publisher,`${book.difficulty||"보통"} 난이도`].filter(Boolean).join(" · ")}</p>
    <div className={"book-metrics "+accuracyTone(stats.accuracy)}><div><small>전체 정답률</small><b>{stats.accuracy===null?"—":stats.accuracy+"%"}</b><span>{stats.correct} / {stats.graded} 정답</span></div><div><small>풀이 문항</small><b>{questionCount(stats.solved,stats.skipped,stats.total)}</b></div></div>
    {book.answerFilePath&&<button className="answer-file-link" onClick={onOpenAnswer}>정답 파일 다운로드 <span title={book.answerFileName}>{book.answerFileName}</span></button>}
    <div className="book-daily"><h4>날짜별 기록</h4>{dailyRows.length?<div className="book-daily-list">{dailyRows.map((day)=>{const progress=rate(day.solved,day.total)??0,accuracy=rate(day.correct,day.graded);return <div className="book-daily-row" key={day.date}><div className="book-daily-date">{new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",weekday:"short"}).format(new Date(day.date+"T12:00:00"))}</div><div className="book-daily-progress"><div><i style={{width:progress+"%"}}/></div><span>{questionCount(day.solved,day.skipped,day.total)}</span></div><div className={"book-daily-accuracy "+accuracyTone(accuracy)}>정답률 <b>{accuracy===null?"—":accuracy+"%"}</b></div></div>;})}</div>:<p className="book-daily-empty">풀이 기록이 생기면 날짜별 진행률과 정답률이 표시돼요.</p>}</div>
    <button className="edit-book-button" onClick={onEdit}>문제집 수정 <span>→</span></button>
  </article>;
}
export function BookEditPage({book,onBack,onSave,onOpenAnswer}){
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
      <label className="photo-field">정답 파일 바꾸기 <span>(PDF/JPG/PNG/WEBP, 15MB 이하)</span><input name="answerFile" type="file" accept=".pdf,image/jpeg,image/png,image/webp"/></label>
      {book.answerFilePath&&<><button type="button" className="answer-file-link" onClick={onOpenAnswer}>현재 파일 다운로드 <span title={book.answerFileName}>{book.answerFileName}</span></button><label className="remove-photo"><input type="checkbox" name="removeAnswer"/> 현재 정답 파일 삭제</label></>}
      <div className="edit-form-actions"><button type="button" className="cancel" onClick={onBack}>취소</button><button className="primary">변경사항 저장 <span>→</span></button></div>
    </form>
  </section>;
}

export default function BooksPage({books,sessions,onAdd,onEdit,onOpenAnswer}){return <section className="view"><PageHeading eyebrow="MY WORKBOOKS" title="내 문제집" subtitle="문제집별 풀이 기록과 누적 정답률을 확인해요." action={<button className="primary" onClick={onAdd}>＋ 문제집 등록</button>}/>{!books.length?<Empty icon="▤" title="아직 등록된 문제집이 없어요" text="문제집 이름과 학년을 등록하면 오늘의 풀이를 만들 수 있어요." action="첫 문제집 등록하기" onClick={onAdd}/>:<div className="book-grid">{books.map((book,index)=><WorkbookCard key={book.id} book={book} index={index} sessions={sessions} onEdit={()=>onEdit(book)} onOpenAnswer={()=>onOpenAnswer(book)}/>)}<button className="add-book" onClick={onAdd}><span>＋</span>문제집 추가</button></div>}</section>; }

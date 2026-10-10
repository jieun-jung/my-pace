export const todayKey = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
export const dateKey = (year,month,day) => year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
export const dateLabel = (key) => new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date(key+"T12:00:00"));
export const makeId = () => globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random();
export const fmt = (value) => { const n=Math.max(0,Math.floor(value||0)); return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"); };
export const elapsedSeconds = (startedAt,now=Date.now()) => Math.max(0,Math.floor((now-startedAt)/1000));
export const totalTime = (s,now=Date.now()) => s.questions.reduce((sum,q)=>sum+q.seconds+(q.startedAt?elapsedSeconds(q.startedAt,now):0),0);
export const questionsForAverage = (questions) => Math.max(questions.filter((q)=>q.result!=="skipped").length,1);
export const bookName = (books,id) => books.find((b)=>b.id===id)?.name||"문제집";
const bookPalette = [{tint:"#f1f7ff",accent:"#4385c5",border:"#d3e3f5"},{tint:"#eff9f4",accent:"#398b69",border:"#cce7d9"},{tint:"#f6f3ff",accent:"#8069ba",border:"#ddd5f1"},{tint:"#fff8eb",accent:"#ad7c27",border:"#eddfbd"},{tint:"#fff3f1",accent:"#bc6258",border:"#f0d7d2"}];
export const bookColor = (id) => { let hash=0; for(const char of String(id||"")) hash=(hash*31+char.charCodeAt(0))|0; return bookPalette[Math.abs(hash)%bookPalette.length]; };
export const isSolved = (q) => q.seconds>0 || q.result!=="pending";
export const isAttempted = (q) => q.result!=="skipped" && isSolved(q);
export const rate = (correct,total) => total ? Math.round(correct/total*100) : null;
export const questionCount = (solved,skipped,total) => `${solved}${skipped?` (${skipped})`:""} / ${total}`;
export const accuracyTone = (value) => value===null?"":value<70?"accuracy-low":value<80?"accuracy-medium":"accuracy-high";
export function statsForBook(sessions,bookId){
  const questions=sessions.filter((s)=>s.bookId===bookId).flatMap((s)=>s.questions);
  const graded=questions.filter((q)=>q.result==="correct"||q.result==="wrong");
  const correct=graded.filter((q)=>q.result==="correct").length;
  return {total:questions.length,solved:questions.filter(isAttempted).length,skipped:questions.filter((q)=>q.result==="skipped").length,graded:graded.length,correct,accuracy:rate(correct,graded.length)};
}

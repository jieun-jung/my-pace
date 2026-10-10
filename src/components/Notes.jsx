import React, { useEffect, useState } from "react";
import { resizePhoto } from "../lib/photos.js";
export default function Notes({reason,strategy,photo,save}){
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

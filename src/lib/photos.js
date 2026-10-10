export function resizePhoto(file){
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


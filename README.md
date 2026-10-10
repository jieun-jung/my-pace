# 마이 페이스

수학을 빠르고 정확하게 풀기 위한 기록 관리 React 앱입니다. 문제집을 등록하고 오늘 풀 범위를 만든 뒤, 문항별 타이머와 사후 채점으로 풀이 시간 및 오답 메모를 관리합니다.

## 시작하기

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/setup.sql`을 실행합니다.
2. `.env.example`을 `.env.local`로 복사하고 Supabase URL과 anon/publishable key를 입력합니다.
3. 프로젝트 폴더에서 `npm install` 후 `npm run dev`를 실행합니다.
4. 첫 로그인에서 이 브라우저에 저장된 기존 기록을 계정으로 가져옵니다.

npm run build 명령으로 정적 배포용 파일을 생성할 수 있습니다.

## 서버 저장 설정

앱은 Supabase Auth로 로그인하고, 사용자별 학습 데이터는 `user_data` 테이블에 저장합니다. 문제집 표지, 오답 사진, 문제집 정답 파일(PDF/JPG/PNG/WEBP, 최대 15MB)은 비공개 `my-pace-photos` 버킷에 저장되며, SQL에 포함된 RLS 정책으로 로그인한 계정 소유의 데이터와 파일만 접근할 수 있습니다. 정답 파일 업로드를 사용하려면 최신 `supabase/setup.sql`을 Supabase SQL Editor에서 다시 실행해 PDF MIME 형식과 15MB 제한을 적용하세요. `SUPABASE_SERVICE_ROLE_KEY`는 계정 탈퇴 API에서만 사용하며, 브라우저에 노출되지 않도록 Vercel과 로컬 `.env.local`의 서버 환경 변수로만 설정하세요.

Vercel 배포에서는 Project Settings → Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 등록한 뒤 재배포합니다. `SUPABASE_SERVICE_ROLE_KEY`에는 Supabase의 `service_role` 키를 입력합니다. 이 키는 관리자 권한이 있으므로 `VITE_` 접두어를 붙이거나 클라이언트 코드에서 사용하지 마세요. 로컬 API 테스트는 `.env.local`에 서버 키를 넣고 `vercel dev`로 실행합니다. Supabase Authentication URL Configuration에서 Site URL을 배포 도메인으로 설정해야 이메일 인증 링크가 앱으로 돌아옵니다.

## AI 학습 코멘트

문제집별 난이도와 월간 학습 통계로 AI 선생님 코멘트를 생성합니다. Vercel Project Settings → Environment Variables에 `OPENAI_API_KEY`를 추가한 뒤 재배포하세요. 이 키는 서버 전용이며 `VITE_` 접두어를 붙이지 마세요. 모델은 기본으로 `gpt-6-luna`를 사용하고, 필요하면 `OPENAI_MODEL`로 변경할 수 있습니다. 로컬에서는 `.env.local`에 같은 서버 환경 변수를 설정하고 `vercel dev`로 Vercel API 함수를 실행해야 합니다.

AI로 보내는 정보는 난이도와 익명 통계(문항 수, 정답률, 풀이 시간)뿐입니다. 문제집 이름, 오답 메모, 사진, 계정 정보는 전달하지 않으며, 코멘트 생성은 레포트에서 버튼을 눌렀을 때만 실행됩니다.

## 주요 기능

- 여러 문제집 등록
- 문제집 표지 사진 등록
- 문제집별 정답 파일 업로드 및 다운로드
- 오늘 풀이 진행률과 정답률, 문제집별 누적 정답률 확인
- 달력에서 날짜별 문제집 풀이와 페이지 범위를 확인하고 계획하거나 날짜 변경
- 문제집 정보와 표지 사진 수정
- 페이지 범위와 전체 문항 범위를 계획 (예: 12~14쪽, 1~8번은 총 8문제)
- 문항별 시작·종료 타이머, 재풀이 시간 누적 및 풀이 시간 합계
- 풀이 완료 후 맞음·틀림 채점
- 오답별 틀린 이유와 풀이 전략 기록
- 오답 메모 수정 및 문제 사진 첨부
- 오답 노트 전체 보기 및 문제집별 필터링
- 브라우저에 기록 저장
- 상단 계정 메뉴에서 로그아웃 또는 계정 탈퇴

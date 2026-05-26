# doamnu-2026scl 프로젝트 설정 가이드

> 건축설계 크리틱 로그 시스템 (SCL) — 이대리(Claude Code) 인수인계 문서

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | 건축설계 크리틱 로그 시스템 (SCL) |
| 운영 URL | https://doamnu-2026scl-284108510633.asia-northeast3.run.app |
| GitHub | https://github.com/edge1014/doamnu-2026scl |
| 인프라 | Google Cloud Run (asia-northeast3, 서울) |
| 프레임워크 | Next.js (App Router, TypeScript) |

---

## 2. 시스템 구조

```
교수 평가 입력 (Cloud Run 앱)
  ├── 이미지 업로드 → Google Drive 저장 → URL을 Notion DB3에 기록
  ├── 평가 점수 + 크리틱 → Notion DB3 저장
  └── AI 조언 생성 → Gemini API → Notion DB4 저장

학생 크리틱 보드 (/board?student=학생ID)
  └── Notion DB3 조회 → 이미지/점수/크리틱/AI조언 표시
```

---

## 3. Notion 연동 구조

**허브 페이지:** 2026 2학년 건축설계수업관리  
URL: https://www.notion.so/836987c1bf1e825c9251011c56b3cc44

| DB | Collection ID | 역할 |
|---|---|---|
| DB1: 학생 목록 | d45987c1-bf1e-82db-8fd4-0725ebf3fe3e | 학생 명단, 분반(1/2분반) |
| DB2: 수업 세션 | 10f987c1-bf1e-8358-a156-87974c317f23 | 수업 날짜, 세션명, 총평 |
| DB3: 평가 기록 | 15a987c1-bf1e-82c6-9885-07dd84148d1e | 점수, 크리틱, 이미지URL |
| DB4: AI 젠지 조언 | bed987c1-bf1e-8203-a73c-87ff0717f76d | Gemini AI 조언 |

**상위 수업 페이지:** 2학년 건축설계 2026 1학기  
URL: https://www.notion.so/369987c1bf1e80a8a60acdd3c220fa4a

---

## 4. GCP 설정

| 항목 | 값 |
|---|---|
| 프로젝트 표시명 | lastclaw |
| 프로젝트 ID | gen-lang-client-0222209083 |
| 프로젝트 번호 | 284108510633 |
| 리전 | asia-northeast3 (서울) |
| Cloud Run 서비스명 | doamnu-2026scl |
| 서비스 계정 | github-deployer@gen-lang-client-0222209083.iam.gserviceaccount.com |

**서비스 계정 역할:**
- Cloud Run 관리자
- Cloud Build 편집자
- 스토리지 관리자
- 서비스 계정 사용자
- Artifact Registry 작성자

---

## 5. GitHub Actions CI/CD

**설정 파일:** `.github/workflows/deploy.yml`  
**트리거:** `main` 브랜치에 push할 때마다 자동 배포

**GitHub Secrets (설정 완료):**

| Secret 이름 | 내용 |
|---|---|
| `GCP_SA_KEY` | 서비스 계정 JSON 키 전체 내용 |
| `GCP_PROJECT_ID` | `gen-lang-client-0222209083` |

---

## 6. 2026-05-26 코드 변경사항

### 문제 1 해결: 이미지 업로드 속도 개선
**파일:** `src/app/api/upload/route.ts`
- Drive 폴더 ID를 **메모리 캐시**에 저장 → 같은 날짜/분반 폴더는 API 재호출 없음
- 최초 업로드: Drive API ~6번 → 이후: ~1번

### 문제 2 해결: 이미지 표시 수정
**파일:** `src/app/api/upload/route.ts`
- URL 형식 변경: `uc?export=view` → `thumbnail?id=...&sz=w800-h500`

**파일:** `src/app/board/page.tsx`
- `normalizeDriveUrl()` 함수 추가: 기존 저장된 URL도 자동 변환
- `onError` 핸들러 추가: 이미지 로드 실패 시 깔끔하게 처리

---

## 7. 집에서 이어서 작업하는 방법

### Step 1: 코드 클론 (최초 1회)
```bash
git clone https://github.com/edge1014/doamnu-2026scl ~/doamnu-2026scl
cd ~/doamnu-2026scl
```

### Step 2: Claude Code 실행
```bash
claude  # ~/doamnu-2026scl 폴더에서 실행
```
이대리에게 이 파일(PROJECT_SETUP.md)을 읽으라고 하면 바로 컨텍스트 파악 가능.

### Step 3: 코드 수정 후 배포
```bash
git add .
git commit -m "변경 내용 설명"
git push  # → GitHub Actions가 자동으로 Cloud Run 배포
```

### Step 4: GitHub 인증 (처음 push 시)
GitHub Personal Access Token 필요:
- https://github.com/settings/tokens/new
- **repo** + **workflow** 체크
- push 시 username: `edge1014`, password: 발급받은 토큰

---

## 8. 로컬 개발 환경 설정

```bash
cd ~/doamnu-2026scl
npm install
cp .env.example .env.local  # 없으면 직접 생성
```

`.env.local` 필수 환경변수:
```
NOTION_TOKEN=...
NOTION_DB_STUDENTS=d45987c1-bf1e-82db-8fd4-0725ebf3fe3e
NOTION_DB_SESSIONS=10f987c1-bf1e-8358-a156-87974c317f23
NOTION_DB_EVALUATIONS=15a987c1-bf1e-82c6-9885-07dd84148d1e
NOTION_DB_ADVICE=bed987c1-bf1e-8203-a73c-87ff0717f76d
GOOGLE_DRIVE_IMAGE_ROOT_FOLDER_ID=...
GEMINI_API_KEY=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

```bash
npm run dev  # http://localhost:3000
```

---

## 9. 주요 API 엔드포인트

| 경로 | 역할 |
|---|---|
| `POST /api/upload` | 이미지 리사이징 + Drive 업로드 |
| `POST /api/save` | 평가 기록 Notion 저장 |
| `GET /api/scl?studentId=` | 학생 평가 이력 조회 |
| `GET /api/init-data` | 학생/세션 목록 초기 로딩 |
| `POST /api/advice` | Gemini AI 조언 생성 |
| `POST /api/export-pdf` | PDF 생성 + Drive 업로드 |

---

## 10. 담당 교수

| 이름 | 역할 |
|---|---|
| 김태훈 | 교수 |
| 정미연 | 교수 |
| 하신해 | 교수 |

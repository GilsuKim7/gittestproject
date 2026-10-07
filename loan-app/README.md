# 융자취급신청관리 (UGSLT08004M01)

TO-BE 화면설계서를 바탕으로 만든 웹 화면과 서버입니다. 데이터는 SQLite DB 파일에 저장되어 여러 사용자가 함께 씁니다.

- 서버: Node.js 기본 모듈(`node:http`, `node:sqlite`)만 사용 → **`npm install` 불필요**, 폐쇄망에서도 바로 실행
- DB: SQLite 파일 `data/loan.db` (처음 실행 시 자동 생성 + 예시 1건 입력)
- 엑셀: 서버에서 `.xlsx` 생성 (SheetJS, `public/lib/`에 포함)

## 실행

Node.js **22.13 이상**이 필요합니다.

```bash
cd loan-app
npm start            # http://localhost:3000
```

환경변수: `PORT`(기본 3000), `DB_FILE`(기본 `data/loan.db`)

테스트: `npm test`

## 기능
- **입력/저장/삭제**: 하단 상세 영역에 입력 후 `저장`. 신규는 신청일자 연도 기준 `SN-YYYY-NNNNNN` 번호가 자동 채번됩니다. 필수값·날짜 검증은 서버에서도 합니다.
- **조회**: 신청번호(연도·일련번호), 구역명, 신청인, 신청일자 기간. 목록 행 클릭 시 상세로 불러옵니다.
- **엑셀다운로드**: 현재 조회조건의 목록을 `융자취급신청목록_YYYYMMDD.xlsx`로 받습니다.
- **첨부파일**: DB에 저장되며(최대 20MB) 상세 화면의 링크로 내려받습니다.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/applications?year=&seq=&area=&applicant=&from=&to=` | 목록 조회 |
| GET | `/api/applications/export.xlsx?(조회조건)` | 엑셀 다운로드 |
| POST | `/api/applications` | 등록 (JSON) |
| GET / PUT / DELETE | `/api/applications/{신청번호}` | 단건 조회 / 수정 / 삭제 |
| PUT | `/api/applications/{신청번호}/file` | 첨부 업로드 (본문=파일, 헤더 `X-File-Name`=URL 인코딩된 파일명) |
| GET | `/api/applications/{신청번호}/file` | 첨부 다운로드 |

## 구조
```
server.js        API + 정적 파일 서버
db.js            스키마, 조회/저장 (테이블: loan_application, loan_attachment)
public/          화면 (index.html, app.js, style.css)
test/            API 테스트
```

## 참고
- 로그인/권한 기능은 없습니다. 내부망 외부에 노출하지 마세요.
- DB 백업은 서버를 멈춘 뒤 `data/` 폴더를 복사하면 됩니다.
- 운영 DB(Oracle, PostgreSQL 등)로 바꿀 경우 `db.js`만 교체하면 됩니다.

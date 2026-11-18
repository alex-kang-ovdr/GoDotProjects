# 실시간 공동 편집·GitHub 연동

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## 권한 모델

Project Owner/Admin/Editor/Viewer. 프로젝트 접근·공유 에셋 권한·Publish 승인 권한 분리. AI Agent는 위임된 사용자 권한 범위 내에서만 작업한다.

## Workspace Authority

Workspace별 논리적 단일 Authority가 UI/MCP/AI 명령을 순차 검증·적용하고 Operation Log에 기록. Presence(커서·선택·포커스)는 휘발성, Lua 텍스트에만 CRDT 사용.

## 편집 잠금

개별 Property는 Revision 기반 충돌 감지, Prefab/Class 구조·바이너리 에셋·프로젝트 설정은 Hard Lock. Undo는 조건부 역연산이며 타인 변경을 조용히 덮어쓰지 않는다.

## GitHub

Source of Truth는 크리에이터 GitHub. Workspace Autosave는 Git Commit과 다르다. ChangeSet을 선택해 Commit/PR 생성, Branch 충돌은 명시적 리뷰. GitHub 접근 불가 시 Workspace 작업 보관 후 재동기화.

## 공유 작업 UX

실시간 선택 아웃라인·사용자 커서·편집 중 필드 표시·AI ChangeSet Preview·파일별 Diff·승인/거절·Git 상태. 모바일은 축소된 웹 UI를 사용한다.

## 수용 기준

동시 Property 편집 충돌, Lock 회수, 네트워크 재접속 후 Operation Replay, Undo 충돌, CRDT Lua 병합, GitHub 충돌을 E2E 테스트한다.
# 30. 서버 권한 검증·안티치트·UGC 실행 격리 개발 계획

| 항목 | 계획 |
| --- | --- |
| 계획 ID / 기준일 | NET-30 / 2026-11-24 |
| 원문 대응 | PDF 5-6쪽 안티치트·서버 검증, 7쪽 벤더 통합 |
| 우선순위 / 상태 | P0 서버 검증·격리, P1 선택 EAC 연동 / 설계안 |
| 구현 위치 | 게임 서버 규칙 계층 + 네트워크 parser + 운영 backend + 선택 native adapter |
| 선행 과제 | 25/26 권한·스키마, 27 입력/판정, 28/29 서버·인증 |
| 담당 / 공수 | 네트워크·보안·backend·QA / 14-22 PW |
| 제외 | 자체 커널 드라이버 개발, 모든 플랫폼의 EAC 지원 보장 |

본 계획의 수치와 API는 설계용이다. 실제 공격·탐지·벤더 승인·제재 수행 결과가 아니다.

## 1. 목표와 책임 분리

서버 권한으로 예방 가능한 부정행위부터 차단한다. 입력 변조·비정상 속도·중복 거래·타인 객체 RPC·정보 과다 노출을 기본 방어로 처리하고, client integrity SDK는 지원이 확인된 플랫폼에 추가한다.

Epic의 Anti-Cheat 문서도 안전한 게임 구조와 게임별 검증을 기본으로 두며 dedicated server 모드의 client/server interface를 구분한다. 이를 따라 SDK 도입과 게임 규칙 검증을 분리한다. [Epic Anti-Cheat Interfaces](https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/anti-cheat-interfaces)

## 2. 위협 모델과 통제 지점

| 경계 | 위험 | 제안 통제 |
| --- | --- | --- |
| 인증 전 연결 | 연결 폭주·거대 패킷·반사 | 제한된 handshake, connection quota, source 검증 |
| 인증된 client | 입력/clock/위치/피해 변조 | 서버 시뮬레이션과 규칙 검증 |
| 객체·세션 | 타인 제어·cross-project 접근 | WorldKey·owner_epoch·권한 allowlist |
| 상태 복제 | 은폐 대상/개인 정보 노출 | NET-26 서버 필터, private fragment |
| 거래·진행 | 재전송·재접속 중복 보상 | request/result revision·원장 idempotency |
| UGC 스크립트 | 서버 파일·네트워크 접근·무한 실행 | 프로세스/OS 격리·quota·공식 API broker |
| 빌드·애드온 | 변조·미승인 native 코드 | manifest hash·서명·검수된 패키지 집합 |
| 운영 도구 | 무권한 kick/ban·증거 누락 | 역할·감사 로그·이의 처리 |

GDScript나 GDExtension 그 자체를 불신 코드를 위한 보안 sandbox로 취급하지 않는다. 동일 엔진 프로세스 안에서 모든 테넌트를 안전하게 격리했다는 가정 없이 OS/컨테이너 경계를 사용한다.

## 3. 서버 입력·행동 검증

모든 client 명령은 authenticated connection→현재 owner→허용 RPC→bounded schema→rate/tick window→게임 규칙 순으로 검사한다. payload에 적힌 user_id·object owner를 권한 증거로 사용하지 않는다.

| 명령 | 검사 항목 | 거절/보정 정책 |
| --- | --- | --- |
| 이동 | 입력 시퀀스·고정 시간·이동 모드·최대 가속·충돌 | 과거/미래 입력 폐기, 권위 상태 보정 |
| 사격·스킬 | 쿨다운·탄약·시작점·사거리·상태·rewind 범위 | 피해 미적용, 원인 코드 |
| 아이템/거래 | 소유권·수량·가격 버전·거래 revision | 원자적 실패 또는 동일 결과 재전송 |
| 스폰/오브젝트 | prefab allowlist·quota·서버 spawn 권한 | 생성 거절 |
| 채팅·로비 | 권한·크기·rate limit·차단 정책 | 제한된 오류/timeout |

허용 오차는 RTT·jitter·tick 부하와 함께 판단한다. 네트워크 보정 횟수가 많다는 이유만으로 자동 영구 제재하지 않는다. 물리 divergence와 악의적 입력을 구별할 evidence를 기록한다.

## 4. 패킷과 복제 경계

직렬화는 길이·타입·enum·숫자 범위·배열 원소 수를 먼저 검증한다. NaN/Infinity, integer overflow, 과도한 chunk 수, 알 수 없는 schema/field/RPC는 명시적으로 처리한다. 수신 데이터에서 임의 Object·Resource·스크립트를 생성하거나 eval하지 않는다.

Godot SceneMultiplayer는 allow_object_decoding의 기본값을 false로 제공한다. 공용 네트워크 계층에서도 객체 자동 decoding을 활성화하지 않고 typed ID/data만 허용한다. [Godot SceneMultiplayer](https://docs.godotengine.org/en/stable/classes/class_scenemultiplayer.html)

ACK·baseline·spawn/destroy·resim request도 신뢰하지 않는 입력으로 검사한다. 패킷 암호화는 통신 보호이고, 인증된 악성 client가 보낸 잘못된 게임 명령을 올바르게 만드는 장치가 아니다.

연결별·IP별·계정별 rate를 분리한다. 같은 NAT를 쓰는 정상 사용자를 하나의 사용자로 취급하지 않는다. 부담이 큰 서명 검증·full snapshot 재요청에는 별도 예산과 backoff를 둔다.

## 5. 선택 EAC/EOS adapter

IClientIntegrityProvider를 Null/Test/EOS 등으로 구현하고 session begin/register/message/end를 NET-28/29 수명에 연결한다. 서버 credential은 전용 서버에만 보관하고 신뢰하지 않는 community server나 게임 client에 전달하지 않는다.

플랫폼이 호스팅하더라도 불신 UGC를 실행하는 게임 프로세스에는 장기 backend/vendor secret을 직접 주입하지 않는다. 신뢰된 supervisor/broker가 비밀값을 소유하고 게임에는 세션·프로젝트 범위의 짧은 수명 권한만 제공한다. 선택 SDK가 같은 프로세스의 비밀값 접근을 필수로 요구하고 이를 분리할 수 없다면 해당 통합은 신뢰된 서버 코드에 한정한다. 컨테이너가 자신의 환경변수·파일에 놓인 비밀값을 같은 프로세스의 코드로부터 숨겨 준다고 가정하지 않는다.

EAC 적용은 플랫폼·배포 경로·벤더 정책·SDK 버전별 승인을 확인한 조합으로 한정한다. 공식 Using Anti-Cheat 문서는 플랫폼 제약을 별도로 두므로 Android/iOS/Web/콘솔에 데스크톱 경로를 그대로 적용하지 않는다. [Epic Using Anti-Cheat](https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/using-anti-cheat)

연결 중 integrity SDK 오류와 확정된 cheating 판정을 구별한다. 보호 필요 경기의 입장 거절 정책, SDK 서비스 장애 시 대체 queue, 사용자 안내를 운영 설정으로 둔다. 임의로 보호를 해제한 경기를 “보호됨”으로 표시하지 않는다.

## 6. UGC·애드온 격리

프로젝트별 서버 실행 identity, 읽기 전용 build, 제한된 임시 디렉터리, 명시적 외부 API 허용 목록, CPU·메모리·프로세스 수 quota를 적용한다. gameplay가 영속 저장·결제·개인정보 DB를 직접 열지 않고 서버 서비스 API로 접근하게 한다.

플랫폼이 승인한 native addon만 build manifest에 포함한다. 플랫폼 지원표·심사 버전·서명이 없는 바이너리는 서버 이미지에서 실행하지 않는다. 검수 통과가 코드의 모든 취약점 부재를 의미하지 않으므로 버전 폐기·긴급 비활성화·기존 경기 drain 경로를 둔다.

실시간 편집 도구·AI 에이전트 credential과 게임 서버 credential은 별도다. 게임에서 받은 명령이 소스 수정·빌드·배포 권한으로 이어지지 않도록 broker API를 분리한다. 보안 범위의 구현 비용은 관련 23/28 계획과 중복 산정하지 않는다.

## 7. 제안 증거·제재 데이터 계약

```text
ValidationEvent = {
  event_id, project_id, build_id, session_id, server_tick,
  pseudonymous_user_id, rule_id, rule_version, observed_range,
  action: allow|correct|reject|disconnect|review,
  trace_hash, retention_class
}
IntegritySession = {provider, session_id, connection_id, protection_state}
SanctionCase = {case_id, evidence_ids, reviewer, decision, expires_at, appeal_state}
```

기록에는 원문 토큰·암호·불필요한 채팅·전체 파일시스템을 담지 않는다. 재현에 필요한 입력·권위 snapshot·검사 이유의 최소 구간을 보존한다. 접근 권한과 보존 기간을 정하고 사용자의 신고를 세션 증거에 연결한다.

서버의 즉시 보호 조치와 장기 계정 제재를 분리한다. 반복된 구조 위반은 세션 차단할 수 있으나 영구 제재는 증거·정책·검토 흐름을 갖는다. 검토가 필요한 게임별 기준은 규칙 버전으로 이력 관리한다.

## 8. WBS와 공수

| 작업 ID | 내용 | PW | 산출물 |
| --- | --- | --- | --- |
| NET30-01 | 위협 모델·권한·행동 검증 규칙 | 3-4 | 규칙/경계 명세 |
| NET30-02 | parser hardening·rate·중복/재전송 보호 | 3-5 | 공용 validator |
| NET30-03 | UGC 격리 policy·build gate 연계 | 2-3 | 실행 정책·검증 |
| NET30-04 | 선택 integrity provider adapter | 2-4 | 승인 조합별 연동 |
| NET30-05 | 증거·신고·검토·감사 backend | 2-3 | 운영 처리 흐름 |
| NET30-06 | fuzz·악성/정상 corpus·장애 QA | 2-3 | 인수 보고서 |
| 합계 | vendor 승인 대기·자체 드라이버 제외 | 14-22 | 출시 기준 |

## 9. 완료 기준과 검증

정상 입력 corpus와 변조 corpus를 분리하고 동일 seed·build·규칙 버전으로 재생한다. 실제 사용자 서비스에 공격을 수행하지 않고 격리된 개발 환경에서 검증한다.

| 시험 | 계획 목표 |
| --- | --- |
| malformed packet fuzz 100만 건 | crash·경계 밖 쓰기·무한 메모리 증가 0건 |
| 타인 객체/세션/프로젝트 요청 10,000건 | 권한 밖 상태 변경 0건 |
| duplicate 거래·결과 확정 10,000건 | 보상·아이템 중복 0건 |
| 정상 RTT 300ms·loss 5%·일시 tick stall | 정해진 정상 시나리오에서 자동 영구 제재 0건 |
| cloak/owner/team 필터 | 비권한 수신 trace에 민감 필드 0건 |
| 무한 loop·OOM·파일 접근 UGC fixture | 다른 세션과 host 관리 권한 침해 없음 |
| integrity 서비스 장애 | 정책대로 queue/입장 처리, 잘못된 보호 표시 0건 |
| signature/key 교체 | 새 키 수용·폐기 키 거절·기존 세션 정책 검증 |

의도적으로 위험한 fixture는 별도 disposable runtime에서만 실행한다. 보안 검증은 “모든 치트 차단” 보장이 아니라 해당 버전·규칙·시험 범위의 통과로 보고한다.

## 10. 중단 기준과 대안

테넌트 간 읽기/쓰기 또는 host 권한 접근이 가능하면 외부 UGC 서버 실행을 중단한다. 해결 전에는 플랫폼이 제작·검토한 프로젝트만 제한 실행한다.

Integrity SDK를 사용할 수 없는 플랫폼은 서버 검증과 해당 플랫폼 공식 보호 수단을 조합하고 경기별 보호 등급을 기록한다. 정상 사용자의 지연 문제를 막기 위해 검증을 통째로 끄는 방식을 채택하지 않는다.

## 11. 제출 산출물·출처

권한/검증 rulebook, typed parser·fuzz corpus, 서버 실행 policy, provider support matrix, 증거·신고·제재 schema, key rotation·장애 대응 runbook, 정상 사용자의 오탐 회귀 결과를 제출한다.

공식 출처 확인일은 2026-11-24이다. EOS 자료의 지원 조합은 실제 SDK 선정 시 다시 확인하며 제재·로그 운영 정책은 별도 운영 결정이다.

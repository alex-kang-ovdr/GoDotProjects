#!/usr/bin/env python3
"""Rebuild authored planning tables. These are planned checks, not test results."""
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "analysis"


def write_pair(name, rows):
    OUT.mkdir(exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (OUT / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


CASES = [
    ("C01", "combat", "랭크별 비용·쿨다운·피해", "랭크 1과 최대 랭크, 동일 대상", "각 수치가 승인된 정의와 일치", "reference", "P2"),
    ("C02", "combat", "방어·관통·반올림", "방어 0/양수/음수와 관통 조합", "연산 순서와 최종 HP를 설명 가능", "reference", "P2"),
    ("C03", "combat", "보호막과 피해 태그", "일반/물리/마법 보호막", "소모한 보호막과 남은 피해 일관", "reference", "P2"),
    ("C04", "combat", "공격·시전 취소", "준비 중 취소, 발사 후 이동, 대상 사망", "비용·주기·투사체의 승인된 정책 준수", "reference", "P2"),
    ("C05", "combat", "시야·지정 불가·무적", "선택 뒤 대상 상태 변경", "타깃 가능·적중·피해 상태를 분리", "reference", "P2"),
    ("C06", "combat", "관통·왕복·반복 적중", "한 대상에 여러 타격 단계", "히트별 허용 횟수와 귀속 일치", "reference", "P2"),
    ("C07", "combat", "같은 틱의 사건", "치명 피해·회복·보호막·부활 중첩", "결정적 순서, 사망·보상 중복 없음", "reference", "P2"),
    ("E01", "economy", "거래 원자성", "중복 재료, 6슬롯, 골드 부족", "성공 시 일괄 변경, 실패 시 상태 보존", "reference", "P2"),
    ("E02", "economy", "보상 수령자", "막타·주변 경험치·처치 관여·역할 보너스", "보상별 귀속과 계산 추적", "reference", "P3"),
    ("E03", "economy", "역할 퀘스트 전환", "완료 직전/직후와 저장 재개", "보상 1회, 상한과 버프 적용 유지", "reference", "P3"),
    ("E04", "lanes", "웨이브 경계 시각", "간격 변경 직전/정각/직후", "중복 생성 없이 다음 시각 예약", "reference", "P3"),
    ("V01", "vision", "벽 차단", "벽 사이 양측과 우회", "논리 시야·미니맵·타깃 후보 일치", "custom", "P4"),
    ("V02", "vision", "고저차", "언덕 위/아래의 양방향 관측", "높이와 가림 정책에 따른 독립 판정", "custom", "P4"),
    ("V03", "vision", "공격 원점 공개", "숨은 고지대 공격자 공격 후 이동", "원점 공개 유지, 이동 좌표 자동 추적 없음", "custom", "P4"),
    ("V04", "vision", "건물 마지막 상태", "80% 관측 후 비관측 상태에서 20%로 감소", "기억 HP80%와 관측 시각 유지", "custom", "P4"),
    ("V05", "vision", "보이지 않는 파괴", "기억 건물 파괴 후 슬롯 재관측", "재관측 때 파괴 상태로 갱신", "custom", "P4"),
    ("V06", "vision", "팀별 기억 격리", "서로 다른 시점에 같은 건물 관측", "각 팀 스냅샷 독립, 전지 뷰 미유입", "custom", "P4"),
    ("V07", "vision", "공개·기억 저장", "위치 공개 중 저장·일시정지·재개", "남은 시뮬레이션 시간과 과거 기억 유지", "custom", "P4"),
    ("V08", "vision", "간접 정보 누출", "비관측 적과 모든 정보 소비 UI·AI", "승인된 공개 채널 외 실제 좌표 비노출", "custom", "P4"),
    ("U01", "settings", "맵 3종", "1/1.5/2배 새 경기", "좌표·지형·미니맵·저장 범위 일치", "custom", "P1"),
    ("U02", "settings", "맵 선택 시점", "경기 시작 후 크기 변경 시도", "진행 중 크기 불변", "custom", "P1"),
    ("U03", "settings", "속도 4종", "0.5/0.75/1/1.5배", "모든 시뮬레이션 타이머에 한 번만 적용", "custom", "P1"),
    ("U04", "settings", "이전 속도 저장", "2배 및 잘못된 값", "현재 정규화 정책, 2배 선택지 비노출", "custom", "P1"),
    ("U05", "settings", "중단·재개", "일시정지·탭 숨김·이어하기", "중복 발사 없음, 입력 해제, 기억 유지", "custom", "P1"),
]

GAPS = [
    ("G01", "champions", "독자 영웅 3종", "173명 기본·성장 정적 데이터", "예외 성장·패시브·폼·실행 매핑", "P1/P2"),
    ("G02", "abilities", "독자 QWER 및 공통 랭크 배율", "692 QWER·3128 랭크 행", "피해식·시전·충돌·재시전·취소", "P2"),
    ("G03", "combat", "공격 준비·발사·대기, 일부 CC", "전투 근거와 패치별 변경", "효과 순서·피해 태그·원작 수치 검증", "P2"),
    ("G04", "progression", "최대18레벨·스킬 포인트", "역할 퀘스트·변경 이력", "역할 보상·조건부 상한·경험치 귀속", "P3"),
    ("G05", "items", "8아이템·6슬롯·2조합", "863아이템·726조합 간선", "패시브·액티브·조건부 상점", "P2/P5"),
    ("G06", "runes_summoners", "원작 룬 없음·독자 점멸/회복", "62룬·5경로·34주문", "선택 제한·효과·내부 쿨다운", "P5"),
    ("G07", "lanes_structures", "18초 웨이브·구조물 순서", "웨이브·방패·Overgrowth 근거", "현재 규칙 전환·포탑 경제·충돌 해소", "P3"),
    ("G08", "jungle", "4캠프·독자 드래곤/거인", "현재 목표 체계·공식 변경", "캠프·리셋·버프·재생성·귀속", "P3"),
    ("G09", "vision", "원형 팀 시야·수풀·공개 구조물", "원작 참고 시야와 사용자 확장 구분", "팀 관측 뷰·벽/높이·원점 공개·건물 기억", "P4"),
    ("G10", "navigation", "원형 벽·구조물 A*와 슬라이드", "지형 역할 분석", "원작 지형 실측·반경·시야 레이어 분리", "P3/P4"),
    ("G11", "ai", "역할·후퇴·구매·목표물 AI", "시스템 의존성 분석", "관측 기반 기억·위험·의사결정", "P3/P4"),
    ("G12", "save", "전체 로컬 경기·난수·맵·속도 저장", "기존 저장 계약 확인", "규칙 해시·버전·관측 스냅샷 이전", "P1/P4"),
    ("G13", "services", "로컬 AI 경기·완료 기록", "드래프트·랭크·모드 공개 문헌", "서버·큐·계정·동기화", "P6"),
    ("G14", "settings", "맵3종·속도4종·시작 전 맵 선택", "사용자 확정 요구와 v7 코드", "새 프로필 도입 시 계약 유지", "P1"),
]


def main():
    cases = [{
        "case_id": a, "system": b, "title_ko": c, "setup_ko": d,
        "expected_invariant_ko": e, "ruleset_scope": f, "phase": g,
        "status": "planned_not_executed", "observed_result": None,
        "evidence_path": None, "reference_doc": "docs/11_qa_and_measurement_plan.md"
    } for a, b, c, d, e, f, g in CASES]
    gaps = [{
        "gap_id": a, "system": b, "prototype_state_ko": c,
        "reconstruction_evidence_ko": d, "remaining_work_ko": e,
        "phase": f, "implementation_changed_this_delivery": False,
        "reference_doc": "docs/10_prototype_gap_and_roadmap.md"
    } for a, b, c, d, e, f in GAPS]
    write_pair("planned_acceptance_cases", cases)
    write_pair("implementation_gap", gaps)
    print(json.dumps({"planned_acceptance_cases": len(cases), "implementation_gaps": len(gaps), "executed_game_tests": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()

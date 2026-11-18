# 재취합 검증 — 2026-11-18

## 검사 대상

| 원본 | 정확한 바이트 | 구성 파일 수 | 원본 ZIP CRC |
|---|---:|---:|---|
| Crownfall_Arena_v4_5_0_Implemented.zip | 607,276 | 80 | 정상 |
| Clash_Royale_Reverse_Design_Reconstructed_v4.zip | 1,331,090 | 149 | 정상 |

게임 원본 ZIP SHA-256:

```text
0f458c1d58ff2e19d380fb5221d156719b33dfff45e73d0822bd2b7af666773a
```

연구 원본 ZIP SHA-256:

```text
cb81db0e575db073ac873864ee2f09a25e1cb3e4db098abe602f1c0934b66288
```

## 동일성 및 새 ZIP 검사 결과

- 게임 원본 80개 및 연구 원본 149개 구성 파일: 원본 ZIP과 현재 작업 파일의 바이트 동일.
- 추가 포함한 기존 소스 ZIP 1개 및 최종 TAP 로그 1개: 현재 원본의 바이트 그대로 복사.
- 새 ZIP의 기존 파일 231개: 원본 바이트·크기·SHA-256·CRC32 전부 일치.
- 새 ZIP 전체 235개 파일: CRC 검사 정상, 누락·중복 엔트리·내용 불일치 없음.
- 새 ZIP 안의 `crownfall-arena/dist/source.zip`: 원본 ZIP과 전체 바이트 동일, 내부 CRC 정상.
- 독립 오프라인 파일과 ZIP 내부 `crownfall-arena/dist/crownfall-offline.html`: 바이트 동일.
- 원본 게임 Git HEAD: `6f4ce3df6a5733dfc11f45249e44987c00620b22`, 작업 트리 변경 없음.

원본별 파일 해시는 [REPACK_MANIFEST.json](REPACK_MANIFEST.json)에 있습니다.
새 ZIP 자체의 정확한 크기와 SHA-256은 배포 답변 및 ZIP 옆의 검증 JSON/체크섬 파일에 기록합니다.
ZIP 자신의 해시를 내부에 넣으면 파일 내용이 다시 바뀌므로 내부 manifest에는 구성 파일 해시를 기록했습니다.

## 이전 검사 결과 보존

게임 v4.5의 251개 검사, 연구 v4의 Node 99개·Python 55개 검사는 원본 보고서에 보존된 이전 실행 결과입니다.
이번 작업은 CRC·바이트·해시 검사만 수행했습니다. 게임 검사·원작 관측·브라우저·GPU 검사를 새로 실행하지 않았습니다.

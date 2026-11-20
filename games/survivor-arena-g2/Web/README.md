# Survivor Arena · Godot G2

WASD/방향키 또는 화면 드래그로 이동합니다. 자동 공격하며, 성장 카드는 1/2/3으로 선택합니다.
P/Esc 정지, B 빌드, M 효과음, N 레이더, F11 전체 화면. 로비/정지 화면의 설정에서 음량과 표시를 조절합니다.
G1의 같은 기기 네이티브 저장을 이어받습니다. 최근 기록은 새로 완료한 12개 전투를 보관합니다.

## 실행

이 폴더에서 HTTP 서버를 실행하고 브라우저로 접속합니다.

```bash
python -m http.server 8060
```

주소: http://localhost:8060

index.html을 더블클릭하는 file:// 방식은 사용하지 않습니다. HTML/JS/WASM/PCK를 같은 폴더에 유지하세요. Compatibility/WebGL 2.0, 단일 스레드 빌드입니다.

검증: 내보내기 및 파일 구조 확인. 브라우저 게임 실기동은 검증 환경 제약으로 미확인입니다. Android/iOS/Safari 실기기 검증은 포함하지 않습니다.

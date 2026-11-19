# Tappy Chicken 원본 그래픽·효과음 포팅 기록

2026-11-18에 `E:/GitHubMy/UnrealSamples/TappyChicken`의 원본 텍스처와 FBX를 대조했다. 이 사본의 프로젝트 버전은 1.0.0이며 `TappyChicken.uproject`의 엔진 연결 값은 4.27이다. Epic의 출시 기록은 원작 제작자를 Shane Caudle로, 최초 출시 플랫폼을 iOS·Android·HTML5로 명시한다. [Epic Games 출시 기록](https://www.unrealengine.com/blog/shipping-tappy-chicken?lang=en-US)

원본 사본의 `README.md`는 Epic 배포 아카이브와 당시 Unreal Engine Wiki를 출처로 기록한다. 상위 `UnrealSamples/LICENSE`의 MIT 표기는 © 2023 taru00이다. 이 조사에서 Epic 원화의 Godot용 재배포를 허용하는 별도 근거는 확인하지 못했다. [README가 가리키는 배포 아카이브](https://epicgames.app.box.com/s/iy2xl8zap9laobqy0xq9hoahr15e7fd6)

## 플레이 흐름과 포팅 범위

시작 맵은 `Content/Maps/TappyChickenMap.umap`이며 비행을 제어하는 블루프린트는 `Content/Blueprints/BP_MainGame.uasset`이다. 시작 화면에서 한 번 누르면 준비 화면으로 넘어가고, 다음 입력에서 비행이 시작된다. 비행 중에는 세 프레임을 각 0.05초씩 재생한다. 아래 수치는 로컬 블루프린트에서 읽은 값이다.

| 시스템 | 원본에서 확인한 값 | Godot 템플릿 적용 |
| --- | --- | --- |
| 날갯짓 | `Timeline_FlapUp` 높이 곡선의 세 키 값 1.7, 0.924991, −5.0 및 회전 곡선 −45°, 90°, 90° | 같은 키 시각과 접선으로 보간하고 480 × 640 화면의 속도에 맞춰 높이를 환산한다. |
| 배경 이동 | 지면부터 원경 구름까지 비율은 1, 0.8, 0.7, 0.5, 0.3, 0.3, 0.2 | 일곱 레이어가 텍스처를 반복하고 서로 다른 속도로 스크롤한다. |
| 결과 | 장애물 통과 점수, 최고 점수, 알 수집 | 점수와 최고 기록을 표시하고 최고 기록을 로컬에 저장한다. 결과 화면에서 쓰는 알은 첫 번째 일반 알 한 종이다. 원작의 64칸 수집 도감은 이 템플릿의 범위 밖이다. |

에디터 시연의 기준은 배포하는 Godot 원본 씬이다. 노드·속성과 루트 스크립트를 그 씬에서 읽으므로 완성 템플릿과 시연의 결과를 같은 원본에 대조할 수 있다. [시연 명세](../../Docs/AGENT_CHAT_REPLAY_HANDOFF.md)

## 원본 식별값

다음 SHA-256은 디코딩 전 TGA 파일 전체의 값이다. 숫자 폰트는 `SourceArt/Fonts`, 나머지는 `SourceArt/Textures`에 있다.

| 원본 TGA | 픽셀 크기 | SHA-256 |
| --- | --- | --- |
| T_TappyChicken_01 | 128 × 128 | `03e89a47c6643489444315f03136fae7cd54ffde1c13e032c027432c8216010f` |
| T_TappyChicken_BG_02 | 512 × 512 | `ff5affa9a131f2c639ad8f528ac945cc1519c6b3bca0b54851bc565566ffadde` |
| T_TappyChicken_UI_01 | 512 × 512 | `2ccca877b6749a43ef723aed8a5ce37253e7058efb891d9c74524fd9d3afff5c` |
| T_Eggs_01 | 256 × 256 | `acde23c150fb2f0e68ac1cc3a09a7c192bcdeae9bd6020a5190995343d021557` |
| TappyChickenfont_10_Page_0 | 256 × 256 | `ea8d655170a81b3f90f1012fc04d2d962a7ddb332c8611ff49da63d141a308e1` |

## 스프라이트와 메시 대응

원점은 TGA의 왼쪽 위다. 시작 좌표와 출력 픽셀 크기로 영역을 재현할 수 있다. FBX의 UV는 `x = u × atlas_width`, `y = (1 − v) × atlas_height`로 대조하고 정수 텍셀 경계에 맞췄다. 배경 메시가 수평으로 반복 참조하는 영역은 아틀라스 한 주기의 너비인 512픽셀로 내보냈다.

| 출력 SVG | 원본 / 대응 | 시작 (x, y) | 출력 크기 |
| --- | --- | --- | --- |
| chicken, chicken-wing-up, chicken-wing-down, chicken-hit | 캐릭터 시트 첫 행의 수평 날개, 올린 날개, 내린 날개, 충돌 프레임 | (0, 0), (32, 0), (64, 0), (96, 0) | 각 32 × 32 |
| clouds-far | BG / SM_BG_Clouds_02 | (0, 23) | 512 × 39 |
| clouds-near | BG / SM_BG_Clouds_01 | (0, 76) | 512 × 49 |
| hills-far | BG / SM_BG_Hill_02 | (0, 128) | 512 × 62 |
| hills-near | BG / SM_BG_Hill_01 | (0, 197) | 512 × 57 |
| plants | BG / SM_BG_Plants_01 | (0, 266) | 512 × 52 |
| fence | BG / SM_BG_Fence_01 | (0, 340) | 512 × 44 |
| ground | BG / SM_BG_Ground_01 | (0, 415) | 512 × 97 |
| pipe | UI / SM_ObstacleUp_01 하단 나무 기둥 | (182, 0) | 34 × 255 |
| pipe-down | UI / SM_ObstacleDown_01 상단 나무 기둥 | (220, 1) | 34 × 254 |
| logo | UI / SM_Logo의 제목 간판 부분. 매다는 사슬은 별도 메시 면에 속한다. | (0, 0) | 133 × 68 |
| play | UI / SM_Btn_Play | (0, 68) | 75 × 44 |
| ready | UI / SM_TappyToFlappy의 화살표와 안내판 | 아래 설명 | 90 × 62 |
| go | UI / SM_GO | (0, 135) | 63 × 33 |
| game-over | UI / SM_GameOver | (0, 256) | 132 × 33 |
| scoreboard | UI / SM_ScoreBoard. Egg, Score, Best 글자와 달걀 자리가 그림에 포함된다. | (0, 176) | 152 × 80 |
| egg | 달걀 시트 첫 칸의 금이 간 흰 달걀 | (0, 0) | 32 × 32 |
| digits | 숫자 폰트 0부터 9까지 | 아래 설명 | 80 × 10 |

`ready.svg`는 메시가 차지하는 T자 모양을 따른다. 원본 (96, 112)의 28 × 38 화살표를 출력 (31, 0)에, (65, 150)의 90 × 24 안내판을 출력 (0, 38)에 붙였다. 숫자 글리프의 원본 y는 43, 높이는 10, x는 순서대로 1, 12, 18, 29, 40, 51, 62, 73, 84, 95다. 검은 외곽선을 포함한 너비는 숫자 1이 4, 나머지는 7이다. 출력에서는 각 글자를 8 × 10 셀 왼쪽에 배치했다.

하늘은 원작의 `M_BG_Sky` 재질이 그린다. `Content/Materials/MPC_TappyChicken_01.uasset`의 벡터 매개변수 기본값에서 읽은 SkyColor의 선형 RGB는 (0.152941, 0.482353, 0.686275), FogColor는 (0.580392, 0.890196, 0.937255)다. sRGB로 변환하면 각각 `#6db9d8`, `#c8f2f8`이다. 실제 출력은 재질의 안개·플래시 매개변수와 메시 정점색에도 영향을 받는다.

## 효과음

`SourceArt/Audio`의 원본 WAV에서 PCM 데이터와 샘플 레이트, 채널 수를 읽어 같은 이름의 `Assets/Audio/*.tres`에 담았다. Godot의 `AudioStreamWAV`가 16비트 리틀 엔디언 데이터를 그대로 재생한다. 텍스트 전송을 위한 Base64 인코딩만 적용했다.

| 원본 WAV | 샘플 레이트 | 채널 | 프레임 | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| SFX_Click_01.wav | 44100 | 1 | 12912 | `727fb916f9305aac3a8c852ab2c6cd61f0c211caae55dcec2188bcb3d1f8fbcf` |
| SFX_FlapWing_01.wav | 44100 | 1 | 21390 | `e8f4413cadbbb4e5facdd5435ba0abca94c9d4c60f154fa9cc9115349c2d1126` |
| SFX_FlapWing_02.wav | 44100 | 1 | 18425 | `8b1c074c9648c95b45374caeffb44415ec09d8f91b6ceea243b8b83c4edd9887` |
| SFX_FlapWing_03.wav | 44100 | 1 | 23161 | `525ecc6dcd221db0b13d0b74139b3ef9fb130c7d5feac679f43f92817c7a7dc0` |
| SFX_FlapWing_04.wav | 44100 | 1 | 18044 | `b3f6a3a9c629970a9a9d4d1bbeb6803254ce0fa83f32de4337e980d0cb441af0` |
| SFX_Score_01.wav | 48000 | 2 | 98445 | `be1a2987f7e976482abef612b1afa2a6e74fecbf2c1633d02b83afd1a9b1973d` |
| SFX_HitObstacle_01.WAV | 44100 | 1 | 19332 | `731858d5bf2dc11fdbc34dc507c47c59175ee753298277f7673847e26c4c536e` |
| SFX_HitGround_01.WAV | 44100 | 1 | 19304 | `d0688e8a19fa1e1a06b3e89c39eb3b6720748244dc2f27ed31f948adcc2bbcad` |

## 재생성과 검증

Python 3과 Pillow가 설치된 환경에서 저장소 루트를 기준으로 실행한다. 첫 명령은 SVG 21개와 효과음 리소스 8개를 `forge/Templates/tappy-chicken/Assets`에 기록하고, 둘째 명령은 원본 해시와 출력 일치 여부를 검사한다.

```powershell
python forge/Tools/convert-tappy-art.py E:/GitHubMy/UnrealSamples/TappyChicken
python forge/Tools/convert-tappy-art.py E:/GitHubMy/UnrealSamples/TappyChicken --check
```

변환기는 한 줄에서 연속한 동일 색상 픽셀을 SVG의 정수 좌표 경로로 쓰고 RGBA가 같은 경로를 묶는다. 투명 픽셀은 비워 두며 리샘플링과 색상 양자화 없이 원본 픽셀 격자를 보존한다. Godot의 기본 SVG 로더와 웹 프로젝트의 텍스트 파일 전송 경로에서 같은 파일을 읽을 수 있다.

출력 경로를 독립적으로 해석해 원본 추출 이미지와 합성 결과를 대조했다. 이어서 Godot 4.7.2의 `Image.load_svg_from_string`으로 21개 전체를 실제 래스터화했다. 총 264,545개 픽셀의 알파가 모두 일치했다. 흰색과 검은색 바탕에 합성해 비교한 8비트 RGB 채널의 최대 차이는 1이었다. 원본 시트와 렌더링한 결과를 눈으로 대조해 날개 자세, 상하 나무 기둥의 방향, 제목과 점수판, 숫자 순서도 확인했다.

효과음 8개 각각을 Godot `ResourceLoader`로 불러와 재생 인스턴스를 만들고 WAV로 다시 저장해 비교했다. 모든 PCM 바이트와 샘플 레이트, 채널 수, 프레임 수가 원본과 일치했다. 생성한 파일의 합계는 2,130,287바이트이며 가장 큰 파일인 `SFX_Score_01.tres`는 525,166바이트다.

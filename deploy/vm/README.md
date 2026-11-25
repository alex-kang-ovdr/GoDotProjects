# PlayHub + PlayForge 단일 VM 배포 (e2-micro)

Firebase Hosting 을 거치지 않고 VM 한 대에서 Hub·Forge 를 직접 서비스한다.

## 왜 VM 인가

Firebase Hosting → Cloud Run 리라이트 구조에는 세 가지 제약이 있다.

1. WebSocket 을 넘기지 않는다(`/forge/collaboration` 업그레이드 요청에 404). 그래서 웹 에디터가 "다시 연결 중" 상태에 머물고 로딩 화면이 닫히지 않는다.
2. 쿠키는 `__session` 하나만 넘긴다. 그래서 Hub 로그인 세션이 유지되지 않는다.
3. Cloud Run 데이터는 `/tmp` 에 있어 재배포하면 사라진다.

VM 에서는 출처가 하나이고 Caddy 가 WebSocket 과 모든 쿠키를 그대로 넘긴다. 데이터는 영구 디스크(`/var/lib/playhub`)에 남는다.

```
https://<IP를-대시로>.sslip.io ──▶ Caddy :443 (Let's Encrypt)
                                     └─▶ Hub 127.0.0.1:8080 ──/forge/*──▶ Forge 127.0.0.1:8190
```

| 파일 | 역할 |
|---|---|
| `docker-compose.yml` | hub·forge·caddy (host 네트워크, 메모리 제한 448/320/96 MiB) |
| `Caddyfile` | HTTPS·WebSocket 프록시, `/internal/*` 외부 차단 |
| `vm.env.example` | `/opt/playhub/.env` 템플릿(사이트 주소, 내부 비밀키, 이미지 태그) |
| `setup-vm.sh` | 최초 1회: Docker, 2 GiB 스왑, 디렉터리, `.env`, Artifact Registry 인증 |
| `deploy.sh` | 이미지 태그 배포, 헬스체크 실패 시 이전 이미지로 복구 |

## 1. 인프라 준비 (최초 1회, 비용 발생: 고정 IP)

```bash
PROJECT=playhub-dev-2611
ZONE=us-west1-b           # Always Free e2-micro: us-west1 / us-central1 / us-east1
SA=playhub-vm@${PROJECT}.iam.gserviceaccount.com

gcloud iam service-accounts create playhub-vm --project=$PROJECT --display-name="PlayHub VM"
gcloud artifacts repositories add-iam-policy-binding playhub-containers \
  --project=$PROJECT --location=us-west1 \
  --member=serviceAccount:$SA --role=roles/artifactregistry.reader

gcloud compute addresses create playhub-vm-ip --project=$PROJECT --region=us-west1
gcloud compute instances create playhub-vm --project=$PROJECT --zone=$ZONE \
  --machine-type=e2-micro --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --address=playhub-vm-ip --tags=playhub-web \
  --service-account=$SA --scopes=cloud-platform
gcloud compute firewall-rules create playhub-web --project=$PROJECT \
  --allow=tcp:80,tcp:443 --target-tags=playhub-web
```

고정 IP 가 `34.82.1.2` 라면 사이트 주소는 `34-82-1-2.sslip.io` 이다.

## 2. VM 초기화

```bash
gcloud compute scp --recurse deploy/vm playhub-vm:~/playhub-vm --project=$PROJECT --zone=$ZONE
gcloud compute ssh playhub-vm --project=$PROJECT --zone=$ZONE \
  --command="sudo bash ~/playhub-vm/setup-vm.sh 34-82-1-2.sslip.io"
```

## 3. 배포

Cloud Run 파이프라인이 푸시한 불변 태그(`sha-<커밋 7자리>`)를 지정한다.

```bash
gcloud compute ssh playhub-vm --project=$PROJECT --zone=$ZONE \
  --command="sudo bash ~/playhub-vm/deploy.sh sha-317e02b"
```

CI 자동 배포는 `.github/workflows/cloudrun-pipeline.yml` 의 `deploy-vm` 잡이 맡는다.

- 수동 실행: `action=deploy-vm` + `image_tag`.
- 푸시마다 자동 실행: 저장소 변수 `PLAYHUB_VM_ENABLED=true` 일 때.
- 필요한 저장소 설정:
  - 변수: `PLAYHUB_VM_HOST`(고정 IP), `PLAYHUB_VM_USER`
  - 시크릿: `PLAYHUB_VM_SSH_KEY`(배포 전용 키), `PLAYHUB_VM_KNOWN_HOSTS`(`ssh-keyscan <IP>` 결과)

## 운영 메모

- **빌드/퍼블리시:** `PLAYFORGE_BUILD_BACKEND` 를 설정하지 않았으므로 웹 빌드는 `PLAYHUB_FORGE_EXECUTION_ALLOWLIST` 에 있는 계정만 실행할 수 있다. Cloud Run Job 격리 빌드를 쓰려면 VM 서비스 계정에 forge-dev-2611 Job 실행 권한을 준 뒤 `PLAYFORGE_BUILD_*` 변수를 추가한다.
- **메모리:** e2-micro(1 GiB)에서 웹 에디터 WASM(57 MB 원본)을 압축 없이 요청받으면 메모리가 순간적으로 오른다. `docker stats` 로 실측하고, 부족하면 e2-small 로 변경(`gcloud compute instances set-machine-type`)한다.
- **백업:** `/var/lib/playhub` 를 디스크 스냅샷 일정에 포함한다.
- **로그:** `sudo docker compose -f /opt/playhub/docker-compose.yml logs -f hub forge`

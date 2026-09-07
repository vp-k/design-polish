# 적용 전 백업 절차 (공용)

`--apply`로 코드를 고치는 모든 경로의 **단일 출처**다.
`design-polish --apply`, `design-renewal` 7단계, `design-from-screenshot --apply`가 모두 이 절차를 따른다.

> 왜 공용 문서인가: 예전에는 이 절차가 design-renewal SKILL 안에만 있었다.
> 그래서 "부분 개선"인 design-polish `--apply`는 백업 없이 파일을 고쳤고,
> 미커밋 원본이 있는 작업트리에서는 되돌릴 방법이 없었다.
> **부분 개선이라도 사용자 코드를 덮어쓰는 것은 같다.**

---

## 0. 원칙 — fail-closed

**백업 지점 확보에 실패하면 `--apply`를 진행하지 않는다.**
분석 결과(개선안)는 그대로 보고하고, 코드 수정은 중단한 뒤 사용자에게 실패 원인을 알린다.
"백업은 못 했지만 일단 고쳐 두겠다"는 선택지는 없다 — 되돌릴 수 없는 변경이 되기 때문이다.

`BACKUP_LABEL`은 호출한 워크플로우 이름을 쓴다: `design-polish` / `design-renewal` / `design-from-screenshot`.

---

## 1. git 저장소 여부 확인

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
```

## 2. git 저장소인 경우

```bash
git status --porcelain
```

- **깨끗함(출력 없음)**: HEAD가 곧 원본 → 3)의 브랜치 스냅샷으로 충분.
- **미커밋 변경 있음**: 브랜치는 HEAD만 담고 미커밋 원본을 보호하지 못한다. 스냅샷을 **먼저** 남긴다:

```bash
# 추적 중인 미커밋 변경(modified/staged)의 스냅샷 커밋 오브젝트 (브랜치/인덱스 미변경)
STASH=$(git stash create "${BACKUP_LABEL} pre-apply snapshot")
# STASH가 비어있으면(=추적 변경 없음) 아무것도 안 만들어진다.
# 생성됐다면 GC로 사라지지 않도록 즉시 참조로 고정하고 사용자에게 롤백 지점으로 고지:
[ -n "$STASH" ] && git stash store -m "${BACKUP_LABEL} pre-apply" "$STASH"
```

> **`git stash create`는 추적(tracked) 파일만 담는다** — untracked/ignored 원본은 포함되지 않고,
> 커밋 오브젝트는 참조가 없으면 GC 대상이다(그래서 `git stash store`로 고정한다).
> 따라서 **변경 예정 파일 중 untracked인 원본이 있으면** §3의 파일 복사 백업을 **반드시 병행**한다.

```bash
# 3) 백업 브랜치 — 기존 백업을 파괴하지 않도록 -f 금지. 존재하면 타임스탬프 접미사로 신규 생성
if git show-ref --verify --quiet "refs/heads/${BACKUP_LABEL}-backup"; then
  git branch "${BACKUP_LABEL}-backup-$(date +%Y%m%d-%H%M%S)"   # 과거 롤백 지점 보존
else
  git branch "${BACKUP_LABEL}-backup"
fi
```

> **`git branch -f`를 쓰지 않는다**: 이전 실행의 백업 브랜치를 현재 HEAD로 강제 이동시켜
> 과거 롤백 지점을 파괴한다(반복 실행 시 데이터 유실 풋건).

## 3. git 저장소가 아닌 경우 (그리고 untracked 원본이 있는 경우 병행)

변경 예정 파일을 `.design-polish/<BACKUP_LABEL>-backup/<타임스탬프>/`에
**원본 디렉토리 구조를 유지한 채** 복사하고, 그 경로를 사용자에게 고지한다.

## 4. 검증 (fail-closed 판정 지점)

적용을 시작하기 전에 다음 중 **최소 하나**가 실제로 존재하는지 확인한다.

백업 브랜치 존재 확인은 반드시 아래 명령을 쓴다:

```bash
# 백업 브랜치가 하나라도 있는가 (타임스탬프 접미사 포함) — 출력이 있으면 확보된 것
git for-each-ref --format='%(refname:short)' "refs/heads/${BACKUP_LABEL}-backup*"
```

> **`git show-ref --verify`에 글롭을 주지 않는다.** `--verify`는 인자를 **정확한 ref 이름**으로만
> 취급하므로 `refs/heads/<label>-backup*`은 항상 exit 1이다. 즉 백업 브랜치가 실제로 있어도
> "확보 실패"로 읽혀 fail-closed 원칙에 따라 `--apply`가 통째로 막힌다(백업이 정상인데 차단).
> 정확한 이름 하나만 볼 때는 `git show-ref --verify --quiet "refs/heads/${BACKUP_LABEL}-backup"`
> (§2의 3번 블록처럼 글롭 없이), 접미사까지 포함해 볼 때는 `git for-each-ref` 출력 유무로 판정한다.

| 상황 | 확보되어야 할 것 | 확인 |
|------|------------------|------|
| git + 작업트리 깨끗 | 백업 브랜치 | 위 `git for-each-ref ...` 출력이 1줄 이상 |
| git + 미커밋(추적) 변경 | 백업 브랜치 **AND** stash 항목 | 위 + `git stash list \| grep "<label> pre-apply"` |
| untracked 원본 포함 | 위 + 파일 복사 백업 디렉토리 | 디렉토리 존재 + 파일 수 > 0 |
| git 아님 | 파일 복사 백업 디렉토리 | 디렉토리 존재 + 파일 수 > 0 |

하나도 확보되지 않았으면 **적용을 중단**하고 다음을 보고한다:

> "백업 지점을 만들지 못해 `--apply`를 중단했습니다. (원인: ...)
> 분석 결과는 아래에 그대로 보고합니다. 수동으로 커밋하거나 백업한 뒤 다시 실행해주세요."

## 5. 롤백 방법 고지 (적용 시작 전 사용자에게 명시)

- 커밋 상태였던 파일: `git restore --source=<label>-backup -- <경로>`
- 미커밋(추적) 원본: `git stash list`로 확인 후 `git checkout <snapshot-hash> -- <경로>`
- untracked였던 원본: stash에 없으므로 **파일 복사 백업**에서만 복원 가능

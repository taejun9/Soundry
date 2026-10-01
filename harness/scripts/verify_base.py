#!/usr/bin/env python3
"""Soundry 문서 기반의 구조, 링크, 실행 명령 및 저장 경계를 검증한다."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
PLAN_NAME = re.compile(r"plan-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md\Z")
REQUIRED_DIRS = (
    "docs/architecture", "docs/product", "docs/quality", "docs/privacy",
    "docs/references", "docs/exec_plans/active", "docs/exec_plans/completed",
    "docs/meetings", "docs/reviews", "harness/scripts", "harness/templates",
)
REQUIRED_FILES = (
    "AGENTS.md", "README.md", "docs/architecture/design.md",
    "docs/architecture/data-model.md", "docs/architecture/provider.md",
    "docs/architecture/api.md", "docs/architecture/harness.md",
    "docs/product/product.md", "docs/product/implementation-roadmap.md",
    "docs/quality/rules.md", "docs/privacy/principles.md",
    "docs/references/official-sources.md", "docs/meetings/index.md",
    "harness/templates/exec-plan.md", "harness/templates/review.md",
    "harness/templates/meeting.md",
)
IGNORED_DIRS = {".git", ".worktree", "node_modules", ".next", ".venv", "venv"}
ENV_SAMPLES = {".env.example", ".env.sample", ".env.template"}
PRIVATE_SUFFIXES = {
    ".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm", ".sqlite-wal",
    ".sqlite-shm", ".sqlite3-wal", ".sqlite3-shm", ".pem", ".key", ".p12",
    ".pfx", ".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aiff", ".aac",
}
PRIVATE_DIRS = {"data", "uploads", "outputs", "backups", ".soundry"}
# plan-006에서 승인한 자체 제작·재현 가능한 두 fixture만 예외다. 사용자 음원은 계속 차단한다.
AUDIO_FIXTURES = {"backend/fixtures/audio/demo-01.wav", "backend/fixtures/audio/demo-02.wav"}
AUDIO_FIXTURE_MAX_BYTES = 2 * 1024 * 1024


def relative(path: Path) -> str:
    """저장소 내부 오류 위치를 사용자 홈 절대 경로 없이 일관되게 표시한다."""
    return path.relative_to(ROOT).as_posix()


def markdown_files() -> list[Path]:
    """의존성과 별도 checkout을 제외한 Markdown을 고정 순서로 반환한다."""
    return sorted(
        path for path in ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() == ".md"
        and not any(part in IGNORED_DIRS for part in path.relative_to(ROOT).parts)
    )


def prose_lines(text: str):
    """코드 펜스는 문서 예시이므로 링크 검사에서 제외한다."""
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        marker = re.match(r"^\s*(`{3,}|~{3,})", line)
        if marker:
            token = marker.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            continue
        if fence is None:
            yield number, re.sub(r"(`+).*?\1", "", line)


def link_targets(line: str):
    """인라인/이미지 링크와 참조 링크 정의의 목적지를 읽는다."""
    for match in re.finditer(r"\]\(\s*", line):
        start = match.end()
        if line[start:start + 1] == "<":
            end = line.find(">", start + 1)
            if end != -1:
                yield line[start + 1:end]
            continue
        depth, end = 0, start
        while end < len(line):
            char = line[end]
            if char == "\\" and end + 1 < len(line):
                end += 2
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                if depth == 0:
                    break
                depth -= 1
            elif char.isspace() and depth == 0:
                break
            end += 1
        yield line[start:end]
    definition = re.match(r"^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))", line)
    if definition:
        yield definition.group(1) or definition.group(2)


def check_links(path: Path, text: str, errors: list[str]) -> None:
    """문서의 로컬 상대 대상 존재만 검사한다. 외부 URL·앵커·템플릿 치환값은 검사하지 않는다."""
    if "harness/templates" in relative(path):
        return
    for number, line in prose_lines(text):
        for target in link_targets(line):
            if not target or target.startswith(("#", "/")):
                continue
            if re.search(r"<[^>]+>|\{[^}]+\}|\bNNN\b", target):
                continue
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc:
                continue
            local = re.sub(r"\\([() ])", r"\1", unquote(parsed.path))
            if local and not (path.parent / local).exists():
                errors.append(f"{relative(path)}:{number}: 상대 링크 대상 없음: {target}")


def check_structure(errors: list[str]) -> None:
    """기본 문서와 계획 lifecycle의 경로·이름·review mirror 규칙을 누적 검사한다."""
    for directory in REQUIRED_DIRS:
        if not (ROOT / directory).is_dir():
            errors.append(f"필수 디렉터리 없음: {directory}/")
    for filename in REQUIRED_FILES:
        if not (ROOT / filename).is_file():
            errors.append(f"필수 문서 없음: {filename}")
    if (ROOT / "docs/plan").exists():
        errors.append("금지된 계획 경로: docs/plan")
    for path in ROOT.iterdir():
        if path.is_file() and path.suffix.lower() == ".md" and path.name not in {"README.md", "AGENTS.md"}:
            errors.append(f"루트 Markdown 허용 목록 위반: {path.name}")
    active = ROOT / "docs/exec_plans/active"
    completed = ROOT / "docs/exec_plans/completed"
    for path in (ROOT / "docs/exec_plans").rglob("*.md"):
        if path.parent not in {active, completed} or not PLAN_NAME.fullmatch(path.name):
            errors.append(f"계획 경로/파일명 규칙 위반: {relative(path)}")
        if path.parent == completed and not (ROOT / "docs/reviews" / path.name).is_file():
            errors.append(f"완료 계획의 리뷰 기록 없음: docs/reviews/{path.name}")
    for path in active.glob("*.md"):
        if (completed / path.name).exists():
            errors.append(f"활성/완료 계획 중복: {path.name}")


def check_private_files(errors: list[str]) -> None:
    """Git 추적 파일과 ignore되지 않은 파일명을 검사한다. 비밀 파일의 내용을 읽지 않는다."""
    try:
        # 이미 추적한 비공개 파일은 .gitignore에 추가해도 이 목록에서 계속 잡힌다.
        result = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=ROOT, capture_output=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        errors.append("git 파일 목록 검사 실패: Git 저장소와 git 설치 여부를 확인하세요.")
        return
    for raw in sorted(set(result.stdout.split(b"\0"))):
        if not raw:
            continue
        name = raw.decode("utf-8", errors="replace")
        path = Path(name)
        basename = path.name.lower()
        if name in AUDIO_FIXTURES:
            fixture = ROOT / path
            if fixture.resolve() != fixture or not fixture.is_file() or not 44 < fixture.stat().st_size <= AUDIO_FIXTURE_MAX_BYTES:
                errors.append(f"승인 fixture 파일/용량 경계 위반: {name}")
            continue
        private_env = (basename == ".env" or basename.startswith(".env.")) and basename not in ENV_SAMPLES
        private_file = any(basename.endswith(suffix) for suffix in PRIVATE_SUFFIXES)
        private_dir = any(part.lower() in PRIVATE_DIRS for part in path.parts[:-1])
        if private_env or private_file or private_dir:
            errors.append(f"비공개 파일이 추적/미제외 상태입니다: {name}")


def check_readme_commands(errors: list[str]) -> None:
    """README가 안내하는 npm 명령을 실제 root scripts와 대조해 실행 불가능한 안내를 막는다."""
    readme = ROOT / "README.md"
    if not readme.is_file():
        return
    scripts = {}
    manifest = ROOT / "package.json"
    if manifest.is_file():
        try:
            scripts = json.loads(manifest.read_text(encoding="utf-8")).get("scripts", {})
            if not isinstance(scripts, dict):
                raise ValueError("scripts must be an object")
        except (OSError, ValueError):
            errors.append("package.json을 읽을 수 없거나 scripts가 객체가 아닙니다.")
            return
    # README에 쓰인 실행 안내는 실제 package script가 있어야 한다.
    # 아직 없는 명령은 코드 블록에 안내하지 않고 구현 로드맵에 기록한다.
    pattern = re.compile(r"\bnpm\s+(?:run(?:-script)?\s+([a-zA-Z0-9:_-]+)|(test|start|stop|restart))\b")
    for number, line in enumerate(readme.read_text(encoding="utf-8").splitlines(), 1):
        for match in pattern.finditer(line):
            command = match.group(1) or match.group(2)
            if command not in scripts:
                errors.append(f"README.md:{number}: 정의되지 않은 npm script 안내: {command}")


def main() -> int:
    """독립 검사들의 오류를 모아 모두 출력하며 하나라도 있으면 종료 코드 1을 반환한다."""
    argparse.ArgumentParser(description=__doc__).parse_args()
    errors: list[str] = []
    check_structure(errors)
    for path in markdown_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            errors.append(f"Markdown을 UTF-8로 읽을 수 없음: {relative(path)}")
            continue
        if path.is_relative_to(ROOT / "docs"):
            for number, line in enumerate(text.splitlines(), 1):
                if re.search(r"\bTODO\b", line, flags=re.IGNORECASE):
                    errors.append(f"{relative(path)}:{number}: 미완성 표시가 남아 있습니다.")
        check_links(path, text, errors)
    check_private_files(errors)
    check_readme_commands(errors)
    if errors:
        print(f"Soundry base QA 실패 ({len(errors)}개)")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Soundry base QA 통과: 구조·계획·문서·상대 링크·README 명령·비공개 파일 경계")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

usage() {
  cat <<'USAGE'
用法:
  pnpm release patch|minor|major [--dry-run] [--no-push]
  pnpm release <version> [--dry-run] [--no-push]

示例:
  pnpm release patch
  pnpm release 1.2.0
  pnpm release minor --dry-run

说明:
  版本发布会依次执行：更新 package.json、生产构建与校验、提交 release commit、创建 v* 标签并推送。
  GitHub Actions 会在 v* 标签推送后自动创建 GitHub Release 并上传 userscript 产物。
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 0
fi

release_spec="$1"
shift
dry_run=false
push_changes=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      ;;
    --no-push)
      push_changes=false
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

for command in git node pnpm; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "错误：找不到必需命令 ${command}" >&2
    exit 1
  fi
done

if [[ -n "$(git status --porcelain)" ]]; then
  echo "错误：工作区不干净，请先提交或清理现有改动后再发布。" >&2
  git status --short >&2
  exit 1
fi

current_branch="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -z "${current_branch}" ]]; then
  echo "错误：当前处于 detached HEAD，无法安全创建发布提交。" >&2
  exit 1
fi

current_version="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
next_version="$(node --input-type=module - "${current_version}" "${release_spec}" <<'NODE'
const [currentVersion, releaseSpec] = process.argv.slice(2);
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const currentMatch = currentVersion.match(semverPattern);

if (!currentMatch) {
  throw new Error(`package.json 中的当前版本无效：${currentVersion}`);
}

let nextVersion;
if (['patch', 'minor', 'major'].includes(releaseSpec)) {
  if (currentMatch[4]) {
    throw new Error(`当前版本 ${currentVersion} 含预发布标识，请显式传入目标版本。`);
  }

  const parts = currentMatch.slice(1, 4).map(Number);
  const index = { major: 0, minor: 1, patch: 2 }[releaseSpec];
  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i += 1) parts[i] = 0;
  nextVersion = parts.join('.');
} else {
  nextVersion = releaseSpec.replace(/^v/, '');
  if (!semverPattern.test(nextVersion)) {
    throw new Error(`版本号无效：${releaseSpec}，应为 patch/minor/major 或 x.y.z。`);
  }

  const currentParts = currentMatch.slice(1, 4).map(Number);
  const nextParts = nextVersion.match(semverPattern).slice(1, 4).map(Number);
  const currentBase = currentParts.join('.');
  const nextBase = nextParts.join('.');
  if (currentBase === nextBase && !currentMatch[4] && !nextVersion.includes('-')) {
    throw new Error(`目标版本 ${nextVersion} 与当前版本相同。`);
  }
}

process.stdout.write(nextVersion);
NODE
)"
tag_name="v${next_version}"

if git rev-parse --verify --quiet "refs/tags/${tag_name}" >/dev/null; then
  echo "错误：本地标签 ${tag_name} 已存在。" >&2
  exit 1
fi

if [[ "${dry_run}" != true ]] && git ls-remote --exit-code --tags origin "refs/tags/${tag_name}" >/dev/null 2>&1; then
  echo "错误：远程标签 ${tag_name} 已存在。" >&2
  exit 1
fi

echo "当前版本：${current_version}"
echo "目标版本：${next_version}"
echo "发布标签：${tag_name}"
echo "发布分支：${current_branch}"

if [[ "${dry_run}" == true ]]; then
  echo "Dry run：未修改文件、未执行构建、未创建提交或标签。"
  exit 0
fi

original_package_json="$(cat package.json)"
version_updated=false
commit_created=false

cleanup_on_failure() {
  if [[ "${version_updated}" == true && "${commit_created}" == false ]]; then
    printf '%s\n' "${original_package_json}" > package.json
    echo "发布失败，已恢复 package.json。" >&2
  fi
}
trap cleanup_on_failure EXIT

node --input-type=module - "${next_version}" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';

const nextVersion = process.argv[2];
const packagePath = 'package.json';
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
packageJson.version = nextVersion;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
version_updated=true

echo "运行正式构建与 userscript 校验..."
pnpm run test:userscript

git add package.json
git commit -m "chore(release): ${tag_name}"
commit_created=true
git tag -a "${tag_name}" -m "Release ${tag_name}"

if [[ "${push_changes}" == true ]]; then
  echo "推送提交和标签到 origin..."
  git push origin "${current_branch}" "${tag_name}"
  echo "发布已提交：${tag_name}。GitHub Actions 将继续创建 GitHub Release。"
else
  echo "已创建提交和本地标签 ${tag_name}，根据 --no-push 未推送到远程。"
fi

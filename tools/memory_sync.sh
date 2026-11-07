#!/usr/bin/env bash
# Claude 记忆两台电脑同步(2026-11-08):记忆目录 = 指向私有仓库 Joylove88/lootchain-memory 的目录联接。
# 用法(由 .claude/settings.json 钩子调用):memory_sync.sh pull  —— 会话开始拉另一台的记忆
#                                          memory_sync.sh push  —— 每轮结束有改动就提交并推送
# 仓库位置默认 D:\project\lootchain-memory,可用环境变量 LOOTCHAIN_MEMORY_REPO 覆盖。失败不打断会话。
REPO="${LOOTCHAIN_MEMORY_REPO:-/d/project/lootchain-memory}"
[ -d "$REPO/.git" ] || exit 0
cd "$REPO" || exit 0

case "$1" in
  pull)
    if ! git pull --rebase --autostash -q >/dev/null 2>&1; then
      git rebase --abort >/dev/null 2>&1
      echo '{"systemMessage":"记忆仓库拉取失败(网络或冲突),请到 D:\\project\\lootchain-memory 处理","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"记忆仓库 D:\\project\\lootchain-memory 本次 git pull 失败,另一台电脑的新记忆可能没拉到;有冲突时先合并 MEMORY.md 再继续。"}}'
    fi
    ;;
  push)
    if [ -n "$(git status --porcelain)" ]; then
      git add -A >/dev/null 2>&1
      git commit -qm "memory: $(hostname) $(date '+%F %H:%M')" >/dev/null 2>&1
    fi
    if [ -n "$(git log '@{u}..' --oneline 2>/dev/null)" ]; then
      git pull --rebase -q >/dev/null 2>&1 || git rebase --abort >/dev/null 2>&1
      git push -q >/dev/null 2>&1
    fi
    ;;
esac
exit 0

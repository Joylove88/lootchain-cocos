# Claude 记忆两台电脑同步(2026-11-08 搭建)

记忆目录 `C:\Users\<用户名>\.claude\projects\D--project-lootchain-cocos\memory` 是一个**目录联接**,指向私有仓库
`Joylove88/lootchain-memory` 的本地克隆 `D:\project\lootchain-memory`。

- 会话开始:`.claude/settings.json` 的 SessionStart 钩子跑 `tools/memory_sync.sh pull`(拉另一台的记忆)。
- 每轮结束:Stop 钩子(后台)跑 `tools/memory_sync.sh push`(有改动就提交 + 推送,提交信息带机器名)。
- 拉取失败(冲突 / 断网)会在会话里提示,去 `D:\project\lootchain-memory` 手动合并。

## 另一台电脑第一次接入(在那台的 Claude 会话里照做)

那台电脑上已经有自己的记忆(含 11-07 异界神州等这台没有的条目),要先**合并**再换联接:

1. `cd D:\project\lootchain-cocos` → `git pull origin main`(拿到钩子与本说明)。
2. `git clone https://github.com/Joylove88/lootchain-memory.git D:\project\lootchain-memory`
3. 对比 `C:\Users\<用户名>\.claude\projects\D--project-lootchain-cocos\memory`(本机旧记忆)与仓库:
   - 仓库没有的文件:直接拷进仓库。
   - 两边同名但内容不同的文件:合并成一份(保留两边信息,新的事实为准)。
   - `MEMORY.md`:两边的索引行取并集,去重。
4. 在仓库里 `git add -A` → `git commit -m "memory: 合并 <机器名> 旧记忆"` → `git push`。
5. 旧目录改名备份,再建联接(PowerShell):
   ```powershell
   $mem = "$env:USERPROFILE\.claude\projects\D--project-lootchain-cocos\memory"
   Rename-Item $mem 'memory.bak-merge'
   New-Item -ItemType Junction -Path $mem -Target 'D:\project\lootchain-memory'
   ```
6. 新开一个会话,确认开头没有「记忆仓库拉取失败」提示即可。

## 注意

- 仓库必须保持**私有**(记忆里有本地库口令、测试号等)。
- 两台同时开会话也没关系:推送前会先 `pull --rebase`;真冲突时脚本放弃本次推送,下次再推。
- 仓库位置不同可设环境变量 `LOOTCHAIN_MEMORY_REPO`(Git Bash 路径写法,如 `/e/work/lootchain-memory`)。

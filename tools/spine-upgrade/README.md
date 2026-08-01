# Spine 骨骼批量升级 3.8 → 4.2

在装有 **Spine 编辑器(4.2.x)** 的电脑上执行。对 `assets/resources/spine/{hero,gacha,ui}` 下全部 83 个骨骼
(19 个 .json + 64 个 .skel)做"导入 → 升级 4.2 → 原地覆盖导出"。文件名不变、atlas/png 一律不动,
因此 Cocos 的 meta/uuid 与所有引用都不会断。回滚靠 git 历史(运行前必须已提交)。

## 步骤

1. `git pull` 拉到本工具与最新资产;
2. 双击 `tools/spine-upgrade/run_upgrade.bat`(若 Spine 不在默认安装路径,改脚本顶部 `SPINE=`);
3. 跑完后 `git status` 应看到 83 个骨骼文件变更;抽查 1-2 个 json 开头 `"spine":"4.2.x"`;
4. 提交并推送:
   ```
   git add assets/resources/spine
   git commit -m "chore: upgrade spine skeletons 3.8 -> 4.2"
   git push
   ```

## 如果 CLI 报导出设置错误

本目录的 `json42.export.json` / `skel42.export.json` 是预写的导出设置。若 Spine CLI 提示设置无法解析:
在 Spine 编辑器里打开任意工程 → 导出对话框 → 选 JSON、版本 4.2、纹理图集"打包"**不勾** → 点左下"保存"
覆盖 `json42.export.json`;再用"二进制"格式同样保存覆盖 `skel42.export.json`,重跑 bat。

## 给 Claude Code 的提示词(如那台电脑也装了)

> 运行 tools/spine-upgrade/run_upgrade.bat 把全部 spine 骨骼从 3.8 升级到 4.2,
> 确认 83 个文件都升级成功(json 的 skeleton.spine 字段为 4.2.x),然后提交推送。
> 若个别文件报错,记录文件名并跳过,汇报清单。

set -u
cd /d/project/lootchain-cocos
D="周报截图/2026-10-26_新手村野区/assets_src"
NOAI="不要 AI 感:不要颗粒噪点、不要光束粒子、不要炫光,像真实上线的游戏美术素材。"
cat > "$D/npc_priest.txt" <<EOF
单个游戏角色立绘素材:年轻的女祭司,白色与淡蓝色长袍、手捧一本发微光的书,站立,身体朝向画面右侧 3/4,全身;写实厚涂画风,人体比例正常(不是 Q 版、不是大头),和参考图里的村长、铁匠同一画风;纯平浅灰色背景(#c8c8c8),无投影、无地面、无文字。$NOAI
EOF
cat > "$D/city_board.txt" <<EOF
单个游戏场景物件素材:主城广场上的木制公告板,两根立柱撑着带小瓦顶的告示板,板上钉着几张泛黄的委托告示和一张悬赏令(纸上不要可读文字),柱脚有石座;俯视 3/4 镜头,写实手绘、暗调低饱和,和参考图同一画风;物件完整居中,纯平浅灰色背景(#c8c8c8),背景上没有投影和地面,不要文字。$NOAI
EOF
python tools/qa/gen_proto.py --prompt "$D/npc_priest.txt" --out "$D/npc_priest.png" --ref "$D/npc_chief.png" "$D/npc_smith.png" 2>&1 | tail -1
python tools/qa/gen_proto.py --prompt "$D/city_board.txt" --out "$D/city_board.png" --ref "assets/resources/ui/town/guild.png" "$D/vil_well.png" 2>&1 | tail -1
echo ALL-DONE

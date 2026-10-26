#!/usr/bin/env bash
# docs/50 P1 素材:逐张调 Codex 生图(串行),已存在的跳过。输出在本目录,入库脚本 tools/qa/field_install_assets.py
set -u
cd /d/project/lootchain-cocos
D="周报截图/2026-10-26_新手村野区/assets_src"
P="周报截图/2026-10-26_新手村野区/proto"
VIL="$P/p1_village.png"
FLD="$P/p2_field.png"
MAPB="$P/p3_map_b.png"
TOWNOBJ="assets/resources/ui/town/forge.png"
BAT="$P/p6_field_battle.png"
GROUNDREF="周报截图/2026-10-26_主城地面/proto/ground_v2.png"
NOAI="不要 AI 感:不要颗粒噪点、不要光束粒子、不要炫光、不要满屏发光点,像真实上线的游戏美术素材。"
OBJ="单个游戏场景物件素材:俯视 3/4 镜头(和参考图同一角度、同一画风:写实手绘、暗调低饱和),物件完整居中,四周留足空白;背景是纯平的浅灰色(#c8c8c8),背景上没有任何投影、地面、草地或杂物;不要文字。"
GROUND="无缝平铺地面贴图:和参考图同一个俯视 3/4 镜头(看起来是平躺的地面,不是墙),均匀光照,没有暗角、没有光斑、没有物件、没有人物、没有文字;四边必须能无缝拼接;正方形。"

w() { cat > "$D/$1.txt"; }

# ── 世界地图 ──
w map_world1 <<EOF
生成一张 2400x1080 横屏的游戏世界地图底图(只有地形,不要任何文字、名牌、图标、传送阵、头像、按钮、UI)。画风、镜头、地理布局与参考图完全一致:一整块漂浮在云海上的立体沙盘大陆,斜 45 度俯视;左下绿色山谷小村庄,中间偏左有城墙塔楼的大城,东边灰褐碎石荒原与废墟,东北枯死黑森林,北边冒暗红熔岩光的矿坑,左上雪山高地,右上横卧巨大龙骨的峡谷;区域之间有土路相连;大陆边缘断崖、瀑布、云海。整体偏暗低饱和。$NOAI
EOF
w map_world2 <<EOF
生成一张 2400x1080 横屏的游戏世界地图底图(只有地形,不要任何文字、图标、UI):同一款游戏的第二个世界「暗潮群岛」,同样是斜 45 度俯视的立体沙盘,但这是一片散落在暗色海面上的群岛:一座港口城、礁石海湾、沉船、海雾、深海漩涡、远处的火山岛;整体被浓重的深灰色云雾笼罩,只能隐约看出轮廓(表示尚未开放)。画风参考参考图。$NOAI
EOF

# ── 地面 ──
w ground_village <<EOF
$GROUND 内容:新手村的地面,泥土小路与草地交错、零星碎石和落叶,偏暖的土黄与暗绿,低对比;一张图横向大约能放下 4~5 块草地斑块。参考第一张图的新手村配色、第二张图的地面镜头。
EOF
w ground_forest <<EOF
$GROUND 内容:树林里的地面,深色落叶、苔藓、泥土和少量树根,暗绿与褐色,低对比。参考第一张图的配色、第二张图的地面镜头。
EOF
w ground_wasteland <<EOF
$GROUND 内容:荒原地面,灰褐色干裂泥土、碎石、枯草茬,低饱和,低对比。参考第一张图的荒原配色、第二张图的地面镜头。
EOF

# ── 新手村物件 ──
w vil_chief_house <<EOF
$OBJ 物件:新手村村长的家,两层木石结构小屋,深色瓦片屋顶、石头墙基、木门、一扇亮着暖光的窗、门口两个木桶。比参考图里的主城建筑朴素。$NOAI
EOF
w vil_smithy <<EOF
$OBJ 物件:乡村铁匠铺,半开放的木棚,里面一座小石炉有炉火微光,门口一块铁砧和工具架。$NOAI
EOF
w vil_altar <<EOF
$OBJ 物件:村边的小祭坛,一块竖立的古老符文石碑(刻淡蓝色发光符文),底下两级石台阶,周围几根矮石柱。$NOAI
EOF
w vil_training <<EOF
$OBJ 物件:乡村训练场的一组设施:两个草扎木桩靶子(胸口画圆靶)、一个插着长矛和木剑的兵器架,周围一圈低矮木栅栏。$NOAI
EOF
w vil_gate <<EOF
$OBJ 物件:村口的木制大门,两根粗木柱 + 带瓦顶的门楣,门两侧挂暗红色布旗,门柱旁一盏小提灯。$NOAI
EOF
w vil_well <<EOF
$OBJ 物件:乡村石砌水井,木制辘轳和小屋顶,井边一个木桶。$NOAI
EOF
w vil_tree <<EOF
$OBJ 物件:一棵枝叶茂密的乡村大树(橡树),暗绿色树冠,树根处有几块石头。$NOAI
EOF
w vil_fence <<EOF
$OBJ 物件:一段横向的乡村木栅栏(约 4 格),旁边堆着两个木箱和一个稻草堆。$NOAI
EOF
w waypoint <<EOF
$OBJ 物件:平放在地上的圆形传送阵:石质圆盘,圆盘上刻淡蓝色符文圆环,外圈 4 根矮石柱,每根柱顶一颗小蓝色晶石;按俯视透视压成横向椭圆(看起来平躺在地上)。符文是熄灭状态(暗蓝灰),之后由程序点亮。$NOAI
EOF

# ── NPC(地图上站立的小人) ──
w npc_chief <<EOF
单个游戏角色立绘素材:白须老人村长,朴素褐色长袍,手持木杖,站立,身体朝向画面右侧 3/4,全身;画风和参考图一致(写实手绘、暗调);纯平浅灰色背景(#c8c8c8),无投影、无地面、无文字。$NOAI
EOF
w npc_smith <<EOF
单个游戏角色立绘素材:强壮的乡村铁匠,皮围裙、卷起袖子、手里拿铁锤,站立,身体朝向画面左侧 3/4,全身;画风和参考图一致;纯平浅灰色背景(#c8c8c8),无投影、无地面、无文字。$NOAI
EOF
w npc_priest <<EOF
单个游戏角色立绘素材:年轻的女祭司,白色与淡蓝色长袍、手捧一本发微光的书,站立,身体朝向画面右侧 3/4,全身;画风和参考图一致;纯平浅灰色背景(#c8c8c8),无投影、无地面、无文字。$NOAI
EOF
w npc_instructor <<EOF
单个游戏角色立绘素材:老兵教官,半身皮甲、腰挎长剑、双臂交叉,站立,身体朝向画面左侧 3/4,全身;画风和参考图一致;纯平浅灰色背景(#c8c8c8),无投影、无地面、无文字。$NOAI
EOF
w portrait_chief <<EOF
游戏对话框用的 NPC 半身立绘:白须老人村长,朴素褐色长袍,手持木杖,和蔼但严肃,面朝画面右侧 3/4;画风与参考图的村长一致(写实厚涂);纯平浅灰色背景(#c8c8c8),无文字、无边框,构图从头顶到腰部。$NOAI
EOF

# ── 野外物件 ──
w fld_forest_trees <<EOF
$OBJ 物件:一丛树林(三棵高矮不一的暗绿色松树 + 底下灌木),作为树林地图的遮挡装饰。$NOAI
EOF
w fld_forest_stump <<EOF
$OBJ 物件:一截长满苔藓的倒木和旁边的树桩、几丛蕨类植物。$NOAI
EOF
w fld_rocks <<EOF
$OBJ 物件:一组风化的灰褐色巨石(三块大小不一),石缝里有枯草。$NOAI
EOF
w fld_ruin_wall <<EOF
$OBJ 物件:一段断裂倒塌的古老石墙废墟,带半个拱门,砖块散落在旁边。$NOAI
EOF
w fld_dead_tree <<EOF
$OBJ 物件:一棵枯死的黑色扭曲老树,没有叶子,树根盘在碎石上。$NOAI
EOF
w fld_bandit_camp <<EOF
$OBJ 物件:盗匪营地的一角:两顶破旧的布帐篷、一堆篝火(火焰是唯一亮色)、木箱和一面画着骷髅的破旗。$NOAI
EOF

# ── 横版战斗背景 ──
w battle_forest <<EOF
生成一张 2400x1080 横版动作战斗场景背景(没有任何人物、怪物、UI、文字):和参考图同一款游戏、同一画风与构图(地平线约在画面 40% 高处,下方是可以站人的平坦地面),场景是村外的树林:前景地面是落叶与泥土小径,远景是层叠的暗绿色树林与透过树冠的薄雾晨光。$NOAI
EOF
w battle_wasteland <<EOF
生成一张 2400x1080 横版动作战斗场景背景(没有任何人物、怪物、UI、文字):和参考图同一款游戏、同一画风与构图(地平线约在画面 40% 高处,下方是可以站人的平坦地面),场景是灰岩荒原:前景是碎石荒原地面,远景是风化石柱、断墙和阴沉的天空。$NOAI
EOF

# ── 界面切片 ──
w ui_bounty_paper <<EOF
单张游戏界面素材:一张竖向的做旧羊皮纸悬赏令(空白,不要任何文字和插画),四角各一颗铁钉,底部中间一枚红色蜡封,纸边略有破损卷曲;纯平深灰色背景(#303030);正视,不要透视。$NOAI
EOF

run() { # $1 名字 $2.. 参考图
  local name=$1; shift
  [ -f "$D/$name.png" ] && { echo "skip $name"; return; }
  python tools/qa/gen_proto.py --prompt "$D/$name.txt" --out "$D/$name.png" --ref "$@" 2>&1 | tail -1
}
run map_world1 "$MAPB"
run map_world2 "$MAPB"
run ground_village "$VIL" "$GROUNDREF"
run ground_forest "$VIL" "$GROUNDREF"
run ground_wasteland "$FLD" "$GROUNDREF"
for n in vil_chief_house vil_smithy vil_altar vil_training vil_gate vil_well vil_tree vil_fence waypoint; do run $n "$VIL" "$TOWNOBJ"; done
for n in npc_chief npc_smith npc_priest npc_instructor portrait_chief; do run $n "$VIL"; done
for n in fld_forest_trees fld_forest_stump; do run $n "$VIL" "$TOWNOBJ"; done
for n in fld_rocks fld_ruin_wall fld_dead_tree fld_bandit_camp; do run $n "$FLD" "$TOWNOBJ"; done
run battle_forest "$BAT"
run battle_wasteland "$BAT"
run ui_bounty_paper "$P/p5_bounty.png"
echo ALL-DONE

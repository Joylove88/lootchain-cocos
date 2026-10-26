cd /d/project/lootchain-cocos
D="周报截图/2026-10-26_真人矿/proto"
python tools/qa/gen_proto.py --prompt "$D/assets/a_mine_card.txt" --out "$D/assets/a_mine_card.png" --ref "$D/proto_left.png"
python tools/qa/gen_proto.py --prompt "$D/assets/b_npc_map.txt" --out "$D/assets/b_npc_map.png" --ref "周报截图/2026-10-26_矿境面板/proto/panel_v1.png"
python tools/qa/gen_proto.py --prompt "$D/assets/c_mine_nodes.txt" --out "$D/assets/c_mine_nodes.png" --ref "周报截图/2026-10-26_矿境面板/proto/panel_v1.png"
python tools/qa/gen_proto.py --prompt "$D/assets/d_zone_thumbs.txt" --out "$D/assets/d_zone_thumbs.png" --ref "周报截图/2026-10-26_矿境面板/proto/panel_v1.png"
python tools/qa/gen_proto.py --prompt "$D/assets/e_report_icons.txt" --out "$D/assets/e_report_icons.png" --ref "$D/proto_right.png"
echo ALL-DONE

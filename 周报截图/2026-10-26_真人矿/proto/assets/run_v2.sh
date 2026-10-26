cd /d/project/lootchain-cocos
D="周报截图/2026-10-26_真人矿/proto/assets"
python tools/qa/gen_proto.py --prompt "$D/f_mine_card_full.txt" --out "$D/f_mine_card_full.png" --ref "$D/ref_mine_card.png"
python tools/qa/gen_proto.py --prompt "$D/g_backdrop.txt" --out "$D/g_backdrop.png" --ref "周报截图/2026-10-26_真人矿/proto/pvp_v1.png"
echo ALL-DONE

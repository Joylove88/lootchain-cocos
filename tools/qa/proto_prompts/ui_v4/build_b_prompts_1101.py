"""11-01 B 风格补全:剩余旧红金界面的原型提示词(用户「电脑端同步之后补剩下的界面更新成 B 风格」)。
用法:python tools/qa/proto_prompts/ui_v4/build_b_prompts_1101.py → 同目录生成 <界面>_b.txt
生成:python tools/qa/gen_proto.py --prompt <界面>_b.txt --out 周报截图/2026-11-01_B风格补全/proto/<界面>_b.png
      --ref 周报截图/2026-10-28_整体UI去AI感/proto/hero_b2.png 周报截图/2026-11-01_B风格补全/before/<界面>.png
"""
import os

from build_b_prompts import EXTRA, HEAD

HERE = os.path.dirname(os.path.abspath(__file__))

DIALOG = """This is a MODAL DIALOG over the hero detail screen: the hero detail page (frosted glass, left tab list, hero art, right column) is visible behind it, dimmed to about 40% and slightly blurred. The dialog itself is one frosted glass card (same panel style), centred, with a title row (title text left-aligned in white, close X on the right), NO red ribbon title bar, NO spiky gold corners.
"""

SCREENS = {
    'more': """SCREEN: "更多" (more / misc), full screen.
- Top bar: back arrow + title "更多"; close (X) on the right.
- Left panel (about 45% width): a row of 3 square frosted tiles with simple white line icons + labels: 邮件 (small red dot with "1"), 设置, 公告. Below: section header "兑换码"; a text input field with grey placeholder "输入礼包码" and a primary champagne button "兑换" on its right.
- Right panel: section header "最近战报"; one row: "10-26 09:31  冒险关卡" with a small muted-red tag "失败" on the right; empty space below.
- Footer, small grey centred text links: "用户协议 · 隐私政策 · 客服:support@lootchain.game".
""",
    'notice': """SCREEN: "公告" (announcements), full screen.
- Top bar: back arrow + title "公告"; close (X) on the right; small grey subtitle "最新公告".
- A vertical list of full-width frosted announcement cards:
  1) small grey tag "公告", title "公告后台联调公告", right-aligned grey "发布 2026-06-12 09:23"; body text "本公告由后台公告管理阶段生成,仅用于 Cocos 大厅只读展示验收,不包含奖励、邮件附件或活动领取。"
  2) tag "公告", title "测试公告", right "发布 2026-09-12 14:20"; body "测试公告123321".
- Bottom centre: a translucent secondary pill button "刷新".
""",
    'profile': """SCREEN: "玩家资料" (player profile), full screen.
- Top bar: back arrow + title "玩家资料"; close (X) on the right.
- Top card (full width, frosted): round avatar (a pale-skinned dark-fantasy heroine portrait, painted, matte) with a thin faint ring, NO gold dragon frame; name "圣契64" large white with a small pencil edit icon; grey "UID 64"; a small soft-green tag "账号状态:正常"; a grey italic motto "无畏前行,书写属于自己的传说".
- Below: two columns of clean stat rows (each row = small monochrome muted-gold icon, grey label, white value), thin dividers:
  left: 等级 Lv.6 / 英雄上限 Lv.16 / 体力 120/120
  right: 下一级 "Lv.7 还差 83 EXP" with a slim champagne progress bar "1,267 / 1,350" / 阵容战力 1,020 / 英雄总战力 10,280.
""",
    'settings': """SCREEN: "设置" (settings), full screen.
- Top bar: back arrow + title "设置"; close (X) on the right.
- Two frosted panels side by side:
  left "语言": grey "当前语言 简体中文"; a segmented control "简体中文" (selected, champagne) | "English".
  right "声音与画面": grey hint "流畅:降低分辨率、减少特效,卡顿时选它;极致:全部拉满"; four setting rows each with a label on the left and a modern toggle or segmented control on the right: 音乐 (toggle on), 音效 (toggle on), 画面 (segmented 流畅 | 极致, 极致 selected), 帧率 (segmented 30 | 60, 60 selected).
""",
    'codex': """SCREEN: "图鉴" (hero codex / collection), full screen.
- Top bar: back arrow + title "图鉴" + small "?" help; right: primary champagne pill "一键领取" with a small red badge "18"; close (X).
- Under the top bar: a slim collection progress bar with 4 milestone markers labelled 5, 10, 15, 22 (small chest icons above 5/10/15 with tiny red dots = claimable; 22 locked), progress filled to about 15.
- Filter row: segmented tabs 全部 (selected) | UR | SSR | SR | R; on the right a checkbox "仅看未收集".
- A 5-column grid of hero cards (frosted glass card, rounded, painted half-body hero art cropped inside, matte): each card has a small rarity tag in the top-left (R / SR), a small champagne pill "领取" in the top-right, and the hero name at the bottom in white: 礼拜堂侍僧, 低语教徒, 城门卫兵, 王国巡逻兵, 荒原游侠; second row partly visible (R and SR heroes). A thin scrollbar on the right.
""",
    'daily': """SCREEN: "每日副本" (daily dungeons), full screen.
- Top bar: back arrow + title "每日副本" + small "?" help; centre a slim frosted notice "玩家等级 Lv.17 后,副本可掉落矿晶" with a small translucent pill "输出榜"; right: stamina chip "120/120" with a small "+", close (X).
- 4 tall dungeon cards in a row (frosted glass, rounded, NO flaming spiky gold frames), each: a painted dungeon illustration at the top (matte, desaturated, darkened - gothic gate / lava mine / arcane cathedral / void rift), title, a small soft-green tag "今日开放 · 次数 0/2"; two difficulty rows "Ⅰ" and "Ⅱ", each with 3-4 small reward slots with counts (×2, ×800, ×6 / ×4, ×1500, ×10); a row "Ⅲ 输出试炼 · 矿晶 8~60 ›"; a primary champagne button "挑战" at the bottom (the last card shows a disabled pill "玩家等级 Lv.8 解锁" instead).
  Titles: 觉醒之门, 熔火矿脉, 秘法圣殿, 深渊裂隙.
""",
    'formation': """SCREEN: "编队" (team formation), full screen. Keep a scene: the left 65% shows the four chibi heroes standing on four round dark stone plinths in a dim gothic hall (painted, darkened and slightly blurred, NO rows of candles, NO glowing crystal).
- Top bar: back arrow + title "编队" + small "?" help; centre a frosted chip "阵容战力 1,020 · 已上阵 4/4"; close (X).
- Under each hero: a compact frosted name plate: rarity tag (SR / R), "Lv.5 契约魔女" / "Lv.1 深渊行者" / "Lv.1 低语教徒" / "Lv.1 王国巡逻兵", a row of small stars, and a small translucent pill "下阵".
- Right panel (about 33% width, frosted): header "可出战英雄"; segmented tabs 全部 (selected) | UR | SSR | SR | R; a 3-column grid of square hero portrait cards (painted, matte) with rarity tag, name, "Lv.5 ⚔405" style line; cards already in the team have a small champagne check mark in the corner. Bottom of the panel: a sort button, a dropdown "品质", a list-view toggle.
""",
    'hero_roster': """SCREEN: "英雄" (hero roster), full screen.
- Top bar: back arrow + title "英雄"; right: currency chips "金币 4.7M", "钻石 909.9K", close (X).
- Left: a vertical list of class filters with small white line icons: 全部 (selected, champagne), 战士, 法师, 坦克, 刺客, 射手, 辅助.
- Main frosted panel: header "英雄名册" with on the right "拥有 15 · 英雄总战力 10,280".
- A 4-column grid of landscape hero cards (painted half-body art cropped in the card, matte, darkened lower third for text): rarity tag top-left (UR / SSR / SR / R), a small class icon top-right, a row of small stars, name, and "Lv.12 ⚔2,645" at the bottom: 圣铠壁垒·阿特拉斯, 晨星圣女·塞拉菲娜, 夜烬女王·莉维娅, 见习圣骑士, 契约魔女, 断刃佣兵, 深渊行者, 峡谷狙击手; a third row partly visible.
- Bottom-right floating primary champagne button "布阵".
""",
    'raid_npc': """SCREEN: "矿境" (mine raid, NPC mines tab), full screen.
- Top bar: back arrow + title "矿境"; segmented tabs "真人矿" | "NPC 矿" (selected); right: stamina chip "120/120 +", close (X).
- Left list (frosted): 废弃矿井 (selected, champagne), 铁脉坑道, 银晶矿洞, 熔火深井, 幽蓝晶窟, 龙脊矿脉 (the last five dimmed with a small lock).
- Centre: a painted cave scene with wooden walkways (matte, darkened, no glowing lamps), 10 round mine-entrance nodes in two rows labelled 1号矿 … 10号矿: 1-6 cleared (small soft-green check), 7 current (champagne ring), 8-10 locked (grey with lock).
- Right frosted panel: title "废弃矿井 · 7号矿"; three small round enemy portraits with names 礼拜堂侍僧, 荒原游侠, 城门卫兵 and a star each; a line "推荐战力 1230 / 当前 1020" (1020 in muted red); section "掠夺奖励": coin ×720, red crystal ×2; "首通": red shard ×30; primary champagne button "掠夺"; small grey "消耗体力 6(胜利才扣)".
""",
    'raid_pvp': """SCREEN: "矿境" (mine raid, real-player mines tab), full screen.
- Top bar: back arrow + title "矿境"; segmented tabs "真人矿" (selected) | "NPC 矿"; right: stamina chip "120/120 +", close (X).
- Three frosted columns:
  left "我的矿": a painted red crystal cluster on dark rock (matte, soft inner light only), "矿库 113" large, grey "阵容战力 1,020", a row with a small shield icon "无盾:矿可能被掠夺", a secondary pill "买 1 天盾 · 50 钻".
  centre "可掠夺的矿" with a small translucent pill "换一批" on the header right; empty state: a simple monochrome mine-entrance line icon, white "附近暂时没有可掠夺的矿", grey "有保护盾、新手保护期内、或 24 小时内打过的矿不会出现", primary champagne button "换一批".
  right "战报": three rows with small icons: "掠夺 矿工三号 · 胜 +45 矿晶" (green), "被 矿工三号 掠夺 · 败 -7 矿晶" (muted red), "掠夺 矿工三号 · 胜 +50 矿晶" (green), each with grey "6 天前" on the right.
""",
    'world_bounty': """SCREEN: "佣兵公会" (mercenary guild bounties), full screen.
- Top bar: back arrow + title "佣兵公会"; centre grey "今日悬赏 0/3 已完成 · 05:50 后刷新"; right a translucent pill "日常任务", close (X).
- Three bounty cards in a row (frosted glass, NOT parchment scrolls), each: title, a small difficulty tag (中 amber / 难 muted red / 易 soft green), a painted monster illustration (matte, darkened: a giant spider, a brown bear, a mutated rat), grey "目标:击败小蜘蛛 8 只 0/8" and "地点:村外林地", section "奖励" with small reward slots (gold ×1000, EXP ×200, a book ×1), and a primary champagne button "接取" at the bottom.
  Cards: 蛛巢隐患 (中, 击败小蜘蛛 8 只 0/8, ×1000 ×200 ×1); 熊出没 (难, 击败棕鬃熊 1 只 0/1, ×1200 ×250 ×1); 清理鼠窝 (易, 击败幼鼠 10 只 0/10, ×800 ×150).
""",
    'attr_detail': DIALOG + """DIALOG "属性详情" (attribute details), about 60% screen width.
- Header strip: small hero portrait (crimson-haired vampire queen, painted), rarity tag "SSR", name "夜烬女王·莉维娅", grey "Lv.12", "战力 3,100".
- Two columns of sections (section headers with a thin champagne bar on the left, like the hero detail page):
  "战斗属性": rows with small monochrome muted-gold icons: 生命 1,707 (this row highlighted with a faint champagne outline), 攻击 96, 防御 66, 速度 43, 暴击 61%, 暴伤 164.5%.
  "养成": 幸运 88, 觉醒 未觉醒, 星级 3 星; then "属性来源": 生命 1,707 = 基础 1,194 + 装备 410 + 特性 103 (as a small equation row).
- Bottom: a single translucent pill "关闭".
""",
    'hero_refine': DIALOG + """DIALOG "特性洗练" (trait reroll), about 70% screen width.
- Left: hero card (painted portrait of the crimson-haired vampire queen, matte), name "夜烬女王·莉维娅", tag "SSR", "当前战力 3,100".
- Right: grey hint "点击特性切换锁定:锁定的保留,其余重新随机;锁得越多消耗越高。"; 5 trait rows (frosted rows with a thin coloured line on the left = quality colour), each: small icon, name, value, a small quality tag, and a lock toggle on the right: 攻击加成 +10.3% (橙), 暴击伤害 +14.5% (橙), 生命加成 +6.4% (金), 战利品掉落率 +7.2% (紫), 防御加成 +3.7% (蓝).
- A legend line "特性品质: 绿 蓝 紫 金 橙 红" as tiny coloured dots.
- Cost strip: "深渊重铸石 ×1 持有:256", "金币 500 持有:4.7M", "锁定 0 条".
- Buttons: primary champagne "确认洗练", secondary pill "取消".
""",
    'ult': DIALOG + """DIALOG "终极技能升级" (ultimate skill upgrade), about 75% screen width, with grey subtitle "圣铠壁垒·阿特拉斯 · 当前 Lv.1 / 上限 Lv.5(觉醒后 Lv.10)".
- Left: a round skill emblem (shield with a cross, painted, matte, a thin faint ring, NO spiky gold frame, NO glow).
- Right of it: skill name "圣铠·天启旋盾 · 大招 · Lv1/5"; description "守卫战 2★ 解锁;蓄满后点击英雄手动释放伤害 +25%,不点自动释放。每升 1 级伤害 +10%。"
- Two small frosted info boxes: "技能等级" with a row of 10 small diamond pips (1 filled champagne, rest empty) and "Lv.1 → Lv.2"; "伤害倍率" "260% → 299%" (299% larger) and a small soft-green "每级 +39%".
- Right box "升级消耗 · 升至 Lv.2": rows "终极技能卷轴 180/1" and "金币 2,000" with small item icons.
- Buttons: primary champagne "升级", secondary pill "关闭".
""",
}


def main() -> None:
    for key, body in SCREENS.items():
        with open(os.path.join(HERE, f'{key}_b.txt'), 'w', encoding='utf-8') as f:
            f.write(HEAD + body + EXTRA)
        print('wrote', f'{key}_b.txt')


if __name__ == '__main__':
    main()

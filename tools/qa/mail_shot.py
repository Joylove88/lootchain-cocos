"""邮箱重做自验(docs/15 2026-10-28):打开邮箱截图 → 点第二封(选中 + 已读)截图 → 删除已读 → 截图;打印状态。
前提同 town_v3_round(模拟器调试包 + 本地服 8081 + 已登录)。用法:python tools/qa/mail_shot.py <输出目录>
"""
import os
import subprocess
import sys
import time

from town_v3_round import INSPECTOR, ROOT_JS

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
ADB = ['adb', '-s', 'emulator-5554']


def ev(body):
    return INSPECTOR.call(f"(() => {{ {ROOT_JS} try {{ {body} }} catch (e) {{ return 'err ' + e.message; }} }})()")


def shot(name):
    with open(os.path.join(OUT, f'{name}.png'), 'wb') as f:
        f.write(subprocess.run(ADB + ['exec-out', 'screencap', '-p'], capture_output=True).stdout)
    print('shot', name, flush=True)


subprocess.run(ADB + ['forward', 'tcp:43086', 'tcp:43086'], capture_output=True)
ev("setTimeout(() => root.openLobbyMailPanel(), 50); return 1;")
time.sleep(4)
print('mails', ev("return JSON.stringify(root.currentLobbyMailState().mails.map(m => [m.mailId, m.title, m.read, m.claimed]));"), flush=True)
shot('mail_open')
print('select', ev("const ms = root.currentLobbyMailState().mails; const m = ms[1] || ms[0]; root.selectLobbyMail(m.mailId); return 'sel ' + m.mailId;"), flush=True)
time.sleep(1.5)
shot('mail_select')
print('delread', ev("root.deleteReadLobbyMails(); return 'deleting';"), flush=True)
time.sleep(3)
print('after', ev("return JSON.stringify(root.currentLobbyMailState().mails.map(m => [m.mailId, m.title, m.read, m.claimed]));"), flush=True)
shot('mail_deleted')
ev("setTimeout(() => root.closeLobbyMailPanel(), 50); return 1;")

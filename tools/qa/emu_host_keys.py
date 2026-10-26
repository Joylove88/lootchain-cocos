"""往安卓模拟器窗口发真实的电脑键盘按键(先切前台再 keybd_event),复现「用电脑键盘在模拟器里玩」。
adb input keyevent 走的是注入通道,和电脑键盘进模拟器不是一条路,验键盘相关问题要用这个。
已知(2026-10-26 实测):模拟器把字母键当打字,按下瞬间连发 DOWN/UP、按住无重复 → WSAD 在模拟器里无法按住移动;方向键正常保持按住。
用法: HOLD=1.2 python tools/qa/emu_host_keys.py LEFT UP A(HOLD = 每个键按住秒数)"""
import ctypes
import os
import sys
import time
from ctypes import wintypes

user32 = ctypes.WinDLL('user32', use_last_error=True)
VK = {'NUMLEFT': 0x25, 'NUMRIGHT': 0x27, 'LEFT': 0x25, 'UP': 0x26, 'RIGHT': 0x27, 'DOWN': 0x28, 'W': 0x57, 'A': 0x41, 'S': 0x53, 'D': 0x44}
EXT = {'LEFT', 'UP', 'RIGHT', 'DOWN'}
KEYEVENTF_EXTENDEDKEY = 0x1
KEYEVENTF_KEYUP = 0x2


def find_window(fragment):
    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        n = user32.GetWindowTextLengthW(hwnd)
        if n:
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            if fragment in buf.value and user32.IsWindowVisible(hwnd):
                found.append((hwnd, buf.value))
        return True

    user32.EnumWindows(cb, 0)
    return found


wins = find_window('Android Emulator')
print('windows', wins)
hwnd = wins[0][0]
user32.ShowWindow(hwnd, 9)
user32.keybd_event(0x12, 0, 0, 0)  # Alt 绕过前台锁
user32.SetForegroundWindow(hwnd)
user32.keybd_event(0x12, 0, KEYEVENTF_KEYUP, 0)
time.sleep(0.8)
HOLD = float(os.environ.get('HOLD', '0.25'))
print('foreground ok', user32.GetForegroundWindow() == hwnd)
for name in sys.argv[1:]:
    vk = VK[name]
    scan = user32.MapVirtualKeyW(vk, 0)
    flag = KEYEVENTF_EXTENDEDKEY if name in EXT else 0
    user32.keybd_event(vk, scan, flag, 0)
    time.sleep(HOLD)
    user32.keybd_event(vk, scan, flag | KEYEVENTF_KEYUP, 0)
    time.sleep(0.35)
print('sent', sys.argv[1:])

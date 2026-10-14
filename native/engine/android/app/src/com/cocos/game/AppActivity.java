/****************************************************************************
Copyright (c) 2015-2016 Chukong Technologies Inc.
Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

http://www.cocos2d-x.org

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
****************************************************************************/
package com.cocos.game;

import android.os.Bundle;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Matrix;
import android.view.MotionEvent;
import android.view.SurfaceView;

import com.cocos.service.SDKWrapper;
import com.cocos.lib.CocosActivity;

public class AppActivity extends CocosActivity {

    /**
     * 渲染分辨率(第二阶段,2026-10-14):画质档位原生化。引擎在原生上没有可用的降分辨率口,
     * 这里让 SurfaceView 用较小的缓冲区(setFixedSize),由系统硬件缩放铺满屏幕;触摸坐标按同一比例换算后再交给引擎。
     * JS 侧通过反射调 setRenderShortSide(短边像素,0 = 原生),选择存本地,下次启动在建画布前就生效。
     */
    private static final String PREFS = "lootchain_render";
    private static final String KEY_SHORT_SIDE = "short_side";
    private static AppActivity sInstance;
    private static volatile int sTargetShortSide = 0;
    /** 渲染缓冲区 / 视图尺寸;1 = 原生分辨率。 */
    private static volatile float sRenderScale = 1f;
    private final Matrix mTouchMatrix = new Matrix();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        sInstance = this;
        sTargetShortSide = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_SHORT_SIDE, 0);
        super.onCreate(savedInstanceState);
        // DO OTHER INITIALIZATION BELOW
        SDKWrapper.shared().init(this);

        SurfaceView surface = getSurfaceView();
        if (surface != null) {
            surface.setOnTouchListener((v, event) -> {
                if (sRenderScale >= 0.999f) {
                    return processMotionEvent(event);
                }
                MotionEvent scaled = MotionEvent.obtain(event);
                mTouchMatrix.setScale(sRenderScale, sRenderScale);
                scaled.transform(mTouchMatrix);
                boolean handled = processMotionEvent(scaled);
                scaled.recycle();
                return handled;
            });
            surface.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
                if (r - l != or - ol || b - t != ob - ot) {
                    applyRenderScale();
                }
            });
            surface.post(this::applyRenderScale);
        }
    }

    private void applyRenderScale() {
        SurfaceView surface = getSurfaceView();
        if (surface == null) {
            return;
        }
        int w = surface.getWidth();
        int h = surface.getHeight();
        if (w <= 0 || h <= 0) {
            return;
        }
        int shortSide = Math.min(w, h);
        int target = sTargetShortSide;
        if (target <= 0 || target >= shortSide) {
            sRenderScale = 1f;
            surface.getHolder().setSizeFromLayout();
            return;
        }
        float scale = (float) target / shortSide;
        sRenderScale = scale;
        surface.getHolder().setFixedSize(Math.round(w * scale), Math.round(h * scale));
    }

    /** JS 反射调用(引擎线程):设渲染短边,0 = 原生分辨率。 */
    public static void setRenderShortSide(int shortSide) {
        sTargetShortSide = Math.max(0, shortSide);
        AppActivity activity = sInstance;
        if (activity == null) {
            return;
        }
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY_SHORT_SIDE, sTargetShortSide).apply();
        activity.runOnUiThread(activity::applyRenderScale);
    }

    /** JS 反射调用:当前渲染缩放(安全区等按视图像素给出的量要乘它)。 */
    public static float getRenderScale() {
        return sRenderScale;
    }

    /** JS 反射调用:屏幕物理短边像素(画质档位按它算目标)。 */
    public static int getScreenShortSide() {
        AppActivity activity = sInstance;
        SurfaceView surface = activity != null ? activity.getSurfaceView() : null;
        if (surface == null || surface.getWidth() <= 0) {
            return 0;
        }
        return Math.min(surface.getWidth(), surface.getHeight());
    }

    @Override
    protected void onResume() {
        super.onResume();
        SDKWrapper.shared().onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        SDKWrapper.shared().onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (sInstance == this) {
            sInstance = null;
        }
        // Workaround in https://stackoverflow.com/questions/16283079/re-launch-of-activity-on-home-button-but-only-the-first-time/16447508
        if (!isTaskRoot()) {
            return;
        }
        SDKWrapper.shared().onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        SDKWrapper.shared().onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        SDKWrapper.shared().onNewIntent(intent);
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        SDKWrapper.shared().onRestart();
    }

    @Override
    protected void onStop() {
        super.onStop();
        SDKWrapper.shared().onStop();
    }

    @Override
    public void onBackPressed() {
        SDKWrapper.shared().onBackPressed();
        super.onBackPressed();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        SDKWrapper.shared().onConfigurationChanged(newConfig);
        super.onConfigurationChanged(newConfig);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        SDKWrapper.shared().onRestoreInstanceState(savedInstanceState);
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        SDKWrapper.shared().onSaveInstanceState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onStart() {
        SDKWrapper.shared().onStart();
        super.onStart();
    }

    @Override
    public void onLowMemory() {
        SDKWrapper.shared().onLowMemory();
        super.onLowMemory();
    }
}

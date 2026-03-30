package com.datalynkr

import android.content.res.Resources
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class NavigationModeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NavigationModeModule"

    /**
     * Returns the Android system navigation mode:
     *   0 = 3-button navigation (buttons)
     *   1 = 2-button navigation (buttons + gesture back)
     *   2 = full gesture navigation
     *
     * Falls back to resource-based detection on older devices.
     */
    @ReactMethod
    fun getNavigationMode(promise: Promise) {
        try {
            val context = reactApplicationContext
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val mode = Settings.Secure.getInt(
                    context.contentResolver,
                    "navigation_mode",
                    0
                )
                promise.resolve(mode)
            } else {
                // Pre-Q devices always use button navigation
                promise.resolve(0)
            }
        } catch (e: Exception) {
            promise.reject("NAV_MODE_ERROR", e.message)
        }
    }

    /**
     * Returns true if the device is using 3-button (classic) navigation.
     */
    @ReactMethod
    fun isButtonNavigation(promise: Promise) {
        try {
            val context = reactApplicationContext
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val mode = Settings.Secure.getInt(
                    context.contentResolver,
                    "navigation_mode",
                    0
                )
                promise.resolve(mode == 0)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("NAV_MODE_ERROR", e.message)
        }
    }
}

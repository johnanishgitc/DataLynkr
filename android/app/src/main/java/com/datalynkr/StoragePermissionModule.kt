package com.datalynkr

import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class StoragePermissionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "StoragePermissionModule"



    /**
     * Opens the system screen where the user can allow the app to ignore battery optimizations
     * (Allow background activity). Takes the user directly to the toggle for this app.
     */
    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}

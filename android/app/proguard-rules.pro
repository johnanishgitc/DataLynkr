# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ============================
# React Native Core
# ============================
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# Keep native module registrations
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keepclassmembers class * extends com.facebook.react.bridge.JavaScriptModule {
    *;
}
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }

# Keep TurboModules
-keep class * extends com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }
-keep class * implements com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }

# Keep ViewManagers
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * extends com.facebook.react.uimanager.BaseViewManager { *; }

# React Native Flipper (debug only, but keep to avoid build issues)
-dontwarn com.facebook.flipper.**

# ============================
# Hermes Engine
# ============================
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ============================
# OkHttp / Retrofit (used by Kotlin native modules)
# ============================
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-keep class okhttp3.** { *; }
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# ============================
# Kotlinx Serialization
# ============================
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.datalynkr.**$$serializer { *; }
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ============================
# Kotlin Coroutines
# ============================
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.** {
    volatile <fields>;
}

# ============================
# Gson (used by Retrofit converter)
# ============================
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }
-keep class * extends com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ============================
# Google MLKit (Barcode Scanning)
# ============================
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# ============================
# Google Play Services
# ============================
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ============================
# Room Database
# ============================
-keep class * extends androidx.room.RoomDatabase { *; }
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }
-dontwarn androidx.room.paging.**

# ============================
# React Native Vision Camera
# ============================
-keep class com.mrousavy.camera.** { *; }

# ============================
# React Native Quick SQLite
# ============================
-keep class com.reactnativequicksqlite.** { *; }

# ============================
# React Native SVG
# ============================
-keep class com.horcrux.svg.** { *; }

# ============================
# Lottie React Native
# ============================
-keep class com.airbnb.lottie.** { *; }
-dontwarn com.airbnb.lottie.**

# ============================
# React Native WebView
# ============================
-keep class com.reactnativecommunity.webview.** { *; }

# ============================
# React Native Screens
# ============================
-keep class com.swmansion.rnscreens.** { *; }

# ============================
# React Native Safe Area Context
# ============================
-keep class com.th3rdwave.safeareacontext.** { *; }

# ============================
# React Native Geolocation
# ============================
-keep class com.agontuk.RNFusedLocation.** { *; }

# ============================
# React Native Linear Gradient
# ============================
-keep class com.BV.LinearGradient.** { *; }

# ============================
# React Native Vector Icons
# ============================
-keep class com.oblador.vectoricons.** { *; }

# ============================
# React Native Async Storage
# ============================
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ============================
# React Native Document Picker
# ============================
-keep class com.reactnativedocumentpicker.** { *; }

# ============================
# React Native FS
# ============================
-keep class com.rnfs.** { *; }

# ============================
# React Native Image Picker
# ============================
-keep class com.imagepicker.** { *; }

# ============================
# React Native Permissions
# ============================
-keep class com.zoontek.rnpermissions.** { *; }

# ============================
# React Native Share
# ============================
-keep class cl.json.** { *; }

# ============================
# React Native System Navigation Bar
# ============================
-keep class com.reactnativesystemnavigationbar.** { *; }

# ============================
# React Native File Viewer
# ============================
-keep class com.vinzscam.reactnativefileviewer.** { *; }

# ============================
# React Native Keep Awake
# ============================
-keep class com.corbt.keepawake.** { *; }

# ============================
# React Native Print
# ============================
-keep class com.christopherdro.RNPrint.** { *; }

# ============================
# React Native HTML to PDF (PDFBox)
# ============================
-keep class com.christopherdro.htmltopdf.** { *; }
# PDFBox references this optional JP2 codec at runtime; it is not on the classpath.
-dontwarn com.gemalto.jp2.**
-keep class com.gemalto.jp2.** { *; }

# ============================
# DataLynkr App - Keep all app classes
# ============================
-keep class com.datalynkr.** { *; }

# ============================
# General Android
# ============================
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

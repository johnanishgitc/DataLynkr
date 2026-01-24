# Build Instructions - IMPORTANT

## ⚠️ CRITICAL: You Must Install Java 21 First

Your build is currently **failing because you have Java 24 installed**. I can see from the output:
```
java version "24.0.1" 2025-04-15
```

## Current Status

✅ Gradle has been upgraded to 8.14.3
✅ Android Gradle Plugin updated to 8.7.3
✅ Build folders cleaned
❌ **Java 24 is incompatible - BUILD WILL FAIL**

## The "wrapper" Error Explained

The error "Task 'wrapper' not found in project ':app'" happens when:
1. You run a gradle command in the wrong directory
2. OR (your case) Gradle fails during initialization due to Java incompatibility

It's **not** actually about a missing wrapper task - the wrapper is fine. The build crashes before it can even show you available tasks.

## What You Need To Do RIGHT NOW

### Step 1: Install Java 21 (5 minutes)

1. **Download Java 21**:
   - Go to: https://www.oracle.com/java/technologies/downloads/#java21-windows
   - Download: **Windows x64 Installer** (jdk-21_windows-x64_bin.exe)

2. **Run the installer**
   - Accept all defaults
   - Remember the install path (usually `C:\Program Files\Java\jdk-21`)

3. **Set Environment Variables** (PowerShell as Administrator):
   ```powershell
   # Set JAVA_HOME
   [System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Java\jdk-21', 'User')
   
   # Update PATH (puts Java 21 FIRST)
   $currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
   $javaPath = "C:\Program Files\Java\jdk-21\bin"
   
   # Remove any existing Java paths
   $pathArray = $currentPath -split ';' | Where-Object { $_ -notlike '*Java*' }
   
   # Add Java 21 at the beginning
   $newPath = "$javaPath;" + ($pathArray -join ';')
   [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
   
   Write-Host "✅ Java 21 environment variables set!" -ForegroundColor Green
   ```

4. **RESTART VS Code and ALL terminals completely**  
   (User env vars only apply to processes started *after* the change.)

5. **Verify Java 21 is active** (in a **new** PowerShell after restart):
   ```powershell
   java -version
   ```
   
   Should show:
   ```
   java version "21.0.x" 2024-xx-xx LTS
   ```

   **If you can’t restart yet**, refresh for the *current* session only:
   ```powershell
   $env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
   $env:Path = "C:\Program Files\Java\jdk-21\bin;" + (($env:Path -split ';' | Where-Object { $_ -notlike '*Java*' }) -join ';')
   java -version   # must show 21.x
   ```

### Step 2: Build Your App (after Java 21 is installed)

```powershell
# Navigate to project
cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app"

# Stop any old Gradle daemons
cd android
.\gradlew --stop
cd ..

# Start Metro bundler in one terminal
npx react-native start
```

**In a NEW terminal**:
```powershell
cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app"

# Run on Android
npx react-native run-android
```

## Why You Can't Build Right Now

Java 24 introduced strict security restrictions:
- ❌ Blocks Gradle's native library access
- ❌ Blocks CMake configuration for native modules
- ❌ Causes "wrapper task not found" errors (misleading)
- ❌ Causes "restricted method" warnings that kill the build

Java 21 (LTS):
- ✅ Fully supported by React Native 0.76
- ✅ Works with Gradle 8.14.3
- ✅ Compatible with all Android build tools
- ✅ Officially recommended for React Native development

## Common Mistakes

### ❌ DON'T try to build with Java 24
The build will always fail, no matter what gradle commands you run.

### ❌ DON'T run gradle wrapper commands manually
The wrapper is already configured. The error message is misleading.

### ❌ DON'T try workarounds or flag tweaks
No amount of gradle flags will make Java 24 work with native builds.

### ✅ DO install Java 21 first
This is the ONLY solution that will work.

## After Installing Java 21

Once Java 21 is installed, you'll be able to:
- ✅ Build the Android app
- ✅ Run on emulator or device
- ✅ Use all React Native features
- ✅ Debug without issues

## Troubleshooting: "Unable to load script" / Red Box / App Crashes on Launch

If you see errors like:

- **`Unable to load script. Make sure you're either running Metro (run 'npx react-native start') or that your bundle 'index.android.bundle' is packaged correctly for release.`**
- **`Couldn't connect to "ws://localhost:8081/..."`** or **`Failed to connect to localhost/127.0.0.1:8081`**
- **`Channel is unrecoverably broken`** (in system logs)
- **Red error box** in the app

The app cannot load the JavaScript bundle. In **debug** builds, the bundle comes from **Metro** on your PC, not from the APK.

### Fix for development (debug) on a **physical device** (e.g. Samsung SM-S938B)

1. **Start Metro first** and leave it running:
   ```powershell
   cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app"
   npx react-native start
   ```
   Wait until you see Metro is ready (e.g. "Welcome to Metro" or the packager UI).

2. **In a second terminal**, run (do **not** launch the app by tapping the icon):
   ```powershell
   cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app"
   npx react-native run-android
   ```
   This builds, installs, runs `adb reverse tcp:8081 tcp:8081`, and starts the app. The device’s `localhost:8081` will point to Metro on your PC.

3. **If you installed/launched the app some other way** (e.g. tapped the icon, or installed an APK manually), the reverse might not be set. With the device connected over **USB**, run:
   ```powershell
   adb reverse tcp:8081 tcp:8081
   ```
   Then reopen the app.

4. **If the device is on Wi‑Fi only** (no USB, or `adb reverse` does not work): in the app, open the **Dev Menu** (shake device or `adb shell input keyevent 82`), go to **Settings** → **Debug server host & port for device**, and set:
   ```
   YOUR_PC_IP:8081
   ```
   (e.g. `192.168.1.100:8081`). Use your PC’s local IP. Find it with `ipconfig` (IPv4 for your Wi‑Fi adapter).

### Running **without Metro** (release / standalone)

To run the app with the JS bundle **inside** the APK (no Metro needed):

```powershell
cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app\android"
.\gradlew assembleRelease
```

The APK is at:

`android\app\build\outputs\apk\release\app-release.apk`

Install it on the device (e.g. `adb install -r android\app\build\outputs\apk\release\app-release.apk` or copy and open the file). No Metro or `adb reverse` is required.

### Other log messages

- **`Unable to open libpenguin.so`** – Safe to ignore. It is an optional, device-specific library.
- **`Channel is unrecoverably broken`** – Usually a side effect of the app crashing (e.g. from "Unable to load script"). Fixing bundle loading resolves it.

---

## Need More Help?

See these files in your project:
- `JAVA_SETUP_GUIDE.md` - Detailed Java 21 installation guide
- `QUICK_FIX_SUMMARY.md` - Quick reference and summary

## Bottom Line

**Install Java 21 → Restart VS Code → Build your app**

That's it. Everything else is already configured and ready to go.

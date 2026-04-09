# Java Setup Guide for React Native Development

## Current Issue

Your project requires **Java 21 (LTS)** or **Java 17 (LTS)** to build successfully. You currently have **Java 24** installed, which causes compatibility issues with React Native's native build tools (CMake).

### Error Symptoms:
- ❌ "Unsupported class file major version 68"
- ❌ "Task 'wrapper' not found in project ':app'"
- ❌ "WARNING: A restricted method in java.lang.System has been called"
- ❌ CMake configuration failures

## Solution: Install Java 21 (Recommended)

### Step 1: Download Java 21

Choose one of these options:

#### Option A: Oracle JDK 21 (Recommended for Windows)
1. Visit: https://www.oracle.com/java/technologies/downloads/#java21-windows
2. Download: **Windows x64 Installer** (jdk-21_windows-x64_bin.exe)

#### Option B: Eclipse Temurin (OpenJDK) 21
1. Visit: https://adoptium.net/temurin/releases/?version=21
2. Download: **Windows x64 JDK .msi** installer

### Step 2: Install Java 21

1. Run the installer you downloaded
2. **Important**: During installation, note the installation path (usually `C:\Program Files\Java\jdk-21`)
3. Complete the installation

### Step 3: Set Environment Variables

#### Method A: Using Windows Settings (Recommended)

1. Press `Win + X` and select **System**
2. Click **Advanced system settings** on the right
3. Click **Environment Variables** button
4. Under **System variables**, click **New**:
   - Variable name: `JAVA_HOME`
   - Variable value: `C:\Program Files\Java\jdk-21` (or your installation path)
5. Find **Path** in System variables, select it, and click **Edit**
6. Click **New** and add: `%JAVA_HOME%\bin`
7. Move this entry to the **top** of the list
8. Click **OK** on all dialogs

#### Method B: Using PowerShell (Quick)

Open PowerShell as Administrator and run:

```powershell
# Set JAVA_HOME for current user
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Java\jdk-21', 'User')

# Add to PATH
$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$newPath = "C:\Program Files\Java\jdk-21\bin;$currentPath"
[System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')

Write-Host "Java 21 environment variables set successfully!" -ForegroundColor Green
Write-Host "Please restart your terminal and VS Code for changes to take effect." -ForegroundColor Yellow
```

### Step 4: Verify Installation

Close all terminals and VS Code, then reopen and run:

```powershell
java -version
```

You should see output like:
```
java version "21.0.x" 2024-xx-xx LTS
Java(TM) SE Runtime Environment (build 21.0.x+...)
Java HotSpot(TM) 64-Bit Server VM (build 21.0.x+..., mixed mode, sharing)
```

### Step 5: Clean and Rebuild Your Project

After installing Java 21, run these commands in your project directory:

```powershell
# Navigate to your project
cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app"

# Clean everything
Remove-Item -Recurse -Force android\.gradle -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\build -ErrorAction SilentlyContinue

# Stop any Gradle daemons
cd android
.\gradlew --stop
cd ..

# Start fresh Metro server
npx react-native start
```

In a **new terminal**, run:
```powershell
cd "C:\Users\johna\OneDrive\Desktop\DataLynkr-app"
npx react-native run-android
```

---

## Alternative: Use Java 17 (Also LTS)

If you prefer Java 17 instead of Java 21, follow the same steps but download Java 17:
- Oracle: https://www.oracle.com/java/technologies/downloads/#java17-windows
- Adoptium: https://adoptium.net/temurin/releases/?version=17

---

## What I've Already Fixed

✅ **Upgraded Gradle** from 8.10.2 to 8.14.3 (better Java support)
✅ **Updated Android Gradle Plugin** to 8.7.3 (latest stable)
✅ **Optimized Gradle memory settings** in `gradle.properties`
✅ **Disabled configuration cache** to prevent file locking issues on Windows

---

## Why Java 24 Doesn't Work

Java 24 is a **non-LTS** (Long-Term Support) release with new security restrictions:
- CMake build tools cannot access native methods
- Gradle native platform libraries are blocked
- React Native's native modules fail to compile

**LTS versions (Java 21 or 17)** are stable and fully supported by the React Native ecosystem.

---

## Troubleshooting

### Issue: "JAVA_HOME is not set"
- Restart your terminal after setting environment variables
- Restart VS Code completely
- Verify with: `echo $env:JAVA_HOME`

### Issue: Still getting Java 24 errors
- Check which Java is being used: `where.exe java`
- Make sure Java 21 bin folder is **first** in your PATH
- Run: `Get-Command java | Select-Object -ExpandProperty Source`

### Issue: Gradle daemon won't stop
```powershell
# Kill all Java processes (closes Gradle daemons)
Stop-Process -Name "java" -Force -ErrorAction SilentlyContinue
```

---

## Need Help?

If you encounter issues after installing Java 21:
1. Verify Java 21 is active: `java -version`
2. Clean the project (see Step 5 above)
3. Check for error messages in the terminal
4. Make sure Android emulator or device is running

---

**Summary**: Install Java 21, set JAVA_HOME, clean your project, and rebuild. This will resolve all the "wrapper task not found" and build errors you're experiencing.

# NOVA Watch AI - Native Android Verification Build

这是一个仅用于 466×466 实机交互验收的原生 Android Canvas 版本。
它不使用 WebView，也不替代正式 HarmonyOS HAP 交付。

## 构建

```powershell
$env:ANDROID_HOME='D:\AndroidSDK\Sdk'
$env:ANDROID_SDK_ROOT='D:\AndroidSDK\Sdk'
D:\tools\gradle-8.7\bin\gradle.bat --no-daemon assembleDebug
```

输出：

```text
app/build/outputs/apk/debug/app-debug.apk
```

已归档验机产物：

```text
../signing/NOVA-Watch-AI-android-api31-verification.apk
```

## 安装

零售手表会拦截未知来源安装。测试机可使用可逆的包安装器临时停用方案，
但必须确保安装后立即恢复：

```powershell
$adb='C:\Users\63054\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$serial='192.168.1.89:5555'
& $adb -s $serial shell pm disable-user --user 0 com.android.packageinstaller
try {
  & $adb -s $serial install -r app\build\outputs\apk\debug\app-debug.apk
} finally {
  & $adb -s $serial shell pm enable com.android.packageinstaller
}
```

该方式只属于本地调试流程，不应作为正式用户安装方案。

## 验证范围

完整实机验证记录见：

```text
../docs/ANDROID_VERIFICATION.md
```

正式 HarmonyOS HAP 的实机安装仍受设备私有签名与
`ohos.permission.INSTALL_BUNDLE` 白名单限制。
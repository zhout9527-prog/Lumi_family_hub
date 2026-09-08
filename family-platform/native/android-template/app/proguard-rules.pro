# Keep JNI entry points and the Tauri Android bridge in release builds.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

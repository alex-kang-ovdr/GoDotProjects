# Keep Godot Android JNI classes and PlayHub GodotPlugin entrypoints
-keep class org.godotengine.godot.** { *; }
-dontwarn org.godotengine.godot.**

-keep class com.playhub.aos.runtime.PlayHubGodotPlugin { *; }
-keepclassmembers class * extends org.godotengine.godot.plugin.GodotPlugin {
    @org.godotengine.godot.plugin.UsedByGodot <methods>;
}

# Keep JavaScript interface bridge methods in WebGameActivity
-keepclassmembers class com.playhub.aos.runtime.WebGameActivity$PlayHubJsBridge {
    @android.webkit.JavascriptInterface <methods>;
}

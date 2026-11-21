import java.util.Locale

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun sanitizeBranchSegment(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty() || trimmed in setOf("PlayHub-Platform", "main", "master", "HEAD")) {
        return "gamedev"
    }
    var clean = trimmed
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-z0-9]+"), "_")
        .replace(Regex("_+"), "_")
        .trim('_')
    if (clean.isEmpty()) return "gamedev"
    if (clean.first().isDigit()) clean = "b_$clean"
    if (clean.length > 32) clean = clean.substring(0, 32).trimEnd('_')
    return clean.ifEmpty { "gamedev" }
}

fun resolveCurrentGitBranch(): String {
    return try {
        val process = ProcessBuilder("git", "rev-parse", "--abbrev-ref", "HEAD")
            .directory(rootProject.projectDir)
            .redirectErrorStream(true)
            .start()
        val output = process.inputStream.bufferedReader().readText().trim()
        val exitCode = process.waitFor()
        if (exitCode == 0) output else ""
    } catch (_: Exception) {
        ""
    }
}

val rawBranchProp = (findProperty("packageBranch") as String?)?.trim()
val rawGitBranch = resolveCurrentGitBranch()
val activeBranchName = if (!rawBranchProp.isNullOrEmpty()) rawBranchProp else rawGitBranch
val packageBranchSegment = sanitizeBranchSegment(activeBranchName)

val includeX86 = (findProperty("includeX86") as String?)?.toBoolean() ?: false
val includeArm32 = (findProperty("includeArm32") as String?)?.toBoolean() ?: false
val hubBaseUrlProp = (findProperty("hubBaseUrl") as String?)?.trim().orEmpty()
val allowLiveOverride = (findProperty("allowLiveOverride") as String?)?.toBoolean() ?: false

val requestedTasks = gradle.startParameter.taskNames.joinToString(" ")
if (requestedTasks.contains("CfgLive", ignoreCase = true) && packageBranchSegment != "gamedev" && !allowLiveOverride) {
    throw GradleException(
        "Live build (com.playhub.gamedev.live) is restricted to trunk (gamedev). " +
            "Current branch='$activeBranchName' (segment='$packageBranchSegment'). " +
            "Use debug/dev/test/release or pass -PpackageBranch=gamedev -PallowLiveOverride=true."
    )
}

android {
    namespace = "com.playhub.aos"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        // Unified 4-segment Package ID rule: com.playhub.<branch>.<buildConfig>
        applicationId = "com.playhub.$packageBranchSegment"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Minimal Footprint Policy: keep only the 8 PlayHub locales
        resourceConfigurations += listOf("ko", "en", "ja", "zh-rCN", "fr", "es", "pt-rBR", "hi")

        // Minimal Footprint Policy: arm64-v8a only by default (opt-in x86_64/armeabi-v7a)
        ndk {
            debugSymbolLevel = "NONE"
            abiFilters.add("arm64-v8a")
            if (includeX86) abiFilters.add("x86_64")
            if (includeArm32 || requestedTasks.contains("bundleCfgLive", ignoreCase = true)) {
                abiFilters.add("armeabi-v7a")
            }
        }

        buildConfigField("String", "PLAYHUB_BRANCH", "\"${activeBranchName.ifEmpty { "gamedev" }}\"")
        buildConfigField("String", "PLAYHUB_BRANCH_SEGMENT", "\"$packageBranchSegment\"")
        buildConfigField("String", "GODOT_ENGINE_VERSION", "\"4.7.2\"")
        buildConfigField("boolean", "FORGE_ENABLED", "false")
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        jniLibs {
            // Compressed .so minimizes sideload APK size while keeping minSdk 24 compatibility.
            // Pass -PuncompressedJniLibs=true for Play Store AAB 16KB page direct mmap delivery.
            useLegacyPackaging = !((findProperty("uncompressedJniLibs") as String?)?.toBoolean() ?: false)
        }
        resources {
            excludes += setOf(
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "META-INF/*.kotlin_module",
                "kotlin/**/*.kotlin_builtins"
            )
        }
    }

    buildTypes {
        getByName("debug") {
            isDebuggable = true
            isMinifyEnabled = false
            isShrinkResources = false
        }
        getByName("release") {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            // Placeholder debug signing for local/CI verification; live uses Play App Signing upload keystore.
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    val appLabelPrefix = if (packageBranchSegment == "gamedev") "Play Hub" else "Play Hub [$activeBranchName]"

    // 5 canonical build stages mapped to the 4th segment: debug | dev | test | release | live
    flavorDimensions += "stage"
    productFlavors {
        create("cfgDebug") {
            dimension = "stage"
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            resValue("string", "app_name", "$appLabelPrefix (debug)")
            buildConfigField("String", "BUILD_STAGE", "\"debug\"")
            buildConfigField("boolean", "ALLOW_FARM_SELECTOR", "true")
            buildConfigField("String", "HUB_BASE_URL", "\"${hubBaseUrlProp.ifEmpty { "http://10.0.2.2:18130" }}\"")
        }
        create("cfgDev") {
            dimension = "stage"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "$appLabelPrefix (dev)")
            buildConfigField("String", "BUILD_STAGE", "\"dev\"")
            buildConfigField("boolean", "ALLOW_FARM_SELECTOR", "true")
            buildConfigField("String", "HUB_BASE_URL", "\"${hubBaseUrlProp.ifEmpty { "http://10.0.2.2:18130" }}\"")
        }
        create("cfgTest") {
            dimension = "stage"
            applicationIdSuffix = ".test"
            versionNameSuffix = "-test"
            resValue("string", "app_name", "$appLabelPrefix (test)")
            buildConfigField("String", "BUILD_STAGE", "\"test\"")
            buildConfigField("boolean", "ALLOW_FARM_SELECTOR", "true")
            buildConfigField("String", "HUB_BASE_URL", "\"${hubBaseUrlProp.ifEmpty { "https://test.playhub.example.com" }}\"")
        }
        create("cfgRelease") {
            dimension = "stage"
            applicationIdSuffix = ".release"
            versionNameSuffix = "-release"
            resValue("string", "app_name", "$appLabelPrefix (release)")
            buildConfigField("String", "BUILD_STAGE", "\"release\"")
            buildConfigField("boolean", "ALLOW_FARM_SELECTOR", "false")
            buildConfigField("String", "HUB_BASE_URL", "\"${hubBaseUrlProp.ifEmpty { "https://staging.playhub.example.com" }}\"")
        }
        create("cfgLive") {
            dimension = "stage"
            applicationIdSuffix = ".live"
            versionNameSuffix = ""
            resValue("string", "app_name", "Play Hub")
            buildConfigField("String", "BUILD_STAGE", "\"live\"")
            buildConfigField("boolean", "ALLOW_FARM_SELECTOR", "false")
            buildConfigField("String", "HUB_BASE_URL", "\"${hubBaseUrlProp.ifEmpty { "https://playhub.example.com" }}\"")
        }
    }
}

androidComponents {
    beforeVariants { variant ->
        val flavor = variant.flavorName
        val buildType = variant.buildType
        val allowed = (flavor in setOf("cfgDebug", "cfgDev") && buildType == "debug") ||
            (flavor in setOf("cfgTest", "cfgRelease", "cfgLive") && buildType == "release")
        variant.enable = allowed
    }
}

dependencies {
    // Embedded Godot 4.7.2 template_release runtime ONLY (zero editor/debug symbols)
    implementation(files("libs/godot-lib.template_release.aar"))

    // Minimal transitive AndroidX set required by Godot 4.7.2 AAR
    implementation("androidx.fragment:fragment:1.8.6")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.documentfile:documentfile:1.1.0")

    testImplementation("junit:junit:4.13.2")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    compileSdk = 36
    namespace = "cn.lumi.familyhub"

    defaultConfig {
        applicationId = "cn.lumi.familyhub"
        minSdk = 24
        targetSdk = 36
        versionCode = (System.getenv("FAMILYHUB_ANDROID_VERSION_CODE") ?: "400005").toInt()
        versionName = System.getenv("FAMILYHUB_ANDROID_VERSION_NAME") ?: "0.4.5"
    }

    flavorDimensions += "abi"
    productFlavors {
        create("universal") {
            dimension = "abi"
        }
        create("arm64") {
            dimension = "abi"
            ndk { abiFilters += "arm64-v8a" }
        }
        create("arm") {
            dimension = "abi"
            ndk { abiFilters += "armeabi-v7a" }
        }
        create("x86") {
            dimension = "abi"
            ndk { abiFilters += "x86" }
        }
        create("x86_64") {
            dimension = "abi"
            ndk { abiFilters += "x86_64" }
        }
    }

    buildTypes {
        getByName("debug") {
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
                "proguard-tauri.pro",
                "src/main/java/cn/lumi/familyhub/generated/proguard-wry.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(project(":tauri-android"))
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
}

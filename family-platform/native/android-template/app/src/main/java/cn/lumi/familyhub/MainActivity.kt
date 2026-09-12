package cn.lumi.familyhub

import android.graphics.Color
import android.content.Context
import android.media.AudioManager
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  private var backDispatchInFlight = false
  private var originalWindowBrightness: Float? = null

  private inner class LumiNativeBridge {
    @JavascriptInterface
    fun getMediaVolumePercent(): Int {
      val audio = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return 0
      val maximum = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      if (maximum <= 0) return 0
      return ((audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f) / maximum).toInt().coerceIn(0, 100)
    }

    @JavascriptInterface
    fun setMediaVolumePercent(percent: Int) {
      val audio = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      val maximum = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      if (maximum <= 0) return
      val target = ((percent.coerceIn(0, 100) * maximum) / 100f).toInt().coerceIn(0, maximum)
      runOnUiThread {
        try {
          audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
        } catch (_: SecurityException) {
          // 极少数电视系统会收紧音量权限，避免异常中断播放器手势。
        }
      }
    }

    @JavascriptInterface
    fun getScreenBrightnessPercent(): Int {
      val current = window.attributes.screenBrightness
      if (current >= 0f) return (current * 100f).toInt().coerceIn(1, 100)
      return try {
        val system = android.provider.Settings.System.getInt(
          contentResolver,
          android.provider.Settings.System.SCREEN_BRIGHTNESS,
        )
        (system * 100f / 255f).toInt().coerceIn(1, 100)
      } catch (_: Exception) {
        100
      }
    }

    @JavascriptInterface
    fun setScreenBrightnessPercent(percent: Int) {
      if (originalWindowBrightness == null) originalWindowBrightness = window.attributes.screenBrightness
      runOnUiThread {
        val attributes = window.attributes
        attributes.screenBrightness = percent.coerceIn(1, 100) / 100f
        window.attributes = attributes
      }
    }

    @JavascriptInterface
    fun resetScreenBrightness() {
      val previous = originalWindowBrightness ?: return
      originalWindowBrightness = null
      runOnUiThread {
        val attributes = window.attributes
        attributes.screenBrightness = previous
        window.attributes = attributes
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    window.decorView.setBackgroundColor(Color.rgb(244, 247, 242))
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // 小米 WebView 在资源响应未带字符集时可能错误解码 UTF-8 页面。
    webView.settings.defaultTextEncodingName = "UTF-8"
    webView.addJavascriptInterface(LumiNativeBridge(), "LumiNative")
    val density = webView.resources.displayMetrics.density
    val minimumTopInset = (40 * density).toInt()
    val topGutter = (8 * density).toInt()
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
      val safeArea = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val topInset = maxOf(safeArea.top + topGutter, minimumTopInset)
      val params = view.layoutParams
      if (params is ViewGroup.MarginLayoutParams) {
        params.setMargins(safeArea.left, topInset, safeArea.right, safeArea.bottom)
        view.layoutParams = params
      } else {
        view.setPadding(safeArea.left, topInset, safeArea.right, safeArea.bottom)
      }
      windowInsets
    }
    ViewCompat.requestApplyInsets(webView)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (backDispatchInFlight) return
        backDispatchInFlight = true
        val script = """
          (() => {
            const event = new Event('lumi:native-back', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
          })()
        """.trimIndent()
        webView.evaluateJavascript(script) { result ->
          backDispatchInFlight = false
          if (result == "true") return@evaluateJavascript
          if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
        }
      }
    })
  }
}

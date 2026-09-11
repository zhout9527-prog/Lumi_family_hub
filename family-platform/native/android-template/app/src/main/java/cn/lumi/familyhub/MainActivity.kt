package cn.lumi.familyhub

import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  private var backDispatchInFlight = false

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

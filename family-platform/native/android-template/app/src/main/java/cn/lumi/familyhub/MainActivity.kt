package cn.lumi.familyhub

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // Tauri's Android bridge may omit a charset on embedded asset responses.
    // Xiaomi WebView versions can otherwise decode the UTF-8 shell as mojibake.
    webView.settings.defaultTextEncodingName = "UTF-8"
    val minimumTopInset = (32 * webView.resources.displayMetrics.density).toInt()
    webView.setPadding(webView.paddingLeft, minimumTopInset, webView.paddingRight, webView.paddingBottom)
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
      val safeArea = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      // A few Android 15/16 vendor builds report a zero top inset while the
      // edge-to-edge window is still drawn below the status bar. Keep a small
      // physical top gutter as a fallback so the menu button stays reachable.
      val topInset = maxOf(safeArea.top, minimumTopInset)
      view.setPadding(safeArea.left, topInset, safeArea.right, safeArea.bottom)
      windowInsets
    }
    ViewCompat.requestApplyInsets(webView)
  }
}

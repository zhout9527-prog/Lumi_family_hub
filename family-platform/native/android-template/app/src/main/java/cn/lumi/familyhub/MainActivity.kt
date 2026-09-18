package cn.lumi.familyhub

import android.annotation.SuppressLint
import android.app.Dialog
import android.graphics.Color
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  private var backDispatchInFlight = false
  private var originalWindowBrightness: Float? = null

  private fun densityPixels(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun isAllowedOfficialGamePage(destination: Uri): Boolean {
    val host = destination.host?.lowercase() ?: return false
    return destination.scheme == "https" && (host == "drawastickman.com" || host.endsWith(".drawastickman.com"))
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun showOfficialGame(url: String) {
    val dialog = Dialog(this, android.R.style.Theme_Material_Light_NoActionBar)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
    }
    val toolbar = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = android.view.Gravity.CENTER_VERTICAL
      setPadding(densityPixels(10), densityPixels(6), densityPixels(12), densityPixels(6))
      setBackgroundColor(Color.rgb(35, 44, 45))
    }
    val backButton = Button(this).apply {
      text = "返回 Lumi"
      isAllCaps = false
      setTextColor(Color.rgb(255, 229, 151))
      setBackgroundColor(Color.TRANSPARENT)
    }
    val title = TextView(this).apply {
      text = "画线人冒险 · 官方原版"
      textSize = 16f
      setTextColor(Color.WHITE)
      setPadding(densityPixels(8), 0, 0, 0)
    }
    toolbar.addView(backButton, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      densityPixels(46),
    ))
    toolbar.addView(title, LinearLayout.LayoutParams(
      0,
      LinearLayout.LayoutParams.WRAP_CONTENT,
      1f,
    ))

    val gameView = WebView(this).apply {
      setBackgroundColor(Color.WHITE)
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      settings.mediaPlaybackRequiresUserGesture = true
      settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
      webChromeClient = WebChromeClient()
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          if (isAllowedOfficialGamePage(request.url)) return false
          Toast.makeText(this@MainActivity, "Lumi 已阻止离开官方游戏页面", Toast.LENGTH_SHORT).show()
          return true
        }
      }
    }
    root.addView(toolbar, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ))
    root.addView(gameView, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      0,
      1f,
    ))
    backButton.setOnClickListener { dialog.dismiss() }
    dialog.setOnKeyListener { _, keyCode, event ->
      if (keyCode != KeyEvent.KEYCODE_BACK || event.action != KeyEvent.ACTION_UP) return@setOnKeyListener false
      if (gameView.canGoBack()) gameView.goBack() else dialog.dismiss()
      true
    }
    dialog.setOnDismissListener {
      gameView.stopLoading()
      gameView.removeAllViews()
      gameView.destroy()
    }
    dialog.setContentView(root)
    dialog.show()
    dialog.window?.apply {
      setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
      statusBarColor = Color.rgb(35, 44, 45)
      navigationBarColor = Color.rgb(35, 44, 45)
    }
    gameView.loadUrl(url)
  }

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

    @JavascriptInterface
    fun openExternalUrl(url: String): Boolean {
      val destination = try {
        Uri.parse(url)
      } catch (_: Exception) {
        return false
      }
      if (destination.scheme != "https") return false
      val intent = Intent(Intent.ACTION_VIEW, destination)
      if (intent.resolveActivity(packageManager) == null) return false
      runOnUiThread { startActivity(intent) }
      return true
    }

    @JavascriptInterface
    fun openInAppOfficialPage(url: String): Boolean {
      val destination = try {
        Uri.parse(url)
      } catch (_: Exception) {
        return false
      }
      if (!isAllowedOfficialGamePage(destination)) return false
      runOnUiThread { showOfficialGame(destination.toString()) }
      return true
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

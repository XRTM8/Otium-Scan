package com.otium.scan

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File

class MainActivity : TauriActivity() {
  private var filePickerCallback: ValueCallback<Array<Uri>>? = null
  private var pendingPermissionRequest: PermissionRequest? = null
  private var activeWebView: WebView? = null

  companion object {
    private const val CAMERA_PERMISSION_REQUEST_CODE = 1001
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Match status & navigation bars with Otium Obsidian (#07090E) with light icons
    window.statusBarColor = Color.parseColor("#07090e")
    window.navigationBarColor = Color.parseColor("#07090e")
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false

    // Hardware Back Button dispatcher for seamless webview navigation
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val wv = activeWebView
        if (wv != null) {
          wv.evaluateJavascript(
            """
            (function() {
              const event = new CustomEvent('otium:back', { cancelable: true });
              window.dispatchEvent(event);
              return event.defaultPrevented;
            })();
            """.trimIndent()
          ) { preventedStr ->
            runOnUiThread {
              val isPrevented = preventedStr?.trim('"', ' ') == "true"
              if (!isPrevented) {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
              }
            }
          }
        } else {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      }
    })

    ensureCameraPermissions()
  }

  private fun ensureCameraPermissions() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
        this,
        arrayOf(Manifest.permission.CAMERA),
        CAMERA_PERMISSION_REQUEST_CODE
      )
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
      if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
        pendingPermissionRequest?.let {
          it.grant(it.resources)
          pendingPermissionRequest = null
        }
      } else {
        pendingPermissionRequest?.let {
          it.deny()
          pendingPermissionRequest = null
        }
      }
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    activeWebView = webView

    // Hardware acceleration & performance settings for smooth camera and rendering
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    webView.settings.apply {
      domStorageEnabled = true
      databaseEnabled = true
      allowFileAccess = true
      mediaPlaybackRequiresUserGesture = false
    }

    // Register Otium Native Bridge for sharing, saving, and reader handoff
    webView.addJavascriptInterface(OtiumNativeBridge(), "OtiumNative")

    val originalChromeClient = webView.webChromeClient

    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest) {
        runOnUiThread {
          if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(request.resources)
          } else {
            pendingPermissionRequest = request
            ActivityCompat.requestPermissions(
              this@MainActivity,
              arrayOf(Manifest.permission.CAMERA),
              CAMERA_PERMISSION_REQUEST_CODE
            )
          }
        }
      }

      override fun onPermissionRequestCanceled(request: PermissionRequest) {
        if (pendingPermissionRequest == request) {
          pendingPermissionRequest = null
        }
      }

      override fun onShowFileChooser(
        view: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
      ): Boolean {
        this@MainActivity.filePickerCallback?.onReceiveValue(null)
        this@MainActivity.filePickerCallback = filePathCallback

        val galleryIntent = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI).apply {
          type = "image/*"
        }

        val fallbackIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
          type = "image/*"
          addCategory(Intent.CATEGORY_OPENABLE)
        }

        val chooser = Intent.createChooser(galleryIntent, "اختر من المعرض / Select from Gallery").apply {
          putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(fallbackIntent))
        }

        try {
          launchActivityForResult(chooser) { result: ActivityResult? ->
            val uris: Array<Uri>? = if (result?.resultCode == Activity.RESULT_OK && result.data != null) {
              val dataUri = result.data?.data
              val clip = result.data?.clipData
              if (clip != null && clip.itemCount > 0) {
                Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
              } else if (dataUri != null) {
                arrayOf(dataUri)
              } else {
                null
              }
            } else {
              null
            }
            this@MainActivity.filePickerCallback?.onReceiveValue(uris)
            this@MainActivity.filePickerCallback = null
          }
          return true
        } catch (e: Exception) {
          this@MainActivity.filePickerCallback?.onReceiveValue(null)
          this@MainActivity.filePickerCallback = null
          return if (originalChromeClient != null) {
            originalChromeClient.onShowFileChooser(view, filePathCallback, fileChooserParams)
          } else {
            false
          }
        }
      }
    }
  }

  inner class OtiumNativeBridge {
    /**
     * Native Android Share Sheet for PDF and image files
     */
    @JavascriptInterface
    fun sharePdf(base64Data: String, filename: String) {
      shareFile(base64Data, filename, "application/pdf")
    }

    @JavascriptInterface
    fun shareFile(base64Data: String, filename: String, mimeType: String) {
      runOnUiThread {
        try {
          val cleanBase64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
          val bytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)
          val file = File(cacheDir, filename)
          file.writeBytes(bytes)

          val uri = FileProvider.getUriForFile(
            this@MainActivity,
            "${applicationContext.packageName}.fileprovider",
            file
          )

          val resolvedMime = when {
            filename.endsWith(".jpg", true) || filename.endsWith(".jpeg", true) -> "image/jpeg"
            filename.endsWith(".png", true) -> "image/png"
            filename.endsWith(".pdf", true) -> "application/pdf"
            mimeType.isNotEmpty() -> mimeType
            else -> "*/*"
          }

          val intent = Intent(Intent.ACTION_SEND).apply {
            type = resolvedMime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, filename)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }

          startActivity(Intent.createChooser(intent, "مشاركة / Share"))
        } catch (e: Exception) {
          Toast.makeText(this@MainActivity, "خطأ في مشاركة الملف: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

    /**
     * Saves PDF or image files directly to Android Downloads/Pictures folder
     */
    @JavascriptInterface
    fun savePdfToDownloads(base64Data: String, filename: String): Boolean {
      return saveFileToDownloads(base64Data, filename, "application/pdf")
    }

    @JavascriptInterface
    fun saveFileToDownloads(base64Data: String, filename: String, mimeType: String): Boolean {
      try {
        val cleanBase64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
        val bytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)

        val isImage = filename.endsWith(".jpg", true) || filename.endsWith(".jpeg", true) || filename.endsWith(".png", true)
        val resolvedMime = when {
          filename.endsWith(".jpg", true) || filename.endsWith(".jpeg", true) -> "image/jpeg"
          filename.endsWith(".png", true) -> "image/png"
          filename.endsWith(".pdf", true) -> "application/pdf"
          mimeType.isNotEmpty() -> mimeType
          else -> "application/octet-stream"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val collection = if (isImage) MediaStore.Images.Media.EXTERNAL_CONTENT_URI else MediaStore.Downloads.EXTERNAL_CONTENT_URI
          val relPath = if (isImage) Environment.DIRECTORY_PICTURES + "/OtiumScan" else Environment.DIRECTORY_DOWNLOADS
          val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(MediaStore.MediaColumns.MIME_TYPE, resolvedMime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relPath)
          }
          val resolver = contentResolver
          val uri = resolver.insert(collection, values)
          if (uri != null) {
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
            runOnUiThread {
              val loc = if (isImage) "معرض الصور (Pictures/OtiumScan)" else "مجلد التنزيلات"
              Toast.makeText(this@MainActivity, "✓ تم حفظ $filename في $loc", Toast.LENGTH_LONG).show()
            }
            return true
          }
        } else {
          val baseDir = if (isImage) {
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "OtiumScan")
          } else {
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          }
          baseDir.mkdirs()
          val file = File(baseDir, filename)
          file.writeBytes(bytes)
          runOnUiThread {
            Toast.makeText(this@MainActivity, "✓ تم حفظ $filename بنجاح", Toast.LENGTH_LONG).show()
          }
          return true
        }
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(this@MainActivity, "خطأ في حفظ الملف: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
      return false
    }

    /**
     * Opens PDF document in Otium Reader (or system PDF viewer chooser if Otium Reader is not installed)
     */
    @JavascriptInterface
    fun openInOtiumReader(base64Data: String, filename: String) {
      runOnUiThread {
        try {
          val cleanBase64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
          val bytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)
          val file = File(cacheDir, filename)
          file.writeBytes(bytes)

          val uri = FileProvider.getUriForFile(
            this@MainActivity,
            "${applicationContext.packageName}.fileprovider",
            file
          )

          val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            setPackage("com.otium.reader")
          }

          try {
            startActivity(intent)
          } catch (e: Exception) {
            // Otium Reader not installed -> open standard PDF viewer chooser
            intent.setPackage(null)
            startActivity(Intent.createChooser(intent, "فتح مستند PDF بواسطة"))
          }
        } catch (e: Exception) {
          Toast.makeText(this@MainActivity, "خطأ في فتح الملف: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

    /**
     * Native HTTP GET to bypass webview CSP/CORS restrictions for GitHub releases
     */
    @JavascriptInterface
    fun fetchUrl(urlStr: String): String {
      return try {
        val url = java.net.URL(urlStr)
        val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
          requestMethod = "GET"
          setRequestProperty("User-Agent", "Otium-Scan-Android")
          setRequestProperty("Accept", "application/vnd.github.v3+json")
          connectTimeout = 10000
          readTimeout = 10000
        }
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        stream.bufferedReader().use { it.readText() }
      } catch (e: Exception) {
        "ERROR:" + (e.message ?: "Network error")
      }
    }

    /**
     * Downloads an APK file directly using Android DownloadManager and launches package installer
     */
    @JavascriptInterface
    fun downloadAndInstallApk(apkUrl: String, filename: String) {
      runOnUiThread {
        try {
          val cleanFilename = if (filename.endsWith(".apk")) filename else "$filename.apk"
          val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
          val request = DownloadManager.Request(Uri.parse(apkUrl)).apply {
            setTitle("تحديث Otium Scan")
            setDescription("جاري تنزيل $cleanFilename وتجهيز التثبيت...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, cleanFilename)
            setMimeType("application/vnd.android.package-archive")
          }

          Toast.makeText(this@MainActivity, "جاري تنزيل التحديث في الخلفية...", Toast.LENGTH_LONG).show()
          val downloadId = dm.enqueue(request)

          // Register BroadcastReceiver for download completion
          val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
              val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) ?: -1L
              if (id == downloadId) {
                try {
                  unregisterReceiver(this)
                } catch (_: Exception) {}

                val file = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), cleanFilename)
                if (file.exists()) {
                  val contentUri = FileProvider.getUriForFile(
                    this@MainActivity,
                    "${applicationContext.packageName}.fileprovider",
                    file
                  )
                  val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                  }
                  try {
                    startActivity(installIntent)
                  } catch (_: Exception) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
                      val permIntent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${applicationContext.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                      }
                      startActivity(permIntent)
                      Toast.makeText(this@MainActivity, "يرجى تفعيل خيار التثبيت من هذا المصدر لإتمام التحديث", Toast.LENGTH_LONG).show()
                    } else {
                      Toast.makeText(this@MainActivity, "يرجى فتح مجلد التنزيلات لتثبيت $cleanFilename", Toast.LENGTH_LONG).show()
                    }
                  }
                }
              }
            }
          }

          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED)
          } else {
            registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
          }
        } catch (e: Exception) {
          openExternalUrl(apkUrl)
        }
      }
    }

    /**
     * Opens an external URL or APK download link in the system browser
     */
    @JavascriptInterface
    fun openExternalUrl(url: String) {
      runOnUiThread {
        try {
          val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          startActivity(intent)
        } catch (e: Exception) {
          Toast.makeText(this@MainActivity, "تعذر فتح الرابط: ${e.message}", Toast.LENGTH_SHORT).show()
        }
      }
    }
  }
}

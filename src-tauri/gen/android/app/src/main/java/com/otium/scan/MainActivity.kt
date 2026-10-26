package com.otium.scan

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Intent
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
     * Native Android Share Sheet for PDF files
     */
    @JavascriptInterface
    fun sharePdf(base64Data: String, filename: String) {
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

          val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, filename)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }

          startActivity(Intent.createChooser(intent, "مشاركة المستند / Share Document"))
        } catch (e: Exception) {
          Toast.makeText(this@MainActivity, "خطأ في مشاركة الملف: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

    /**
     * Saves PDF file directly to Android Downloads folder and shows notification
     */
    @JavascriptInterface
    fun savePdfToDownloads(base64Data: String, filename: String): Boolean {
      try {
        val cleanBase64 = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
        val bytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
          }
          val resolver = contentResolver
          val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          if (uri != null) {
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
            runOnUiThread {
              Toast.makeText(this@MainActivity, "✓ تم حفظ $filename في مجلد التنزيلات", Toast.LENGTH_LONG).show()
            }
            return true
          }
        } else {
          val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          val file = File(downloadsDir, filename)
          file.writeBytes(bytes)
          runOnUiThread {
            Toast.makeText(this@MainActivity, "✓ تم حفظ $filename في مجلد التنزيلات", Toast.LENGTH_LONG).show()
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
  }
}

package com.otium.scan

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResult

class MainActivity : TauriActivity() {
  private var filePickerCallback: ValueCallback<Array<Uri>>? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    val originalChromeClient = webView.webChromeClient

    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest) {
        if (originalChromeClient != null) {
          originalChromeClient.onPermissionRequest(request)
        } else {
          super.onPermissionRequest(request)
        }
      }

      override fun onPermissionRequestCanceled(request: PermissionRequest) {
        if (originalChromeClient != null) {
          originalChromeClient.onPermissionRequestCanceled(request)
        } else {
          super.onPermissionRequestCanceled(request)
        }
      }

      override fun onShowFileChooser(
        view: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
      ): Boolean {
        this@MainActivity.filePickerCallback?.onReceiveValue(null)
        this@MainActivity.filePickerCallback = filePathCallback

        // Intent.ACTION_PICK directly opens the OEM Gallery/Studio app
        val galleryIntent = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI).apply {
          type = "image/*"
        }

        // Generic fallback intent to choose from other providers
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
}

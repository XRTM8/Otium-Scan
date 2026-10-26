package com.otium.scan

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  private var filePickerCallback: ValueCallback<Array<Uri>>? = null
  private var pendingPermissionRequest: PermissionRequest? = null

  companion object {
    private const val CAMERA_PERMISSION_REQUEST_CODE = 1001
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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

    val originalChromeClient = webView.webChromeClient

    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest) {
        runOnUiThread {
          // If the web application requests camera access, grant immediately if OS permission is granted
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

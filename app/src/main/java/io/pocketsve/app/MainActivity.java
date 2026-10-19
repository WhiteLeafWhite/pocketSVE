package io.pocketsve.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.TagLostException;
import android.nfc.tech.Ndef;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Offline application shell. NFC transactions are restricted to reads and authentication. */
public final class MainActivity extends Activity implements NfcAdapter.ReaderCallback {
    private static final String ENTRY = "file:///android_asset/index.html";
    private WebView webView;
    private NfcAdapter nfcAdapter;
    private volatile boolean resumed;
    private volatile boolean scanRequested;
    private volatile boolean readerEnabled;
    private volatile boolean pageReady;
    private volatile long scanSession;
    private String lastTagId = "";
    private long lastTagTime;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 26, 30));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // NFC completion and animation callbacks occur after the initiating tap.
        // Playback remains confined to bundled local media by the request policy.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !ENTRY.equals(request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !ENTRY.equals(url);
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if ("file".equals(uri.getScheme()) && path != null && path.startsWith("/android_asset/")
                        && !path.contains("/../") && !path.contains("/./") && !path.contains("\\")) return null;
                // Inline data assets are harmless and do not access another application or network.
                if ("data".equals(uri.getScheme())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", null,
                        new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = ENTRY.equals(url);
                if (pageReady) publishStatus();
            }
        });
        webView.addJavascriptInterface(new PocketNfcBridge(), "PocketNfc");
        setContentView(webView);
        nfcAdapter = NfcAdapter.getDefaultAdapter(this);
        webView.loadUrl(ENTRY);
        applyImmersiveMode();
    }

    private void applyImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (webView != null) webView.onResume();
        updateReaderMode();
    }

    @Override protected void onPause() {
        resumed = false;
        scanSession++;
        disableReaderMode();
        publishStatus();
        if (webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('pocket:pause'));", null);
            webView.onPause();
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        pageReady = false;
        disableReaderMode();
        if (webView != null) {
            webView.removeJavascriptInterface("PocketNfc");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (webView == null || !pageReady) { finish(); return; }
        webView.evaluateJavascript("(function(){return !window.dispatchEvent(new CustomEvent('pocket:back',{cancelable:true}));})()",
                handled -> { if (!"true".equals(handled)) finish(); });
    }

    private void updateReaderMode() {
        if (!scanRequested || !resumed || nfcAdapter == null || !nfcAdapter.isEnabled()) {
            disableReaderMode();
            publishStatus();
            return;
        }
        try {
            Bundle options = new Bundle();
            options.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
            int flags = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
                    | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V
                    | NfcAdapter.FLAG_READER_NFC_BARCODE | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS;
            // Keep the NDEF check: skip-NDEF would prevent cached NDEF reads.
            nfcAdapter.enableReaderMode(this, this, flags, options);
            readerEnabled = true;
            publishStatus();
        } catch (RuntimeException error) {
            readerEnabled = false;
            publishError("reader_failed", "无法启动 NFC 扫描：" + readable(error));
            publishStatus();
        }
    }

    private void disableReaderMode() {
        if (readerEnabled && nfcAdapter != null) {
            try { nfcAdapter.disableReaderMode(this); } catch (RuntimeException ignored) { }
        }
        readerEnabled = false;
    }

    private JSONObject status() {
        JSONObject result = new JSONObject();
        boolean available = nfcAdapter != null;
        boolean enabled = available && nfcAdapter.isEnabled();
        String state = !available ? "unavailable" : !enabled ? "disabled" : readerEnabled ? "scanning"
                : scanRequested && !resumed ? "paused" : "ready";
        String message = !available ? "此设备没有 NFC，可使用手动卡牌选择"
                : !enabled ? "NFC 尚未开启" : readerEnabled ? "请将卡牌贴近手机 NFC 区域"
                : scanRequested && !resumed ? "返回应用后继续扫描" : "NFC 已就绪";
        try {
            result.put("available", available).put("enabled", enabled).put("scanning", readerEnabled)
                    .put("requested", scanRequested).put("state", state).put("message", message);
        } catch (JSONException ignored) { }
        return result;
    }

    private void publishStatus() { dispatch("pocket:nfc-status", status()); }

    private void publishError(String code, String message) {
        JSONObject error = new JSONObject();
        try { error.put("code", code).put("message", message); } catch (JSONException ignored) { }
        dispatch("pocket:nfc-error", error);
    }

    private void dispatch(String event, JSONObject detail) {
        final String source = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(event)
                + ",{detail:" + detail.toString() + "}));";
        runOnUiThread(() -> {
            if (webView != null && pageReady) webView.evaluateJavascript(source, null);
        });
    }

    @Override public void onTagDiscovered(Tag tag) {
        if (!scanRequested || !resumed) return;
        final long session = scanSession;
        final String id = hex(tag.getId());
        long now = android.os.SystemClock.elapsedRealtime();
        synchronized (this) {
            if (id.equals(lastTagId) && now - lastTagTime < 1200) return;
            lastTagId = id;
            lastTagTime = now;
        }
        JSONObject result = new JSONObject();
        try {
            result.put("id", id).put("techTypes", new JSONArray(tag.getTechList()));
            JSONArray records = new JSONArray();
            Ndef ndef = Ndef.get(tag);
            if (ndef != null) {
                try {
                    NdefMessage message = ndef.getCachedNdefMessage();
                    if (message == null) {
                        ndef.connect();
                        message = ndef.getNdefMessage();
                    }
                    if (message != null) for (NdefRecord record : message.getRecords()) {
                        JSONObject entry = new JSONObject();
                        entry.put("tnf", record.getTnf()).put("type", unsigned(record.getType()))
                                .put("id", unsigned(record.getId())).put("payload", unsigned(record.getPayload()));
                        records.put(entry);
                    }
                } catch (TagLostException error) { throw error; }
                catch (IOException unavailable) { result.put("ndefError", "此标签的 NDEF 记录不可读"); }
                finally { try { ndef.close(); } catch (IOException ignored) { } }
            }
            result.put("ndefMessage", records);
            if (!scanRequested || !resumed || session != scanSession) return;
            OriginalCardReader.enrich(this, tag, result);
            if (!scanRequested || !resumed || session != scanSession) return;
            dispatch("pocket:nfc", result);
        } catch (TagLostException error) {
            if (scanRequested && resumed && session == scanSession)
                publishError("tag_lost", "卡牌移开过快，请贴近手机后重试");
        } catch (Exception error) {
            if (scanRequested && resumed && session == scanSession)
                publishError("read_failed", "读取失败：" + readable(error));
        }
    }

    private static JSONArray unsigned(byte[] bytes) {
        JSONArray result = new JSONArray();
        if (bytes != null) for (byte value : bytes) result.put(value & 255);
        return result;
    }

    static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        if (bytes != null) for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02X", value & 255));
        return result.toString();
    }

    private static String readable(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private void vibrateNow() {
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(55, VibrationEffect.DEFAULT_AMPLITUDE));
        else vibrator.vibrate(55);
    }

    public final class PocketNfcBridge {
        @JavascriptInterface public String getStatus() { return status().toString(); }
        @JavascriptInterface public void startScan() {
            runOnUiThread(() -> {
                scanSession++;
                scanRequested = true;
                lastTagId = "";
                lastTagTime = 0;
                updateReaderMode();
                if (nfcAdapter == null) publishError("unavailable", "此设备没有 NFC，可使用手动卡牌选择");
                else if (!nfcAdapter.isEnabled()) publishError("disabled", "请先在系统设置中开启 NFC");
            });
        }
        @JavascriptInterface public void stopScan() {
            runOnUiThread(() -> { scanSession++; scanRequested = false; disableReaderMode(); publishStatus(); });
        }
        @JavascriptInterface public void openSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_NFC_SETTINGS)); }
                catch (ActivityNotFoundException error) {
                    try { startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS)); }
                    catch (ActivityNotFoundException unavailable) { publishError("settings_unavailable", "无法打开 NFC 设置"); }
                }
            });
        }
        @JavascriptInterface public void vibrate() { runOnUiThread(MainActivity.this::vibrateNow); }
    }
}

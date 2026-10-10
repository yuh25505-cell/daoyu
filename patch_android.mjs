import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');
const appDir = path.join(androidDir, 'app');
const srcDir = path.join(appDir, 'src', 'main', 'java');
const manifestPath = path.join(appDir, 'src', 'main', 'AndroidManifest.xml');
const capacitorConfigPath = path.join(root, 'capacitor.config.json');

if (!fs.existsSync(androidDir) || !fs.existsSync(manifestPath)) {
  throw new Error('Android project was not generated; expected android/ and AndroidManifest.xml');
}

const capacitorConfig = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));
const appId = String(capacitorConfig.appId || 'com.daoyu.islandworldbook');
const appName = String(capacitorConfig.appName || '岛屿');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '1.50.0';

function packagePath(id) {
  return id.split('.').join(path.sep);
}

const mainPackageDir = path.join(srcDir, packagePath(appId));
fs.mkdirSync(mainPackageDir, { recursive: true });

const pluginJava = `package ${appId};

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(
    name = "IslandNative",
    permissions = @Permission(
        strings = { Manifest.permission.POST_NOTIFICATIONS },
        alias = IslandNativePlugin.NOTIFICATIONS
    )
)
public class IslandNativePlugin extends Plugin {
    static final String NOTIFICATIONS = "notifications";
    static final String CHANNEL_ID = "island_messages";
    static final String CHANNEL_NAME = "${appName}消息";
    static final int CHANNEL_IMPORTANCE = NotificationManager.IMPORTANCE_HIGH;
    static final String SAVE_FOLDER = "${appName}";

    private static class SaveSession {
        OutputStream out;
        Uri uri;
        File file;
        String path;
    }

    private final Map<String, SaveSession> saveSessions = new HashMap<>();

    @Override
    public void load() {
        super.load();
        ensureNotificationChannel();
    }

    @PluginMethod
    public void getNotificationPermissionState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", getNotificationState());
        call.resolve(result);
    }

    @PluginMethod
    public void areNotificationsEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", isNotificationEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("state", isNotificationEnabled() ? "granted" : "denied");
            call.resolve(result);
            return;
        }

        if (getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("state", isNotificationEnabled() ? "granted" : "denied");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias(NOTIFICATIONS, call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", getNotificationState());
        call.resolve(result);
    }

    @PluginMethod
    public void showWebNotification(PluginCall call) {
        String title = safeText(call.getString("title", "${appName}"), "${appName}");
        String body = safeText(call.getString("body", ""), "");
        String tag = safeText(call.getString("tag", "island-message"), "island-message");
        String url = call.getString("url", "");

        if (!isNotificationEnabled()) {
            call.resolve(result(false, getNotificationState()));
            return;
        }

        ensureNotificationChannel();

        Intent intent = new Intent(getActivity(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (isSafeDeepLink(url)) {
            intent.putExtra(MainActivity.EXTRA_DEEP_LINK, url);
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            getActivity(),
            Math.abs(tag.hashCode()),
            intent,
            pendingFlags
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(getActivity(), CHANNEL_ID);
        } else {
            builder = new Notification.Builder(getActivity())
                .setPriority(Notification.PRIORITY_HIGH);
        }

        builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setDefaults(Notification.DEFAULT_ALL);

        NotificationManager manager = (NotificationManager) getActivity()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.resolve(result(false, getNotificationState()));
            return;
        }

        int id = (int) (System.currentTimeMillis() & 0x7fffffff);
        manager.notify(tag, id, builder.build());
        call.resolve(result(true, getNotificationState()));
    }

    /**
     * 前端取走最近一次通知点击携带的链接（取走即清空）。
     * 点击通知不再重新加载页面，而是由前端读到链接后直接切到对应聊天。
     */
    @PluginMethod
    public void consumeDeepLink(PluginCall call) {
        JSObject result = new JSObject();
        String url = MainActivity.pendingDeepLink;
        MainActivity.pendingDeepLink = null;
        result.put("url", url == null ? "" : url);
        call.resolve(result);
    }

    // ---- Save exported files (backups) into the phone's Download/${appName} folder ----

    @PluginMethod
    public void beginSaveFile(PluginCall call) {
        String name = safeFileName(call.getString("filename", "island-file"));
        String mime = call.getString("mimeType", "application/octet-stream");
        try {
            SaveSession session = new SaveSession();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + SAVE_FOLDER);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("无法在下载目录创建文件");
                    return;
                }
                session.uri = uri;
                session.out = resolver.openOutputStream(uri);
            } else {
                File dir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    SAVE_FOLDER
                );
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("无法创建下载目录（可能缺少存储权限）");
                    return;
                }
                File file = new File(dir, name);
                int dot = name.lastIndexOf('.');
                String base = dot > 0 ? name.substring(0, dot) : name;
                String ext = dot > 0 ? name.substring(dot) : "";
                int n = 1;
                while (file.exists()) {
                    file = new File(dir, base + "(" + n + ")" + ext);
                    n++;
                }
                session.file = file;
                session.out = new FileOutputStream(file);
            }
            if (session.out == null) {
                call.reject("无法写入文件");
                return;
            }
            session.path = "下载/" + SAVE_FOLDER + "/" + name;
            String id = UUID.randomUUID().toString();
            saveSessions.put(id, session);
            JSObject result = new JSObject();
            result.put("id", id);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("创建文件失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void writeSaveFileChunk(PluginCall call) {
        String id = call.getString("id", "");
        SaveSession session = saveSessions.get(id);
        if (session == null) {
            call.reject("保存会话不存在");
            return;
        }
        try {
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            session.out.write(bytes);
            call.resolve();
        } catch (Exception e) {
            discardSession(id);
            call.reject("写入文件失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void finishSaveFile(PluginCall call) {
        String id = call.getString("id", "");
        SaveSession session = saveSessions.remove(id);
        if (session == null) {
            call.reject("保存会话不存在");
            return;
        }
        try {
            session.out.flush();
            session.out.close();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(session.uri, values, null, null);
            } else if (session.file != null) {
                MediaScannerConnection.scanFile(
                    getContext(),
                    new String[] { session.file.getAbsolutePath() },
                    null,
                    null
                );
            }
            JSObject result = new JSObject();
            result.put("path", session.path);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("保存文件失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void abortSaveFile(PluginCall call) {
        discardSession(call.getString("id", ""));
        call.resolve();
    }

    private void discardSession(String id) {
        SaveSession session = saveSessions.remove(id);
        if (session == null) return;
        try {
            if (session.out != null) session.out.close();
        } catch (Exception ignored) {
        }
        try {
            if (session.uri != null) {
                getContext().getContentResolver().delete(session.uri, null, null);
            } else if (session.file != null) {
                session.file.delete();
            }
        } catch (Exception ignored) {
        }
    }

    private String safeFileName(String raw) {
        String name = raw == null ? "" : raw.trim();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c == '/' || c == 0x5C || c == ':' || c == '*' || c == '?' || c == 0x22 ||
                c == '<' || c == '>' || c == '|' || c < 32) {
                sb.append('_');
            } else {
                sb.append(c);
            }
        }
        String out = sb.toString();
        return out.isEmpty() ? "island-file" : out;
    }

    private JSObject result(boolean shown, String state) {
        JSObject result = new JSObject();
        result.put("shown", shown);
        result.put("state", state);
        return result;
    }

    private String safeText(String value, String fallback) {
        if (value == null) return fallback;
        String text = value.trim();
        return text.isEmpty() ? fallback : text;
    }

    private boolean isNotificationEnabled() {
        NotificationManager manager = (NotificationManager) getActivity()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(
                getActivity(),
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        return Build.VERSION.SDK_INT < Build.VERSION_CODES.N || manager.areNotificationsEnabled();
    }

    private String getNotificationState() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState state = getPermissionState(NOTIFICATIONS);
            if (state == PermissionState.GRANTED) {
                return isNotificationEnabled() ? "granted" : "denied";
            }
            if (state == PermissionState.DENIED) return "denied";
            return "default";
        }
        return isNotificationEnabled() ? "granted" : "denied";
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getActivity()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            CHANNEL_IMPORTANCE
        );
        channel.setDescription("${appName}角色主动消息");
        channel.enableVibration(true);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    private boolean isSafeDeepLink(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                "localhost".equalsIgnoreCase(uri.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }
}
`;

const mainActivityJava = `package ${appId};

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_DEEP_LINK = "island_deep_link";

    /**
     * 最近一次通知点击带来的链接。
     * 点击通知时不能再用 webView.loadUrl() 重载页面（会让正在运行的岛屿整页刷新、
     * 打断正在进行的聊天 / AI 请求）；改为先存放在这里，再通知前端调用
     * IslandNative.consumeDeepLink() 取走，由前端直接切换到对应聊天。
     */
    public static volatile String pendingDeepLink = null;

    @Override
    public void load() {
        registerPlugin(IslandNativePlugin.class);
        super.load();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 冷启动：被通知拉起时把链接放进待处理，页面加载完成后由前端取走。
        // savedInstanceState != null 只是系统重建（如旋转），不应重复打开。
        if (savedInstanceState == null) rememberDeepLink(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (rememberDeepLink(intent)) notifyWebDeepLink();
    }

    private boolean rememberDeepLink(Intent intent) {
        if (intent == null) return false;

        String url = intent.getStringExtra(EXTRA_DEEP_LINK);
        if (url == null || url.isEmpty()) return false;

        try {
            android.net.Uri uri = android.net.Uri.parse(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) ||
                !"localhost".equalsIgnoreCase(uri.getHost())) {
                return false;
            }
        } catch (Exception ignored) {
            return false;
        }

        pendingDeepLink = url;
        intent.removeExtra(EXTRA_DEEP_LINK);
        return true;
    }

    private void notifyWebDeepLink() {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
            "try{window.dispatchEvent(new Event('island-native-deeplink'));}catch(e){}", null));
    }
}
`;

fs.writeFileSync(path.join(mainPackageDir, 'IslandNativePlugin.java'), pluginJava, 'utf8');
fs.writeFileSync(path.join(mainPackageDir, 'MainActivity.java'), mainActivityJava, 'utf8');

let manifest = fs.readFileSync(manifestPath, 'utf8');
const requiredPermissions = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
];
for (const permission of requiredPermissions) {
  if (!manifest.includes(`android:name="${permission}"`)) {
    manifest = manifest.replace(
      /(<manifest\b[^>]*>)/,
      `$1\n    <uses-permission android:name="${permission}" />`
    );
  }
}
// Saving files to Download/ needs no permission on Android 10+; only Android 9 and below do.
if (!manifest.includes('android.permission.WRITE_EXTERNAL_STORAGE')) {
  manifest = manifest.replace(
    /(<manifest\b[^>]*>)/,
    `$1\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />`
  );
}
// Microphone is optional hardware so the APK still installs on devices without one.
if (!manifest.includes('android.hardware.microphone')) {
  manifest = manifest.replace(
    /(<manifest\b[^>]*>)/,
    `$1\n    <uses-feature android:name="android.hardware.microphone" android:required="false" />`
  );
}
manifest = manifest.replace(
  /(<activity\b[^>]*android:name="\.MainActivity"[^>]*)(>)/,
  (full, prefix, end) => prefix.includes('android:launchMode=')
    ? full
    : `${prefix} android:launchMode="singleTop"${end}`
);
fs.writeFileSync(manifestPath, manifest, 'utf8');

const gradlePath = path.join(appDir, 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const runNumber = Number.parseInt(process.env.GITHUB_RUN_NUMBER || '', 10);
let versionCode;
if (Number.isFinite(runNumber) && runNumber > 0) {
  versionCode = 100000 + runNumber;
} else {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  versionCode = match
    ? Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3])
    : 100000;
}
gradle = gradle.replace(/versionCode\s+\d+/g, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+["'][^"']*["']/g, `versionName "${version}"`);
if (!gradle.includes(`versionCode ${versionCode}`)) {
  throw new Error('Could not update Android versionCode');
}
if (!gradle.includes(`versionName "${version}"`)) {
  throw new Error('Could not update Android versionName');
}
fs.writeFileSync(gradlePath, gradle, 'utf8');

// Adjust the packaged index.html (www/) for the APK:
//  1. remove the leftover "CapDiag" startup toast script,
//  2. load api-backup.js (export / import of API settings) after app.js,
//  3. inline native-shim.js before </body> so it runs before the deferred app.js
//     (Capacitor.registerPlugin shim + saving backups into Download/岛屿).
const wwwIndexPath = path.join(root, 'www', 'index.html');
const shimSourcePath = path.join(root, 'native-shim.js');
if (fs.existsSync(wwwIndexPath)) {
  let html = fs.readFileSync(wwwIndexPath, 'utf8');

  html = html.replace(/<script>\s*\(function\(\)\{\s*function showDiag\(\)[\s\S]*?<\/script>\s*/, '');

  if (!html.includes('api-backup.js') && fs.existsSync(path.join(root, 'api-backup.js'))) {
    const appTag = '<script defer="" src="./app.js"></script>';
    const apiBackupTag = '<script defer="" src="./api-backup.js"></script>';
    html = html.includes(appTag)
      ? html.replace(appTag, appTag + '\n' + apiBackupTag)
      : html.replace('</body>', apiBackupTag + '\n</body>');
  }

  if (!html.includes('id="island-cap-shim"') && fs.existsSync(shimSourcePath)) {
    const shimScript = '<script id="island-cap-shim">\n' + fs.readFileSync(shimSourcePath, 'utf8') + '\n</script>\n';
    html = html.replace('</body>', shimScript + '</body>');
  }

  fs.writeFileSync(wwwIndexPath, html, 'utf8');
}

console.log(`Applied Android native integrations for ${appId} (${version}, versionCode ${versionCode}).`);

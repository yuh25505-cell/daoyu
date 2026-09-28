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
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_DEEP_LINK = "island_deep_link";

    @Override
    public void load() {
        registerPlugin(IslandNativePlugin.class);
        super.load();
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openDeepLink(intent);
    }

    private void openDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;

        String url = intent.getStringExtra(EXTRA_DEEP_LINK);
        if (url == null || url.isEmpty()) return;

        try {
            android.net.Uri uri = android.net.Uri.parse(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) ||
                !"localhost".equalsIgnoreCase(uri.getHost())) {
                return;
            }
        } catch (Exception ignored) {
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.postDelayed(() -> webView.loadUrl(url), 120);
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
];
for (const permission of requiredPermissions) {
  if (!manifest.includes(`android:name="${permission}"`)) {
    manifest = manifest.replace(
      /(<manifest\b[^>]*>)/,
      `$1\n    <uses-permission android:name="${permission}" />`
    );
  }
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

// Inject small inline scripts into the packaged index.html (before </body>, so they run
// before the deferred app.js): the Capacitor registerPlugin shim first, then a TEMPORARY
// on-screen diagnostic that reports whether the IslandNative plugin is reachable.
const wwwIndexPath = path.join(root, 'www', 'index.html');
if (fs.existsSync(wwwIndexPath)) {
  let html = fs.readFileSync(wwwIndexPath, 'utf8');
  const injections = [
    { id: 'island-cap-shim', file: 'native-shim.js' },
    { id: 'island-cap-diag', file: 'native-diag.js' },
  ];
  let injected = '';
  for (const item of injections) {
    const filePath = path.join(root, item.file);
    if (!fs.existsSync(filePath) || html.includes(`id="${item.id}"`)) continue;
    injected += `<script id="${item.id}">\n${fs.readFileSync(filePath, 'utf8')}\n</script>\n`;
  }
  if (injected) {
    html = html.replace('</body>', injected + '</body>');
    fs.writeFileSync(wwwIndexPath, html, 'utf8');
  }
}

console.log(`Applied Android native integrations for ${appId} (${version}, versionCode ${versionCode}).`);

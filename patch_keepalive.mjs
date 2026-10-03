// Adds the Android background keep-alive foreground service to the generated Capacitor project.
// Runs after patch_android.mjs (which generates IslandNativePlugin.java and edits the manifest).
//  - KeepAliveService : foreground service (mediaPlayback) + silent looping AudioTrack + partial wake lock
//  - IslandNativePlugin: startKeepAlive / stopKeepAlive / isKeepAliveRunning /
//                        isIgnoringBatteryOptimizations / requestIgnoreBatteryOptimizations
//  - MainActivity     : keeps the WebView (JS timers, in-flight AI requests) running in the background
//  - AndroidManifest  : permissions + <service>
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'android', 'app');
const manifestPath = path.join(appDir, 'src', 'main', 'AndroidManifest.xml');
const srcDir = path.join(appDir, 'src', 'main', 'java');

const capacitorConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const appId = String(capacitorConfig.appId || 'com.daoyu.islandworldbook');
const appName = String(capacitorConfig.appName || '岛屿');

const pkgDir = path.join(srcDir, ...appId.split('.'));
const pluginPath = path.join(pkgDir, 'IslandNativePlugin.java');
const servicePath = path.join(pkgDir, 'KeepAliveService.java');
const mainActivityPath = path.join(pkgDir, 'MainActivity.java');

if (!fs.existsSync(pluginPath) || !fs.existsSync(manifestPath)) {
  throw new Error('Run patch_android.mjs first: IslandNativePlugin.java / AndroidManifest.xml not found');
}

const serviceJava = `package ${appId};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

public class KeepAliveService extends Service {
    static final String CHANNEL_ID = "island_keepalive";
    static final int NOTIFICATION_ID = 7101;
    static final String ACTION_STOP = "${appId}.action.STOP_KEEP_ALIVE";

    static volatile boolean running = false;
    static volatile boolean userStopped = false;

    private PowerManager.WakeLock wakeLock;
    private AudioTrack track;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            userStopped = true;
            stopSelf();
            return START_NOT_STICKY;
        }
        userStopped = false;
        try {
            startAsForeground();
        } catch (Exception e) {
            running = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        acquireWakeLock();
        startSilentAudio();
        running = true;
        return START_STICKY;
    }

    private void startAsForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "${appName}后台保活",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("后台保活开启时显示");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, piFlags);

        Intent stop = new Intent(this, KeepAliveService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
        }
        builder
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("${appName}正在后台运行")
            .setContentText("静音保活已开启，点按返回应用")
            .setContentIntent(openPi)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭保活", stopPi);

        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "${appId}:keepalive");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    // 30 seconds of mono 16-bit 8 kHz PCM: a 20 Hz sine at amplitude 40 (about -58 dBFS), looped
    // forever. Same signal as the web keep-alive.js. Inaudible on phone speakers, but not digital
    // silence. No audio focus is requested, so it never interrupts the user's own music.
    private void startSilentAudio() {
        if (track != null) return;
        try {
            final int rate = 8000;
            final int frames = rate * 30;
            short[] pcm = new short[frames];
            for (int i = 0; i < frames; i++) {
                pcm[i] = (short) Math.round(40 * Math.sin(2 * Math.PI * 20 * i / rate));
            }
            AudioTrack t = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build())
                .setAudioFormat(new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(rate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build())
                .setBufferSizeInBytes(frames * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build();
            t.write(pcm, 0, frames);
            t.setLoopPoints(0, frames, -1);
            t.play();
            track = t;
        } catch (Exception e) {
            track = null;
        }
    }

    private void stopSilentAudio() {
        if (track == null) return;
        try {
            track.stop();
        } catch (Exception ignored) {
        }
        try {
            track.release();
        } catch (Exception ignored) {
        }
        track = null;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopSilentAudio();
        releaseWakeLock();
        try {
            stopForeground(true);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
`;

const pluginMethods = `    // ---- Silent-audio foreground service (background keep-alive) ----

    @PluginMethod
    public void startKeepAlive(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, KeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            JSObject result = new JSObject();
            result.put("running", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("启动保活服务失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stopKeepAlive(PluginCall call) {
        try {
            KeepAliveService.userStopped = false;
            getContext().stopService(new Intent(getContext(), KeepAliveService.class));
            JSObject result = new JSObject();
            result.put("running", false);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("停止保活服务失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void isKeepAliveRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", KeepAliveService.running);
        result.put("userStopped", KeepAliveService.userStopped);
        call.resolve(result);
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        boolean ignoring = true;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            }
        } catch (Exception ignored) {
        }
        JSObject result = new JSObject();
        result.put("ignoring", ignoring);
        call.resolve(result);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("无法打开电池优化设置：" + e2.getMessage());
            }
        }
    }

`;

const mainActivityMethods = `    // While the keep-alive service runs, do not let the WebView freeze in the background:
    // in-flight AI requests and proactive-message timers must keep running.
    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAlive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAlive();
    }

    private void keepWebViewAlive() {
        try {
            if (!KeepAliveService.running || getBridge() == null) return;
            WebView wv = getBridge().getWebView();
            if (wv == null) return;
            wv.onResume();
            wv.resumeTimers();
        } catch (Exception ignored) {
        }
    }

`;

// 1) Service class
fs.writeFileSync(servicePath, serviceJava, 'utf8');

// 2) Plugin methods (idempotent)
let plugin = fs.readFileSync(pluginPath, 'utf8');
if (!plugin.includes('public void startKeepAlive(')) {
  const importAnchor = 'import android.util.Base64;';
  if (!plugin.includes(importAnchor)) throw new Error('Anchor not found in IslandNativePlugin.java: imports');
  plugin = plugin.replace(
    importAnchor,
    importAnchor + '\nimport android.os.PowerManager;\nimport android.provider.Settings;'
  );

  const methodAnchor = '    // ---- Save exported files';
  const at = plugin.indexOf(methodAnchor);
  if (at < 0) throw new Error('Anchor not found in IslandNativePlugin.java: methods');
  plugin = plugin.slice(0, at) + pluginMethods + plugin.slice(at);
  fs.writeFileSync(pluginPath, plugin, 'utf8');
}

// 3) MainActivity: keep the WebView alive in the background (idempotent)
if (fs.existsSync(mainActivityPath)) {
  let main = fs.readFileSync(mainActivityPath, 'utf8');
  if (!main.includes('keepWebViewAlive')) {
    const anchor = '    @Override\n    public void onNewIntent(Intent intent) {';
    const at = main.indexOf(anchor);
    if (at < 0) throw new Error('Anchor not found in MainActivity.java: onNewIntent');
    main = main.slice(0, at) + mainActivityMethods + main.slice(at);
    fs.writeFileSync(mainActivityPath, main, 'utf8');
  }
}

// 4) Manifest: permissions + service (idempotent)
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.WAKE_LOCK',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];
for (const permission of permissions) {
  if (!manifest.includes(`android:name="${permission}"`)) {
    manifest = manifest.replace(
      /(<manifest\b[^>]*>)/,
      `$1\n    <uses-permission android:name="${permission}" />`
    );
  }
}
if (!manifest.includes('.KeepAliveService')) {
  if (!manifest.includes('</application>')) throw new Error('</application> not found in AndroidManifest.xml');
  manifest = manifest.replace(
    '</application>',
    '    <service android:name=".KeepAliveService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>'
  );
}
fs.writeFileSync(manifestPath, manifest, 'utf8');

console.log(`Applied Android keep-alive service for ${appId}.`);

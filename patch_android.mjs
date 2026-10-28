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
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.ActivityCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

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
    /* 用户导入了自定义消息铃声时用的渠道：同样是高优先级，但没有系统提示音（铃声由应用自己播放） */
    static final String SILENT_CHANNEL_ID = "island_messages_silent";
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

    /* APK 聊天专用 SQLite：消息逐条存储，媒体独立放在 chat_media 表。网页端不会走这条路径。 */
    private static final class ChatDbHelper extends SQLiteOpenHelper {
        ChatDbHelper(Context context) { super(context.getApplicationContext(), "island-chat-v1.db", null, 2); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE chat_messages (chat TEXT NOT NULL, seq INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL, search_text TEXT NOT NULL DEFAULT '', PRIMARY KEY(chat, seq))");
            db.execSQL("CREATE INDEX idx_chat_messages_time ON chat_messages(chat, created_at, seq)");
            db.execSQL("CREATE TABLE chat_media (chat TEXT NOT NULL, seq INTEGER NOT NULL, media_key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(chat, seq, media_key))");
            db.execSQL("CREATE INDEX idx_chat_media_message ON chat_media(chat, seq)");
            createBackupTables(db);
        }
        private void createBackupTables(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS chat_messages_backup (slot TEXT NOT NULL, chat TEXT NOT NULL, seq INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL, search_text TEXT NOT NULL DEFAULT '', PRIMARY KEY(slot, chat, seq))");
            db.execSQL("CREATE TABLE IF NOT EXISTS chat_media_backup (slot TEXT NOT NULL, chat TEXT NOT NULL, seq INTEGER NOT NULL, media_key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(slot, chat, seq, media_key))");
            db.execSQL("CREATE TABLE IF NOT EXISTS chat_snapshot_meta (slot TEXT PRIMARY KEY, saved_at INTEGER NOT NULL, message_count INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { createBackupTables(db); }
    }
    private ChatDbHelper chatDbHelper;
    private synchronized SQLiteDatabase getChatDb() {
        if (chatDbHelper == null) chatDbHelper = new ChatDbHelper(getContext());
        return chatDbHelper.getWritableDatabase();
    }

    /* APK 附件落到应用私有文件目录，SQLite 只保存内容哈希路径；备份 JSON 导出时才重新转成 data URL。 */
    private File chatMediaDirectory() {
        File dir = new File(getContext().getFilesDir(), "island-media");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private String contentHash(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder out = new StringBuilder();
        for (byte b : digest) out.append(String.format(java.util.Locale.US, "%02x", b & 0xff));
        return out.toString();
    }

    private String storeChatMedia(String value) throws Exception {
        if (value == null || value.length() < 8192 || !value.matches("(?is)^data:(image|audio|video|application|font)/[^,]*,.+$")) return value == null ? "" : value;
        int comma = value.indexOf(','); if (comma < 0) return value;
        String header = value.substring(5, comma);
        String mime = header.split(";", 2)[0];
        byte[] bytes = Base64.decode(value.substring(comma + 1), Base64.DEFAULT);
        String hash = contentHash(bytes);
        File file = new File(chatMediaDirectory(), hash + ".bin");
        if (!file.exists()) {
            FileOutputStream out = new FileOutputStream(file);
            try { out.write(bytes); out.flush(); } finally { out.close(); }
        }
        return "@file:" + file.getAbsolutePath() + "|" + mime;
    }

    private String loadChatMedia(String value) {
        if (value == null || !value.startsWith("@file:")) return value == null ? "" : value;
        int split = value.indexOf('|', 6);
        if (split < 0) return "";
        String filePath = value.substring(6, split), mime = value.substring(split + 1);
        File file = new File(filePath);
        if (!file.isFile()) return "";
        try {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            FileInputStream in = new FileInputStream(file);
            try { byte[] chunk = new byte[32768]; int read; while ((read = in.read(chunk)) != -1) buffer.write(chunk, 0, read); }
            finally { in.close(); }
            return "data:" + mime + ";base64," + Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) { android.util.Log.w("IslandNative", "Read chat media failed", e); return ""; }
    }

    private void cleanupUnusedChatMediaFiles(SQLiteDatabase db) {
        Set<String> used = new HashSet<>();
        Cursor c = db.rawQuery("SELECT value FROM chat_media UNION SELECT value FROM chat_media_backup", null);
        try { while (c.moveToNext()) { String value = c.getString(0); if (value != null && value.startsWith("@file:")) { int split = value.indexOf('|', 6); if (split > 6) used.add(value.substring(6, split)); } } }
        finally { c.close(); }
        File[] files = chatMediaDirectory().listFiles();
        if (files != null) for (File file : files) if (file.isFile() && !used.contains(file.getAbsolutePath())) file.delete();
    }

    private void recoverChatIfEmpty(SQLiteDatabase db) {
        Cursor countCursor = db.rawQuery("SELECT COUNT(*) FROM chat_messages", null);
        long existing = 0; try { if (countCursor.moveToFirst()) existing = countCursor.getLong(0); } finally { countCursor.close(); }
        if (existing > 0) return;
        Cursor meta = db.rawQuery("SELECT slot FROM chat_snapshot_meta WHERE complete=1 ORDER BY saved_at DESC LIMIT 1", null);
        String slot = null; try { if (meta.moveToFirst()) slot = meta.getString(0); } finally { meta.close(); }
        if (slot == null) return;
        Cursor backupCount = db.rawQuery("SELECT COUNT(*) FROM chat_messages_backup WHERE slot=?", new String[]{slot});
        long backupRows = 0; try { if (backupCount.moveToFirst()) backupRows = backupCount.getLong(0); } finally { backupCount.close(); }
        if (backupRows <= 0) return; /* 元数据计数可能过期，逐行删除后不应从空快照复活消息。 */
        db.beginTransaction();
        try {
            db.execSQL("INSERT OR REPLACE INTO chat_messages(chat,seq,created_at,payload,search_text) SELECT chat,seq,created_at,payload,search_text FROM chat_messages_backup WHERE slot=?", new Object[]{slot});
            db.execSQL("INSERT OR REPLACE INTO chat_media(chat,seq,media_key,value) SELECT chat,seq,media_key,value FROM chat_media_backup WHERE slot=?", new Object[]{slot});
            db.setTransactionSuccessful();
        } catch (Exception e) { android.util.Log.w("IslandNative", "Chat snapshot recovery failed", e); }
        finally { db.endTransaction(); }
    }

    @PluginMethod
    public void chatSnapshot(PluginCall call) {
        String slot = call.getString("slot", "daily");
        if (!"daily".equals(slot)) { call.resolve(); return; }
        SQLiteDatabase db = getChatDb(); db.beginTransaction();
        try {
            ContentValues meta = new ContentValues(); meta.put("slot", slot); meta.put("saved_at", System.currentTimeMillis()); meta.put("message_count", 0); meta.put("complete", 0);
            db.insertWithOnConflict("chat_snapshot_meta", null, meta, SQLiteDatabase.CONFLICT_REPLACE);
            db.delete("chat_messages_backup", "slot=?", new String[]{slot});
            db.delete("chat_media_backup", "slot=?", new String[]{slot});
            db.execSQL("INSERT INTO chat_messages_backup(slot,chat,seq,created_at,payload,search_text) SELECT ?,chat,seq,created_at,payload,search_text FROM chat_messages", new Object[]{slot});
            db.execSQL("INSERT INTO chat_media_backup(slot,chat,seq,media_key,value) SELECT ?,chat,seq,media_key,value FROM chat_media", new Object[]{slot});
            Cursor c = db.rawQuery("SELECT COUNT(*) FROM chat_messages WHERE 1=1", null);
            long count = 0; try { if (c.moveToFirst()) count = c.getLong(0); } finally { c.close(); }
            ContentValues completed = new ContentValues(); completed.put("saved_at", System.currentTimeMillis()); completed.put("message_count", count); completed.put("complete", 1);
            db.update("chat_snapshot_meta", completed, "slot=?", new String[]{slot});
            db.setTransactionSuccessful();
        } catch (Exception e) { call.reject("创建聊天安全快照失败", e); return; }
        finally { db.endTransaction(); }
        cleanupUnusedChatMediaFiles(db);
        call.resolve();
    }

    @PluginMethod
    public void chatReadPage(PluginCall call) {
        String chat = call.getString("chat", "");
        if (chat.isEmpty()) { call.reject("chat 不能为空"); return; }
        int limit = Math.max(1, Math.min(1000, call.getInt("limit", 300)));
        long before = call.getLong("beforeSeq", 0L), after = call.getLong("afterSeq", 0L);
        boolean first = Boolean.TRUE.equals(call.getBoolean("first", false));
        boolean withMedia = !Boolean.FALSE.equals(call.getBoolean("withMedia", true));
        boolean withCount = Boolean.TRUE.equals(call.getBoolean("withCount", false));
        SQLiteDatabase db = getChatDb();
        String where = "chat=?", order = "DESC";
        ArrayList<String> args = new ArrayList<>(); args.add(chat);
        if (after > 0) { where += " AND seq>?"; args.add(String.valueOf(after)); order = "ASC"; }
        else if (first) { where += " AND seq>0"; order = "ASC"; }
        else if (before > 0) { where += " AND seq<?"; args.add(String.valueOf(before)); order = "DESC"; }
        Cursor c = db.rawQuery("SELECT seq, created_at, payload FROM chat_messages WHERE " + where + " ORDER BY seq " + order + " LIMIT ?", appendArg(args, String.valueOf(limit)));
        ArrayList<JSObject> page = new ArrayList<>();
        try {
            while (c.moveToNext()) {
                long seq = c.getLong(0);
                JSObject row = new JSObject();
                row.put("seq", seq); row.put("createdAt", c.getLong(1)); row.put("payload", c.getString(2));
                JSONArray media = new JSONArray();
                if (withMedia) {
                    Cursor m = db.rawQuery("SELECT media_key, value FROM chat_media WHERE chat=? AND seq=?", new String[]{chat, String.valueOf(seq)});
                    try { while (m.moveToNext()) { JSObject item = new JSObject(); item.put("key", m.getString(0)); item.put("value", loadChatMedia(m.getString(1))); media.put(item); } }
                    finally { m.close(); }
                }
                row.put("media", media); page.add(row);
            }
        } finally { c.close(); }
        if ("DESC".equals(order)) Collections.reverse(page);
        JSONArray rows = new JSONArray(); for (JSObject row : page) rows.put(row);
        JSObject result = new JSObject(); result.put("rows", rows);
        if (withCount) { Cursor countCursor = db.rawQuery("SELECT COUNT(*) FROM chat_messages WHERE chat=?", new String[]{chat});
            long count = 0; try { if (countCursor.moveToFirst()) count = countCursor.getLong(0); } finally { countCursor.close(); }
            result.put("count", count); }
        result.put("hasMore", page.size() == limit);
        call.resolve(result);
    }

    private String[] appendArg(ArrayList<String> args, String last) {
        String[] result = new String[args.size() + 1];
        for (int i = 0; i < args.size(); i++) result[i] = args.get(i);
        result[result.length - 1] = last; return result;
    }

    @PluginMethod
    public void chatWriteBatch(PluginCall call) {
        String chat = call.getString("chat", "");
        if (chat.isEmpty()) { call.reject("chat 不能为空"); return; }
        JSONArray rows = call.getArray("rows");
        JSONArray deletes = call.getArray("deleteSeqs");
        if (rows == null) rows = new JSONArray(); if (deletes == null) deletes = new JSONArray();
        SQLiteDatabase db = getChatDb(); JSONArray savedRows = new JSONArray(); long maxSeq = 0;
        Cursor maxCursor = db.rawQuery("SELECT COALESCE(MAX(seq),0) FROM chat_messages WHERE chat=?", new String[]{chat});
        try { if (maxCursor.moveToFirst()) maxSeq = maxCursor.getLong(0); } finally { maxCursor.close(); }
        db.beginTransaction();
        try {
            for (int i = 0; i < deletes.length(); i++) {
                long seq = deletes.optLong(i, 0); if (seq <= 0) continue;
                db.delete("chat_messages", "chat=? AND seq=?", new String[]{chat, String.valueOf(seq)});
                db.delete("chat_media", "chat=? AND seq=?", new String[]{chat, String.valueOf(seq)});
                db.delete("chat_messages_backup", "chat=? AND seq=?", new String[]{chat, String.valueOf(seq)});
                db.delete("chat_media_backup", "chat=? AND seq=?", new String[]{chat, String.valueOf(seq)});
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i); if (row == null) continue;
                long seq = row.optLong("seq", 0); if (seq <= 0) seq = Math.max(maxSeq + 1, System.currentTimeMillis() * 1000L); maxSeq = Math.max(maxSeq, seq);
                long createdAt = row.optLong("createdAt", System.currentTimeMillis());
                String payload = row.optString("payload", "{}");
                String searchText = row.optString("searchText", "");
                ContentValues values = new ContentValues(); values.put("chat", chat); values.put("seq", seq);
                values.put("created_at", createdAt); values.put("payload", payload); values.put("search_text", searchText);
                db.insertWithOnConflict("chat_messages", null, values, SQLiteDatabase.CONFLICT_REPLACE);
                db.delete("chat_media", "chat=? AND seq=?", new String[]{chat, String.valueOf(seq)});
                JSONArray media = row.optJSONArray("media");
                if (media != null) for (int j = 0; j < media.length(); j++) {
                    JSONObject m = media.optJSONObject(j); if (m == null) continue;
                    ContentValues mv = new ContentValues(); mv.put("chat", chat); mv.put("seq", seq);
                    mv.put("media_key", m.optString("key", "m" + j)); mv.put("value", storeChatMedia(m.optString("value", "")));
                    db.insertWithOnConflict("chat_media", null, mv, SQLiteDatabase.CONFLICT_REPLACE);
                }
                JSObject saved = new JSObject(); saved.put("seq", seq); saved.put("index", row.optInt("index", i)); savedRows.put(saved);
            }
            db.setTransactionSuccessful();
        } catch (Exception e) { call.reject("写入聊天数据库失败", e); return; }
        finally { db.endTransaction(); }
        if (deletes.length() > 0) {
            db.execSQL("UPDATE chat_snapshot_meta SET message_count=(SELECT COUNT(*) FROM chat_messages_backup b WHERE b.slot=chat_snapshot_meta.slot)");
            cleanupUnusedChatMediaFiles(db);
        }
        JSObject result = new JSObject(); result.put("rows", savedRows); result.put("maxSeq", maxSeq); call.resolve(result);
    }

    @PluginMethod
    public void chatDeleteAll(PluginCall call) {
        String chat = call.getString("chat", "");
        SQLiteDatabase db = getChatDb(); db.beginTransaction();
        try {
            db.delete("chat_messages", "chat=?", new String[]{chat}); db.delete("chat_media", "chat=?", new String[]{chat});
            db.delete("chat_messages_backup", "chat=?", new String[]{chat}); db.delete("chat_media_backup", "chat=?", new String[]{chat});
            db.execSQL("UPDATE chat_snapshot_meta SET message_count=(SELECT COUNT(*) FROM chat_messages_backup b WHERE b.slot=chat_snapshot_meta.slot)");
            db.setTransactionSuccessful();
        }
        catch (Exception e) { call.reject("删除聊天记录失败", e); return; }
        finally { db.endTransaction(); }
        cleanupUnusedChatMediaFiles(db);
        call.resolve();
    }

    @PluginMethod
    public void chatClearAll(PluginCall call) {
        SQLiteDatabase db = getChatDb(); db.beginTransaction();
        try {
            db.delete("chat_messages", null, null); db.delete("chat_media", null, null);
            db.delete("chat_messages_backup", null, null); db.delete("chat_media_backup", null, null); db.delete("chat_snapshot_meta", null, null);
            db.setTransactionSuccessful();
        }
        catch (Exception e) { call.reject("清空聊天数据库失败", e); return; }
        finally { db.endTransaction(); }
        cleanupUnusedChatMediaFiles(db);
        call.resolve();
    }

    @PluginMethod
    public void chatCount(PluginCall call) {
        String chat = call.getString("chat", ""); SQLiteDatabase db = getChatDb();
        Cursor c = db.rawQuery("SELECT COUNT(*) FROM chat_messages WHERE chat=?", new String[]{chat});
        long count = 0; try { if (c.moveToFirst()) count = c.getLong(0); } finally { c.close(); }
        JSObject result = new JSObject(); result.put("count", count); call.resolve(result);
    }

    @PluginMethod
    public void chatSearchRows(PluginCall call) {
        String chat = call.getString("chat", "");
        String query = call.getString("query", "");
        long before = call.getLong("beforeSeq", 0L);
        int limit = Math.max(1, Math.min(500, call.getInt("limit", 250)));
        SQLiteDatabase db = getChatDb();
        String where = "chat=?";
        ArrayList<String> args = new ArrayList<>(); args.add(chat);
        if (!query.isEmpty()) { where += " AND instr(search_text, ?) > 0"; args.add(query); }
        if (before > 0) { where += " AND seq<?"; args.add(String.valueOf(before)); }
        Cursor c = db.rawQuery("SELECT seq, created_at, payload FROM chat_messages WHERE " + where + " ORDER BY seq DESC LIMIT ?", appendArg(args, String.valueOf(limit)));
        JSONArray rows = new JSONArray();
        try {
            while (c.moveToNext()) {
                JSObject row = new JSObject();
                row.put("seq", c.getLong(0)); row.put("createdAt", c.getLong(1)); row.put("payload", c.getString(2));
                rows.put(row);
            }
        } finally { c.close(); }
        JSObject result = new JSObject(); result.put("rows", rows);
        call.resolve(result);
    }

    @PluginMethod
    public void chatSeqNth(PluginCall call) {
        String chat = call.getString("chat", "");
        long after = call.getLong("afterSeq", 0L);
        int n = Math.max(1, call.getInt("n", 1));
        boolean fromEnd = Boolean.TRUE.equals(call.getBoolean("fromEnd", false));
        SQLiteDatabase db = getChatDb();
        Cursor c = db.rawQuery("SELECT seq FROM chat_messages WHERE chat=? AND seq>? ORDER BY seq " + (fromEnd ? "DESC" : "ASC") + " LIMIT 1 OFFSET ?", new String[]{chat, String.valueOf(after), String.valueOf(n - 1)});
        long seq = 0; try { if (c.moveToFirst()) seq = c.getLong(0); } finally { c.close(); }
        JSObject result = new JSObject(); result.put("seq", seq); call.resolve(result);
    }

    @PluginMethod
    public void chatCountRange(PluginCall call) {
        String chat = call.getString("chat", "");
        long after = call.getLong("afterSeq", 0L), upto = call.getLong("uptoSeq", 0L);
        SQLiteDatabase db = getChatDb();
        Cursor c = upto > 0
            ? db.rawQuery("SELECT COUNT(*) FROM chat_messages WHERE chat=? AND seq>? AND seq<=?", new String[]{chat, String.valueOf(after), String.valueOf(upto)})
            : db.rawQuery("SELECT COUNT(*) FROM chat_messages WHERE chat=? AND seq>?", new String[]{chat, String.valueOf(after)});
        long count = 0; try { if (c.moveToFirst()) count = c.getLong(0); } finally { c.close(); }
        JSObject result = new JSObject(); result.put("count", count); call.resolve(result);
    }

    @PluginMethod
    public void chatListNames(PluginCall call) {
        SQLiteDatabase db = getChatDb(); recoverChatIfEmpty(db); Cursor c = db.rawQuery("SELECT DISTINCT chat FROM chat_messages ORDER BY chat", null);
        JSONArray names = new JSONArray(); try { while (c.moveToNext()) names.put(c.getString(0)); } finally { c.close(); }
        JSObject result = new JSObject(); result.put("names", names); call.resolve(result);
    }

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

    /* ===== 应用内更新：下载新版安装包，交给系统安装页面 ===== */
    private volatile String apkState = "idle";
    private volatile long apkDone = 0;
    private volatile long apkTotal = 0;
    private volatile String apkError = "";
    private volatile String apkPath = "";
    private volatile boolean apkCancel = false;

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < 26) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File apkDir() {
        File dir = new File(getContext().getCacheDir(), "apk-update");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /* 读一小段文字（只允许 GitHub 的地址，自动跟随跳转）。用来读更新信息，绕开网页的跨域限制和接口次数限制 */
    @PluginMethod
    public void fetchText(PluginCall call) {
        String first = call.getString("url", "");
        try {
            String current = first;
            int hops = 0;
            HttpURLConnection conn;
            while (true) {
                URL u = new URL(current);
                String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
                boolean okHost = "github.com".equals(host) || host.endsWith(".githubusercontent.com");
                if (!"https".equals(u.getProtocol()) || !okHost) throw new IOException("地址不允许访问");
                conn = (HttpURLConnection) u.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestProperty("User-Agent", "IslandApp");
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (loc == null || ++hops > 6) throw new IOException("地址跳转异常");
                    current = new URL(u, loc).toString();
                    continue;
                }
                if (code != 200) {
                    conn.disconnect();
                    throw new IOException("服务器返回了 " + code);
                }
                break;
            }
            InputStream in = conn.getInputStream();
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                bos.write(buf, 0, n);
                if (bos.size() > 262144) break;
            }
            in.close();
            conn.disconnect();
            JSObject res = new JSObject();
            res.put("text", new String(bos.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(res);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "网络不太稳" : e.getMessage());
        }
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        JSObject res = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : (long) info.versionCode;
            res.put("versionCode", code);
            res.put("versionName", info.versionName == null ? "" : info.versionName);
        } catch (Exception ignored) {
            res.put("versionCode", 0);
            res.put("versionName", "");
        }
        res.put("canInstall", canInstallPackages());
        call.resolve(res);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("打不开授权页面：" + e.getMessage());
        }
    }

    @PluginMethod
    public void startApkDownload(PluginCall call) {
        final String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) {
            call.reject("下载地址不对");
            return;
        }
        if ("downloading".equals(apkState)) {
            call.resolve();
            return;
        }
        apkCancel = false;
        apkDone = 0;
        apkTotal = 0;
        apkError = "";
        apkPath = "";
        apkState = "downloading";
        new Thread(new Runnable() {
            @Override public void run() { downloadApk(url); }
        }, "island-apk-download").start();
        call.resolve();
    }

    private void downloadApk(String firstUrl) {
        HttpURLConnection conn = null;
        InputStream in = null;
        FileOutputStream out = null;
        File dir = apkDir();
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        File part = new File(dir, "island-update.apk.part");
        File dest = new File(dir, "island-update.apk");
        try {
            String current = firstUrl;
            int hops = 0;
            while (true) {
                URL u = new URL(current);
                conn = (HttpURLConnection) u.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(20000);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestProperty("User-Agent", "IslandApp");
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (loc == null || ++hops > 6) throw new IOException("下载地址跳转异常");
                    current = new URL(u, loc).toString();
                    if (!current.startsWith("https://")) throw new IOException("下载地址不安全");
                    continue;
                }
                if (code != 200) throw new IOException("服务器返回了 " + code);
                break;
            }
            apkTotal = conn.getContentLengthLong();
            in = conn.getInputStream();
            out = new FileOutputStream(part);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (apkCancel) throw new IOException("cancelled");
                out.write(buf, 0, n);
                apkDone += n;
            }
            out.flush();
            out.getFD().sync();
            out.close();
            out = null;
            if (apkTotal > 0 && part.length() != apkTotal) throw new IOException("文件没有下载完整，请重试");
            PackageInfo pkg = getContext().getPackageManager().getPackageArchiveInfo(part.getAbsolutePath(), 0);
            if (pkg == null) throw new IOException("下载下来的文件不是有效的安装包");
            if (!getContext().getPackageName().equals(pkg.packageName)) throw new IOException("下载下来的安装包不是岛屿的");
            if (!part.renameTo(dest)) throw new IOException("保存安装包失败");
            apkPath = dest.getAbsolutePath();
            apkState = "done";
        } catch (Exception e) {
            part.delete();
            if (apkCancel) {
                apkState = "cancelled";
            } else {
                String m = e.getMessage();
                apkError = (m == null || m.isEmpty()) ? "网络不太稳" : m;
                apkState = "error";
            }
        } finally {
            try { if (out != null) out.close(); } catch (Exception ignored) {}
            try { if (in != null) in.close(); } catch (Exception ignored) {}
            if (conn != null) conn.disconnect();
        }
    }

    @PluginMethod
    public void getApkProgress(PluginCall call) {
        JSObject res = new JSObject();
        res.put("state", apkState);
        res.put("done", apkDone);
        res.put("total", apkTotal);
        res.put("error", apkError);
        call.resolve(res);
    }

    @PluginMethod
    public void cancelApkDownload(PluginCall call) {
        apkCancel = true;
        call.resolve();
    }

    @PluginMethod
    public void cleanApkCache(PluginCall call) {
        if (!"downloading".equals(apkState)) {
            File[] files = apkDir().listFiles();
            if (files != null) for (File f : files) f.delete();
            apkState = "idle";
            apkPath = "";
        }
        call.resolve();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        if (!canInstallPackages()) {
            call.reject("NEED_PERMISSION");
            return;
        }
        File file = new File(apkPath == null ? "" : apkPath);
        if (!"done".equals(apkState) || !file.exists()) {
            call.reject("安装包不见了，请重新下载");
            return;
        }
        try {
            Context ctx = getContext();
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".islandupdate", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("打开安装页面失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void showWebNotification(PluginCall call) {
        String title = safeText(call.getString("title", "${appName}"), "${appName}");
        String body = safeText(call.getString("body", ""), "");
        String tag = safeText(call.getString("tag", "island-message"), "island-message");
        String url = call.getString("url", "");
        Boolean silentFlag = call.getBoolean("silent", false);
        boolean silent = silentFlag != null && silentFlag.booleanValue();
        Boolean callFlag = call.getBoolean("callActions", false);
        boolean callActions = callFlag != null && callFlag.booleanValue();
        String acceptUrl = call.getString("acceptUrl", "");
        String declineUrl = call.getString("declineUrl", "");

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
            builder = new Notification.Builder(getActivity(), silent ? SILENT_CHANNEL_ID : CHANNEL_ID);
        } else {
            builder = new Notification.Builder(getActivity())
                .setPriority(Notification.PRIORITY_HIGH);
        }

        builder
            .setSmallIcon(R.drawable.ic_stat_island)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setDefaults(silent ? (Notification.DEFAULT_VIBRATE | Notification.DEFAULT_LIGHTS) : Notification.DEFAULT_ALL);

        NotificationManager manager = (NotificationManager) getActivity()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.resolve(result(false, getNotificationState()));
            return;
        }

        int id = (int) (System.currentTimeMillis() & 0x7fffffff);

        if (callActions) {
            // 语音来电：通知上带「接听 / 拒接」两个按钮。
            // 接听 -> 打开软件并直接进入语音通话；拒接 -> 不打开软件，只通知前端把来电标为已拒接。
            builder.setCategory(Notification.CATEGORY_CALL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder.setTimeoutAfter(45000L);
            }

            Intent acceptIntent = new Intent(getActivity(), MainActivity.class);
            acceptIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (isSafeDeepLink(acceptUrl)) {
                acceptIntent.putExtra(MainActivity.EXTRA_DEEP_LINK, acceptUrl);
            }
            acceptIntent.putExtra(MainActivity.EXTRA_CANCEL_TAG, tag);
            acceptIntent.putExtra(MainActivity.EXTRA_CANCEL_ID, id);
            PendingIntent acceptPending = PendingIntent.getActivity(
                getActivity(),
                Math.abs((tag + "#accept").hashCode()),
                acceptIntent,
                pendingFlags
            );

            Intent declineIntent = new Intent(getActivity(), CallActionReceiver.class);
            declineIntent.setAction("island.call.decline");
            if (isSafeDeepLink(declineUrl)) {
                declineIntent.putExtra(MainActivity.EXTRA_DEEP_LINK, declineUrl);
            }
            declineIntent.putExtra(MainActivity.EXTRA_CANCEL_TAG, tag);
            declineIntent.putExtra(MainActivity.EXTRA_CANCEL_ID, id);
            PendingIntent declinePending = PendingIntent.getBroadcast(
                getActivity(),
                Math.abs((tag + "#decline").hashCode()),
                declineIntent,
                pendingFlags
            );

            builder.addAction(0, "拒接", declinePending);
            builder.addAction(0, "接听", acceptPending);
        }

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

    // ---- 系统栏（状态栏 / 导航栏）图标颜色：由前端按"栏下方实际画面"的明暗来决定 ----
    // 只改图标深浅，不改栏的背景，保持与软件融为一体（安卓原生 WindowInsetsController）。
    @PluginMethod
    public void setSystemBarStyle(PluginCall call) {
        final boolean lightStatus = Boolean.TRUE.equals(call.getBoolean("lightStatusBar", false));
        final boolean lightNav = Boolean.TRUE.equals(call.getBoolean("lightNavigationBar", lightStatus));
        MainActivity.lightStatusBar = lightStatus;
        MainActivity.lightNavigationBar = lightNav;
        final android.app.Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            MainActivity.applySystemBars(activity);
            call.resolve();
        });
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

        NotificationChannel silentChannel = new NotificationChannel(
            SILENT_CHANNEL_ID,
            CHANNEL_NAME + "（自定义铃声）",
            CHANNEL_IMPORTANCE
        );
        silentChannel.setDescription("${appName}角色消息（由应用播放自定义铃声，系统不再出声）");
        silentChannel.setSound(null, null);
        silentChannel.enableVibration(true);
        silentChannel.setShowBadge(true);
        manager.createNotificationChannel(silentChannel);
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

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_DEEP_LINK = "island_deep_link";
    public static final String EXTRA_CANCEL_TAG = "island_cancel_tag";
    public static final String EXTRA_CANCEL_ID = "island_cancel_id";

    /** 当前页面的 WebView（弱引用）：来电通知的「拒接」按钮不拉起界面，由广播接收器直接把动作交给页面。 */
    private static volatile java.lang.ref.WeakReference<WebView> webViewRef = null;

    /** 把一条深链放进待处理，并通知页面取走（页面在后台但进程还活着时也有效）。 */
    public static void deliverDeepLink(String url) {
        if (url == null || url.isEmpty()) return;
        pendingDeepLink = url;
        java.lang.ref.WeakReference<WebView> ref = webViewRef;
        final WebView webView = ref == null ? null : ref.get();
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
            "try{window.dispatchEvent(new Event('island-native-deeplink'));}catch(e){}", null));
    }

    /** 点通知按钮后，把这条通知从通知栏撤掉（按钮不会自动撤）。 */
    public static void cancelNotification(android.content.Context context, Intent intent) {
        if (context == null || intent == null) return;
        String tag = intent.getStringExtra(EXTRA_CANCEL_TAG);
        if (tag == null || tag.isEmpty() || !intent.hasExtra(EXTRA_CANCEL_ID)) return;
        int id = intent.getIntExtra(EXTRA_CANCEL_ID, 0);
        try {
            android.app.NotificationManager manager = (android.app.NotificationManager)
                context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(tag, id);
        } catch (Exception ignored) {
        }
    }

    /**
     * 最近一次通知点击带来的链接。
     * 点击通知时不能再用 webView.loadUrl() 重载页面（会让正在运行的岛屿整页刷新、
     * 打断正在进行的聊天 / AI 请求）；改为先存放在这里，再通知前端调用
     * IslandNative.consumeDeepLink() 取走，由前端直接切换到对应聊天。
     */
    public static volatile String pendingDeepLink = null;

    /**
     * 系统栏图标深浅：true = 栏下方是浅色画面，用深色图标；false = 深色画面，用浅色图标；null = 前端还没告知。
     * 记在这里是因为系统在回到前台、切换深色模式时可能把图标颜色重置，需要原样再套一次。
     */
    public static volatile Boolean lightStatusBar = null;
    public static volatile Boolean lightNavigationBar = null;

    public static void applySystemBars(final android.app.Activity activity) {
        if (activity == null) return;
        Boolean ls = lightStatusBar;
        Boolean ln = lightNavigationBar;
        if (ls == null && ln == null) return;
        android.view.Window window = activity.getWindow();
        androidx.core.view.WindowInsetsControllerCompat controller =
            androidx.core.view.WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller == null) return;
        if (ls != null) controller.setAppearanceLightStatusBars(ls);
        if (ln != null) controller.setAppearanceLightNavigationBars(ln);
    }

    private void reapplySystemBars() {
        final android.view.View decor = getWindow().getDecorView();
        decor.post(() -> applySystemBars(this));
        decor.postDelayed(() -> applySystemBars(this), 300);
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                webViewRef = new java.lang.ref.WeakReference<>(getBridge().getWebView());
            }
        } catch (Exception ignored) {
        }
        reapplySystemBars();
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        reapplySystemBars();
    }

    @Override
    public void load() {
        registerPlugin(IslandNativePlugin.class);
        super.load();
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                webViewRef = new java.lang.ref.WeakReference<>(getBridge().getWebView());
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 冷启动：被通知拉起时把链接放进待处理，页面加载完成后由前端取走。
        // savedInstanceState != null 只是系统重建（如旋转），不应重复打开。
        if (savedInstanceState == null) {
            cancelNotification(this, getIntent());
            rememberDeepLink(getIntent());
        }

        // 返回键 / 返回手势（全面屏手势、三键导航都走这里）：
        // 先问前端有没有可以退的一层（弹窗、页面、子页面），有就由前端处理；
        // 前端说已经在桌面了，才把应用退到后台。回调在 super.onCreate 之后添加，优先于默认处理。
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleIslandBack();
            }
        });
    }

    private void handleIslandBack() {
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return !!(window.IslandSwipeBack&&window.IslandSwipeBack.handleBack());}catch(e){return false;}})()",
            value -> {
                if (!"true".equals(value)) moveTaskToBack(true);
            });
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        cancelNotification(this, intent);
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

const callReceiverJava = `package ${appId};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 来电通知上的「拒接」按钮：不拉起软件界面，只撤掉通知，
 * 并把深链（带 call=decline）交给页面，由前端把这通来电标记为已拒接。
 */
public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        MainActivity.cancelNotification(context, intent);
        String url = intent.getStringExtra(MainActivity.EXTRA_DEEP_LINK);
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
        MainActivity.deliverDeepLink(url);
    }
}
`;

const updateProviderJava = `package ${appId};

import androidx.core.content.FileProvider;

/** 应用内更新专用：把下载好的安装包安全地交给系统安装器。单独一个子类，避免和 Capacitor 自带的 FileProvider 重名冲突。 */
public class IslandUpdateFileProvider extends FileProvider {}
`;
fs.writeFileSync(path.join(mainPackageDir, 'IslandUpdateFileProvider.java'), updateProviderJava, 'utf8');
const xmlResDir = path.join(appDir, 'src', 'main', 'res', 'xml');
fs.mkdirSync(xmlResDir, { recursive: true });
fs.writeFileSync(path.join(xmlResDir, 'island_update_paths.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<paths>\n    <cache-path name="island_apk_update" path="apk-update/" />\n</paths>\n', 'utf8');
fs.writeFileSync(path.join(mainPackageDir, 'CallActionReceiver.java'), callReceiverJava, 'utf8');
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
if (!manifest.includes('.CallActionReceiver')) {
  if (!manifest.includes('</application>')) throw new Error('</application> not found in AndroidManifest.xml');
  manifest = manifest.replace(
    '</application>',
    '    <receiver android:name=".CallActionReceiver" android:exported="false" />\n    </application>'
  );
}
// 应用内更新：允许申请「安装未知应用」，并登记交安装包给系统用的 FileProvider
if (!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace(
    /(<manifest\b[^>]*>)/,
    '$1\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
  );
}
if (!manifest.includes('.IslandUpdateFileProvider')) {
  manifest = manifest.replace('</application>', () =>
    '    <provider android:name=".IslandUpdateFileProvider" android:authorities="${applicationId}.islandupdate" android:exported="false" android:grantUriPermissions="true">\n' +
    '        <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/island_update_paths" />\n' +
    '    </provider>\n    </application>');
}
fs.writeFileSync(manifestPath, manifest, 'utf8');

// Notification small icon: use icon-192.png (same icon as the web app) instead of the generic Android info icon.
const statIconSrc = path.join(root, 'icon-192.png');
if (!fs.existsSync(statIconSrc)) {
  throw new Error('icon-192.png not found; needed for the notification small icon');
}
const statIconDir = path.join(appDir, 'src', 'main', 'res', 'drawable-nodpi');
fs.mkdirSync(statIconDir, { recursive: true });
fs.copyFileSync(statIconSrc, path.join(statIconDir, 'ic_stat_island.png'));

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

  // 应用内更新要知道去哪个 GitHub 仓库找新安装包（打包时由 GitHub 自动提供仓库名）
  if (!html.includes('id="island-apk-repo"')) {
    const repoName = String(process.env.GITHUB_REPOSITORY || '');
    html = html.replace('</body>', '<script id="island-apk-repo">window.ISLAND_APK_REPO=' + JSON.stringify(repoName) + ';</script>\n</body>');
  }

  if (!html.includes('id="island-cap-shim"') && fs.existsSync(shimSourcePath)) {
    const shimScript = '<script id="island-cap-shim">\n' + fs.readFileSync(shimSourcePath, 'utf8') + '\n</script>\n';
    html = html.replace('</body>', shimScript + '</body>');
  }

  fs.writeFileSync(wwwIndexPath, html, 'utf8');
}

console.log(`Applied Android native integrations for ${appId} (${version}, versionCode ${versionCode}).`);

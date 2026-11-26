package dev.pgrazor;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.AtomicFile;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** One-shot owned-Pokemon export. The native tick reads the bag once per armed token and sends the rows back. */
public final class PokemonDumpSettings {
    private PokemonDumpSettings() {}

    private static final Object LOCK = new Object();
    private static final long TIMEOUT_MS = 60000;
    private static long nextToken = System.currentTimeMillis();
    private static long token, startedAt;
    private static int expectedIndex;
    private static boolean allNamed = true;
    private static final List<PokemonDump.Entry> accumulated = new ArrayList<>();
    private static Context context;

    /** Polled by the transport daemon: "D|token" while an export is armed, else empty. */
    public static String config() {
        long now = System.currentTimeMillis();
        synchronized (LOCK) {
            if (token != 0 && now - startedAt >= TIMEOUT_MS) clearLocked();
            return token == 0 ? "" : "D|" + token;
        }
    }

    public static void reset() {
        synchronized (LOCK) { clearLocked(); }
    }

    public static void request(Context app) {
        long now = System.currentTimeMillis();
        synchronized (LOCK) {
            if (token != 0 && now - startedAt < TIMEOUT_MS) {
                toast(app, "An export is already running.");
                return;
            }
            clearLocked();
            context = app.getApplicationContext();
            token = ++nextToken;
            startedAt = now;
        }
        toast(app, "Exporting owned Pokemon. Keep the game open on the map or in storage.");
    }

    /** Reassembles and writes the files for the armed export. Any other token is ignored. */
    public static void publish(String detail) {
        Context app = null;
        long eventToken = 0;
        try {
            JSONObject event = new JSONObject(detail);
            eventToken = event.optLong("token");
            String phase = event.optString("phase");
            synchronized (LOCK) {
                if (token == 0 || eventToken != token) return;
                app = context;
                if ("error".equals(phase)) {
                    clearLocked();
                    if (app != null) toast(app, "Export failed: " + event.optString("message", "unknown error"));
                    return;
                }
                if (!"part".equals(phase) && !"done".equals(phase)) {
                    clearLocked();
                    if (app != null) toast(app, "Export failed: " + event.optString("message", "unknown error"));
                    return;
                }
            }
            if (app == null) return;
            int index = event.optInt("index", 0), count = event.optInt("count", 1);
            List<PokemonDump.Entry> part = entries(event.getJSONArray("pokemon"), PokemonSpeciesDialog.readNames(app));
            List<PokemonDump.Entry> finished = null;
            boolean finalNamed = true;
            synchronized (LOCK) {
                if (token == 0 || eventToken != token) return;
                if (count < 1 || index != expectedIndex || index >= count || ("done".equals(phase) && index + 1 != count)) {
                    clearLocked();
                    toast(app, "Export failed: incomplete export data.");
                    return;
                }
                accumulated.addAll(part);
                allNamed &= event.optBoolean("named", true);
                startedAt = System.currentTimeMillis();
                expectedIndex++;
                if ("done".equals(phase)) {
                    finished = new ArrayList<>(accumulated);
                    finalNamed = allNamed;
                    clearLocked();
                }
            }
            if (finished == null) return;
            String location = save(app, "pokemon-dump.json", "application/json", PokemonDump.json(finished));
            save(app, "pokemon-pvpoke.csv", "text/csv", PokemonDump.csv(finished));
            int withoutLevel = 0;
            for (PokemonDump.Entry e : finished) if (e.levelHalf < 0) withoutLevel++;
            toast(app, PokemonDump.summary(finished.size(), location, withoutLevel, finalNamed));
        } catch (Exception e) {
            synchronized (LOCK) { if (token != 0 && eventToken == token) clearLocked(); }
            if (app != null) toast(app, "Export failed: " + e.getMessage());
        }
    }

    private static void clearLocked() {
        token = 0; startedAt = 0; expectedIndex = 0; allNamed = true;
        accumulated.clear();
        context = null;
    }

    private static List<PokemonDump.Entry> entries(JSONArray rows, JSONObject names) {
        List<PokemonDump.Entry> out = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            if (r == null) continue;
            int dex = r.optInt("dex");
            JSONArray charged = r.optJSONArray("charged");
            String fallback = "#" + dex;
            String name = names == null ? fallback : names.optString(String.valueOf(dex), fallback);
            out.add(new PokemonDump.Entry(dex, name, r.optBoolean("shadow"), r.optInt("cp"), r.optInt("levelHalf", -1),
                r.optInt("atk"), r.optInt("def"), r.optInt("hp"), r.optString("fast"),
                charged == null ? "" : charged.optString(0), charged == null ? "" : charged.optString(1),
                r.optString("nickname")));
        }
        return out;
    }

    /** Android 10+ writes to Downloads/PGRazor through MediaStore, which needs no storage permission for our own rows. */
    private static String save(Context app, String name, String mime, String text) throws IOException {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (Build.VERSION.SDK_INT < 29) {
            File dir = app.getExternalFilesDir("pgrazor-dumps");
            if (dir == null) dir = new File(app.getFilesDir(), "pgrazor-dumps");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create export folder");
            write(new File(dir, name), text);
            return dir.getAbsolutePath();
        }
        String path = Environment.DIRECTORY_DOWNLOADS + "/PGRazor/";
        ContentResolver resolver = app.getContentResolver();
        resolver.delete(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?",
            new String[] {name, path});
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, path);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Cannot create " + name);
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Cannot write " + name);
            out.write(bytes);
        }
        return path;
    }

    private static void write(File file, String text) throws IOException {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream out = atomic.startWrite();
        try {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            atomic.finishWrite(out);
        } catch (IOException e) {
            atomic.failWrite(out);
            throw e;
        }
    }

    private static void toast(Context app, String message) {
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(app, message, Toast.LENGTH_LONG).show());
    }
}

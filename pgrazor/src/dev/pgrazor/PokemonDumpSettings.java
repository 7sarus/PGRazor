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
    private static Context context;

    /** Polled by the transport daemon: "D|token" while an export is armed, else empty. */
    public static String config() {
        synchronized (LOCK) { return token == 0 ? "" : "D|" + token; }
    }

    public static void request(Context app) {
        long now = System.currentTimeMillis();
        synchronized (LOCK) {
            if (token != 0 && now - startedAt < TIMEOUT_MS) {
                toast(app, "An export is already running.");
                return;
            }
            context = app.getApplicationContext();
            token = ++nextToken;
            startedAt = now;
        }
        toast(app, "Exporting owned Pokemon. Keep the game open on the map or in storage.");
    }

    /** Writes the files for the armed export. Any other token is ignored. */
    public static void publish(String detail) {
        Context app = null;
        try {
            JSONObject event = new JSONObject(detail);
            long eventToken = event.optLong("token");
            synchronized (LOCK) {
                if (token == 0 || eventToken != token) return;
                token = 0;
                app = context;
            }
            if (app == null) return;
            if (!"done".equals(event.optString("phase"))) {
                toast(app, "Export failed: " + event.optString("message", "unknown error"));
                return;
            }
            List<PokemonDump.Entry> rows = entries(event.getJSONArray("pokemon"), PokemonSpeciesDialog.readNames(app));
            String location = save(app, "pokemon-dump.json", "application/json", PokemonDump.json(rows));
            save(app, "pokemon-pvpoke.csv", "text/csv", PokemonDump.csv(rows));
            int withoutLevel = 0;
            for (PokemonDump.Entry e : rows) if (e.levelHalf < 0) withoutLevel++;
            String notes = (withoutLevel > 0 ? " " + withoutLevel + " without a known level are left out of the CSV." : "")
                + (event.optBoolean("named", true) ? "" : " Move names unavailable; move ids were written.");
            toast(app, "Exported " + rows.size() + " Pokemon to " + location + "." + notes);
        } catch (Exception e) {
            if (app != null) toast(app, "Export failed: " + e.getMessage());
        }
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

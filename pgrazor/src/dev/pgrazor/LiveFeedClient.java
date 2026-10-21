package dev.pgrazor;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Minimal HTTPS client for LivePokeMap built on {@link HttpURLConnection} (no third-party deps).
 *
 * <p>It talks to exactly two endpoints: {@code POST /api/auth/login} and {@code POST /api/map/viewport}.
 * It never activates a remote game session, never sends an {@code X-Credential-ID}, and never logs or
 * echoes credentials or raw server bodies. The viewport request uses a bounded box around the given
 * centre so it cannot ask for a world-sized area. All methods are synchronous and must be called off
 * the main thread; a single instance is owned by the UI and {@link #cancel()} aborts the in-flight call.
 */
public final class LiveFeedClient {
    private static final String BASE = "https://play.livepokemap.com";
    private static final int CONNECT_TIMEOUT_MS = 10000;
    private static final int READ_TIMEOUT_MS = 15000;
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
    private static final int MAP_ZOOM = 15;
    private static final String USER_AGENT = "PGRazor/0.1 (+https://github.com/jpitty03/PGRazor)";
    private static final double KM_PER_DEGREE_LAT = 111.0;
    private static final double MAX_LON_DELTA_DEGREES = 45.0; // guards against a huge box near the poles
    private static final long DEFAULT_RETRY_AFTER_MS = 10000;

    /** Raised for every network/auth failure with a user-safe message and no raw server content. */
    public static class FeedException extends Exception {
        public final int status;       // HTTP status when known, else 0
        public final long retryAfterMs; // suggested wait for a 429, else 0

        public FeedException(String message) { this(message, 0, 0); }

        public FeedException(String message, int status, long retryAfterMs) {
            super(message);
            this.status = status;
            this.retryAfterMs = retryAfterMs;
        }
    }

    private final LiveFeedSession session;
    private volatile HttpURLConnection connection;
    private final Object requestLock = new Object();
    private long epoch;

    public LiveFeedClient(LiveFeedSession session) { this.session = session; }

    public boolean signedIn() { return session.signedIn(); }

    public void logout() { cancel(); synchronized(requestLock) { session.clear(); } }

    /** Aborts the connection currently in flight, if any; the blocked call fails with a safe message. */
    public void cancel() {
        HttpURLConnection current;
        synchronized(requestLock) { epoch++; current = connection; }
        if (current != null) { try { current.disconnect(); } catch (Exception ignored) { } }
    }

    /** Signs in and stores the returned bearer token encrypted. Call off the UI thread. */
    public void login(String username, String password) throws Exception {
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty())
            throw new FeedException("Enter your username and password.");
        long requestEpoch; synchronized(requestLock) { requestEpoch = epoch; }
        JSONObject body = new JSONObject();
        body.put("username", username.trim());
        body.put("password", password);
        JSONObject response = request("/api/auth/login", body, null, requestEpoch);
        // The token sits inside the success/data envelope, but tolerate a top-level token too.
        String token = null;
        JSONObject data = response.optJSONObject("data");
        if (data != null) token = nonEmpty(data.optString("token", ""));
        if (token == null) token = nonEmpty(response.optString("token", ""));
        if (token == null) throw new FeedException("Sign-in did not return a session. Please try again.");
        synchronized(requestLock) { checkActive(requestEpoch); session.save(token); }
    }

    /**
     * Fetches map objects within {@code radiusKm} (clamped 1..5) of the given centre, applying an IV
     * floor both server-side and client-side. Throws {@link FeedException} (status 401) and clears the
     * stored token when the session is rejected. Call off the UI thread.
     */
    public LiveFeedData.Snapshot fetch(double lat, double lon, double radiusKm, int minIv) throws Exception {
        long requestEpoch; synchronized(requestLock) { requestEpoch = epoch; }
        String token = session.token();
        if (token == null) throw new FeedException("Please sign in to load the live map.", 401, 0);
        if (!Double.isFinite(lat) || !Double.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180)
            throw new FeedException("That location is outside the valid range.");

        double radius = clamp(radiusKm, 1, 5);
        int iv = (int) clamp(minIv, 0, 100);

        double dLat = radius / KM_PER_DEGREE_LAT;
        double cosLat = Math.max(Math.cos(Math.toRadians(lat)), 1e-6); // avoid divide-by-zero at the poles
        double dLon = Math.min(radius / (KM_PER_DEGREE_LAT * cosLat), MAX_LON_DELTA_DEGREES);
        double minLat = clamp(lat - dLat, -90, 90), maxLat = clamp(lat + dLat, -90, 90);
        double minLon = clamp(lon - dLon, -180, 180), maxLon = clamp(lon + dLon, -180, 180);

        JSONObject body = new JSONObject();
        body.put("min_lat", minLat);
        body.put("max_lat", maxLat);
        body.put("min_lon", minLon);
        body.put("max_lon", maxLon);
        body.put("zoom", MAP_ZOOM);
        body.put("display_filters", displayFilters(iv));

        JSONObject response;
        try {
            response = request("/api/map/viewport", body, token, requestEpoch);
        } catch (FeedException fe) {
            if (fe.status == 401) synchronized(requestLock) { if(epoch == requestEpoch) session.clear(); } // expired token: force a fresh sign-in
            throw fe;
        }
        LiveFeedData.Snapshot parsed = LiveFeedData.parse(response, System.currentTimeMillis());
        return filterByIv(parsed, iv);
    }

    // show_all keeps the server from hiding anything; the explicit floors plus disabled "always show"
    // overrides mean the server respects the IV floor, and we re-apply it client-side as a backstop.
    private static JSONObject displayFilters(int minIv) throws JSONException {
        JSONObject filters = new JSONObject();
        filters.put("show_all", true);
        filters.put("min_iv", minIv);
        filters.put("max_iv", 100);
        filters.put("min_level", 0);
        filters.put("max_level", 50);
        filters.put("always_show_perfect", false);
        filters.put("always_show_zero", false);
        filters.put("always_show_rare", false);
        filters.put("always_show_size", false);
        return filters;
    }

    // Keep every non-pokemon object; for pokemon honour the IV floor but, when the floor is 0, keep
    // ordinary wild spawns whose IV is unknown.
    private static LiveFeedData.Snapshot filterByIv(LiveFeedData.Snapshot snapshot, int minIv) {
        if (minIv <= 0) return snapshot;
        List<LiveFeedData.Entry> kept = new ArrayList<>(snapshot.entries.size());
        for (LiveFeedData.Entry e : snapshot.entries) {
            if (e.kind != LiveFeedData.Kind.POKEMON || (e.hasStats && e.iv >= minIv)) kept.add(e);
        }
        return new LiveFeedData.Snapshot(kept, snapshot.fetchedAt, snapshot.refreshSeconds, snapshot.note);
    }

    private JSONObject request(String path, JSONObject body, String bearer, long requestEpoch) throws Exception {
        URL url = new URL(BASE + path);
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new FeedException("A secure connection is required.");
        HttpURLConnection http = (HttpURLConnection) url.openConnection();
        synchronized(requestLock) { checkActive(requestEpoch); connection = http; }
        try {
            http.setConnectTimeout(CONNECT_TIMEOUT_MS);
            http.setReadTimeout(READ_TIMEOUT_MS);
            http.setInstanceFollowRedirects(false); // refuse redirects so the bearer token cannot leak
            http.setRequestMethod("POST");
            http.setDoOutput(true);
            http.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            http.setRequestProperty("Accept", "application/json");
            http.setRequestProperty("User-Agent", USER_AGENT);
            if (bearer != null) http.setRequestProperty("Authorization", "Bearer " + bearer);

            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = http.getOutputStream()) { out.write(payload); }

            int code = http.getResponseCode();
            if (code >= 300 && code < 400)
                throw new FeedException("The service redirected the request; refusing to continue.", code, 0);
            if (code == 401)
                throw new FeedException("Your session has expired. Please sign in again.", 401, 0);
            if (code == 429)
                throw new FeedException("Too many requests. Please wait before refreshing.", 429, retryAfterMs(http));
            if (code < 200 || code >= 300)
                throw new FeedException("The live map service is unavailable (HTTP " + code + ").", code, 0);

            byte[] bytes;
            try (InputStream in = http.getInputStream()) { bytes = readBounded(in); }
            JSONObject json;
            try {
                json = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            } catch (JSONException e) {
                throw new FeedException("The live map service returned an unexpected response.", code, 0);
            }
            // A structured failure envelope: report safely without echoing the server's message.
            if (json.has("success") && !json.optBoolean("success", true))
                throw new FeedException("The live map service could not complete the request.", code, 0);
            synchronized(requestLock) { checkActive(requestEpoch); }
            return json;
        } catch (SocketTimeoutException e) {
            throw new FeedException("The live map service timed out. Please retry.");
        } catch (IOException e) {
            synchronized(requestLock) { checkActive(requestEpoch); }
            throw new FeedException("Could not reach the live map service.");
        } finally {
            try { http.disconnect(); } catch (Exception ignored) { }
            if (connection == http) connection = null;
        }
    }

    private void checkActive(long requestEpoch) throws FeedException {
        if(epoch != requestEpoch || Thread.currentThread().isInterrupted()) throw new FeedException("Request cancelled.");
    }

    private static long retryAfterMs(HttpURLConnection http) {
        String header = http.getHeaderField("Retry-After");
        if (header != null) {
            try {
                long seconds = Long.parseLong(header.trim());
                if (seconds >= 0) return Math.min(seconds, 3600) * 1000L; // cap at one hour
            } catch (NumberFormatException ignored) {
                // HTTP-date form is not parsed here; fall through to the default.
            }
        }
        return DEFAULT_RETRY_AFTER_MS;
    }

    private static byte[] readBounded(InputStream stream) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new IOException("Interrupted");
            if (out.size() + count > MAX_RESPONSE_BYTES) throw new IOException("Response too large");
            out.write(buffer, 0, count);
        }
        return out.toByteArray();
    }

    private static double clamp(double value, double min, double max) {
        return value < min ? min : (value > max ? max : value);
    }

    private static String nonEmpty(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

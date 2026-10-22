package dev.pgrazor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Prototype system-browser Google sign-in using the authorization-code + PKCE flow (RFC 7636),
 * built on {@link HttpURLConnection} with no third-party dependencies.
 *
 * <p><b>Prototype only.</b> The client id and redirect scheme below were observed in the public
 * PGSharp manifest (they are not secrets); initial sign-in and an immediate game restart were verified on a Pixel 11 Pro XL.
 * Long-term session renewal remains unverified. This class only performs the local half: it launches
 * the system browser, receives the custom-scheme redirect, exchanges the code for tokens over
 * TLS, and reads the id-token claims.
 *
 * <p>Design notes and safety properties:
 * <ul>
 *   <li>At most one session is pending at a time; {@link #begin(Activity)} replaces and wipes any
 *       previous one. All state is memory only and never persisted.</li>
 *   <li>PKCE is used as a public client: the token exchange sends {@code client_id} and
 *       {@code code_verifier} and <b>never</b> a client secret.</li>
 *   <li>The redirect is only accepted when its scheme and path match exactly and the {@code state}
 *       matches the one issued for the pending session; a duplicate or unrelated callback does not
 *       consume the pending session. The authorization code is consumed exactly once, before any
 *       network call.</li>
 *   <li>Network work runs off the main thread, holds no {@link Activity} reference, refuses
 *       redirects, enforces TLS, bounds the response to 64 KiB, and expires the session after five
 *       minutes (measured with {@link SystemClock#elapsedRealtime()}).</li>
 *   <li>The id-token payload is decoded only to read claims (issuer, audience, expiry, nonce,
 *       email). This does <b>not</b> verify the JWT signature; trust comes from the TLS connection
 *       to the Google token endpoint. An id token is accepted only when every claim checks out and
 *       an email is present. Tokens are never cached.</li>
 *   <li>{@link Control#event} records phase/status only, never raw errors, URLs, or token
 *       material.</li>
 * </ul>
 */
public final class GoogleBrowserAuth {
    // Public values observed in the PGSharp manifest (not secrets). PKCE public client, no secret.
    private static final String CLIENT_ID =
            "848232511240-dmrj3gba506c9svge2p9gq35p1fg654p.apps.googleusercontent.com";
    private static final String REDIRECT_SCHEME =
            "com.googleusercontent.apps.848232511240-dmrj3gba506c9svge2p9gq35p1fg654p";
    private static final String REDIRECT_PATH = "/oauth2redirect";
    private static final String REDIRECT_URI = REDIRECT_SCHEME + ":" + REDIRECT_PATH;
    private static final String AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    private static final String SCOPE = "openid email";

    private static final long SESSION_TTL_MS = 5 * 60 * 1000L;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;
    private static final int MAX_RESPONSE_BYTES = 64 * 1024;
    private static final long CLOCK_SKEW_SECONDS = 120L;

    private static final SecureRandom RANDOM = new SecureRandom();

    /** The single pending/completed session; guarded by {@code GoogleBrowserAuth.class}. */
    private static Session current;

    private GoogleBrowserAuth() {}

    /** In-memory record of one sign-in attempt. Sensitive fields are nulled once no longer needed. */
    private static final class Session {
        final String requestId;        // opaque id handed back to the caller
        final String state;            // CSRF/replay guard echoed in the redirect
        final String nonce;            // bound into the id token to guard against replay
        final long createdAt;          // elapsedRealtime at launch, for the five-minute expiry
        volatile String codeVerifier;  // PKCE verifier; nulled after the exchange or on cleanup
        boolean codeConsumed;          // set once a redirect for this session is accepted
        String hostClass;
        boolean browserLeft;
        volatile String result;        // null while pending; the delivered-once JSON when ready

        Session(String requestId, String state, String nonce, String codeVerifier, long createdAt) {
            this.requestId = requestId;
            this.state = state;
            this.nonce = nonce;
            this.codeVerifier = codeVerifier;
            this.createdAt = createdAt;
        }
    }

    /**
     * Starts a sign-in: builds the PKCE parameters, launches the system browser at Google's
     * authorization endpoint, and returns an opaque request id. Any previous pending session is
     * replaced and wiped. The result is retrieved later with {@link #takeResult(String)}.
     *
     * @return the opaque request id; never null
     */
    public static synchronized String begin(Activity activity) {
        discardCurrent();
        String requestId = randomToken(16);
        String state = randomToken(32);
        String nonce = randomToken(32);
        String verifier = randomToken(32);
        String challenge;
        try {
            challenge = codeChallenge(verifier);
        } catch (Exception problem) {
            // No session is created; takeResult will report nothing is pending for this id.
            Control.event("google-auth", "begin aborted; PKCE unavailable");
            throw new IllegalStateException("PKCE unavailable");
        }

        Session session = new Session(requestId, state, nonce, verifier, SystemClock.elapsedRealtime());
        current = session;
        session.hostClass = activity.getClass().getName();

        Uri authUri = Uri.parse(AUTH_ENDPOINT).buildUpon()
                .appendQueryParameter("response_type", "code")
                .appendQueryParameter("client_id", CLIENT_ID)
                .appendQueryParameter("redirect_uri", REDIRECT_URI)
                .appendQueryParameter("scope", SCOPE)
                .appendQueryParameter("state", state)
                .appendQueryParameter("nonce", nonce)
                .appendQueryParameter("code_challenge", challenge)
                .appendQueryParameter("code_challenge_method", "S256")
                .appendQueryParameter("prompt", "select_account")
                .build();

        Intent intent = new Intent(Intent.ACTION_VIEW, authUri)
                .addCategory(Intent.CATEGORY_BROWSABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
            Control.event("google-auth", "begin; browser launched");
        } catch (RuntimeException noBrowser) {
            // Never log the exception detail or the URL.
            fail(session);
            Control.event("google-auth", "begin failed; no browser available");
        }
        return requestId;
    }

    /**
     * Handles a custom-scheme redirect delivered to the callback activity. Only a URI whose scheme
     * and path match the configured redirect and whose {@code state} matches the pending session is
     * acted on; anything else (a duplicate, an unrelated scheme, or a stale state) is ignored and
     * leaves the pending session untouched. The authorization code is consumed once and the token
     * exchange is dispatched to a background thread.
     *
     * @return true when the URI was recognised as this session's callback
     */
    public static synchronized boolean handleRedirect(Uri uri) {
        if (uri == null) return false;
        if (uri.toString().length() > 16384 || uri.getAuthority() != null || uri.getFragment() != null) return false;
        if (!REDIRECT_SCHEME.equalsIgnoreCase(uri.getScheme()) || !REDIRECT_PATH.equals(uri.getPath()))
            return false; // not our callback; say nothing and keep the pending session
        for (String key : new String[]{"state", "code", "error"})
            if (uri.getQueryParameters(key).size() > 1) return false;

        Session session = current;
        if (session == null || session.result != null || session.codeConsumed) {
            Control.event("google-auth", "callback ignored; nothing pending");
            return false;
        }
        String state = queryParameter(uri, "state");
        if (!constantTimeEquals(state, session.state)) {
            // Duplicate or unrelated callback: must not consume the pending session.
            Control.event("google-auth", "callback ignored; state mismatch");
            return false;
        }
        if (expired(session)) {
            fail(session);
            Control.event("google-auth", "result=Fail; session expired before callback");
            return true;
        }

        String error = queryParameter(uri, "error");
        if (error != null) {
            session.codeConsumed = true;
            boolean cancelled = "access_denied".equals(error);
            complete(session, cancelled ? cancelledJson() : failJson());
            Control.event("google-auth", cancelled ? "result=Cancelled; user declined" : "result=Fail; error response");
            return true;
        }

        String code = queryParameter(uri, "code");
        if (code == null || code.isEmpty()) {
            session.codeConsumed = true;
            complete(session, failJson());
            Control.event("google-auth", "result=Fail; callback missing code");
            return true;
        }

        // Consume the code exactly once, before any network work.
        session.codeConsumed = true;
        final String verifier = session.codeVerifier;
        session.codeVerifier = null; // the worker holds its own copy below
        final String nonce = session.nonce;
        final Session captured = session;
        Control.event("google-auth", "callback accepted; token exchange starting");
        Thread worker = new Thread(() -> finishResult(captured, exchange(code, verifier, nonce)),
                "pgrazor-google-auth");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    /**
     * Returns the result for the given request id exactly once, or null while the session is still
     * pending (or when the id does not match the current session). A still-pending session past its
     * five-minute lifetime is reported as a failure. On any non-null return the session is dropped.
     *
     * @return a JSON object {@code {"status":"Success"|"Cancelled"|"Fail", ...}} (tokens only on
     *         Success) delivered once, or null while pending
     */
    public static synchronized String takeResult(String requestId) {
        Session session = current;
        if (session == null || requestId == null || !requestId.equals(session.requestId)) return null;
        if (expired(session)) {
            session.result = failJson();
            Control.event("google-auth", "result=Fail; session timed out");
        }
        if (session.result == null) return null; // still pending
        String json = session.result;
        session.codeVerifier = null;
        current = null; // deliver exactly once, then forget everything
        return json;
    }

    /**
     * Cancels the session matching the given request id, if it is still pending, recording a
     * Cancelled result for a single {@link #takeResult(String)}. A non-matching id is ignored. This
     * is the hook a coordinator can call when it detects the user abandoned the browser; the initial
     * launch is never cancelled here.
     */
    public static synchronized void cancel(String requestId) {
        Session session = current;
        if (session == null || requestId == null || !requestId.equals(session.requestId)) return;
        session.codeConsumed = true;
        if (session.result == null) {
            complete(session, cancelledJson());
            Control.event("google-auth", "result=Cancelled; cancelled by request");
        }
    }

    public static synchronized void onHostPaused(Activity activity) {
        if (current != null && activity.getClass().getName().equals(current.hostClass)) current.browserLeft = true;
    }

    public static synchronized void onHostResumed(Activity activity) {
        final Session session = current;
        if (session == null || !session.browserLeft || !activity.getClass().getName().equals(session.hostClass)) return;
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            synchronized (GoogleBrowserAuth.class) {
                if (current == session && !session.codeConsumed && session.result == null) cancel(session.requestId);
            }
        }, 1000);
    }

    // --- internal helpers -------------------------------------------------------------------

    private static void discardCurrent() {
        Session previous = current;
        if (previous != null) previous.codeVerifier = null;
        current = null;
    }

    // Marks a result on the pending session; keeps any result already set (e.g. a cancel that raced).
    private static void complete(Session session, String json) {
        session.codeVerifier = null;
        if (session.result == null) session.result = json;
    }

    private static void fail(Session session) {
        complete(session, failJson());
    }

    // Stores the background exchange's outcome under the lock, dropping it if the session was replaced
    // or already resolved. Called from the worker thread; the network itself ran with no lock held.
    private static synchronized void finishResult(Session session, String json) {
        session.codeVerifier = null;
        if (current == session && session.result == null) session.result = expired(session) ? failJson() : json;
    }

    private static boolean expired(Session session) {
        return SystemClock.elapsedRealtime() - session.createdAt > SESSION_TTL_MS;
    }

    // Runs off the main thread with no Activity/Context reference. Returns the result JSON string.
    private static String exchange(String code, String verifier, String nonce) {
        if (verifier == null) return failJson();
        try {
            JSONObject tokens = postToken(code, verifier);
            String idToken = tokens.optString("id_token", "");
            if (idToken.isEmpty()) {
                Control.event("google-auth", "result=Fail; no id token returned");
                return failJson();
            }
            JSONObject claims = decodeJwtPayload(idToken);
            String problem = claimProblem(claims, nonce);
            if (problem != null) {
                Control.event("google-auth", "result=Fail; id token rejected (" + problem + ")");
                return failJson();
            }
            JSONObject success = new JSONObject();
            success.put("status", "Success");
            success.put("email", claims.optString("email", ""));
            success.put("idToken", idToken);
            Control.event("google-auth", "result=Success");
            return success.toString();
        } catch (Exception failure) {
            // Never log the exception detail or any token/response content.
            Control.event("google-auth", "result=Fail; token exchange failed");
            return failJson();
        }
    }

    private static JSONObject postToken(String code, String verifier) throws IOException, JSONException {
        URL url = new URL(TOKEN_ENDPOINT);
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IOException("insecure endpoint");
        HttpURLConnection http = (HttpURLConnection) url.openConnection();
        try {
            http.setConnectTimeout(CONNECT_TIMEOUT_MS);
            http.setReadTimeout(READ_TIMEOUT_MS);
            http.setInstanceFollowRedirects(false); // never follow redirects on the token path
            http.setRequestMethod("POST");
            http.setDoOutput(true);
            http.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=utf-8");
            http.setRequestProperty("Accept", "application/json");

            StringBuilder form = new StringBuilder();
            appendForm(form, "grant_type", "authorization_code");
            appendForm(form, "code", code);
            appendForm(form, "client_id", CLIENT_ID);      // PKCE public client: no client secret
            appendForm(form, "redirect_uri", REDIRECT_URI);
            appendForm(form, "code_verifier", verifier);
            byte[] payload = form.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = http.getOutputStream()) { out.write(payload); }

            int status = http.getResponseCode();
            if (status < 200 || status >= 300) {
                Control.event("google-auth", "Token endpoint HTTP " + status);
                throw new IOException("token endpoint rejected request");
            }
            byte[] bytes;
            try (InputStream in = http.getInputStream()) { bytes = readBounded(in); }
            return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        } finally {
            try { http.disconnect(); } catch (RuntimeException ignored) {}
        }
    }

    // Decodes the JWT payload ONLY to read claims. This does not verify the signature; trust comes
    // from the TLS connection to the Google token endpoint that returned the token.
    private static JSONObject decodeJwtPayload(String idToken) throws JSONException {
        String[] parts = idToken.split("\\.");
        if (parts.length != 3) throw new JSONException("malformed id token");
        byte[] payload = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        return new JSONObject(new String(payload, StandardCharsets.UTF_8));
    }

    // Returns a short phase label for the first failing check, or null when every claim is valid.
    private static String claimProblem(JSONObject claims, String nonce) {
        if (claims == null) return "payload";
        String issuer = claims.optString("iss", "");
        if (!"https://accounts.google.com".equals(issuer) && !"accounts.google.com".equals(issuer))
            return "issuer";
        if (!CLIENT_ID.equals(claims.optString("aud", ""))) return "audience";
        long exp = claims.optLong("exp", 0L); // seconds since epoch
        long nowSeconds = System.currentTimeMillis() / 1000L;
        if (exp <= 0 || nowSeconds > exp + CLOCK_SKEW_SECONDS) return "expiry";
        if (nonce == null || !nonce.equals(claims.optString("nonce", ""))) return "nonce";
        if (claims.optString("email", "").isEmpty()) return "email";
        return null;
    }

    private static String queryParameter(Uri uri, String key) {
        try { return uri.getQueryParameter(key); }
        catch (RuntimeException malformed) { return null; }
    }

    private static void appendForm(StringBuilder form, String key, String value) {
        try {
            if (form.length() > 0) form.append('&');
            form.append(URLEncoder.encode(key, "UTF-8")).append('=').append(URLEncoder.encode(value, "UTF-8"));
        } catch (java.io.UnsupportedEncodingException impossible) {
            throw new AssertionError(impossible); // UTF-8 is always available
        }
    }

    private static byte[] readBounded(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = in.read(buffer)) != -1) {
            if (out.size() + count > MAX_RESPONSE_BYTES) throw new IOException("response too large");
            out.write(buffer, 0, count);
        }
        return out.toByteArray();
    }

    private static String randomToken(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return Base64.encodeToString(buffer, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private static String codeChallenge(String verifier) throws Exception {
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        byte[] digest = sha256.digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.encodeToString(digest, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    // Constant-time comparison so a mismatched state cannot be probed by timing.
    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static String failJson() { return statusJson("Fail"); }

    private static String cancelledJson() { return statusJson("Cancelled"); }

    private static String statusJson(String status) {
        try { return new JSONObject().put("status", status).toString(); }
        catch (JSONException impossible) { return "{\"status\":\"" + status + "\"}"; }
    }
}

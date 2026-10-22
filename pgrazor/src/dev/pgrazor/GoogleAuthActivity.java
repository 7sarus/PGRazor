package dev.pgrazor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Prototype OAuth callback trampoline. The redirect from the system browser (the reversed-client-id
 * custom scheme) is routed here by an exported intent filter declared in the manifest, which the
 * coordinator maintains. This activity shows no UI: it hands the redirect to
 * {@link GoogleBrowserAuth}, brings the game back to the foreground, and finishes.
 *
 * <p>It never logs the incoming intent or its data (the URI carries the authorization code), and it
 * holds no state across the handoff. The token exchange runs on {@link GoogleBrowserAuth}'s own
 * background thread with no reference to this activity, so finishing immediately cannot leak it.
 */
public final class GoogleAuthActivity extends Activity {

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        handleRedirect(getIntent());
        returnToGame();
        finish();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleRedirect(intent);
        returnToGame();
        finish();
    }

    // Only the expected callback is acted on; GoogleBrowserAuth validates the scheme, path, and state
    // and ignores anything unrelated. The URI is deliberately not logged.
    private void handleRedirect(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null) GoogleBrowserAuth.handleRedirect(data);
    }

    // Brings the existing game task to the front without clearing its state. In the instrumented host
    // this package is the game; the preview build returns to its own launcher. The async token
    // exchange has already been dispatched, so there is nothing to wait for here.
    private void returnToGame() {
        try {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                startActivity(launch);
            }
        } catch (RuntimeException ignored) {
            // A missing launcher intent or launch failure is non-fatal: the trampoline still finishes.
        }
    }
}

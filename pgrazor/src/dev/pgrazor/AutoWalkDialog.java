package dev.pgrazor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ContextThemeWrapper;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import android.os.Handler;
import android.os.Looper;

/**
 * Modal that plans and starts an auto-walk over nearby map POIs the game has already loaded.
 *
 * It only reads the shared POI snapshot (never scans or teleports): while open it renews the
 * snapshot request through {@link Control#setAutoWalkPlanning(boolean)}, reports whether data is
 * loading/empty/stale, and builds a deterministic nearest-neighbour route with
 * {@link AutoWalkPlanner}. Start applies only the stops that are actually loaded — it never
 * pretends to reach the requested count — and hands the route to {@link Control#startAutoWalk}.
 */
public final class AutoWalkDialog {
    private AutoWalkDialog() {}

    /** Bound to one dialog lifetime; all timers and the snapshot request stop on dismiss/destroy. */
    public static AlertDialog show(Activity activity) {
        if(activity.isFinishing()||activity.isDestroyed())return null;
        Context ctx = new ContextThemeWrapper(activity, Control.darkTheme()
            ? android.R.style.Theme_Material_Dialog_Alert : android.R.style.Theme_Material_Light_Dialog_Alert);

        LinearLayout layout = new LinearLayout(ctx);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(activity, 18);
        layout.setPadding(pad, dp(activity, 8), pad, 0);

        layout.addView(label(ctx, "Visit nearby Pok\u00e9Stops and Gyms, nearest first.", 13));

        LinearLayout countRow = new LinearLayout(ctx);
        countRow.setOrientation(LinearLayout.HORIZONTAL);
        countRow.setGravity(Gravity.CENTER_VERTICAL);
        countRow.setPadding(0, dp(activity, 10), 0, 0);
        countRow.addView(label(ctx, "Stops (1–" + MotionEngine.MAX_ROUTE_STOPS + "):", 15),
            new LinearLayout.LayoutParams(0, -2, 1));
        EditText countField = new EditText(ctx);
        countField.setInputType(InputType.TYPE_CLASS_NUMBER);
        countField.setFilters(new InputFilter[]{new InputFilter.LengthFilter(2)});
        countField.setText(String.valueOf(MotionEngine.MAX_ROUTE_STOPS));
        countField.setSingleLine(true);
        countField.setContentDescription("Number of stops to visit, 1 to " + MotionEngine.MAX_ROUTE_STOPS);
        countRow.addView(countField, new LinearLayout.LayoutParams(dp(activity, 72), -2));
        layout.addView(countRow);

        CheckBox loop = new CheckBox(ctx);
        loop.setText("Loop route");
        loop.setTextSize(14);
        loop.setChecked(false);
        layout.addView(loop);

        TextView status = label(ctx, "Waiting for nearby game locations…", 13);
        status.setPadding(0, dp(activity, 10), 0, 0);
        layout.addView(status);
        TextView running = label(ctx, "", 13);
        running.setPadding(0, dp(activity, 4), 0, dp(activity, 4));
        layout.addView(running);

        AlertDialog dialog = new AlertDialog.Builder(ctx)
            .setTitle("Auto-walk nearby")
            .setView(layout)
            .setNegativeButton("Close", null)
            .setNeutralButton("Stop auto-walk", null)
            .setPositiveButton("Start", null)
            .create();

        Controller controller = new Controller(activity, dialog, countField, loop, status, running);
        DialogLifecycle.bind(activity,dialog,controller::close);
        dialog.setOnShowListener(d -> controller.attach());
        dialog.show();
        return dialog;
    }

    /** Owns the repeating poll, the Start/Stop wiring, and tears everything down exactly once. */
    private static final class Controller {
        private final Activity activity;
        private final AlertDialog dialog;
        private final EditText countField;
        private final CheckBox loop;
        private final TextView status, running;
        private final Handler main = new Handler(Looper.getMainLooper());
        private final Runnable poll = this::poll;
        private boolean closed;

        Controller(Activity activity, AlertDialog dialog, EditText countField, CheckBox loop, TextView status, TextView running) {
            this.activity = activity; this.dialog = dialog; this.countField = countField;
            this.loop = loop; this.status = status; this.running = running;
        }

        void attach() {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> start());
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> stop());
            poll(); // begins the snapshot request and first UI update immediately
        }

        private void poll() {
            if (closed) return;
            if (activity.isFinishing() || activity.isDestroyed()) {
                if (dialog.isShowing()) dialog.dismiss(); else close();
                return;
            }
            Control.setAutoWalkPlanning(true); // renew while the dialog is showing
            updateAvailability();
            updateRunning();
            main.removeCallbacks(poll);
            main.postDelayed(poll, 1000);
        }

        /** Loading / unavailable / empty / loaded are each reported plainly; Start follows what is loaded. */
        private void updateAvailability() {
            String snapshot = Control.mapPoiSnapshot();
            boolean canStart = false;
            String message;
            if (snapshot.isEmpty()) {
                message = "Waiting for nearby game locations…";
            } else {
                double[][] points = parse(snapshot);
                if (points == null) {
                    message = "Nearby locations are unavailable right now.";
                } else {
                    int unique = AutoWalkPlanner.filter(points).length;
                    if (unique == 0) {
                        message = "No nearby locations loaded yet. Move around in-game to load some.";
                    } else {
                        int requested=MotionEngine.MAX_ROUTE_STOPS;
                        try{requested=Integer.parseInt(countField.getText().toString().trim());}catch(NumberFormatException ignored){}
                        int selected=Math.min(Math.max(1,requested),unique);
                        message = selected+" stops in route ("+unique+" nearby).";
                        canStart = true;
                    }
                }
            }
            status.setText(message);
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(canStart);
        }

        private void updateRunning() {
            MotionEngine.RouteProgress progress = Control.engine.routeProgress();
            running.setText(Control.engine.speedKmh==0 ? "Speed is 0 km/h. Use the walking icon to resume travel." : progress.active
                ? String.format(Locale.US, "A route is running: %d of %d stops done.", progress.visited, progress.total)
                : "");
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setEnabled(progress.active);
        }

        private void start() {
            if (closed) return;
            if (!Control.canEnable()) { toast("Location adapter is not ready."); return; }
            int count;
            String text = countField.getText().toString().trim();
            if (text.isEmpty()) count = MotionEngine.MAX_ROUTE_STOPS;
            else try { count = Integer.parseInt(text); }
            catch (NumberFormatException e) { countField.setError("Enter 1–" + MotionEngine.MAX_ROUTE_STOPS); return; }
            if (count < 1 || count > MotionEngine.MAX_ROUTE_STOPS) { countField.setError("Enter 1–" + MotionEngine.MAX_ROUTE_STOPS); return; }

            String snapshot = Control.mapPoiSnapshot();
            double[][] points = snapshot.isEmpty() ? null : parse(snapshot);
            if (points == null) { toast("Nearby locations are unavailable right now."); return; }

            AutoWalkPlanner.Plan plan;
            try { plan = AutoWalkPlanner.plan(Control.engine.latitude, Control.engine.longitude, points, count); }
            catch (IllegalArgumentException e) { toast(e.getMessage()); return; }
            if (plan.empty()) { toast("No nearby locations are loaded yet. Move around in-game, then try again."); return; }

            boolean looping = loop.isChecked();
            try { Control.startAutoWalk(plan.route, looping); }
            catch (IllegalArgumentException e) { toast(e.getMessage()); return; }
            Control.event("autowalk-started", String.format(Locale.US,
                "requested=%d selected=%d available=%d loop=%s", plan.requested, plan.selected(), plan.available, looping));
            if (plan.fewerThanRequested())
                toast("Only " + plan.selected() + " of " + plan.requested + " requested stops are loaded; starting with " + plan.selected() + ".");
            else
                toast("Auto-walking " + plan.selected() + (plan.selected() == 1 ? " stop" : " stops") + (looping ? " on a loop." : "."));
            dialog.dismiss();
        }

        private void stop() {
            if (closed) return;
            if (!Control.engine.routeProgress().active) { updateRunning(); return; }
            Control.engine.stop();
            Control.saveState();
            Control.event("autowalk-stopped", "User stopped the active route from Auto-walk");
            updateRunning();
            toast("Auto-walk stopped.");
        }

        private void toast(String message) {
            if (!closed) Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
        }

        void close() {
            if (closed) return;
            closed = true;
            main.removeCallbacksAndMessages(null);
            Control.setAutoWalkPlanning(false);
        }
    }

    /** Null means a parse error or an explicit error snapshot; an empty array means no points yet. */
    private static double[][] parse(String snapshot) {
        try {
            JSONObject root = new JSONObject(snapshot);
            if (root.has("error")) return null;
            JSONArray array = root.optJSONArray("points");
            if (array == null) return new double[0][];
            List<double[]> points = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                JSONObject point = array.optJSONObject(i);
                if (point == null) continue;
                points.add(new double[]{point.optDouble("lat", Double.NaN), point.optDouble("lon", Double.NaN)});
            }
            return points.toArray(new double[points.size()][]);
        } catch (JSONException invalid) {
            return null;
        }
    }

    private static int dp(Activity a, float value) { return Math.round(value * a.getResources().getDisplayMetrics().density); }
    private static TextView label(Context c, String text, int size) { TextView v = new TextView(c); v.setText(text); v.setTextSize(size); return v; }
}

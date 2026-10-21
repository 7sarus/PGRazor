package dev.pgrazor;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Rect;
import android.content.SharedPreferences;
import android.widget.CheckBox;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.Html;
import android.text.InputFilter;
import android.text.InputType;
import android.text.method.LinkMovementMethod;
import android.util.LruCache;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** In-activity map picker. Merely browsing/selecting does not change location. */
public final class WorldMapDialog {
    public interface DestinationListener {
        /** Return true after applying the destination, or false to keep the picker open. */
        boolean onDestination(double latitude, double longitude);
    }
    public interface RouteListener {
        /** Coordinates are copied in visit order; return true only after accepting the route. */
        boolean onRoute(double[][] waypoints);
    }

    public static AlertDialog show(Activity activity, double latitude, double longitude, DestinationListener listener) {
        return show(activity, latitude, longitude, listener, null);
    }

    public static AlertDialog show(Activity activity, double latitude, double longitude, DestinationListener listener, DestinationListener walk) {
        return show(activity,latitude,longitude,listener,walk,null);
    }

    public static AlertDialog show(Activity activity, double latitude, double longitude, DestinationListener listener, DestinationListener walk, RouteListener route) {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
            throw new IllegalArgumentException("Invalid map coordinates");
        ResponsiveLayout layout = new ResponsiveLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(activity, 12);
        layout.setPadding(pad, pad, pad, pad);
        TextView hint = label(activity, "Drag to pan. Pinch to zoom. Tap to select a destination.", 13);
        layout.addView(hint);
        TextView selected = label(activity, "", 15);
        selected.setPadding(0, dp(activity, 8), 0, dp(activity, 8));
        LinearLayout selectionRow = new LinearLayout(activity);
        selectionRow.setGravity(Gravity.CENTER_VERTICAL);
        selectionRow.addView(selected, new LinearLayout.LayoutParams(0, -2, 1));
        Button saved = button(activity, "Saved places");
        selectionRow.addView(saved, new LinearLayout.LayoutParams(dp(activity, route == null ? 116 : 100), dp(activity, 48)));
        Button routeMode = button(activity, "Route"); routeMode.setContentDescription("Open route builder");
        routeMode.setVisibility(route == null ? View.GONE : View.VISIBLE);
        selectionRow.addView(routeMode,new LinearLayout.LayoutParams(dp(activity, 64),dp(activity, 48)));
        layout.addView(selectionRow);
        TextView attribution = label(activity, "", 12);
        attribution.setGravity(Gravity.RIGHT);
        attribution.setPadding(0, 0, 0, dp(activity, 6));
        attribution.setText(Html.fromHtml("© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap contributors</a>", Html.FROM_HTML_MODE_LEGACY));
        attribution.setMovementMethod(LinkMovementMethod.getInstance());
        layout.addView(attribution);
        TextView status = label(activity, "Loading map…", 12);
        MapView map = new MapView(activity, latitude, longitude, selected, status);
        LinearLayout layers=new LinearLayout(activity);
        SharedPreferences preferences=activity.getSharedPreferences("pgrazor-map",0);
        String[] names={"Stops","Gyms","Raids"};
        for(int i=0;i<names.length;i++){
            final int bit=1<<i;CheckBox toggle=new CheckBox(activity);toggle.setText(names[i]);toggle.setTextSize(13);
            boolean enabled=preferences.getBoolean(names[i],false);if(enabled)map.layers|=bit;toggle.setChecked(enabled);
            final String key=names[i];toggle.setOnCheckedChangeListener((b,on)->{map.layers=on?map.layers|bit:map.layers&~bit;preferences.edit().putBoolean(key,on).apply();map.refreshPois();});
            layers.addView(toggle,new LinearLayout.LayoutParams(0,-2,1));
        }
        layout.addView(layers);
        TextView coverage=label(activity,"Nearby locations loaded by the game",12);layout.addView(coverage);map.poiStatus=coverage;
        map.refreshPois();
        PlaceUi places = new PlaceUi(activity, map, saved);
        saved.setOnClickListener(v -> places.openLibrary());
        layout.map = map;
        layout.addView(map, new LinearLayout.LayoutParams(-1, dp(activity, 420)));
        LinearLayout actions = new LinearLayout(activity);
        Button globe = button(activity, "World"), center = button(activity, "Selected"), retry = button(activity, "Retry");
        for (Button b : new Button[] {globe, center, retry}) actions.addView(b, new LinearLayout.LayoutParams(0, dp(activity, 48), 1));
        globe.setOnClickListener(v -> map.worldView());
        center.setOnClickListener(v -> map.centerSelection()); retry.setOnClickListener(v -> map.retry());
        layout.addView(actions);
        layout.addView(status);
        RouteUi routes = route == null ? null : new RouteUi(activity,map,routeMode,hint,globe,center,retry,route,walk != null);
        AlertDialog.Builder builder = new AlertDialog.Builder(activity).setTitle("World map").setView(layout)
            .setNegativeButton("Cancel", null).setPositiveButton("Teleport", null);
        if (walk != null) builder.setNeutralButton("Walk here", null);
        AlertDialog dialog = builder.create();
        dialog.setOnDismissListener(d -> { if(routes!=null)routes.close(); places.close(); map.close(); });
        dialog.setOnShowListener(d -> {
            if (dialog.getWindow() != null) dialog.getWindow().setLayout(-1, -2);
            if(routes!=null)routes.attach(dialog);
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                if(routes!=null && routes.editing) { routes.start(); return; }
                if (listener.onDestination(map.latitude, map.longitude)) dialog.dismiss();
            });
            if (walk != null) dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
                if (walk.onDestination(map.latitude, map.longitude)) dialog.dismiss();
            });
        });
        dialog.show();
        return dialog;
    }

    private static int dp(Activity a, float value) { return Math.round(value * a.getResources().getDisplayMetrics().density); }
    private static TextView label(Activity a, String text, int size) { TextView v = new TextView(a); v.setText(text); v.setTextSize(size); return v; }
    private static Button button(Activity a, String text) { Button b = new Button(a); b.setText(text); b.setAllCaps(false); b.setTextSize(13); b.setPadding(0, 0, 0, 0); return b; }

    /** Route mode reuses the map toolbar and dialog action rather than consuming another row. */
    private static final class RouteUi {
        static final int LIMIT=50;
        final Activity activity;
        final MapView map;
        final Button mode,add,undo,stops;
        final TextView hint;
        final RouteListener listener;
        final boolean hasWalk;
        final List<double[]> draft=new ArrayList<>();
        final List<AlertDialog> dialogs=new ArrayList<>();
        AlertDialog parent;
        boolean editing;
        RouteUi(Activity activity,MapView map,Button mode,TextView hint,Button add,Button undo,Button stops,RouteListener listener,boolean hasWalk) {
            this.activity=activity;this.map=map;this.mode=mode;this.hint=hint;
            this.add=add;this.undo=undo;this.stops=stops;this.listener=listener;this.hasWalk=hasWalk;
            mode.setOnClickListener(v -> {editing=!editing;refresh();});
            add.setOnClickListener(v -> {if(editing)addStop();else map.worldView();});
            undo.setOnClickListener(v -> {if(editing)undo();else map.centerSelection();});
            stops.setOnClickListener(v -> {if(editing)showStops();else map.retry();});
        }
        void attach(AlertDialog parent) {this.parent=parent;refresh();}
        void refresh() {
            mode.setText(editing ? "Map" : "Route");
            mode.setContentDescription(editing ? "Leave route builder without starting" : "Open route builder");
            hint.setText(editing ? "Route: "+draft.size()+"/50 stops. Tap map, then Add stop." : "Drag to pan. Pinch to zoom. Tap to select a destination.");
            add.setText(editing ? "Add stop" : "World"); add.setContentDescription(editing ? "Add selected destination as next route stop" : "Show world map");
            undo.setText(editing ? "Undo" : "Selected"); undo.setContentDescription(editing ? "Undo last route stop" : "Center selected destination");
            stops.setText(editing ? "Stops ("+draft.size()+")" : "Retry"); stops.setContentDescription(editing ? "View ordered route stops and clear route" : "Retry map tiles");
            add.setEnabled(!editing || draft.size()<LIMIT);undo.setEnabled(!editing || !draft.isEmpty());
            if(parent!=null) {
                parent.setTitle(editing ? "Build route" : "World map");
                Button action=parent.getButton(AlertDialog.BUTTON_POSITIVE);
                action.setText(editing ? "Start route" : "Teleport");
                action.setContentDescription(editing ? "Start route in numbered stop order" : "Teleport to selected destination");
                action.setEnabled(!editing || draft.size()>=2);
                Button walk=parent.getButton(AlertDialog.BUTTON_NEUTRAL);
                if(walk!=null && hasWalk)walk.setVisibility(editing ? View.GONE : View.VISIBLE);
            }
            map.setRoute(draft);
        }
        void addStop() {
            if(draft.size()>=LIMIT)return;
            double lat=map.latitude,lon=map.longitude;
            if(!Double.isFinite(lat) || !Double.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) {
                Toast.makeText(activity,"Select valid coordinates for this stop.",Toast.LENGTH_SHORT).show();return;
            }
            draft.add(new double[]{lat,lon});refresh();
        }
        void undo() {if(!draft.isEmpty())draft.remove(draft.size()-1);refresh();}
        void showStops() {
            AlertDialog.Builder builder=new AlertDialog.Builder(activity).setTitle("Route stops ("+draft.size()+"/50)")
                .setNegativeButton("Close",null).setPositiveButton("Clear route",null);
            if(draft.isEmpty())builder.setMessage("Select a destination on the map and tap Add stop. Add at least two stops before starting.");
            else {
                String[] rows=new String[draft.size()];
                for(int i=0;i<rows.length;i++)rows[i]=String.format(Locale.US,"%d.  %.6f, %.6f",i+1,draft.get(i)[0],draft.get(i)[1]);
                builder.setItems(rows,(d,index) -> {double[] stop=draft.get(index);map.select(stop[0],stop[1]);});
            }
            AlertDialog dialog=builder.create();dialogs.add(dialog);
            dialog.setOnDismissListener(d -> dialogs.remove(dialog));
            dialog.setOnShowListener(d -> {
                Button clear=dialog.getButton(AlertDialog.BUTTON_POSITIVE);clear.setEnabled(!draft.isEmpty());
                clear.setOnClickListener(v -> {draft.clear();refresh();dialog.dismiss();});
            });
            dialog.show();
        }
        void start() {
            if(draft.size()<2 || draft.size()>LIMIT)return;
            double[][] points=new double[draft.size()][2];
            for(int i=0;i<points.length;i++) {points[i][0]=draft.get(i)[0];points[i][1]=draft.get(i)[1];}
            if(listener.onRoute(points))parent.dismiss();
        }
        void close() {for(AlertDialog dialog:new ArrayList<>(dialogs))dialog.dismiss();draft.clear();}
    }

    /** Child dialogs share the map's activity; selecting a saved place never invokes Teleport. */
    private static final class PlaceUi {
        final Activity activity;
        final MapView map;
        final Button opener;
        final Handler main = new Handler(Looper.getMainLooper());
        final ThreadPoolExecutor storage = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<Runnable>(8));
        final List<AlertDialog> dialogs = new ArrayList<>();
        SavedPlaces places;
        boolean closed;
        PlaceUi(Activity activity, MapView map, Button opener) { this.activity = activity; this.map = map; this.opener = opener; }
        private SavedPlaces store() { if (places == null) places = new SavedPlaces(activity); return places; }
        private void show(AlertDialog dialog) {
            if (closed) return;
            dialogs.add(dialog);
            dialog.setOnDismissListener(d -> dialogs.remove(dialog));
            dialog.show();
        }
        void openLibrary() {
            if (closed) return;
            opener.setEnabled(false);
            storage.execute(() -> {
                try {
                    SavedPlaces.Snapshot snapshot = store().read();
                    main.post(() -> { if (!closed) { opener.setEnabled(true); showLibrary(snapshot); } });
                } catch (RuntimeException e) {
                    main.post(() -> { if (!closed) { opener.setEnabled(true); Toast.makeText(activity, "Saved places could not be opened.", Toast.LENGTH_LONG).show(); } });
                }
            });
        }
        private void showLibrary(SavedPlaces.Snapshot snapshot) {
            AlertDialog.Builder builder = new AlertDialog.Builder(activity).setTitle("Saved places (" + snapshot.entries.size() + "/50)")
                .setNegativeButton("Close", null).setPositiveButton("Save selected", null);
            final AlertDialog[] holder = new AlertDialog[1];
            if (snapshot.entries.isEmpty()) builder.setMessage(snapshot.damaged ? "Saved places could not be read. You can save new destinations here." : "No saved places yet. Save the selected map destination to find it again later.");
            else {
                String[] names = new String[snapshot.entries.size()];
                for (int i = 0; i < names.length; i++) {
                    SavedPlaces.Entry entry = snapshot.entries.get(i);
                    names[i] = String.format(Locale.US, "%s\n%.6f, %.6f", entry.name, entry.latitude, entry.longitude);
                }
                builder.setItems(names, (dialog, which) -> showPlace(snapshot.entries.get(which)));
            }
            holder[0] = builder.create();
            holder[0].setOnShowListener(d -> holder[0].getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> showSave(holder[0])));
            show(holder[0]);
            if (snapshot.damaged && !snapshot.entries.isEmpty()) Toast.makeText(activity, "Some saved places could not be read. Valid entries are shown.", Toast.LENGTH_LONG).show();
        }
        private void showSave(AlertDialog library) {
            final double latitude = map.latitude, longitude = map.longitude;
            LinearLayout form = new LinearLayout(activity); form.setOrientation(LinearLayout.VERTICAL);
            int pad = dp(activity, 20); form.setPadding(pad, 0, pad, 0);
            form.addView(label(activity, String.format(Locale.US, "%.6f, %.6f", latitude, longitude), 14));
            EditText name = new EditText(activity); name.setHint("Place name (up to 40 characters)"); name.setSingleLine(true);
            name.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
            name.setFilters(new InputFilter[] {new InputFilter.LengthFilter(SavedPlaces.NAME_LIMIT)});
            form.addView(name);
            AlertDialog dialog = new AlertDialog.Builder(activity).setTitle("Save selected place").setView(form)
                .setNegativeButton("Cancel", null).setPositiveButton("Save", null).create();
            dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                final SavedPlaces.Entry entry;
                try { entry = new SavedPlaces.Entry(name.getText().toString(), latitude, longitude); }
                catch (IllegalArgumentException e) { name.setError(e.getMessage()); return; }
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
                storage.execute(() -> {
                    try {
                        store().add(entry);
                        main.post(() -> {
                            if (!closed && dialog.isShowing()) {
                                dialog.dismiss(); library.dismiss(); Toast.makeText(activity, "Saved " + entry.name, Toast.LENGTH_SHORT).show(); openLibrary();
                            }
                        });
                    } catch (IOException | RuntimeException e) {
                        main.post(() -> { if (!closed && dialog.isShowing()) { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true); name.setError(e.getMessage()); } });
                    }
                });
            }));
            show(dialog);
        }
        private void showPlace(SavedPlaces.Entry entry) {
            AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(entry.name)
                .setMessage(String.format(Locale.US, "%.6f, %.6f\n\nSelect shows this destination on the map. Choose Teleport or Walk here there to apply it.", entry.latitude, entry.longitude))
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Select on map", (d, which) -> map.select(entry.latitude, entry.longitude))
                .setNeutralButton("Delete", null).create();
            dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> confirmDelete(entry, dialog)));
            show(dialog);
        }
        private void confirmDelete(SavedPlaces.Entry entry, AlertDialog details) {
            AlertDialog confirm = new AlertDialog.Builder(activity).setTitle("Delete saved place?")
                .setMessage(entry.name + " will be removed from your saved places. The current location stays unchanged.")
                .setNegativeButton("Cancel", null).setPositiveButton("Delete", null).create();
            confirm.setOnShowListener(d -> confirm.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                confirm.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
                storage.execute(() -> {
                    try {
                        store().remove(entry.id);
                        main.post(() -> { if (!closed && confirm.isShowing()) { confirm.dismiss(); details.dismiss(); openLibrary(); } });
                    } catch (IOException | RuntimeException e) {
                        main.post(() -> {
                            if (!closed && confirm.isShowing()) {
                                confirm.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                                Toast.makeText(activity, "Could not delete place. Please retry.", Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                });
            }));
            show(confirm);
        }
        void close() {
            closed = true;
            for (AlertDialog dialog : new ArrayList<>(dialogs)) dialog.dismiss();
            main.removeCallbacksAndMessages(null);
            storage.shutdown(); // Finish any explicitly requested persistence write; callbacks ignore the closed UI.
        }
    }

    /** Give the map the space left after controls, rather than guessing from physical screen orientation. */
    private static final class ResponsiveLayout extends LinearLayout {
        View map;
        final int maximumMapHeight;
        ResponsiveLayout(Activity activity) { super(activity); maximumMapHeight = dp(activity, 420); }
        protected void onMeasure(int widthSpec, int heightSpec) {
            if (map != null) {
                int reserved = getPaddingTop() + getPaddingBottom();
                for (int i = 0; i < getChildCount(); i++) {
                    View child = getChildAt(i);
                    if (child == map || child.getVisibility() == View.GONE) continue;
                    measureChildWithMargins(child, widthSpec, 0, MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED), 0);
                    LinearLayout.LayoutParams params = (LinearLayout.LayoutParams)child.getLayoutParams();
                    reserved += child.getMeasuredHeight() + params.topMargin + params.bottomMargin;
                }
                int available = MeasureSpec.getMode(heightSpec) == MeasureSpec.UNSPECIFIED ? maximumMapHeight : Math.max(0, MeasureSpec.getSize(heightSpec) - reserved);
                map.getLayoutParams().height = Math.min(maximumMapHeight, available);
            }
            super.onMeasure(widthSpec, heightSpec);
        }
    }

    private static final class Tile {
        final String key;
        final int zoom, x, y;
        final float left, top;
        Tile(int zoom, int x, int y, float left, float top) {
            this.zoom = zoom; this.x = x; this.y = y; this.left = left; this.top = top;
            key = zoom + "-" + x + "-" + y;
        }
    }

    private static final class MapView extends View {
        private final TextView selectionLabel, status;
        private final Handler main = new Handler(Looper.getMainLooper());
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final int tileSize, slop;
        private final File cacheDirectory;
        // A single worker and a single replaceable viewport task bound network and queued work.
        private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<Runnable>(1));
        private static final LruCache<String, Bitmap> bitmaps = new LruCache<String, Bitmap>(16 * 1024 * 1024) {
            protected int sizeOf(String key, Bitmap b) { return b.getAllocationByteCount(); }
        };
        private final Map<String, Long> failures = new HashMap<>();
        private List<Tile> visible = Collections.emptyList();
        private List<double[]> route = Collections.emptyList();
        private volatile boolean closed;
        private volatile int generation;
        private volatile Set<String> visibleKeys=Collections.emptySet();
        private int layers;
        private TextView poiStatus;
        private JSONArray pois=new JSONArray();
        private String lastPois="";
        // Bundled POI art is decoded once and reused every frame; a null entry marks a tried-but-missing
        // asset so the vector fallback renders without re-hitting the AssetManager each draw.
        private final Map<String, Bitmap> markerIcons = new HashMap<>();
        // Compact gym defender count has its own paints so the shared marker/route style is never disturbed.
        private final Paint labelFill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint labelOutline = new Paint(Paint.ANTI_ALIAS_FLAG);
        // Raid-boss base-species id -> English game name, read once from the bundled table (null if unreadable).
        private Map<String, String> bossNames;
        private boolean bossNamesLoaded;
        private final List<AlertDialog> poiDialogs = new ArrayList<>();
        private final Runnable poiRefresh=this::refreshPois;
        private volatile HttpURLConnection connection;
        private Future<?> pending;
        private double centerX, centerY, latitude, longitude;
        private int zoom = 14;
        private double zoomScale=1;
        private final ScaleGestureDetector pinch;
        private float downX, downY, previousX, previousY;
        private boolean dragged, multiTouch;
        private final Runnable request = this::loadVisible;
        private static final long CACHE_TTL = 7L * 24 * 60 * 60 * 1000;
        private static final long CACHE_LIMIT = 64L * 1024 * 1024;
        private static final int TILE_BYTE_LIMIT = 512 * 1024;

        MapView(Activity activity, double latitude, double longitude, TextView selection, TextView status) {
            super(activity);
            this.latitude = latitude; this.longitude = longitude;
            centerX = MapProjection.x(longitude); centerY = MapProjection.y(latitude);
            selectionLabel = selection; this.status = status;
            tileSize = dp(activity, 256); slop = ViewConfiguration.get(activity).getScaledTouchSlop();
            cacheDirectory = new File(activity.getCacheDir(), "pgrazor-map-tiles-v1");
            for(String icon:new String[]{"stop.png","gym.png","raid-normal.png","raid-rare.png","raid-legendary.png","raid-primal.png","raid-ultra.png","raid-shadow.png","raid-active.png","raid-mega-active.png","raid-primal-active.png","raid-shadow-active.png"})loadIcon(icon);
            setContentDescription("World map. Drag to pan, pinch to zoom, tap to select destination.");
            // White glyphs on a dark outline keep the count legible over any street colour.
            labelFill.setColor(Color.WHITE); labelFill.setTextAlign(Paint.Align.CENTER); labelFill.setFakeBoldText(true);
            labelOutline.setColor(Color.rgb(20, 24, 28)); labelOutline.setTextAlign(Paint.Align.CENTER);
            labelOutline.setStyle(Paint.Style.STROKE); labelOutline.setFakeBoldText(true);
            // Use the activity hardware renderer; tile I/O stays on the worker.
            pinch=new ScaleGestureDetector(activity,new ScaleGestureDetector.SimpleOnScaleGestureListener(){
                public boolean onScaleBegin(ScaleGestureDetector detector){multiTouch=true;return true;}
                public boolean onScale(ScaleGestureDetector detector){
                    double old=world(),minimum=Math.max(1,Math.min(getWidth(),getHeight()));
                    double next=Math.max(minimum,Math.min(tileSize*Math.pow(2,19),old*detector.getScaleFactor()));
                    double dx=detector.getFocusX()-getWidth()/2.0,dy=detector.getFocusY()-getHeight()/2.0;
                    double anchorX=MapProjection.offsetX(centerX,dx,old),anchorY=MapProjection.offsetY(centerY,dy,old);
                    zoom=Math.max(0,Math.min(19,(int)Math.floor(Math.log(next/tileSize)/Math.log(2))));
                    zoomScale=next/((zoom==0?minimum:tileSize)*(1<<zoom));
                    centerX=MapProjection.offsetX(anchorX,-dx,next);centerY=MapProjection.offsetY(anchorY,-dy,next);
                    viewportChanged();return true;
                }
            });
            updateSelection();
        }

        private void updateSelection() {
            selectionLabel.setText(String.format(Locale.US, "Selected: %.6f, %.6f", latitude, longitude));
        }
        private double displayedTileSize() { return (zoom == 0 ? Math.max(1, Math.min(getWidth(), getHeight())) : tileSize)*zoomScale; }
        private double world() { return MapProjection.worldPixels(zoom, displayedTileSize()); }
        void zoom(int amount) { int next = Math.max(0, Math.min(19, zoom + amount)); if (next != zoom) { zoom = next; viewportChanged(); } }
        void worldView() { zoomScale=1; zoom = 0; centerX = .5; centerY = .5; viewportChanged(); }
        void centerSelection() { zoomScale=1; if (zoom == 0) zoom = 14; centerX = MapProjection.x(longitude); centerY = MapProjection.y(latitude); viewportChanged(); }
        void select(double latitude, double longitude) {
            this.latitude = latitude; this.longitude = longitude;
            zoomScale=1; zoom = 14; centerX = MapProjection.x(longitude); centerY = MapProjection.y(latitude);
            updateSelection(); viewportChanged();
        }
        void retry() { failures.clear(); viewportChanged(); }
        void setRoute(List<double[]> points) {
            List<double[]> copy=new ArrayList<>(points.size());
            for(double[] point:points)copy.add(new double[]{point[0],point[1]});
            route=copy;invalidate();
        }
        protected void onSizeChanged(int w, int h, int oldw, int oldh) { viewportChanged(); }

        private void viewportChanged() {
            if (closed || getWidth() <= 0 || getHeight() <= 0) return;
            if (zoom == 0 && zoomScale<=1) { centerX = .5; centerY = .5; }
            int count = 1 << zoom;
            double pixels = displayedTileSize();
            double originX = centerX * world() - getWidth() / 2.0;
            double originY = centerY * world() - getHeight() / 2.0;
            int left = zoom == 0 ? 0 : (int)Math.floor(originX / pixels), top = (int)Math.floor(originY / pixels);
            int right = zoom == 0 ? 0 : (int)Math.floor((originX + getWidth() - 1) / pixels), bottom = (int)Math.floor((originY + getHeight() - 1) / pixels);
            List<Tile> tiles = new ArrayList<>();
            for (int y = Math.max(0, top); y <= Math.min(count - 1, bottom); y++) {
                for (int x = left; x <= right && tiles.size() < 32; x++) {
                    tiles.add(new Tile(zoom, Math.floorMod(x, count), y, (float)(x * pixels - originX), (float)(y * pixels - originY)));
                }
            }
            visible = tiles;
            Set<String> keys=new HashSet<>();for(Tile tile:tiles)keys.add(tile.key);visibleKeys=keys;
            generation++;
            // Keep useful in-flight tiles; never disconnect a socket on the UI thread.
            if(!main.hasCallbacks(request))main.postDelayed(request,60);
            invalidate();
        }

        protected void onDraw(Canvas canvas) {
            canvas.drawColor(Color.rgb(225, 231, 234));
            paint.setStyle(Paint.Style.FILL);
            for (Tile tile : visible) {
                Bitmap bitmap = bitmaps.get(tile.key);
                float pixels = (float)displayedTileSize();
                RectF bounds = new RectF(tile.left, tile.top, tile.left + pixels, tile.top + pixels);
                if (bitmap != null) canvas.drawBitmap(bitmap, null, bounds, paint);
                else if(!drawParent(canvas,tile,bounds)) {
                    paint.setColor(Color.rgb(202, 211, 216)); paint.setStyle(Paint.Style.STROKE); canvas.drawRect(bounds, paint); paint.setStyle(Paint.Style.FILL);
                }
            }
            drawPois(canvas);
            drawRoute(canvas,false);
            float markerX = (float)(getWidth() / 2.0 + MapProjection.deltaX(MapProjection.x(longitude), centerX) * world());
            float markerY = (float)(getHeight() / 2.0 + (MapProjection.y(latitude) - centerY) * world());
            float radius = Math.max(8, tileSize / 28f);
            paint.setColor(Color.WHITE); canvas.drawCircle(markerX, markerY, radius + 3, paint);
            paint.setColor(Color.rgb(197, 35, 52)); canvas.drawCircle(markerX, markerY, radius, paint);
            paint.setColor(Color.WHITE); canvas.drawCircle(markerX, markerY, radius / 3, paint);
            drawRoute(canvas,true);
        }

        private boolean drawParent(Canvas canvas,Tile tile,RectF bounds){
            for(int z=tile.zoom-1;z>=Math.max(0,tile.zoom-5);z--){int factor=1<<(tile.zoom-z);Bitmap parent=bitmaps.get(z+"-"+(tile.x/factor)+"-"+(tile.y/factor));if(parent==null)continue;
                int size=256/factor,x=(tile.x%factor)*size,y=(tile.y%factor)*size;
                canvas.drawBitmap(parent,new Rect(x,y,x+size,y+size),bounds,paint);return true;
            }return false;
        }
        void refreshPois(){
            if(closed)return;Control.setMapPoiOpen(layers!=0);
            String snapshot=Control.mapPoiSnapshot();
            if(!snapshot.equals(lastPois)){lastPois=snapshot;try{pois=new JSONObject(snapshot).optJSONArray("points");}catch(Exception e){pois=null;}if(pois==null)pois=new JSONArray();invalidate();}
            if(poiStatus!=null){String message=layers==0?"Nearby layers off":"Nearby locations loaded by the game ("+pois.length()+")";
                if(layers!=0&&snapshot.isEmpty())message="Waiting for nearby game locations";
                else if(layers!=0)try{if(new JSONObject(snapshot).has("error"))message="Nearby layers unavailable";}catch(Exception ignored){}
                poiStatus.setText(message);
            }
            invalidate();main.removeCallbacks(poiRefresh);main.postDelayed(poiRefresh,1000);
        }
        private void drawPois(Canvas canvas){
            if(layers==0)return;float radius=dp((Activity)getContext(),11);long now=System.currentTimeMillis();
            for(int i=0;i<pois.length();i++){JSONObject point=pois.optJSONObject(i);if(point==null||!poiVisible(point,now))continue;
                double lat=point.optDouble("lat",Double.NaN),lon=point.optDouble("lon",Double.NaN);if(!Double.isFinite(lat)||!Double.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
                float x=projectX(lon),y=projectY(lat);
                float extent="stop".equals(point.optString("kind"))?radius:dp((Activity)getContext(),27);
                if(x< -radius-3||x>getWidth()+radius+3||y< -extent||y>getHeight()+radius+3)continue;
                drawMarker(canvas,point,x,y,radius,now);
            }
        }

        /** Shared layer/time gate so only on-screen, currently drawn markers can be tapped. */
        private boolean poiVisible(JSONObject point,long now){
            boolean stop="stop".equals(point.optString("kind"));
            boolean showRaid=point.optLong("raidEnd")>now&&(layers&4)!=0;
            return stop?(layers&1)!=0:((layers&2)!=0||showRaid);
        }
        private float projectX(double lon){return (float)(getWidth()/2.0+MapProjection.deltaX(MapProjection.x(lon),centerX)*world());}
        private float projectY(double lat){return (float)(getHeight()/2.0+(MapProjection.y(lat)-centerY)*world());}

        private void drawMarker(Canvas canvas,JSONObject point,float x,float y,float radius,long now){
            boolean showRaid=point.optLong("raidEnd")>now&&(layers&4)!=0;
            boolean stop="stop".equals(point.optString("kind"));
            paint.setStyle(Paint.Style.FILL);
            if(showRaid){
                paint.setColor(Color.WHITE);canvas.drawCircle(x,y,radius+3,paint);
                if(!point.optBoolean("egg")){ // a hatched raid shows a solid accent ring; an egg stays plain
                    paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(Math.max(2,radius/5f));paint.setColor(Color.rgb(242,110,30));
                    canvas.drawCircle(x,y,radius+2,paint);paint.setStyle(Paint.Style.FILL);
                }
                drawIconOrFallback(canvas,loadIcon(raidIcon(point)),x,y,radius,point.optBoolean("egg")?"E":"R",Color.rgb(151,65,205));
                if(point.optBoolean("egg")){paint.setColor(Color.rgb(65,45,85));canvas.drawCircle(x+radius*.8f,y+radius*.8f,radius*.45f,paint);paint.setColor(Color.WHITE);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(radius*.65f);canvas.drawText("E",x+radius*.8f,y+radius*1.02f,paint);}
            } else if(stop){
                paint.setColor(Color.WHITE);canvas.drawCircle(x,y,radius+3,paint);
                drawIconOrFallback(canvas,loadIcon("stop.png"),x,y,radius,"S",Color.rgb(20,157,208));
            } else { // gym: a team-colour ring sits behind the disc
                paint.setColor(Color.WHITE);canvas.drawCircle(x,y,radius+3,paint);
                paint.setColor(teamColor(point.optString("team",null)));canvas.drawCircle(x,y,radius+1,paint);
                drawIconOrFallback(canvas,loadIcon("gym.png"),x,y,radius*0.92f,"G",Color.rgb(223,124,35));
            }
            if(!stop)drawDefenderLabel(canvas,point,x,y,radius); // gyms and gym-hosted raids; never stops
        }

        /** "(6-slots)/6" defenders just below a gym/raid marker; invalid or missing slots show "--/6". */
        private void drawDefenderLabel(Canvas canvas,JSONObject point,float x,float y,float radius){
            int slots=point.optInt("slots",-1);
            String text=(slots>=0&&slots<=6)?((6-slots)+"/6"):"--/6"; // 0 slots open = full (6/6), 6 open = empty (0/6)
            float textSize=Math.max(dp((Activity)getContext(),9),radius*0.78f);
            labelFill.setTextSize(textSize);labelOutline.setTextSize(textSize);labelOutline.setStrokeWidth(Math.max(2f,textSize/5f));
            float baseline=y+radius+dp((Activity)getContext(),3)+textSize; // sits beneath the white marker halo, within the tap reach
            canvas.drawText(text,x,baseline,labelOutline);
            canvas.drawText(text,x,baseline,labelFill);
        }

        private void drawIconOrFallback(Canvas canvas,Bitmap icon,float x,float y,float radius,String letter,int fallbackColor){
            if(icon!=null){
                RectF bounds=new RectF(x-radius,y-radius,x+radius,y+radius);
                canvas.drawBitmap(icon,null,bounds,paint);return;
            }
            paint.setStyle(Paint.Style.FILL);paint.setColor(fallbackColor);canvas.drawCircle(x,y,radius,paint);
            paint.setColor(Color.WHITE);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(radius*1.25f);canvas.drawText(letter,x,y+radius*.43f,paint);
        }

        /** Asset name for a raid cue, chosen from the game-resolved tier text (never the icon file name). */
        private static String raidIcon(JSONObject point){
            String tier=point.optString("tier","");String n=tier.toLowerCase(Locale.US);
            boolean egg=point.optBoolean("egg");
            if(n.contains("shadow"))return egg?"raid-shadow.png":"raid-shadow-active.png";
            if(n.contains("primal"))return egg?"raid-primal.png":"raid-primal-active.png";
            if(n.contains("ultra"))return "raid-ultra.png";
            if(n.contains("mega"))return "raid-mega-active.png";
            if(!egg)return "raid-active.png";
            if(tier.matches("_?[1-5]")){
                int level=tier.charAt(tier.length()-1)-'0';
                return level>=5?"raid-legendary.png":level>=3?"raid-rare.png":"raid-normal.png";
            }
            return "raid-active.png"; // Unknown/special tier: generic cue, never guess egg rarity.
        }
        /** Team colour keyed on the game-resolved constant name, so no numeric team id is assumed. */
        private static int teamColor(String name){
            if(name==null)return Color.rgb(150,150,150);
            String n=name.toLowerCase(Locale.US);
            if(n.contains("mystic")||n.contains("blue"))return Color.rgb(29,120,230);
            if(n.contains("valor")||n.contains("red"))return Color.rgb(221,60,60);
            if(n.contains("instinct")||n.contains("yellow"))return Color.rgb(240,190,30);
            return Color.rgb(150,150,150);
        }
        private Bitmap loadIcon(String name){
            if(markerIcons.containsKey(name))return markerIcons.get(name);
            Bitmap bitmap=null;
            try(InputStream in=getContext().getAssets().open("pgrazor/map-icons/"+name)){bitmap=BitmapFactory.decodeStream(in);}
            catch(IOException|RuntimeException ignored){bitmap=null;}
            markerIcons.put(name,bitmap);return bitmap;
        }

        /** Visible markers within the tap radius, nearest first; respects the active layers. */
        private List<JSONObject> poiHits(float px,float py){
            List<JSONObject> hits=new ArrayList<>();final List<Double> distances=new ArrayList<>();
            long now=System.currentTimeMillis();float reach=dp((Activity)getContext(),18);
            for(int i=0;i<pois.length();i++){JSONObject point=pois.optJSONObject(i);if(point==null||!poiVisible(point,now))continue;
                double lat=point.optDouble("lat",Double.NaN),lon=point.optDouble("lon",Double.NaN);if(!Double.isFinite(lat)||!Double.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
                double dx=px-projectX(lon),dy=py-projectY(lat),distance=Math.hypot(dx,dy);
                boolean labelHit=!"stop".equals(point.optString("kind"))&&Math.abs(dx)<=dp((Activity)getContext(),16)&&dy>=0&&dy<=dp((Activity)getContext(),27);
                if(distance<=reach||labelHit){hits.add(point);distances.add(distance);}
            }
            List<Integer> order=new ArrayList<>();for(int i=0;i<hits.size();i++)order.add(i);
            Collections.sort(order,(a,b)->Double.compare(distances.get(a),distances.get(b)));
            List<JSONObject> sorted=new ArrayList<>();for(int i:order)sorted.add(hits.get(i));return sorted;
        }

        private void openPoiDetails(List<JSONObject> hits){
            if(closed||hits.isEmpty())return;
            if(hits.size()==1){showPoiDetails(hits.get(0));return;}
            String[] labels=new String[hits.size()];for(int i=0;i<labels.length;i++)labels[i]=poiShortLabel(hits.get(i));
            AlertDialog chooser=new AlertDialog.Builder(getContext()).setTitle("Nearby here ("+hits.size()+")")
                .setItems(labels,(d,which)->showPoiDetails(hits.get(which))).setNegativeButton("Close",null).create();
            registerPoiDialog(chooser);chooser.show();
        }
        private String poiShortLabel(JSONObject point){
            long now=System.currentTimeMillis();
            if(point.optLong("raidEnd")>now){String tier=point.optString("tier","");return "Raid"+(tier.isEmpty()?"":" "+tier)+(point.optBoolean("egg")?" (egg)":"");}
            if("stop".equals(point.optString("kind")))return "PokéStop";
            String team=point.optString("team","");return "Gym"+(team.isEmpty()?"":" ("+team+")");
        }
        private void registerPoiDialog(AlertDialog dialog){
            poiDialogs.add(dialog);dialog.setOnDismissListener(d->poiDialogs.remove(dialog));
        }
        private void showPoiDetails(JSONObject initial){
            if(closed)return;
            final String id=initial.optString("id","");
            final TextView body=new TextView(getContext());
            int pad=dp((Activity)getContext(),18);body.setPadding(pad,pad,pad,pad);body.setTextSize(14);
            final AlertDialog dialog=new AlertDialog.Builder(getContext()).setTitle(poiTitle(initial)).setView(body).setNegativeButton("Close",null).create();
            final Runnable[] refresh=new Runnable[1];
            refresh[0]=()->{
                if(closed||!dialog.isShowing())return;
                JSONObject live=id.isEmpty()?null:findPoi(id);
                dialog.setTitle(poiTitle(live!=null?live:initial));
                body.setText(poiDetailsText(live!=null?live:initial,live==null));
                main.postDelayed(refresh[0],1000);
            };
            dialog.setOnDismissListener(d->{poiDialogs.remove(dialog);main.removeCallbacks(refresh[0]);});
            poiDialogs.add(dialog);dialog.show();refresh[0].run();
        }
        private JSONObject findPoi(String id){
            for(int i=0;i<pois.length();i++){JSONObject point=pois.optJSONObject(i);if(point!=null&&id.equals(point.optString("id")))return point;}
            return null;
        }
        private static String poiTitle(JSONObject point){
            long now=System.currentTimeMillis();
            if(point.optLong("raidEnd")>now)return "Raid";
            return "stop".equals(point.optString("kind"))?"PokéStop":"Gym";
        }
        /** Read-only; never changes the selected destination. "Unknown"/"unavailable" stay explicit. */
        private String poiDetailsText(JSONObject p,boolean gone){
            StringBuilder sb=new StringBuilder();
            double lat=p.optDouble("lat",Double.NaN),lon=p.optDouble("lon",Double.NaN);
            if(Double.isFinite(lat)&&Double.isFinite(lon))sb.append(String.format(Locale.US,"%.6f, %.6f\n\n",lat,lon));
            long now=System.currentTimeMillis();
            boolean stop="stop".equals(p.optString("kind"));
            if(stop)sb.append("PokéStop loaded nearby by the game.\n");
            else {
                String team=p.optString("team","");
                sb.append("Team: ").append(team.isEmpty()?"Unknown":team).append('\n');
                // Six defenders per gym: official Pokemon GO Help Center, Battling at Gyms (verified 2026-10-21).
                int slots=p.optInt("slots",-1);
                if(slots>=0&&slots<=6)sb.append("Defenders: ").append(6-slots).append("/6 ("+slots+" slots open)\n");
                else sb.append("Defenders: unavailable\n");
            }
            if(p.optLong("raidEnd")>now){
                sb.append('\n');boolean egg=p.optBoolean("egg");String tier=p.optString("tier","");
                sb.append("Raid tier: ").append(tier.isEmpty()?"Unknown":tier.replace("_", " ").replaceAll("([0-9])([A-Za-z])", "$1 $2").trim()).append('\n');
                if(egg){
                    long start=p.optLong("raidStart",0);
                    sb.append("Egg — boss not yet revealed");
                    if(start>now)sb.append("; hatches in ").append(countdown(start-now));
                    sb.append('\n');
                } else {
                    int boss=p.optInt("boss",0);
                    String name=boss>0?bossName(boss):null; // base species only; forms (e.g. Mega X/Y) not inferred
                    sb.append("Boss: ").append(boss>0?(name!=null?name:("#"+boss)):"unknown").append('\n');
                }
                long end=p.optLong("raidEnd",0);if(end>now)sb.append("Ends in ").append(countdown(end-now)).append('\n');
            }
            if(p.optLong("raidEnd")>0&&p.optLong("raidEnd")<=now)sb.append("\nRaid ended.\n");
            if(gone)sb.insert(0,"Last known data - no fresh nearby snapshot.\n\n");
            return sb.toString().trim();
        }
        private static String countdown(long millis){long total=Math.max(0,millis)/1000;return String.format(Locale.US,"%d:%02d",total/60,total%60);}

        /** English name for a base-species id, or null to fall back to #id; the table is read once. */
        private String bossName(int id){
            if(!bossNamesLoaded){bossNamesLoaded=true;bossNames=loadBossNames();} // one asset read per map, not per refresh
            return bossNames==null?null:bossNames.get(Integer.toString(id));
        }
        /** Parse the bundled id->name table once; any missing/oversize/malformed file leaves #id fallbacks. */
        private Map<String,String> loadBossNames(){
            try(InputStream in=getContext().getAssets().open("pgrazor/map-icons/pokemon-names.json")){
                ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;
                while((count=in.read(buffer))!=-1){if(out.size()+count>2*1024*1024)throw new IOException("Oversize name table");out.write(buffer,0,count);}
                JSONObject json=new JSONObject(new String(out.toByteArray(),"UTF-8"));
                Map<String,String> map=new HashMap<>();
                for(java.util.Iterator<String> keys=json.keys();keys.hasNext();){
                    String key=keys.next();String value=json.optString(key,"");
                    if(!value.isEmpty())map.put(key,value);
                }
                return map;
            }catch(IOException|org.json.JSONException|RuntimeException e){return null;}
        }

        /** Each segment takes the shortest horizontal wrap, splitting at the dateline when needed. */
        private void drawRoute(Canvas canvas,boolean markers) {
            if(route.isEmpty() || getWidth()<=0 || getHeight()<=0)return;
            double pixels=world();float radius=Math.max(11,tileSize/20f);
            int saved=canvas.save();
            if(zoom==0)canvas.clipRect((float)((getWidth()-pixels)/2),(float)((getHeight()-pixels)/2),(float)((getWidth()+pixels)/2),(float)((getHeight()+pixels)/2));
            paint.setStyle(Paint.Style.FILL);paint.setStrokeWidth(Math.max(2,tileSize/90f));
            for(int i=0;i<route.size();i++) {
                double[] point=route.get(i);
                double pointX=MapProjection.x(point[1]);
                double x=getWidth()/2.0+MapProjection.deltaX(pointX,centerX)*pixels;
                double y=getHeight()/2.0+(MapProjection.y(point[0])-centerY)*pixels;
                if(!markers && i>0) {
                    double[] previous=route.get(i-1);
                    double previousX=MapProjection.x(previous[1]);
                    double start=getWidth()/2.0+MapProjection.deltaX(previousX,centerX)*pixels;
                    double end=start+MapProjection.deltaX(pointX,previousX)*pixels;
                    double startY=getHeight()/2.0+(MapProjection.y(previous[0])-centerY)*pixels;
                    int first=(int)Math.ceil(-Math.max(start,end)/pixels),last=(int)Math.floor((getWidth()-Math.min(start,end))/pixels);
                    paint.setColor(Color.rgb(25,103,190));
                    for(int repeat=first;repeat<=last && repeat<first+32;repeat++)canvas.drawLine((float)(start+repeat*pixels),(float)startY,(float)(end+repeat*pixels),(float)y,paint);
                }
                if(markers) {
                    int first=(int)Math.ceil((-radius-x)/pixels),last=(int)Math.floor((getWidth()+radius-x)/pixels);
                    for(int repeat=first;repeat<=last && repeat<first+32;repeat++) {
                        float shownX=(float)(x+repeat*pixels),shownY=(float)y;
                        paint.setColor(Color.WHITE);canvas.drawCircle(shownX,shownY,radius+2,paint);
                        paint.setColor(Color.rgb(25,103,190));canvas.drawCircle(shownX,shownY,radius,paint);
                        paint.setTextSize(radius*1.1f);paint.setTextAlign(Paint.Align.CENTER);paint.setColor(Color.WHITE);
                        Paint.FontMetrics font=paint.getFontMetrics();canvas.drawText(Integer.toString(i+1),shownX,shownY-(font.ascent+font.descent)/2,paint);
                    }
                }
            }
            canvas.restoreToCount(saved);
        }

        public boolean onTouchEvent(MotionEvent event) {
            pinch.onTouchEvent(event);
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    getParent().requestDisallowInterceptTouchEvent(true);
                    downX = previousX = event.getX(); downY = previousY = event.getY(); dragged = false; multiTouch = false; return true;
                case MotionEvent.ACTION_POINTER_DOWN: multiTouch = true; return true;
                case MotionEvent.ACTION_MOVE:
                    if (multiTouch) return true;
                    float x = event.getX(), y = event.getY();
                    if (Math.hypot(x - downX, y - downY) > slop) dragged = true;
                    if (dragged && (zoom != 0 || zoomScale>1)) {
                        centerX = MapProjection.offsetX(centerX, previousX - x, world());
                        centerY = MapProjection.offsetY(centerY, previousY - y, world());
                        viewportChanged();
                    }
                    previousX = x; previousY = y; return true;
                case MotionEvent.ACTION_UP:
                    boolean insideWorld = zoom != 0 || (Math.abs(event.getX() - getWidth() / 2.0) <= world() / 2 && Math.abs(event.getY() - getHeight() / 2.0) <= world() / 2);
                    if (!dragged && !multiTouch) {
                        // A tap on a visible marker opens read-only details and never moves the destination.
                        List<JSONObject> hits = layers != 0 ? poiHits(event.getX(), event.getY()) : Collections.<JSONObject>emptyList();
                        if (!hits.isEmpty()) { performClick(); openPoiDetails(hits); getParent().requestDisallowInterceptTouchEvent(false); return true; }
                        if (insideWorld) {
                            longitude = MapProjection.longitude(MapProjection.offsetX(centerX, event.getX() - getWidth() / 2.0, world()));
                            latitude = MapProjection.latitude(MapProjection.offsetY(centerY, event.getY() - getHeight() / 2.0, world()));
                            updateSelection(); invalidate(); performClick();
                        }
                    }
                    getParent().requestDisallowInterceptTouchEvent(false); return true;
                case MotionEvent.ACTION_CANCEL: getParent().requestDisallowInterceptTouchEvent(false); return true;
                default: return true;
            }
        }
        public boolean performClick() { super.performClick(); return true; }

        private void loadVisible() {
            if (closed || (pending!=null&&!pending.isDone())) return;
            final int revision = generation;
            final List<Tile> wanted = new ArrayList<>();
            long now = SystemClock.elapsedRealtime();
            int blocked = 0;
            for (Tile tile : visible) {
                Long failedAt = failures.get(tile.key);
                if (bitmaps.get(tile.key) != null) continue;
                if (failedAt != null && now - failedAt < 60000) { blocked++; continue; }
                wanted.add(tile);
            }
            status.setText(wanted.isEmpty() ? (blocked > 0 ? "Map unavailable in some areas. Check internet, then Retry." : "Zoom " + zoom + " · Tap map to select") : "Loading map…");
            if (wanted.isEmpty()) return;
            final int blockedTiles = blocked;
            worker.purge();
            pending = worker.submit(() -> {
                int errors = 0;
                try {
                    if (!cacheDirectory.isDirectory() && !cacheDirectory.mkdirs()) throw new IOException("Cannot create map cache");
                    for (Tile tile : wanted) {
                        if(!visibleKeys.contains(tile.key))continue;
                        if (closed || Thread.currentThread().isInterrupted()) return;
                        try {
                            Bitmap bitmap = readTile(tile, revision);
                            main.post(() -> {
                                if (closed) { bitmap.recycle(); return; }
                                bitmaps.put(tile.key, bitmap); failures.remove(tile.key); invalidate();
                            });
                        } catch (IOException | RuntimeException e) {
                            if (closed || Thread.currentThread().isInterrupted()) return;
                            errors++;
                            main.post(() -> {
                                if (!closed) {
                                    if (failures.size() >= 128) failures.clear();
                                    failures.put(tile.key, SystemClock.elapsedRealtime());
                                }
                            });
                        }
                    }
                    trimCache();
                    final int finalErrors = errors + blockedTiles;
                    main.post(() -> { if (!closed && revision == generation) status.setText(finalErrors == 0 ? "Zoom " + zoom + " · Tap map to select" : "Map unavailable in some areas. Check internet, then Retry."); });
                } catch (IOException | RuntimeException e) {
                    main.post(() -> { if (!closed && revision == generation) status.setText("Map cache unavailable. Close map and retry."); });
                } finally {main.post(()->{if(!closed){pending=null;if(revision!=generation)loadVisible();}});}

            });
        }

        private Bitmap readTile(Tile tile, int revision) throws IOException {
            File file = new File(cacheDirectory, tile.key + ".png");
            // This cache deliberately uses the policy's >=7-day fallback instead of parsing HTTP cache headers.
            if (file.isFile() && System.currentTimeMillis() - file.lastModified() < CACHE_TTL) {
                try (InputStream stream = new FileInputStream(file)) { return decode(readBounded(stream)); }
                catch (IOException e) { file.delete(); }
            }
            if (closed) throw new IOException("Map closed");
            HttpURLConnection request = (HttpURLConnection)new URL("https://tile.openstreetmap.org/" + tile.zoom + "/" + tile.x + "/" + tile.y + ".png").openConnection();
            connection = request;
            try {
                request.setConnectTimeout(8000); request.setReadTimeout(8000);
                request.setInstanceFollowRedirects(false);
                request.setRequestProperty("User-Agent", "PGRazor/0.1 (+https://github.com/jpitty03/PGRazor)");
                request.setRequestProperty("Accept", "image/png");
                if (request.getResponseCode() != 200) throw new IOException("Tile HTTP " + request.getResponseCode());
                byte[] bytes;
                try (InputStream stream = request.getInputStream()) { bytes = readBounded(stream); }
                Bitmap bitmap = decode(bytes);
                if (closed) { bitmap.recycle(); throw new IOException("Map closed"); }
                File temporary = new File(cacheDirectory, tile.key + ".part");
                try {
                    try (FileOutputStream out = new FileOutputStream(temporary)) { out.write(bytes); }
                    if (file.exists()) file.delete();
                    if (!temporary.renameTo(file)) temporary.delete();
                    trimCache(); // Bound disk use even if the user keeps changing viewport before a batch finishes.
                } catch (IOException e) { temporary.delete(); } // A disk cache failure must not discard a usable map tile.
                return bitmap;
            } finally { request.disconnect(); if (connection == request) connection = null; }
        }

        private static byte[] readBounded(InputStream stream) throws IOException {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192]; int count;
            while ((count = stream.read(buffer)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new IOException("Map closed");
                if (out.size() + count > TILE_BYTE_LIMIT) throw new IOException("Oversize map tile");
                out.write(buffer, 0, count);
            }
            return out.toByteArray();
        }
        private static Bitmap decode(byte[] bytes) throws IOException {
            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth != 256 || bounds.outHeight != 256) throw new IOException("Invalid tile dimensions");
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) throw new IOException("Invalid map tile");
            return bitmap;
        }
        private void trimCache() {
            File[] files = cacheDirectory.listFiles(); if (files == null) return;
            Arrays.sort(files, Comparator.comparingLong(File::lastModified));
            long total = 0; for (File file : files) total += file.length();
            int remaining = files.length;
            for (File file : files) {
                if (total <= CACHE_LIMIT && remaining <= 1024) break;
                long length = file.length(); if (file.delete()) { total -= length; remaining--; }
            }
        }
        void close() {
            if (closed) return;
            closed = true; generation++;
            main.removeCallbacksAndMessages(null);
            for (AlertDialog dialog : new ArrayList<>(poiDialogs)) dialog.dismiss();
            poiDialogs.clear();
            if (pending != null) pending.cancel(true);
            worker.shutdownNow();

            failures.clear();Control.setMapPoiOpen(false);
        }
        protected void onDetachedFromWindow() { close(); super.onDetachedFromWindow(); }
    }
}

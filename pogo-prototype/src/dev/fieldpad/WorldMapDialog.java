package dev.fieldpad;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
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
        private final LruCache<String, Bitmap> bitmaps = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
            protected int sizeOf(String key, Bitmap b) { return b.getAllocationByteCount(); }
        };
        private final Map<String, Long> failures = new HashMap<>();
        private List<Tile> visible = Collections.emptyList();
        private List<double[]> route = Collections.emptyList();
        private volatile boolean closed;
        private volatile int generation;
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
            cacheDirectory = new File(activity.getCacheDir(), "fieldpad-map-tiles-v1");
            setContentDescription("World map. Drag to pan, pinch to zoom, tap to select destination.");
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
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
            generation++;
            if (pending != null) pending.cancel(true);
            worker.purge();
            HttpURLConnection active = connection;
            if (active != null) active.disconnect();
            main.removeCallbacks(request);
            main.postDelayed(request, 180); // Only request the settled visible viewport, never adjacent tiles.
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
                else {
                    paint.setColor(Color.rgb(202, 211, 216)); paint.setStyle(Paint.Style.STROKE); canvas.drawRect(bounds, paint); paint.setStyle(Paint.Style.FILL);
                }
            }
            drawRoute(canvas,false);
            float markerX = (float)(getWidth() / 2.0 + MapProjection.deltaX(MapProjection.x(longitude), centerX) * world());
            float markerY = (float)(getHeight() / 2.0 + (MapProjection.y(latitude) - centerY) * world());
            float radius = Math.max(8, tileSize / 28f);
            paint.setColor(Color.WHITE); canvas.drawCircle(markerX, markerY, radius + 3, paint);
            paint.setColor(Color.rgb(197, 35, 52)); canvas.drawCircle(markerX, markerY, radius, paint);
            paint.setColor(Color.WHITE); canvas.drawCircle(markerX, markerY, radius / 3, paint);
            drawRoute(canvas,true);
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
                    if (!dragged && !multiTouch && insideWorld) {
                        longitude = MapProjection.longitude(MapProjection.offsetX(centerX, event.getX() - getWidth() / 2.0, world()));
                        latitude = MapProjection.latitude(MapProjection.offsetY(centerY, event.getY() - getHeight() / 2.0, world()));
                        updateSelection(); invalidate(); performClick();
                    }
                    getParent().requestDisallowInterceptTouchEvent(false); return true;
                case MotionEvent.ACTION_CANCEL: getParent().requestDisallowInterceptTouchEvent(false); return true;
                default: return true;
            }
        }
        public boolean performClick() { super.performClick(); return true; }

        private void loadVisible() {
            if (closed) return;
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
                        if (closed || revision != generation || Thread.currentThread().isInterrupted()) return;
                        try {
                            Bitmap bitmap = readTile(tile, revision);
                            main.post(() -> {
                                if (closed) { bitmap.recycle(); return; }
                                bitmaps.put(tile.key, bitmap); failures.remove(tile.key); invalidate();
                            });
                        } catch (IOException | RuntimeException e) {
                            if (closed || revision != generation || Thread.currentThread().isInterrupted()) return;
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
                }
            });
        }

        private Bitmap readTile(Tile tile, int revision) throws IOException {
            File file = new File(cacheDirectory, tile.key + ".png");
            // This cache deliberately uses the policy's >=7-day fallback instead of parsing HTTP cache headers.
            if (file.isFile() && System.currentTimeMillis() - file.lastModified() < CACHE_TTL) {
                try (InputStream stream = new FileInputStream(file)) { return decode(readBounded(stream)); }
                catch (IOException e) { file.delete(); }
            }
            if (closed || revision != generation) throw new IOException("Viewport changed");
            HttpURLConnection request = (HttpURLConnection)new URL("https://tile.openstreetmap.org/" + tile.zoom + "/" + tile.x + "/" + tile.y + ".png").openConnection();
            connection = request;
            try {
                request.setConnectTimeout(8000); request.setReadTimeout(8000);
                request.setInstanceFollowRedirects(false);
                request.setRequestProperty("User-Agent", "FieldPad-WorldMap/0.1 (Android; personal prototype)");
                request.setRequestProperty("Accept", "image/png");
                if (request.getResponseCode() != 200) throw new IOException("Tile HTTP " + request.getResponseCode());
                byte[] bytes;
                try (InputStream stream = request.getInputStream()) { bytes = readBounded(stream); }
                Bitmap bitmap = decode(bytes);
                if (closed || revision != generation) { bitmap.recycle(); throw new IOException("Viewport changed"); }
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
            if (pending != null) pending.cancel(true);
            worker.shutdownNow();
            HttpURLConnection active = connection; if (active != null) active.disconnect();
            bitmaps.evictAll(); failures.clear();
        }
        protected void onDetachedFromWindow() { close(); super.onDetachedFromWindow(); }
    }
}

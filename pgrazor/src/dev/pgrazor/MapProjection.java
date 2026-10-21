package dev.pgrazor;

/** Normalized Web Mercator coordinates, independent of Android for testing. */
public final class MapProjection {
    public static final double MAX_LATITUDE = 85.0511287798066;
    private MapProjection() {}
    public static double wrap(double x) { return x - Math.floor(x); }
    public static double clampY(double y) { return Math.max(0, Math.min(1, y)); }
    public static double x(double longitude) { return wrap((longitude + 180) / 360); }
    public static double y(double latitude) {
        double lat = Math.toRadians(Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude)));
        return clampY((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2);
    }
    public static double longitude(double x) { return wrap(x) * 360 - 180; }
    public static double latitude(double y) { return Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1 - 2 * clampY(y))))); }
    public static double worldPixels(int zoom, double tilePixels) { return Math.scalb(tilePixels, zoom); }
    public static double offsetX(double center, double pixels, double worldPixels) { return wrap(center + pixels / worldPixels); }
    public static double offsetY(double center, double pixels, double worldPixels) { return clampY(center + pixels / worldPixels); }
    /** Shortest signed world offset so markers remain visible across the dateline. */
    public static double deltaX(double x, double center) { return wrap(x - center + .5) - .5; }
}

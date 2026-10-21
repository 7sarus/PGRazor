package dev.pgrazor;

/** Durable user intent and actual current position; deliberately excludes routes and joystick input. */
public final class LocationState {
    public static final int MAX_RECORD_LENGTH = 256;
    public final double latitude, longitude, speedKmh, bearing;
    public final boolean enabled;

    public LocationState(double latitude, double longitude, double speedKmh, double bearing, boolean enabled) {
        if (!Double.isFinite(latitude) || Math.abs(latitude) > 90 || !Double.isFinite(longitude) || Math.abs(longitude) > 180)
            throw new IllegalArgumentException("Invalid saved coordinates");
        if (!Double.isFinite(speedKmh) || speedKmh < .5 || speedKmh > 30)
            throw new IllegalArgumentException("Invalid saved speed");
        if (!Double.isFinite(bearing) || bearing < 0 || bearing >= 360)
            throw new IllegalArgumentException("Invalid saved bearing");
        this.latitude = latitude; this.longitude = longitude; this.speedKmh = speedKmh; this.bearing = bearing; this.enabled = enabled;
    }
    public static LocationState defaults() { return capture(new MotionEngine(), true); }
    public static LocationState capture(MotionEngine engine, boolean desiredEnabled) {
        synchronized (engine) { return new LocationState(engine.latitude, engine.longitude, engine.speedKmh, engine.bearing, desiredEnabled); }
    }
    public void restoreStationary(MotionEngine engine, boolean backendReady, boolean foreground) {
        synchronized (engine) {
            engine.pause();
            engine.position(latitude, longitude); engine.speed(speedKmh); engine.bearing = bearing;
            engine.targetLatitude = latitude; engine.targetLongitude = longitude;
            engine.enabled = enabled && backendReady && foreground;
        }
    }
    public String encode() {
        return "1|" + latitude + "|" + longitude + "|" + speedKmh + "|" + bearing + "|" + enabled;
    }
    public static LocationState decode(String record) {
        if (record == null || record.length() > MAX_RECORD_LENGTH) throw new IllegalArgumentException("Missing or oversized saved location");
        String[] fields = record.split("\\|", -1);
        if (fields.length != 6 || !fields[0].equals("1") || !(fields[5].equals("true") || fields[5].equals("false")))
            throw new IllegalArgumentException("Unrecognized saved location format");
        return new LocationState(Double.parseDouble(fields[1]), Double.parseDouble(fields[2]), Double.parseDouble(fields[3]), Double.parseDouble(fields[4]), Boolean.parseBoolean(fields[5]));
    }
}

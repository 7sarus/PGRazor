package dev.pgrazor;

/** Pure camera-relative steering math. Does not read game state or enable movement. */
public final class CameraSteering {
    private CameraSteering() {}

    public static final class Direction {
        public final double east, north;
        /** False means the caller must not use this sample for camera-relative movement. */
        public final boolean valid;
        private Direction(double east, double north, boolean valid) {
            this.east = east; this.north = north; this.valid = valid;
        }
    }
    private static final Direction UNAVAILABLE = new Direction(0, 0, false);

    /**
     * right/up are screen-relative joystick components, with up positive.
     * headingDegrees is clockwise from geographic north and may include full turns.
     * sampleAgeMillis must be computed using the same monotonic clock as the heading sample.
     * Samples are accepted through maxAgeMillis inclusive; negative age/limit, non-finite
     * heading, or non-finite input returns (0,0,valid=false), never a north-up fallback.
     * Valid input is clamped radially to unit length. No deadzone is applied here.
     */
    public static Direction rotate(double right, double up, double headingDegrees,
                                   long sampleAgeMillis, long maxAgeMillis) {
        if (!Double.isFinite(right) || !Double.isFinite(up) || !Double.isFinite(headingDegrees)
                || sampleAgeMillis < 0 || maxAgeMillis < 0 || sampleAgeMillis > maxAgeMillis)
            return UNAVAILABLE;

        // Scale before hypot so even finite near-MAX_VALUE inputs cannot overflow.
        double scale = Math.max(Math.abs(right), Math.abs(up));
        if (scale > 1) { right /= scale; up /= scale; }
        double length = Math.hypot(right, up);
        if (length > 1) { right /= length; up /= length; }

        double radians = Math.toRadians(headingDegrees % 360);
        double sine = Math.sin(radians), cosine = Math.cos(radians);
        double east = right * cosine + up * sine;
        double north = -right * sine + up * cosine;
        // Correct the possible last-bit overshoot introduced by rotation.
        length = Math.hypot(east, north);
        if (length > 1) { east /= length; north /= length; }
        return new Direction(east, north, true);
    }
}

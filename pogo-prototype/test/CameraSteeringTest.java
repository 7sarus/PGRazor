import dev.fieldpad.CameraSteering;

public final class CameraSteeringTest {
    static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    static void near(double actual, double expected, String message) {
        check(Double.isFinite(actual) && Math.abs(actual - expected) < 1e-12, message + ": " + actual + " expected " + expected);
    }
    static void direction(double right, double up, double heading, double east, double north) {
        CameraSteering.Direction result = CameraSteering.rotate(right, up, heading, 20, 100);
        check(result.valid, "Fresh finite heading accepted");
        near(result.east, east, "east at heading " + heading); near(result.north, north, "north at heading " + heading);
        check(Math.hypot(result.east, result.north) <= 1 + 1e-15, "Radial bound");
    }
    static void unavailable(double right, double up, double heading, long age, long maximum) {
        CameraSteering.Direction result = CameraSteering.rotate(right, up, heading, age, maximum);
        check(!result.valid && result.east == 0 && result.north == 0, "Unavailable heading/input must produce explicit stationary invalid result");
    }
    public static void main(String[] args) {
        direction(0, 1, 0, 0, 1); direction(1, 0, 0, 1, 0);
        direction(0, 1, 90, 1, 0); direction(1, 0, 90, 0, -1);
        direction(0, 1, 180, 0, -1); direction(1, 0, 180, -1, 0);
        direction(0, 1, 270, -1, 0); direction(1, 0, 270, 0, 1);
        direction(0, -1, 90, -1, 0); direction(-1, 0, 90, 0, 1);
        double diagonal = Math.sqrt(.5);
        direction(1, 1, 0, diagonal, diagonal);
        direction(1, 1, 90, diagonal, -diagonal);
        direction(1, 1, 180, -diagonal, -diagonal);
        direction(1, 1, 270, -diagonal, diagonal);
        direction(0, 1, 45, diagonal, diagonal);
        direction(1, 1, 45, 1, 0);
        direction(.3, .4, 90, .4, -.3);
        direction(.001, 0, 0, .001, 0); // Deadzone belongs to the caller, not this helper.
        direction(0, 0, 37, 0, 0);
        for (double heading : new double[]{90, 450, 810, -270, -630, 3600090}) direction(0, 1, heading, 1, 0);
        direction(0, 1, -90, -1, 0); direction(0, 1, -360, 0, 1);
        direction(Double.MAX_VALUE, Double.MAX_VALUE, 0, diagonal, diagonal);
        direction(-Double.MAX_VALUE, Double.MAX_VALUE, 180, diagonal, -diagonal);
        direction(Double.MAX_VALUE, 0, 90, 0, -1);
        CameraSteering.Direction largeHeading = CameraSteering.rotate(1, 1, Double.MAX_VALUE, 0, 0);
        check(largeHeading.valid && Double.isFinite(largeHeading.east) && Double.isFinite(largeHeading.north), "Large finite heading wraps without overflow");
        check(CameraSteering.rotate(0, 1, 0, 100, 100).valid, "Freshness boundary is inclusive");
        check(CameraSteering.rotate(0, 1, 0, 0, 0).valid, "Zero-age sample accepted for zero-age policy");
        unavailable(0, 1, 0, 101, 100); unavailable(0, 1, 0, -1, 100); unavailable(0, 1, 0, 0, -1);
        unavailable(0, 1, Double.NaN, 0, 100); unavailable(0, 1, Double.POSITIVE_INFINITY, 0, 100);
        unavailable(Double.NaN, 0, 0, 0, 100); unavailable(0, Double.NEGATIVE_INFINITY, 0, 0, 100);
        unavailable(0, 1, 0, Long.MAX_VALUE, 100);
        System.out.println("PASS: camera steering cardinal directions, diagonals, full turns, magnitude, finite overflow, freshness gating, stationary invalid input");
    }
}

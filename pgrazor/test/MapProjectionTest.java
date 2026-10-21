import dev.pgrazor.MapProjection;

public final class MapProjectionTest {
    static void near(double expected, double actual, String name) {
        if (!Double.isFinite(actual) || Math.abs(expected - actual) > 1e-8) throw new AssertionError(name + ": " + actual);
    }
    public static void main(String[] args) {
        for (double latitude : new double[] {-85, -45.25, 0, 12.5, 85})
            near(latitude, MapProjection.latitude(MapProjection.y(latitude)), "latitude round trip");
        for (double longitude : new double[] {-180, -179.99, 0, 45.25, 179.99})
            near(longitude, MapProjection.longitude(MapProjection.x(longitude)), "longitude round trip");
        near(-180, MapProjection.longitude(MapProjection.x(180)), "east dateline canonicalized");
        near(MapProjection.MAX_LATITUDE, MapProjection.latitude(MapProjection.y(90)), "north pole clipped");
        near(-MapProjection.MAX_LATITUDE, MapProjection.latitude(MapProjection.y(-90)), "south pole clipped");
        near(.02, MapProjection.deltaX(.01, .99), "marker across east dateline");
        near(-.02, MapProjection.deltaX(.99, .01), "marker across west dateline");
        double world = MapProjection.worldPixels(2, 256);
        near(90, MapProjection.longitude(MapProjection.offsetX(.5, 256, world)), "tap east of center");
        near(0, MapProjection.latitude(MapProjection.offsetY(.5, 0, world)), "center tap");
        near(-90, MapProjection.longitude(MapProjection.offsetX(.5, -256, world)), "drag east pans west");
        near(.01, MapProjection.offsetX(.99, .02 * world, world), "pan wraps");
        near(0, MapProjection.offsetY(.1, -world, world), "pan north clamps");
        near(1, MapProjection.offsetY(.9, world, world), "pan south clamps");
        near(45, MapProjection.longitude(MapProjection.offsetX(.5, 256, MapProjection.worldPixels(3, 256))), "zoom halves longitude span");
        System.out.println("PASS: map projection round trips, dateline, poles, taps, pan, zoom");
    }
}

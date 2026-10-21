import dev.fieldpad.LocationState;
import dev.fieldpad.MotionEngine;

public final class LocationStateTest {
    static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    static void invalid(String record) {
        try { LocationState.decode(record); throw new AssertionError("Accepted corrupt saved state: " + record); }
        catch (IllegalArgumentException expected) { }
    }
    public static void main(String[] args) {
        check(LocationState.defaults().enabled, "New installs default to enabled intent");
        MotionEngine moving = new MotionEngine(); moving.position(12.5, 45.25); moving.speed(7.2); moving.walkTo(13, 46);
        for (int i=0;i<40;i++) moving.step(.25);
        LocationState saved = LocationState.decode(LocationState.capture(moving, true).encode());
        check(saved.latitude == moving.latitude && saved.longitude == moving.longitude, "Save actual traveled position at full precision");
        check(saved.latitude != 12.5 && saved.latitude != moving.targetLatitude, "Checkpoint is neither route origin nor destination");
        check(saved.speedKmh == 7.2 && saved.bearing == moving.bearing, "Speed and bearing persist");
        for (boolean ready : new boolean[]{false,true}) for (boolean foreground : new boolean[]{false,true}) {
            MotionEngine restored = new MotionEngine(); restored.walkTo(50,50); restored.input(1,1);
            saved.restoreStationary(restored, ready, foreground);
            check(restored.enabled == (ready && foreground), "Restore is gated by ready foreground");
            check(!restored.walking && restored.metersPerSecond() == 0, "Restore never resumes route or joystick");
            restored.step(600);
            check(restored.latitude == saved.latitude && restored.longitude == saved.longitude, "No movement after boot/background restore");
        }
        moving.pause();
        moving.walkRoute(new double[][]{{13,46},{14,47}});moving.step(.25);
        LocationState routeCheckpoint=LocationState.decode(LocationState.capture(moving,true).encode());
        routeCheckpoint.restoreStationary(moving,true,true);
        check(moving.routeProgress().total==0&&!moving.walking&&moving.enabled,"Restart restores actual route position without queued movement");
        check(moving.latitude==routeCheckpoint.latitude&&moving.longitude==routeCheckpoint.longitude,"Route checkpoint preserves traveled position");
        moving.pause();
        LocationState suspended = LocationState.capture(moving, true);
        check(suspended.enabled, "Runtime suspension does not erase enabled preference");
        suspended.restoreStationary(moving, true, true); check(moving.enabled, "Foreground resumes saved enabled preference stationary");
        LocationState paused = LocationState.decode(LocationState.capture(moving, false).encode());
        paused.restoreStationary(moving, true, true); check(!moving.enabled, "Explicit Pause survives restart even when ready");
        moving.position(-90,-180); moving.bearing=359.999; moving.speed(.5);
        LocationState.decode(LocationState.capture(moving, false).encode());
        moving.position(90,180); moving.speed(30); moving.bearing=0;
        LocationState.decode(LocationState.capture(moving, true).encode());
        invalid(null); invalid(""); invalid("2|1|2|5|0|true"); invalid("1|1|2|5|0|yes");
        invalid("1|NaN|2|5|0|true"); invalid("1|1|Infinity|5|0|true"); invalid("1|91|2|5|0|true");
        invalid("1|1|-181|5|0|true"); invalid("1|1|2|0|0|true"); invalid("1|1|2|31|0|true");
        invalid("1|1|2|5|360|true"); invalid("1|1|2|5|-1|true"); invalid("1|1|2|5|NaN|true");
        invalid("1|1|2|5|0|true|extra"); invalid(new String(new char[257]).replace('\0','0'));
        System.out.println("PASS: location state precision, traveled checkpoint, defaults, remembered Pause, readiness/foreground gating, stationary restore, corrupt records");
    }
}

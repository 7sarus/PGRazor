import dev.pgrazor.CameraHeadingState;
import dev.pgrazor.CameraSteering;

public final class CameraHeadingStateTest {
    static void check(boolean condition,String message) { if(!condition) throw new AssertionError(message); }
    static void near(double actual,double expected) { check(Math.abs(actual-expected)<1e-12,"Expected "+expected+", got "+actual); }
    static void blocked(CameraHeadingState state,long gesture,long now) {
        CameraSteering.Direction result=state.direction(gesture,0,1,now);
        check(!result.valid && result.east==0 && result.north==0,"Invalid gesture must stop without fallback");
    }
    public static void main(String[] args) {
        CameraHeadingState state=new CameraHeadingState();
        long unavailable=state.beginGesture(1000);
        check(unavailable<0,"No gesture before first heading");
        check(state.update(0,7,true,100,1000),"Fresh aged sample accepted");
        blocked(state,unavailable,1000);
        long gesture=state.beginGesture(1000);
        CameraSteering.Direction direction=state.direction(gesture,0,1,1000);
        check(direction.valid,"New gesture accepted"); near(direction.east,0); near(direction.north,1);
        check(state.update(90,7,true,0,1100),"Same camera turns");
        direction=state.direction(gesture,0,1,1100);
        check(direction.valid,"Continuous fresh heading preserves held gesture"); near(direction.east,1); near(direction.north,0);
        check(state.direction(gesture,0,1,1600).valid,"500 ms age inclusive");
        blocked(state,gesture,1601);
        check(state.update(180,7,true,0,1602),"Fresh heading recovers");
        blocked(state,gesture,1602); // Never restart a held vector after staleness.
        gesture=state.beginGesture(1602);
        check(state.direction(gesture,0,1,1602).valid,"New drag after recovery");
        check(state.update(270,-100,true,0,1700),"Signed camera identities accepted");
        blocked(state,gesture,1700);
        gesture=state.beginGesture(1700);
        direction=state.direction(gesture,0,1,1700); near(direction.east,-1); near(direction.north,0);

        // Expiration must be noticed even when no tick checked the stale interval.
        check(state.update(450,-100,true,0,2300),"Update after unnoticed gap");
        blocked(state,gesture,2300);
        gesture=state.beginGesture(2300); near(state.direction(gesture,0,1,2300).east,1);
        state.invalidate(); blocked(state,gesture,2300);
        check(state.update(0,-100,true,0,2301),"Recovery after explicit invalidation"); blocked(state,gesture,2301);

        double[] invalidHeadings={Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY};
        for(double heading:invalidHeadings) {
            gesture=state.beginGesture(2301);
            check(!state.update(heading,-100,true,0,2301),"Reject nonfinite heading");
            state.update(0,-100,true,0,2301); blocked(state,gesture,2301);
        }
        for(long age:new long[]{-1,501,Long.MAX_VALUE}) {
            gesture=state.beginGesture(2301);
            check(!state.update(0,-100,true,age,2301),"Reject invalid age");
            state.update(0,-100,true,0,2301); blocked(state,gesture,2301);
        }
        gesture=state.beginGesture(2301);
        check(!state.update(0,-100,false,0,2301),"Hidden map rejected");
        state.update(0,-100,true,0,2301); blocked(state,gesture,2301);
        gesture=state.beginGesture(2301);
        check(!state.update(180,-100,true,1,2301),"Out-of-order sample rejected");
        state.update(0,-100,true,0,2301); blocked(state,gesture,2301);
        check(!state.update(0,7,true,10,5),"Impossible preboot timestamp rejected");
        check(!state.update(0,7,true,0,-1),"Negative monotonic time rejected");
        state.update(0,7,true,0,2500); gesture=state.beginGesture(2500); blocked(state,gesture,2499);
        state.update(0,7,true,0,Long.MAX_VALUE); gesture=state.beginGesture(Long.MAX_VALUE);
        check(state.direction(gesture,0,1,Long.MAX_VALUE).valid,"Large monotonic timestamp remains valid");
        CameraHeadingState delivered=new CameraHeadingState();
        check(delivered.updateAt(90,7,true,100000,100100),"Original boot timestamp accepted with 100 ms delivery delay");
        long held=delivered.beginGesture(100100);
        check(!delivered.updateAt(90,7,true,100100,101100),"Bridge delay cannot renew an old reading");
        check(delivered.updateAt(90,7,true,101100,101100),"New reading after delayed delivery");
        blocked(delivered,held,101100);
        check(delivered.updateAt(0,7,true,101100,101600),"Timestamp freshness boundary inclusive");
        check(!delivered.updateAt(0,7,true,101100,101601),"Timestamp past boundary rejected");
        check(!delivered.updateAt(0,7,true,200000,101601),"Future boot timestamp rejected");
        check(!delivered.updateAt(0,7,true,-1,101601),"Negative timestamp rejected");
        check(!delivered.updateAt(0,7,true,101100,201100),"Suspend time ages sample and blocks old heading");
        System.out.println("PASS: continuous rotation, sample age, expiry boundaries, fresh gesture after recovery, camera identity, hidden map, invalid/reordered samples, monotonic bounds");
    }
}

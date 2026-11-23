package dev.pgrazor;

public final class JoystickLockTest {
    public static void main(String[] args) {
        testThresholds();
        testCancellation();
        testReleaseWithoutHold();
        testResetBeforeRelease();
        testHoldAndReleaseToLock();
        testUnlockTap();
        testMultiTouchPointer();
        testCameraLossIdleWalkImmunity();
        System.out.println("JoystickLock tests passed");
    }

    private static void check(boolean ok, String name) {
        if (!ok) throw new AssertionError(name);
    }

    private static void testThresholds() {
        check(!JoystickLock.popsOut(0.44), "just inside the pop distance does not pop");
        check(JoystickLock.popsOut(0.45), "pops at the pop distance");
        check(JoystickLock.popsOut(1.0), "fully deflected pops");
        check(JoystickLock.resetsHold(0.34), "well inside resets the hold");
        check(!JoystickLock.resetsHold(0.35), "reset boundary is exclusive");
        check(!JoystickLock.resetsHold(0.40) && !JoystickLock.popsOut(0.40), "gap between thresholds keeps the hold");
        check(JoystickLock.POP_DELAY_MS == 250, "pop delay is 250 ms");
    }

    private static void testCancellation() {
        // 1. Cancel before badge pops: clears timer and releases without lock.
        JoystickLock.State s1 = new JoystickLock.State();
        s1.onDown(0);
        check(s1.onMove(0.50, 1.0, false), "deflection schedules timer");
        check(s1.holdingOut && !s1.lockPopped, "timer scheduled but badge not yet popped");
        s1.onCancel();
        check(!s1.isLocked && !s1.lockPopped && !s1.holdingOut && !s1.isHeld(), "cancel before badge clears all");

        // 2. Cancel after badge pops: cancels badge and does not lock.
        JoystickLock.State s2 = new JoystickLock.State();
        s2.onDown(0);
        s2.onMove(0.50, 1.0, false);
        check(s2.onTimerFired(), "timer fires badge popup");
        check(s2.lockPopped, "badge is visible");
        s2.onCancel();
        check(!s2.isLocked && !s2.lockPopped && !s2.isHeld(), "cancel after badge clears without lock");

        // 3. Cancel while locked: releases lock immediately.
        JoystickLock.State s3 = new JoystickLock.State();
        s3.lockTo(1.5);
        check(s3.isLocked && s3.isHeld(), "stick is locked");
        s3.onCancel();
        check(!s3.isLocked && !s3.isHeld(), "cancel while locked unlocks stick");
    }

    private static void testReleaseWithoutHold() {
        // Quick drag outward (< 250ms) and release before badge appears: releases normally without lock.
        JoystickLock.State s = new JoystickLock.State();
        s.onDown(0);
        s.onMove(0.50, 0.5, false);
        check(!s.lockPopped, "badge not yet popped");
        s.onPointerUp(0);
        check(!s.isLocked && !s.isHeld() && s.pointer == -1, "release without hold stops movement");
    }

    private static void testResetBeforeRelease() {
        // Deflect to 0.50, wait for badge to pop, then pull back inside 0.35 reset threshold before lifting.
        JoystickLock.State s = new JoystickLock.State();
        s.onDown(0);
        s.onMove(0.50, 0.5, false);
        s.onTimerFired();
        check(s.lockPopped, "badge popped");
        // Pull back inside reset threshold
        s.onMove(0.20, 0.5, false);
        check(!s.lockPopped && !s.holdingOut, "pulling back inside reset threshold dismisses badge");
        // Release
        s.onPointerUp(0);
        check(!s.isLocked && !s.isHeld(), "release after pulling back stops without locking");
    }

    private static void testHoldAndReleaseToLock() {
        // Hold past 0.45 for 250ms (badge pops), then release finger to lock:
        JoystickLock.State s = new JoystickLock.State();
        s.onDown(0);
        s.onMove(0.50, 0.8, false);
        s.onTimerFired();
        check(s.lockPopped, "badge popped after hold");
        // Finger lifted after badge popped
        s.onPointerUp(0);
        check(s.isLocked && s.isHeld(), "releasing after badge popped locks stick in direction");

        // Lifting a secondary pointer while locked preserves lock
        s.onPointerUp(1);
        check(s.isLocked && s.isHeld(), "secondary pointer event does not disturb locked stick");
    }

    private static void testUnlockTap() {
        JoystickLock.State s = new JoystickLock.State();
        s.lockTo(0.0);
        check(s.isLocked && s.isHeld(), "stick locked");
        // A fresh down tap unlocks
        s.onDown(0);
        check(!s.isLocked && !s.isHeld(), "tap unlocks locked joystick");
    }

    private static void testMultiTouchPointer() {
        JoystickLock.State s = new JoystickLock.State();
        s.onDown(0);
        check(s.pointer == 0 && s.isHeld(), "pointer 0 active");
        // Secondary pointer lifts: active pointer remains
        s.onPointerUp(1);
        check(s.pointer == 0 && s.isHeld(), "secondary pointer lift does not stop active stick");
        // Active pointer lifts: releases
        s.onPointerUp(0);
        check(s.pointer == -1 && !s.isHeld(), "active pointer lift releases");
    }

    private static void testCameraLossIdleWalkImmunity() {
        MotionEngine e = new MotionEngine();
        e.position(37.7749, -122.4194);
        e.enabled = true;
        e.speed(5.0);
        e.setIdleWalking(true);

        JoystickLock.State s = new JoystickLock.State();
        s.lockTo(Math.PI / 2); // locked north
        check(s.isHeld(), "lock reports stick held");

        // Under camera loss, manual steering input drops to 0,0
        e.input(0, 0);
        // Motion loop passes !s.isHeld() to idle walking allowed
        e.setIdleWalkingAllowed(!s.isHeld());

        // Step for 100 frames (10 seconds, well past 3-second idle delay)
        for (int i = 0; i < 100; i++) {
            e.step(0.1);
        }
        check(!e.idleWalkingActive(), "camera loss while locked must never trigger idle walking");
        check(e.latitude == 37.7749 && e.longitude == -122.4194, "position unchanged during camera loss");

        // Now unlock
        s.unlock();
        check(!s.isHeld(), "stick released");
        e.setIdleWalkingAllowed(!s.isHeld());

        // Step past 3 seconds (35 frames * 0.1s)
        for (int i = 0; i < 35; i++) {
            e.step(0.1);
        }
        check(e.idleWalkingActive(), "idle walking starts normally after unlock");

        // Re-locking halts idle walking immediately
        s.lockTo(0);
        e.setIdleWalkingAllowed(!s.isHeld());
        e.step(0.1);
        check(!e.idleWalkingActive(), "re-locking stick immediately halts idle walking");
    }
}

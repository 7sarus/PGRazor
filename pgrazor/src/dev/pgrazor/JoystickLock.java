package dev.pgrazor;

// Lock gesture thresholds and state machine, shared by Pad and JoystickLockTest.
final class JoystickLock {
    static final double POP_DISTANCE = 0.45;
    static final double RESET_DISTANCE = 0.35;
    static final long POP_DELAY_MS = 250;
    static final double BADGE_RADIUS_DP = 24.0;

    private JoystickLock() {}

    static boolean popsOut(double distance) { return distance >= POP_DISTANCE; }
    static boolean resetsHold(double distance) { return distance < RESET_DISTANCE; }
    static boolean hitsBadge(double touchX, double touchY, double badgeX, double badgeY, double radius) {
        return Math.hypot(touchX - badgeX, touchY - badgeY) <= radius;
    }

    /** Pure state machine for joystick lock transitions, testable without Android runtime. */
    static final class State {
        boolean isLocked;
        boolean lockPopped;
        boolean holdingOut;
        double lockAngle;
        int pointer = -1;

        void onDown(int pointerId) {
            if (isLocked) {
                unlock();
                return;
            }
            pointer = pointerId;
            holdingOut = false;
            lockPopped = false;
        }

        boolean onMove(double dist, double angle, boolean hitBadge) {
            if (isLocked) return false;
            if (popsOut(dist)) {
                lockAngle = angle;
                if (!holdingOut) {
                    holdingOut = true;
                    return true; // schedule pop timer
                }
                if (lockPopped && hitBadge) {
                    lockTo(angle);
                }
            } else if (resetsHold(dist)) {
                holdingOut = false;
                lockPopped = false;
            }
            return false;
        }

        boolean onTimerFired() {
            if (pointer >= 0 && holdingOut && !isLocked) {
                lockPopped = true;
                return true;
            }
            return false;
        }

        void lockTo(double angle) {
            isLocked = true;
            lockPopped = false;
            holdingOut = false;
            lockAngle = angle;
            pointer = -1;
        }

        void unlock() {
            release();
        }

        void release() {
            isLocked = false;
            lockPopped = false;
            holdingOut = false;
            pointer = -1;
        }

        void onCancel() {
            release();
        }

        void onPointerUp(int pointerId) {
            if (pointer == pointerId) {
                if (isLocked) {
                    pointer = -1;
                } else if (lockPopped) {
                    lockTo(lockAngle);
                } else {
                    release();
                }
            }
        }

        boolean isHeld() {
            return pointer >= 0 || isLocked;
        }
    }
}

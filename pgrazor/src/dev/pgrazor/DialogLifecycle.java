package dev.pgrazor;

import android.app.Activity;
import android.app.Application;
import android.app.Dialog;
import android.os.Bundle;

/** Keeps quick-menu dialogs and their polling scoped to the foreground activity. */
final class DialogLifecycle {
    private DialogLifecycle() {}
    static void bind(Activity owner, Dialog dialog, Runnable cleanup) {
        Application app=owner.getApplication();
        Application.ActivityLifecycleCallbacks callbacks=new Application.ActivityLifecycleCallbacks(){
            public void onActivityPaused(Activity a){if(a==owner)dialog.dismiss();}
            public void onActivityDestroyed(Activity a){if(a==owner)dialog.dismiss();}
            public void onActivityCreated(Activity a,Bundle b){}
            public void onActivityStarted(Activity a){}
            public void onActivityResumed(Activity a){}
            public void onActivityStopped(Activity a){}
            public void onActivitySaveInstanceState(Activity a,Bundle b){}
        };
        app.registerActivityLifecycleCallbacks(callbacks);
        dialog.setOnDismissListener(d->{app.unregisterActivityLifecycleCallbacks(callbacks);if(cleanup!=null)cleanup.run();});
    }
}

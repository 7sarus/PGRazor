"""Exercise actual Control feature policy on a JVM, with narrow Android API shells.

These shells do not simulate Android UI/lifecycle behavior. Tests drive foreground
and clock inputs explicitly; device tests remain responsible for scrolling/touch.
Temporary compiler outputs are removed automatically. No Android SDK/device needed.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
STUBS = {
    'android/content/Context.java': 'package android.content; public class Context {}',
    'android/app/Activity.java': '''package android.app;
public class Activity extends android.content.Context {
 public boolean finishing, destroyed;
 public boolean isFinishing(){return finishing;} public boolean isDestroyed(){return destroyed;}
}''',
    'android/app/Application.java': '''package android.app;
public class Application {
 public java.io.File getFilesDir(){throw new UnsupportedOperationException("Files not exercised");}
 public void registerActivityLifecycleCallbacks(ActivityLifecycleCallbacks c){}
 public interface ActivityLifecycleCallbacks {
  void onActivityResumed(Activity a); void onActivityPaused(Activity a); void onActivityDestroyed(Activity a);
  void onActivityCreated(Activity a,android.os.Bundle b); void onActivityStarted(Activity a);
  void onActivityStopped(Activity a); void onActivitySaveInstanceState(Activity a,android.os.Bundle b);
 }
}''',
    'android/os/Bundle.java': 'package android.os; public class Bundle {}',
    'android/os/Looper.java': 'package android.os; public class Looper {public static Looper getMainLooper(){return new Looper();}}',
    'android/os/Handler.java': '''package android.os;
public class Handler {
 // Posted work runs only when a test drains it explicitly.
 public static final java.util.List<Runnable> queue=new java.util.ArrayList<>();
 public static boolean accept=true;
 public Handler(Looper l){}
 public boolean post(Runnable r){if(accept)queue.add(r);return accept;}
 public static void drain(){while(!queue.isEmpty())queue.remove(0).run();}
}''',
    'android/widget/Toast.java': '''package android.widget;
public class Toast {
 public static final int LENGTH_SHORT=0, LENGTH_LONG=1;
 public static final java.util.List<Toast> made=new java.util.ArrayList<>();
 public static boolean fail;
 public final android.content.Context context; public final CharSequence text; public boolean shown, cancelled;
 private Toast(android.content.Context c,CharSequence t){context=c;text=t;}
 public static Toast makeText(android.content.Context c,CharSequence t,int d){
  if(fail)throw new IllegalStateException("toast unavailable");
  if(c==null)throw new NullPointerException("context");
  Toast toast=new Toast(c,t);made.add(toast);return toast;
 }
 public void show(){shown=true;} public void cancel(){cancelled=true;}
}''',
    'android/os/SystemClock.java': '''package android.os;
public class SystemClock {public static long now=1000; public static long elapsedRealtime(){return now;}}''',
    'android/os/StrictMode.java': '''package android.os;
public class StrictMode {
 public static class ThreadPolicy {}
 public static ThreadPolicy allowThreadDiskWrites(){return new ThreadPolicy();}
 public static ThreadPolicy allowThreadDiskReads(){return new ThreadPolicy();}
 public static void setThreadPolicy(ThreadPolicy p){}
}''',
    'android/util/Log.java': '''package android.util;
public class Log {
 public static final java.util.List<String> lines=new java.util.ArrayList<>();
 public static int i(String tag,String text){lines.add(text);return 0;}
 public static int e(String tag,String text,Throwable error){throw new AssertionError(text,error);}
}''',
    'android/util/AtomicFile.java': '''package android.util;
public class AtomicFile {
 private final java.io.File file; public AtomicFile(java.io.File file){this.file=file;}
 public java.io.FileOutputStream startWrite() throws java.io.IOException {return new java.io.FileOutputStream(file);}
 public java.io.FileInputStream openRead() throws java.io.IOException {return new java.io.FileInputStream(file);}
 public void finishWrite(java.io.FileOutputStream out){try{out.close();}catch(java.io.IOException e){throw new RuntimeException(e);}} public void failWrite(java.io.FileOutputStream out){}
}''',
    'dev/pgrazor/Pad.java': '''package dev.pgrazor;
public class Pad {public final android.app.Activity activity; public Pad(android.app.Activity a){activity=a;} public void close(){}}''',
    'dev/pgrazor/LogActivity.java': 'package dev.pgrazor; public class LogActivity extends android.app.Activity {}',
}


def java_tools():
    candidates = []
    if os.environ.get('JAVA_HOME'):
        candidates.append(Path(os.environ['JAVA_HOME']) / 'bin')
    found = shutil.which('javac')
    if found:
        candidates.append(Path(found).parent)
    if os.name == 'nt':
        candidates.extend(sorted(Path('C:/Program Files/Eclipse Adoptium').glob('jdk-*/bin'), reverse=True))
    suffix = '.exe' if os.name == 'nt' else ''
    for folder in candidates:
        compiler, runtime = folder / ('javac' + suffix), folder / ('java' + suffix)
        if compiler.is_file() and runtime.is_file():
            return compiler, runtime
    raise unittest.SkipTest('A JDK is required to run actual Control policy tests')


class ControlJavaTests(unittest.TestCase):
    def test_quick_summary_policy_and_location_isolation(self):
        compiler, runtime = java_tools()
        with tempfile.TemporaryDirectory(prefix='pgrazor-control-test-') as directory:
            work = Path(directory)
            sources = []
            for relative, text in STUBS.items():
                source = work / relative
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text(text, encoding='utf-8')
                sources.append(source)
            sources.extend(ROOT / 'src/dev/pgrazor' / name for name in (
                'Control.java', 'MotionEngine.java', 'LocationState.java',
                'CameraHeadingState.java', 'CameraSteering.java'))
            sources.extend([ROOT / 'test/ControlQuickSummaryTest.java',ROOT / 'test/ControlQuickBallTest.java',
                            ROOT / 'test/ControlQuickBallOutcomeTest.java',ROOT / 'test/ControlSettingsTest.java'])
            classes = work / 'classes'
            compiled = subprocess.run([str(compiler), '-encoding', 'UTF-8', '-d', str(classes),
                                       *map(str, sources)], capture_output=True, text=True, timeout=30)
            self.assertEqual(compiled.returncode, 0, compiled.stdout + compiled.stderr)
            tested = subprocess.run([str(runtime), '-cp', str(classes), 'dev.pgrazor.ControlQuickSummaryTest'],
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(tested.returncode, 0, tested.stdout + tested.stderr)
            self.assertIn('PASS: real Control summary', tested.stdout)
            tested = subprocess.run([str(runtime), '-cp', str(classes), 'dev.pgrazor.ControlQuickBallTest'],
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(tested.returncode, 0, tested.stdout + tested.stderr)
            self.assertIn('PASS: real Control ball', tested.stdout)
            tested = subprocess.run([str(runtime), '-cp', str(classes), 'dev.pgrazor.ControlQuickBallOutcomeTest'],
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(tested.returncode, 0, tested.stdout + tested.stderr)
            self.assertIn('PASS: real Control ball outcome', tested.stdout)
            for phase in ('save','load'):
                tested=subprocess.run([str(runtime),'-cp',str(classes),'dev.pgrazor.ControlSettingsTest',phase,str(work)],capture_output=True,text=True,timeout=15)
                self.assertEqual(tested.returncode,0,tested.stdout+tested.stderr)


if __name__ == '__main__':
    unittest.main()

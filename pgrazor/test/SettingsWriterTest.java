package dev.pgrazor;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class SettingsWriterTest {
    private static Properties value(String text) { Properties p=new Properties();p.setProperty("value",text);return p; }
    private static void check(boolean result,String reason) { if(!result)throw new AssertionError(reason); }
    private static void expectFailure(SettingsWriter writer) throws Exception {
        try { writer.flush(10);throw new AssertionError("Expected write/flush failure"); }
        catch (IOException expected) {}
    }
    public static void main(String[] args) throws Exception {
        List<Runnable> queue=new ArrayList<>();List<String> writes=new ArrayList<>();List<IOException> errors=new ArrayList<>();
        SettingsWriter writer=new SettingsWriter(queue::add,p->writes.add(p.getProperty("value")),errors::add);
        Properties mutable=value("first");writer.submit(mutable);mutable.setProperty("value","mutated");
        check(writes.isEmpty(),"No synchronous writes");queue.remove(0).run();writer.flush(10);
        check(writes.equals(java.util.Arrays.asList("first")),"Snapshot is immutable after enqueue");
        writer.submit(value("second"));writer.submit(value("latest"));check(queue.size()==1,"One drain per burst");
        expectFailure(writer);queue.remove(0).run();writer.flush(10);
        check(writes.equals(java.util.Arrays.asList("first","latest")),"Queued snapshots coalesce to the newest");

        boolean[] fail={true};SettingsWriter recovery=new SettingsWriter(queue::add,p->{if(fail[0])throw new IOException("disk full");},errors::add);
        recovery.submit(value("bad"));queue.remove(0).run();expectFailure(recovery);check(errors.size()==1,"Write failure reported");
        fail[0]=false;recovery.submit(value("recovered"));queue.remove(0).run();recovery.flush(10);
        SettingsWriter rejected=new SettingsWriter(r->{throw new IllegalStateException("closed");},p->{},errors::add);
        rejected.submit(value("reject"));expectFailure(rejected);

        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1),done=new CountDownLatch(1);
        List<String> ordered=new ArrayList<>();
        SettingsWriter concurrent=new SettingsWriter(r->new Thread(()->{try{r.run();}finally{done.countDown();}}).start(),p->{
            if(p.getProperty("value").equals("old")){entered.countDown();try{if(!release.await(5,TimeUnit.SECONDS))throw new IOException("test timeout");}catch(InterruptedException e){throw new IOException(e);}}
            ordered.add(p.getProperty("value"));
        },e->{throw new AssertionError(e);});
        concurrent.submit(value("old"));check(entered.await(5,TimeUnit.SECONDS),"Worker entered sink");
        concurrent.submit(value("new"));concurrent.submit(value("newest"));release.countDown();concurrent.flush(5000);
        check(done.await(5,TimeUnit.SECONDS),"Worker drains and exits");
        check(ordered.equals(java.util.Arrays.asList("old","newest")),"In-flight snapshot cannot overwrite its successor");
        System.out.println("PASS settings writer: snapshots, coalescing, ordering, flush timeout, rejection and recovery");
    }
}

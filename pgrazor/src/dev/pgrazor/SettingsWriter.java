package dev.pgrazor;

import java.io.IOException;
import java.util.Properties;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Serializes immutable snapshots off the caller thread, coalescing queued changes. */
final class SettingsWriter {
    interface Sink { void write(Properties snapshot) throws IOException; }

    private final Executor executor;
    private final Sink sink;
    private final Consumer<IOException> errors;
    private Properties pending;
    private long submitted, completed;
    private boolean draining;
    private IOException failure;

    SettingsWriter(Executor executor, Sink sink, Consumer<IOException> errors) {
        this.executor = executor;
        this.sink = sink;
        this.errors = errors;
    }

    void submit(Properties values) {
        boolean schedule;
        synchronized (this) {
            pending = new Properties();
            pending.putAll(values);
            submitted++;
            schedule = !draining;
            draining = true;
        }
        if (schedule) {
            try { executor.execute(this::drain); }
            catch (RuntimeException error) {
                IOException wrapped = new IOException("Settings worker unavailable", error);
                synchronized (this) {
                    pending = null;
                    completed = submitted;
                    failure = wrapped;
                    draining = false;
                    notifyAll();
                }
                report(wrapped);
            }
        }
    }

    private void drain() {
        while (true) {
            Properties snapshot;
            long revision;
            synchronized (this) {
                if (pending == null) { draining = false; notifyAll(); return; }
                snapshot = pending;
                revision = submitted;
                pending = null;
            }
            IOException error = null;
            try { sink.write(snapshot); }
            catch (IOException problem) { error = problem; }
            catch (RuntimeException problem) { error = new IOException("Settings write failed", problem); }
            synchronized (this) {
                completed = revision;
                failure = error;
                notifyAll();
            }
            if (error != null) report(error);
        }
    }

    private void report(IOException error) {
        try { errors.accept(error); } catch (RuntimeException ignored) { /* Logging cannot stall writes. */ }
    }

    /** Waits for at least the snapshot current at entry; failures never masquerade as durability. */
    synchronized void flush(long timeoutMillis) throws IOException {
        final long target = submitted;
        long remaining = TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        long before = System.nanoTime();
        while (completed < target) {
            if (remaining <= 0) throw new IOException("Timed out waiting for settings to save");
            try { TimeUnit.NANOSECONDS.timedWait(this, remaining); }
            catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while saving settings", error);
            }
            long now = System.nanoTime();
            remaining -= now - before;
            before = now;
        }
        if (failure != null) throw new IOException("Settings were not saved", failure);
    }
}

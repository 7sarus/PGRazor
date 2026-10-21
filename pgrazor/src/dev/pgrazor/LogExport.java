package dev.pgrazor;

import android.content.Context;
import android.net.Uri;
import java.io.*;
import java.security.*;
import java.util.Arrays;

/** Verify exports through the document URI; its backing folder is provider-owned. */
public final class LogExport {
    public static void save(Context context,Uri uri,File file) throws IOException {
        if(uri==null || file==null) throw new IOException("No log or document selected");
        try {
            MessageDigest written=MessageDigest.getInstance("SHA-256");
            MessageDigest checked=MessageDigest.getInstance("SHA-256");
            long count=0,verified=0;
            Control.event("export-start",uri.toString());
            try(InputStream in=new FileInputStream(file); OutputStream out=context.getContentResolver().openOutputStream(uri,"wt")) {
                if(out==null) throw new IOException("Document provider returned no output stream");
                byte[] buffer=new byte[8192]; int n;
                while((n=in.read(buffer))!=-1) { out.write(buffer,0,n); written.update(buffer,0,n); count+=n; }
                out.flush();
            }
            try(InputStream in=context.getContentResolver().openInputStream(uri)) {
                if(in==null) throw new IOException("Document provider returned no verification stream");
                byte[] buffer=new byte[8192]; int n;
                while((n=in.read(buffer))!=-1) { checked.update(buffer,0,n); verified+=n; }
            }
            if(count!=verified || !Arrays.equals(written.digest(),checked.digest())) throw new IOException("Saved document verification failed");
            Control.event("export-complete","verifiedBytes="+count+" uri="+uri);
        } catch(NoSuchAlgorithmException impossible) { throw new IOException(impossible); }
        catch(IOException error) { Control.event("export-error",error.toString()); throw error; }
    }
}

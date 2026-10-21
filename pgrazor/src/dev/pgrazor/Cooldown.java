package dev.pgrazor;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.location.*;
import android.os.*;
import android.util.AtomicFile;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
public final class Cooldown {
    private static final CooldownState state=new CooldownState();
    private static final ExecutorService io=Executors.newSingleThreadExecutor();
    private static final ExecutorService geo=Executors.newSingleThreadExecutor();
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static final Map<String,String> countries=new ConcurrentHashMap<>();
    private static AtomicFile file; private static long nextId; private static Context context;
    public static synchronized void init(Context app){context=app.getApplicationContext();file=new AtomicFile(new File(app.getFilesDir(),"cooldown-history.txt"));try{state.decode(new String(file.readFully(),StandardCharsets.UTF_8));for(CooldownState.Entry e:state.rows)nextId=Math.max(nextId,e.id);}catch(IOException ignored){}}
    private static void save(){final String data=state.encode();final AtomicFile f=file;if(f==null)return;io.execute(()->{FileOutputStream out=null;try{out=f.startWrite();out.write(data.getBytes(StandardCharsets.UTF_8));f.finishWrite(out);}catch(IOException e){if(out!=null)f.failWrite(out);Control.event("cooldown-save-error",e.toString());}});}
    public static synchronized void record(String action){double lat=Control.engine.latitude,lon=Control.engine.longitude;if(!CooldownState.valid(lat,lon))return;long now=System.currentTimeMillis();if(!state.rows.isEmpty()){CooldownState.Entry last=state.rows.get(0);if(action.equals("Gym battle")&&last.action.equals(action)&&CooldownState.distance(lat,lon,last.lat,last.lon)<0.01&&now-last.time<60000){state.rows.set(0,new CooldownState.Entry(last.id,now,lat,lon,action));if(now/5000!=last.time/5000)save();return;}if(last.action.equals(action)&&now-last.time<1500&&CooldownState.distance(lat,lon,last.lat,last.lon)<0.01)return;}state.add(new CooldownState.Entry(++nextId,now,lat,lon,action));save();}
    public static synchronized long remaining(){return state.remaining(System.currentTimeMillis(),Control.engine.latitude,Control.engine.longitude);}
    public static synchronized String label(){if(state.rows.isEmpty())return "History  --:--";long seconds=(remaining()+999)/1000;return String.format(Locale.US,"Est. %d:%02d:%02d",seconds/3600,(seconds/60)%60,seconds%60);}
    private static synchronized ArrayList<CooldownState.Entry> entries(){return new ArrayList<>(state.rows);}
    private static synchronized void remove(long id){state.rows.removeIf(e->e.id==id);save();}
    private static Button button(Context c,String text){Button b=new Button(c);b.setText(text);b.setAllCaps(false);b.setTextSize(12);return b;}
    private static void country(TextView label,CooldownState.Entry e){String key=String.format(Locale.US,"%.2f,%.2f",e.lat,e.lon);String cached=countries.get(key);if(cached!=null){label.setText(cached);return;}label.setText("??");geo.execute(()->{String value="??";try{if(Geocoder.isPresent()){List<Address> found=new Geocoder(context,Locale.US).getFromLocation(e.lat,e.lon,1);if(found!=null&&!found.isEmpty()){String code=found.get(0).getCountryCode();if(code!=null&&code.matches("[A-Z]{2}"))value=new String(Character.toChars(0x1f1e6+code.charAt(0)-'A'))+new String(Character.toChars(0x1f1e6+code.charAt(1)-'A'));}}}catch(Exception ignored){}countries.put(key,value);final String result=value;main.post(()->label.setText(result));});}
    public static void show(Activity a){
        final Context ui=MapTheme.wrap(a); // full-screen, matching the PGRazor dark/light theme
        int unit=(int)(48*a.getResources().getDisplayMetrics().density);
        LinearLayout root=new LinearLayout(ui);root.setOrientation(1);root.setPadding(16,12,16,12);
        TextView note=new TextView(ui);note.setText("Estimated from recorded actions and current location. Teleporting and walking do not reset it. Automatic: wild encounter throws, encounter berries, spins and gym attacks. Use Add action for gym placement/feeding, accessories or an action performed outside this app. Quest catches are excluded. Deleting history changes only this estimate.");note.setTextSize(12);root.addView(note);
        Button add=button(ui,"Add action at current location");root.addView(add);
        ScrollView scroll=new ScrollView(ui);LinearLayout list=new LinearLayout(ui);list.setOrientation(1);scroll.addView(list);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        Runnable render=()->{list.removeAllViews();ArrayList<CooldownState.Entry> rows=entries();if(rows.isEmpty()){TextView empty=new TextView(ui);empty.setText("No recorded actions yet");list.addView(empty);}for(CooldownState.Entry e:rows){LinearLayout row=new LinearLayout(ui);row.setGravity(Gravity.CENTER_VERTICAL);TextView flag=new TextView(ui);flag.setTextSize(20);row.addView(flag,new LinearLayout.LayoutParams(unit/2,-2));country(flag,e);TextView info=new TextView(ui);info.setText(new SimpleDateFormat("MM-dd HH:mm:ss",Locale.US).format(new Date(e.time))+"\n"+e.action+String.format(Locale.US,"\n%.5f, %.5f",e.lat,e.lon));info.setTextSize(12);row.addView(info,new LinearLayout.LayoutParams(0,-2,1));Button copy=button(ui,"Copy"),map=button(ui,"Map"),del=button(ui,"?");row.addView(copy,new LinearLayout.LayoutParams(unit,-2));row.addView(map,new LinearLayout.LayoutParams(unit,-2));row.addView(del,new LinearLayout.LayoutParams(unit,-2));copy.setOnClickListener(v->{((ClipboardManager)a.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Coordinates",String.format(Locale.US,"%.7f, %.7f",e.lat,e.lon)));Toast.makeText(a,"Coordinates copied",Toast.LENGTH_SHORT).show();});map.setOnClickListener(v->WorldMapDialog.show(a,e.lat,e.lon,(lat,lon)->mapApply(a,lat,lon,false),(lat,lon)->mapApply(a,lat,lon,true)));del.setOnClickListener(v->{remove(e.id);list.removeView(row);});list.addView(row);}MapTheme.style(list);};
        add.setOnClickListener(v->new AlertDialog.Builder(ui).setTitle("Record action here").setItems(new String[]{"Catch / ball throw","Berry feeding","Pok\u00e9Stop spin","Gym placement / feeding","Gym battle","Accessory action"},(d,i)->{record(new String[]{"Catch / ball throw","Berry feeding","Pok\u00e9Stop spin","Gym placement / feeding","Gym battle","Accessory action"}[i]);render.run();}).show());render.run();
        AlertDialog dialog=new AlertDialog.Builder(ui).setTitle("Cooldown history").setView(root).setPositiveButton("Done",null).create();
        dialog.setOnShowListener(d->{MapTheme.fullScreen(dialog);MapTheme.style(root);MapTheme.styleButtons(dialog);});
        DialogLifecycle.bind(a,dialog,null);
        dialog.show();
    }
    /** Applies a destination chosen from the history map, validating adapter readiness first (never a dummy no-op). */
    private static boolean mapApply(Activity a,double lat,double lon,boolean walk){
        if(!Control.canEnable()){Toast.makeText(a,"Location adapter is not ready",Toast.LENGTH_SHORT).show();return false;}
        try{
            if(walk)Control.walkTo(lat,lon);else Control.teleport(lat,lon);
            Control.event(walk?"cooldown-map-walk":"cooldown-map-teleport",String.format(Locale.US,"lat=%.7f lon=%.7f",lat,lon));
            return true;
        }catch(IllegalArgumentException error){Toast.makeText(a,"Select valid coordinates",Toast.LENGTH_SHORT).show();return false;}
    }
}

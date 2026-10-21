package dev.fieldpad;
import java.util.*;
/** Local estimate from PGSharp's published distance chart; not server state. */
public final class CooldownState {
    public static final long MAX=7200000L;
    private static final double[] KM={0,1,2,3,5,7,9,10,12,18,26,42,65,76,81,100,220,250,350,375,460,500,565,700,800,900,1000,1100,1200,1300,1350};
    private static final double[] MIN={0,1,1,2,2,5,7,7,8,10,15,19,22,25,25,35,40,45,51,54,62,65,69,78,84,92,99,107,114,117,120};
    public static final class Entry {
        public final long id,time; public final double lat,lon; public final String action;
        public Entry(long id,long time,double lat,double lon,String action){this.id=id;this.time=time;this.lat=lat;this.lon=lon;this.action=action;}
    }
    public final ArrayList<Entry> rows=new ArrayList<>();
    public static boolean valid(double lat,double lon){return Double.isFinite(lat)&&Double.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
    public static double distance(double a,double b,double c,double d){double x=Math.toRadians(c-a),y=Math.toRadians(d-b);double h=Math.sin(x/2)*Math.sin(x/2)+Math.cos(Math.toRadians(a))*Math.cos(Math.toRadians(c))*Math.sin(y/2)*Math.sin(y/2);return 6371.0088*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));}
    public static long duration(double km){if(!Double.isFinite(km)||km<0)throw new IllegalArgumentException();if(km<0.05)return 0;for(int i=1;i<KM.length;i++)if(km<=KM[i])return (long)Math.ceil((MIN[i-1]+(MIN[i]-MIN[i-1])*(km-KM[i-1])/(KM[i]-KM[i-1]))*60000);return MAX;}
    public long remaining(long now,double lat,double lon){if(!valid(lat,lon))return MAX;long wait=0;for(Entry e:rows){long elapsed=Math.max(0,now-e.time);if(elapsed>=MAX)continue;wait=Math.max(wait,duration(distance(e.lat,e.lon,lat,lon))-elapsed);}return Math.max(0,wait);}
    public void add(Entry e){if(!valid(e.lat,e.lon)||e.time<=0)return;rows.add(0,e);while(rows.size()>500)rows.remove(rows.size()-1);}
    public String encode(){StringBuilder b=new StringBuilder();for(Entry e:rows)b.append(e.id).append('|').append(e.time).append('|').append(e.lat).append('|').append(e.lon).append('|').append(e.action.replace('|',' ').replace('\n',' ')).append('\n');return b.toString();}
    public void decode(String text){rows.clear();for(String line:text.split("\n")){try{String[] p=line.split("\\|",5);Entry e=new Entry(Long.parseLong(p[0]),Long.parseLong(p[1]),Double.parseDouble(p[2]),Double.parseDouble(p[3]),p[4]);if(valid(e.lat,e.lon)&&e.time>0&&rows.size()<500)rows.add(e);}catch(RuntimeException ignored){}}}
}

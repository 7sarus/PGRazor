package dev.pgrazor;

/** Pairs only game-confirmed ground taps; distant or expired taps start another walk. */
public final class MapTapSequence {
    private double latitude,longitude,at=Double.NaN;
    private int epoch;
    public boolean doubleTap(double lat,double lon,double time,int generation,long timeoutMs){
        if(generation==epoch&&Double.isFinite(at)&&time-at<40)return false;
        boolean paired=generation==epoch&&Double.isFinite(at)&&time>at&&time-at<=timeoutMs&&distance(latitude,longitude,lat,lon)<=8;
        latitude=lat;longitude=lon;epoch=generation;at=paired?Double.NaN:time;
        return paired;
    }
    private static double distance(double a,double b,double c,double d){
        double x=Math.toRadians(c-a),y=Math.toRadians(d-b);
        double h=Math.sin(x/2)*Math.sin(x/2)+Math.cos(Math.toRadians(a))*Math.cos(Math.toRadians(c))*Math.sin(y/2)*Math.sin(y/2);
        return 6371000*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
    }
}

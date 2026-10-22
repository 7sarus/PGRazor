import dev.pgrazor.SettingsBackupRules;
import org.json.*;

public class SettingsBackupRulesTest {
    private static JSONObject valid()throws Exception{
        return new JSONObject().put("format","PGRazor settings").put("version",1).put("speedKmh",9.3)
            .put("settings",new JSONObject().put("autoDismiss","true").put("transferProtect","63"))
            .put("preferences",new JSONObject().put("pgrazor-overlays",new JSONObject().put("vgp.fx",0.8)));
    }
    private static void rejects(JSONObject value)throws Exception{
        try{SettingsBackupRules.validate(value);}catch(JSONException expected){return;}throw new AssertionError("Accepted invalid backup");
    }
    public static void main(String[] args)throws Exception{
        SettingsBackupRules.validate(valid());
        rejects(valid().put("version",1.5));rejects(valid().put("speedKmh",99));
        JSONObject v=valid();v.getJSONObject("settings").put("vgpEnabled","true");rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-livefeed-session",new JSONObject().put("token","secret"));rejects(v);
        v=valid();v.getJSONObject("settings").put("itemRules","1:100001;");rejects(v);
        v=valid();v.getJSONObject("settings").put("locationSpoofing","false");SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("settings").put("locationSpoofing","invalid");rejects(v);
        v=valid();v.getJSONObject("settings").put("ivCatch","false").put("ivOwned","true");SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("settings").put("ivOwned","maybe");rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-overlays",new JSONObject().put("vgp.fx",1.2));rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-livefeed",new JSONObject().put("radius","2"));rejects(v);
        String places="[{\"id\":\"a\",\"name\":\"Home\",\"latitude\":40,\"longitude\":-70}]";
        v=valid();v.getJSONObject("preferences").put("pgrazor-saved-places-v1",new JSONObject().put("places",places));SettingsBackupRules.validate(v);
        v.getJSONObject("preferences").getJSONObject("pgrazor-saved-places-v1").put("places",places.replace("40","400"));rejects(v);
        System.out.println("PASS settings backup: valid settings/favorites, schema, credential and VGP exclusion, bounds, IV display booleans and preference types");
    }
}

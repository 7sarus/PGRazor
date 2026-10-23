import dev.pgrazor.SettingsBackupRules;
import dev.pgrazor.BerryPriority;
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
        String choices="";
        choices=BerryPriority.select(choices,707);choices=BerryPriority.select(choices,705);choices=BerryPriority.select(choices,701);
        if(!choices.equals("707,705,701"))throw new AssertionError("Selection order lost");
        if(!BerryPriority.select(choices,706).equals("706"))throw new AssertionError("Fourth choice must reset");
        if(!BerryPriority.select(choices,0).isEmpty())throw new AssertionError("Off must clear all");
        if(!BerryPriority.select("707,705",707).equals("707,705"))throw new AssertionError("Duplicate priority");
        JSONObject berries=valid();berries.getJSONObject("settings").put("berryPriority",choices);SettingsBackupRules.validate(berries);
        berries.getJSONObject("settings").put("berryPriority","");SettingsBackupRules.validate(berries);
        for(String bad:new String[]{"701,701","701,703,705,706","702","701,","701, 703","0"}){berries.getJSONObject("settings").put("berryPriority",bad);rejects(berries);}
        rejects(valid().put("version",1.5));rejects(valid().put("speedKmh",99));
        JSONObject v=valid();v.getJSONObject("settings").put("vgpEnabled","true");rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-livefeed-session",new JSONObject().put("token","secret"));rejects(v);
        v=valid();v.getJSONObject("settings").put("itemRules","1:100001;");rejects(v);
        v=valid();v.getJSONObject("settings").put("locationSpoofing","false");SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("settings").put("locationSpoofing","invalid");rejects(v);
        v=valid();v.getJSONObject("settings").put("ivCatch","false").put("ivOwned","true");SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("settings").put("ivOwned","maybe");rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-overlays",new JSONObject().put("vgp.fx",1.2));rejects(v);
        // Transfer keep list and Keep All / overlay settings.
        v=valid();v.getJSONObject("settings").put("transferKeepAll","true").put("transferOverlay","false").put("transferKeepSpecies","1,4,25,2000");SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","");SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","1,4,2001");rejects(v);   // out of range (>2000)
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","0");rejects(v);           // zero is not positive
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","1,4,abc");rejects(v);      // non-numeric token
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","1,1");rejects(v);          // duplicate dex id
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","1,,4");rejects(v);         // empty token
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies","01");rejects(v);           // leading zero
        v=valid();v.getJSONObject("settings").put("transferKeepSpecies",new String(new char[11000]).replace('\0','1'));rejects(v); // over length bound
        v=valid();v.getJSONObject("settings").put("transferKeepAll","maybe");rejects(v);
        v=valid();v.getJSONObject("settings").put("transferOverlay","yes");rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-overlays",new JSONObject().put("transfer.fx",0.5).put("transfer.fy",0.25));SettingsBackupRules.validate(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-overlays",new JSONObject().put("transfer.fx",1.5));rejects(v);
        v=valid();v.getJSONObject("preferences").put("pgrazor-livefeed",new JSONObject().put("radius","2"));rejects(v);
        String places="[{\"id\":\"a\",\"name\":\"Home\",\"latitude\":40,\"longitude\":-70}]";
        v=valid();v.getJSONObject("preferences").put("pgrazor-saved-places-v1",new JSONObject().put("places",places));SettingsBackupRules.validate(v);
        v.getJSONObject("preferences").getJSONObject("pgrazor-saved-places-v1").put("places",places.replace("40","400"));rejects(v);
        System.out.println("PASS settings backup: valid settings/favorites, schema, credential and VGP exclusion, bounds, IV display booleans, transfer keep list/Keep All/overlay validation and preference types");
    }
}

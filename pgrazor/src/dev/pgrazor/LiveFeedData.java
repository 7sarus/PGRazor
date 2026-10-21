package dev.pgrazor;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Immutable, UI-agnostic model for LivePokeMap viewport results plus the parser that turns a raw
 * {@code /api/map/viewport} (or user-supplied map data) response into bounded, sanitised entries.
 *
 * <p>Parsing is defensive: invalid/non-finite coordinates are dropped, expired pokemon/raids/stations
 * are discarded, unknown fields stay unknown rather than being invented, and the total entry count is
 * capped so a hostile or malformed payload cannot exhaust memory. Names/details are plain-text safe.
 */
public final class LiveFeedData {
    /** Hard cap on produced entries regardless of how many the payload advertises. */
    public static final int MAX_ENTRIES = 10000;
    /** Default client refresh cadence; the UI may override from its own config. */
    public static final int DEFAULT_REFRESH_SECONDS = 15;

    public enum Kind { POKEMON, STOP, GYM, RAID, STATION }

    /** One map object. Numeric fields use -1 and {@code iv}/{@code hasStats} to flag "unknown". */
    public static final class Entry {
        public final String id, name, details;
        public final Kind kind;
        public final double lat, lon;
        public final int dexId, cp;
        public final double level;
        public final double iv;
        public final long expiresAt;
        public final boolean hasStats;

        public Entry(String id, Kind kind, String name, String details, double lat, double lon,
                     int dexId, int cp, double level, double iv, long expiresAt, boolean hasStats) {
            this.id = id;
            this.kind = kind;
            this.name = name;
            this.details = details;
            this.lat = lat;
            this.lon = lon;
            this.dexId = dexId;
            this.cp = cp;
            this.level = level;
            this.iv = iv;
            this.expiresAt = expiresAt;
            this.hasStats = hasStats;
        }

        /** True only when a real future expiry was known and has now passed. */
        public boolean expired(long now) { return expiresAt > 0 && expiresAt <= now; }

        /** Human-readable one-line detail, folding in the live countdown when an expiry is known. */
        public String subtitle(long now) {
            StringBuilder sb = new StringBuilder();
            if (details != null && !details.isEmpty()) sb.append(details);
            if (expiresAt > 0) {
                long remaining = expiresAt - now;
                if (sb.length() > 0) sb.append(" · ");
                if (remaining <= 0) sb.append(kind == Kind.POKEMON ? "despawned" : "ended");
                else sb.append(kind == Kind.POKEMON ? "despawns in " : "ends in ").append(duration(remaining));
            }
            return sb.toString();
        }
    }

    public static final class Snapshot {
        public final List<Entry> entries;
        public final long fetchedAt;
        public final int refreshSeconds;
        public final String note;

        public Snapshot(List<Entry> entries, long fetchedAt, int refreshSeconds, String note) {
            this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
            this.fetchedAt = fetchedAt;
            this.refreshSeconds = refreshSeconds > 0 ? refreshSeconds : DEFAULT_REFRESH_SECONDS;
            this.note = note == null ? "" : note;
        }
    }

    private LiveFeedData() { }

    /**
     * Parses a viewport response. Accepts either the {@code {success,data:{...}}} envelope or a bare
     * {@code {forts,pokemon,stations}} object (user-supplied map data). Exposed for unit tests.
     */
    public static Snapshot parse(JSONObject response, long now) throws JSONException {
        JSONObject root = response;
        JSONObject data = response.optJSONObject("data");
        if (data != null) root = data;

        List<Entry> entries = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        boolean truncated = parsePokemon(root.optJSONArray("pokemon"), now, entries, ids);
        truncated |= parseForts(root.optJSONArray("forts"), now, entries, ids);
        truncated |= parseStations(root.optJSONArray("stations"), now, entries, ids);

        int refresh = root.optInt("refresh_seconds", root.optInt("viewport_refresh_seconds", DEFAULT_REFRESH_SECONDS));
        String note = "";
        if (truncated) note = "Showing the first " + MAX_ENTRIES + " results.";
        else if (root.optBoolean("limit_reached", false)) note = "The service limited how many objects it returned.";
        return new Snapshot(entries, now, refresh, note);
    }

    // --- pokemon ---------------------------------------------------------------------------------

    private static boolean parsePokemon(JSONArray array, long now, List<Entry> out, Set<String> ids) {
        if (array == null) return false;
        int limit = Math.min(array.length(), MAX_ENTRIES);
        for (int i = 0; i < limit; i++) {
            if (out.size() >= MAX_ENTRIES) return true;
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            double lat = o.optDouble("lat", Double.NaN), lon = o.optDouble("lon", Double.NaN);
            if (!validCoords(lat, lon)) continue;
            // Preserve the 64-bit encounter id as a string; never narrow it through a numeric type.
            String encounter = o.optString("encounter_id", o.optString("encounterId", ""));
            if (encounter.isEmpty()) continue; // cannot de-duplicate an anonymous spawn
            long despawn = o.optLong("despawn_ms", o.optLong("despawnMs", 0));
            if (despawn > 0 && despawn <= now) continue; // already despawned

            String id = "pokemon:" + encounter;
            if (!ids.add(id)) continue;

            int dex = o.optInt("dex_id", o.optInt("dexId", 0));
            String source = o.optString("source", "wild");
            boolean hasStats = o.optBoolean("has_full_stats", false);
            int cp = hasStats ? o.optInt("cp", -1) : -1;
            double level = hasStats ? o.optDouble("level", -1) : -1;
            if (!Double.isFinite(level) || level <= 0 || level > 55) level = -1;
            double iv = hasStats && !o.isNull("iv_percent") ? o.optDouble("iv_percent", -1) : -1;
            if (!Double.isFinite(iv) || iv < 0 || iv > 100) iv = -1;

            String name = clean(o.optString("pokemon_name", o.optString("pokemonName", "")));
            if (name.isEmpty()) name = dex > 0 ? "#" + dex : "Unknown Pokémon";

            String details;
            if (hasStats && iv >= 0) {
                StringBuilder d = new StringBuilder();
                if (cp >= 0) d.append("CP ").append(cp);
                if (level >= 0) { if (d.length() > 0) d.append(" · "); d.append("Lv ").append(level == Math.rint(level) ? Long.toString((long)level) : Double.toString(level)); }
                if (d.length() > 0) d.append(" · ");
                d.append(String.format(java.util.Locale.US, "%.1f%% IV", iv));
                details = d.toString();
            } else {
                details = "Wild · stats hidden";
            }
            out.add(new Entry(id, Kind.POKEMON, name, details, lat, lon, dex, cp, level, iv, despawn, hasStats && iv >= 0));
        }
        return false;
    }

    // --- forts (stops / gyms / raids) ------------------------------------------------------------

    private static boolean parseForts(JSONArray array, long now, List<Entry> out, Set<String> ids) {
        if (array == null) return false;
        int limit = Math.min(array.length(), MAX_ENTRIES);
        for (int i = 0; i < limit; i++) {
            if (out.size() >= MAX_ENTRIES) return true;
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            double lat = o.optDouble("lat", Double.NaN), lon = o.optDouble("lon", Double.NaN);
            if (!validCoords(lat, lon)) continue;
            String fortId = o.optString("fort_id", "");
            if (fortId.isEmpty()) continue;
            String type = o.optString("fort_type", "");

            if ("CHECKPOINT".equals(type) || "POKESTOP".equals(type)) {
                addStop(o, fortId, lat, lon, now, out, ids);
            } else if ("GYM".equals(type)) {
                addGymOrRaid(o, fortId, lat, lon, now, out, ids);
            }
            // Unknown fort types are intentionally skipped rather than guessed at.
        }
        return false;
    }

    private static void addStop(JSONObject o, String fortId, double lat, double lon, long now,
                                List<Entry> out, Set<String> ids) {
        String id = "stop:" + fortId;
        if (!ids.add(id)) return;
        String name = clean(o.optString("name", ""));
        if (name.isEmpty()) name = "Pokéstop";

        // Only surface a feature when it is explicitly flagged true and its expiry is still in the future.
        List<String> feats = new ArrayList<>();
        long lure = o.optLong("lure_expire_ms", 0);
        if (o.optBoolean("has_lure", false) && lure > now) feats.add("Lure " + duration(lure - now));
        long invasion = o.optLong("invasion_expire_ms", 0);
        if (o.optBoolean("has_invasion", false) && invasion > now) feats.add("Invasion " + duration(invasion - now));
        long kecleon = o.optLong("kecleon_expire_ms", 0);
        if (o.optBoolean("has_kecleon", false) && kecleon > now) feats.add("Kecleon " + duration(kecleon - now));

        String details = feats.isEmpty() ? "Pokéstop" : join(feats);
        // The stop itself persists, so it has no expiry; feature countdowns live in the detail text.
        out.add(new Entry(id, Kind.STOP, name, details, lat, lon, -1, -1, -1, -1, 0, false));
    }

    private static void addGymOrRaid(JSONObject o, String fortId, double lat, double lon, long now,
                                     List<Entry> out, Set<String> ids) {
        String name = clean(o.optString("name", ""));
        if (name.isEmpty()) name = "Gym";
        int team = o.optInt("team", 0);
        long raidEnd = o.optLong("raid_end_ms", 0);

        if (raidEnd > now) {
            String id = "raid:" + fortId;
            if (!ids.add(id)) return;
            int rawLevel = o.optInt("raid_level", 0);
            long hatch = o.optLong("raid_battle_ms", 0);
            int boss = o.has("raid_pokemon_id") && !o.isNull("raid_pokemon_id") ? o.optInt("raid_pokemon_id", -1) : -1;
            int cp = o.has("raid_pokemon_cp") && !o.isNull("raid_pokemon_cp") ? o.optInt("raid_pokemon_cp", -1) : -1;

            StringBuilder d = new StringBuilder();
            boolean egg = hatch > now; // not yet hatched
            d.append(teamName(team)).append(" \u00b7 ").append(occupancy(o)).append(" \u00b7 ").append(egg ? "Raid egg" : "Raid");
            if (rawLevel > 0) d.append(" · Raid type ").append(rawLevel); // no invented star rating
            if (boss > 0) d.append(" · #").append(boss);
            else if (!egg) d.append(" · boss unknown");
            if (!egg && cp > 0) d.append(" · CP ").append(cp);

            out.add(new Entry(id, Kind.RAID, name, d.toString(), lat, lon, boss, cp, rawLevel, -1, raidEnd, false));
            return;
        }

        String id = "gym:" + fortId;
        if (!ids.add(id)) return;
        StringBuilder d = new StringBuilder(teamName(team));
        d.append(" · ").append(occupancy(o));
        if (o.optBoolean("in_battle", false)) d.append(" · in battle");
        out.add(new Entry(id, Kind.GYM, name, d.toString(), lat, lon, -1, -1, -1, -1, 0, false));
    }

    private static String occupancy(JSONObject o) {
        if (o.has("slots_available") && !o.isNull("slots_available")) {
            int free = o.optInt("slots_available", -1);
            if (free >= 0 && free <= 6) return (6 - free) + "/6"; // occupied of six, only when validated
        }
        return "--/6"; // null / out-of-range => unknown rather than fabricated
    }

    private static String teamName(int team) {
        switch (team) {
            case 1: return "Mystic";
            case 2: return "Valor";
            case 3: return "Instinct";
            case 0: return "Uncontested";
            default: return "Team unknown";
        }
    }

    // --- stations --------------------------------------------------------------------------------

    private static boolean parseStations(JSONArray array, long now, List<Entry> out, Set<String> ids) {
        if (array == null) return false;
        int limit = Math.min(array.length(), MAX_ENTRIES);
        for (int i = 0; i < limit; i++) {
            if (out.size() >= MAX_ENTRIES) return true;
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            double lat = o.optDouble("lat", Double.NaN), lon = o.optDouble("lon", Double.NaN);
            if (!validCoords(lat, lon)) continue;
            String stationId = o.optString("station_id", "");
            if (stationId.isEmpty()) continue;
            long end = o.optLong("end_ms", 0);
            if (end > 0 && end <= now) continue; // expired station ignored

            String id = "station:" + stationId;
            if (!ids.add(id)) continue;
            String name = clean(o.optString("name", ""));
            if (name.isEmpty()) name = "Power Station";
            int level = o.optInt("battle_level", 0);
            int boss = o.has("boss_dex_id") && !o.isNull("boss_dex_id") ? o.optInt("boss_dex_id", -1) : -1;

            StringBuilder d = new StringBuilder("Max battle");
            if (level > 0) d.append(" Lv").append(level); // battle-kind semantics unverified; show level only
            if (boss > 0) d.append(" · #").append(boss);
            out.add(new Entry(id, Kind.STATION, name, d.toString(), lat, lon, boss, -1, level, -1, end, false));
        }
        return false;
    }

    // --- shared helpers --------------------------------------------------------------------------

    private static boolean validCoords(double lat, double lon) {
        return Double.isFinite(lat) && Double.isFinite(lon)
                && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
                && !(Math.abs(lat) < 1e-9 && Math.abs(lon) < 1e-9); // drop null-island placeholders
    }

    private static String join(List<String> parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) { if (sb.length() > 0) sb.append(" · "); sb.append(p); }
        return sb.toString();
    }

    /** Formats a positive millisecond span as a compact, human countdown. */
    static String duration(long ms) {
        if (ms < 0) ms = 0;
        long totalSeconds = ms / 1000;
        if (totalSeconds < 60) return totalSeconds + "s";
        long minutes = totalSeconds / 60;
        if (minutes < 60) { long s = totalSeconds % 60; return s > 0 ? minutes + "m " + s + "s" : minutes + "m"; }
        long hours = minutes / 60; long m = minutes % 60;
        return m > 0 ? hours + "h " + m + "m" : hours + "h";
    }

    /** Trims, strips control characters, and bounds length so names/details stay plain-text safe. */
    static String clean(String raw) {
        if (raw == null) return "";
        String trimmed = raw.trim();
        if (trimmed.length() > 120) trimmed = trimmed.substring(0, 120);
        StringBuilder sb = new StringBuilder(trimmed.length());
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            sb.append(Character.isISOControl(c) ? ' ' : c);
        }
        return sb.toString().trim();
    }
}

package dev.pgrazor;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** Formats the owned-Pokemon export: the pokemon-dump.json array and PvPoke import CSV rows. Pure, no Android. */
public final class PokemonDump {
    private PokemonDump() {}

    /** One owned Pokemon. levelHalf is twice the level, plus one for a half level; -1 when the level is unknown. */
    static final class Entry {
        final int dex, cp, levelHalf, atk, def, hp;
        final boolean shadow;
        final String name, fast, charged1, charged2, nickname;

        Entry(int dex, String name, boolean shadow, int cp, int levelHalf, int atk, int def, int hp,
              String fast, String charged1, String charged2, String nickname) {
            this.dex = dex; this.name = name; this.shadow = shadow; this.cp = cp; this.levelHalf = levelHalf;
            this.atk = atk; this.def = def; this.hp = hp;
            this.fast = fast; this.charged1 = charged1; this.charged2 = charged2; this.nickname = nickname;
        }
    }

    // shortcut: base species only, forms not mapped (Alola, Mega, Gigantamax), upgrade to the pvp snapshot ids in pgrazor/native/schema/pvp/snapshot.json when forms are needed.
    static String speciesId(String name) {
        String plain = name.replace("\u2640", "female").replace("\u2642", "male");
        plain = Normalizer.normalize(plain, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return plain.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    static String levelText(int levelHalf) {
        return levelHalf % 2 == 1 ? (levelHalf / 2) + ".5" : String.valueOf(levelHalf / 2);
    }

    static String pvpokeRow(Entry e) {
        return speciesId(e.name) + (e.shadow ? "-shadow" : "")
            + "," + orNone(e.fast) + "," + orNone(e.charged1) + "," + orNone(e.charged2)
            + "," + levelText(e.levelHalf) + "," + e.atk + "," + e.def + "," + e.hp;
    }

    /** CSV rows sorted by CP ascending, no header. Rows without a known level cannot be imported and are left out. */
    static String csv(List<Entry> rows) {
        StringBuilder out = new StringBuilder();
        for (Entry e : byCp(rows)) if (e.levelHalf >= 0) out.append(pvpokeRow(e)).append('\n');
        return out.toString();
    }

    /** The pokemon-dump.json array, in the order given. */
    static String json(List<Entry> rows) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < rows.size(); i++) {
            Entry e = rows.get(i);
            if (i > 0) out.append(',');
            out.append("{\"dex\":").append(e.dex)
                .append(",\"name\":").append(jsonString(e.name))
                .append(",\"shadow\":").append(e.shadow)
                .append(",\"cp\":").append(e.cp)
                .append(",\"level\":").append(e.levelHalf >= 0 ? levelText(e.levelHalf) : "null")
                .append(",\"atk\":").append(e.atk)
                .append(",\"def\":").append(e.def)
                .append(",\"hp\":").append(e.hp)
                .append(",\"fast\":").append(jsonString(e.fast))
                .append(",\"charged\":[").append(jsonString(e.charged1)).append(',').append(jsonString(e.charged2)).append(']')
                .append(",\"nickname\":").append(jsonString(e.nickname))
                .append('}');
        }
        return out.append(']').toString();
    }

    static String jsonString(String s) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 0x20) out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }

    static List<Entry> byCp(List<Entry> rows) {
        List<Entry> sorted = new ArrayList<>(rows);
        sorted.sort(Comparator.comparingInt(e -> e.cp));
        return sorted;
    }

    private static String orNone(String move) {
        return move.isEmpty() ? "none" : move;
    }
}

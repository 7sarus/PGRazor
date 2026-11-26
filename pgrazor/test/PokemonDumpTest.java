package dev.pgrazor;

import java.util.Arrays;

/** Exercises the owned-Pokemon export formats: PvPoke species ids, CSV rows, CP order, levels and JSON. */
public final class PokemonDumpTest {
    private static void expect(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        expect("mrmime".equals(PokemonDump.speciesId("Mr. Mime")), "Mr. Mime becomes mrmime");
        expect("flabebe".equals(PokemonDump.speciesId("Flab\u00e9b\u00e9")), "accents fold to base letters");
        expect("nidoranfemale".equals(PokemonDump.speciesId("Nidoran\u2640")), "female symbol becomes female");
        expect("farfetchd".equals(PokemonDump.speciesId("Farfetch'd")), "punctuation is dropped");
        expect("40.5".equals(PokemonDump.levelText(81)) && "40".equals(PokemonDump.levelText(80)), "half level renders as .5");

        PokemonDump.Entry shadow = new PokemonDump.Entry(122, "Mr. Mime", true, 1500, 81, 15, 14, 13,
            "CONFUSION_FAST", "PSYSTRIKE", "", "");
        expect("mrmime-shadow,CONFUSION_FAST,PSYSTRIKE,none,40.5,15,14,13".equals(PokemonDump.pvpokeRow(shadow)),
            "shadow suffix and a missing charged move becomes none");

        PokemonDump.Entry high = new PokemonDump.Entry(6, "Charizard", false, 2000, 60, 10, 10, 10,
            "FIRE_SPIN", "BLAST_BURN", "FIRE_BLAST", "");
        PokemonDump.Entry low = new PokemonDump.Entry(25, "Pikachu", false, 300, 20, 14, 15, 13,
            "THUNDER_SHOCK", "WILD_CHARGE", "THUNDERBOLT", "");
        PokemonDump.Entry unknown = new PokemonDump.Entry(1, "Bulbasaur", false, 100, -1, 1, 1, 1,
            "VINE_WHIP", "", "", "");
        expect(("pikachu,THUNDER_SHOCK,WILD_CHARGE,THUNDERBOLT,10,14,15,13\n"
            + "charizard,FIRE_SPIN,BLAST_BURN,FIRE_BLAST,30,10,10,10\n").equals(PokemonDump.csv(Arrays.asList(high, unknown, low))),
            "CSV rows sort by CP ascending and leave out unknown levels");

        String json = PokemonDump.json(Arrays.asList(high, unknown));
        expect(json.startsWith("[{\"dex\":6,\"name\":\"Charizard\",\"shadow\":false,\"cp\":2000,\"level\":30,\"atk\":10,"
            + "\"def\":10,\"hp\":10,\"fast\":\"FIRE_SPIN\",\"charged\":[\"BLAST_BURN\",\"FIRE_BLAST\"],\"nickname\":\"\"}"),
            "JSON row keeps the documented fields in order");
        expect(json.contains("\"level\":null"), "unknown level is JSON null");
        expect("\"a\\\"b\\\\c\\u0001\"".equals(PokemonDump.jsonString("a\"b\\c\u0001")), "JSON strings are escaped");

        PokemonDump.Entry emptyMoves = new PokemonDump.Entry(1, "Bulbasaur", false, 100, 20, 1, 1, 1, "", "", "", "");
        expect("bulbasaur,none,none,none,10,1,1,1".equals(PokemonDump.pvpokeRow(emptyMoves)), "missing moves become none");
        expect("Exported 5 Pokemon to Download/PGRazor/.".equals(PokemonDump.summary(5, "Download/PGRazor/", 0, true)), "clean summary");
        expect(("Exported 5 Pokemon to Download/PGRazor/. 2 without a known level are left out of the CSV."
            + " Move names unavailable; move ids were written.").equals(PokemonDump.summary(5, "Download/PGRazor/", 2, false)),
            "summary includes missing level and move id notes");

        System.out.println("PokemonDump tests passed");
    }
}

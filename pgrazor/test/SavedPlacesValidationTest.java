import dev.pgrazor.SavedPlaces;

public final class SavedPlacesValidationTest {
    static void invalid(String name, double latitude, double longitude) {
        try { new SavedPlaces.Entry(name, latitude, longitude); throw new AssertionError("Accepted invalid saved place"); }
        catch (IllegalArgumentException expected) { }
    }
    public static void main(String[] args) {
        SavedPlaces.Entry entry = new SavedPlaces.Entry("  Home  ", 12.5, 45.25);
        if (!entry.name.equals("Home") || entry.latitude != 12.5 || entry.longitude != 45.25 || entry.id.length() == 0) throw new AssertionError("Validated entry changed coordinates");
        new SavedPlaces.Entry("North dateline", 90, 180);
        new SavedPlaces.Entry("South dateline", -90, -180);
        new SavedPlaces.Entry("1234567890123456789012345678901234567890", 0, 0);
        invalid("12345678901234567890123456789012345678901", 0, 0);
        invalid(null, 0, 0); invalid("  ", 0, 0); invalid("Bad\nname", 0, 0);
        invalid("Bad\tname", 0, 0); invalid("Bad\u0000name", 0, 0);
        invalid("Invalid", Double.NaN, 0); invalid("Invalid", 0, Double.POSITIVE_INFINITY);
        invalid("Invalid", 90.01, 0); invalid("Invalid", -90.01, 0);
        invalid("Invalid", 0, 180.01); invalid("Invalid", 0, -180.01);
        if (SavedPlaces.LIMIT != 50 || SavedPlaces.NAME_LIMIT != 40) throw new AssertionError("Library bounds changed");
        System.out.println("PASS: saved-place names, coordinate boundaries, non-finite rejection, bounds");
    }
}

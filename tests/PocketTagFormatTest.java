package io.pocketsve.app;
import java.nio.charset.StandardCharsets;
public final class PocketTagFormatTest {
    private static void expect(boolean condition, String name) {
        if (!condition) throw new AssertionError(name);
    }
    public static void main(String[] args) {
        String reference = "pocketsve:leader/svgdb-2808";
        byte[] text = ("\u0002en" + reference).getBytes(StandardCharsets.UTF_8);
        expect(PocketTagFormat.isCustomLeaderRecord(1, new byte[]{'T'}, text), "NFC Tools UTF-8 text tag");
        expect(PocketTagFormat.isCustomLeaderRecord(1, new byte[]{'U'}, ("\u0000" + reference).getBytes(StandardCharsets.UTF_8)), "custom URI tag");
        expect(!PocketTagFormat.isCustomLeaderRecord(1, new byte[]{'T'}, new byte[]{63, 1}), "invalid language length");
        expect(!PocketTagFormat.isCustomLeaderRecord(1, new byte[]{'T'}, "\u0002enother-card-data".getBytes(StandardCharsets.UTF_8)), "original/unrelated tag preserves original reader");
        expect(!PocketTagFormat.isCustomLeaderRecord(2, new byte[]{'T'}, text), "MIME is not well-known Text");
        expect(!PocketTagFormat.isCustomLeaderRecord(1, new byte[]{'T'}, ("\u0002enpocketsve:leader/../wrong").getBytes(StandardCharsets.UTF_8)), "malformed ID");
        expect(!PocketTagFormat.isCustomLeaderRecord(1, null, null), "empty input");
        System.out.println("7 native NDEF routing checks passed");
    }
}

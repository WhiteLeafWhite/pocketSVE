package io.pocketsve.app;

import java.nio.charset.StandardCharsets;

/** Routes our ordinary NDEF Text/URI tags without sending original-card authentication commands. */
final class PocketTagFormat {
    private PocketTagFormat() { }

    static boolean isCustomLeaderRecord(int tnf, byte[] type, byte[] payload) {
        if (tnf != 1 || type == null || type.length != 1 || payload == null || payload.length < 1) return false;
        String text;
        if (type[0] == 'T') {
            int offset = 1 + (payload[0] & 63);
            if (offset >= payload.length) return false;
            text = new String(payload, offset, payload.length - offset,
                    (payload[0] & 128) == 0 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16);
        } else if (type[0] == 'U' && payload[0] == 0) {
            text = new String(payload, 1, payload.length - 1, StandardCharsets.UTF_8);
        } else return false;
        return text.trim().matches("(?i)^pocketsve:(?://)?leader/[a-z0-9_-]{1,100}$");
    }
}

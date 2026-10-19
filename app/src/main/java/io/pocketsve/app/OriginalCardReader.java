package io.pocketsve.app;

import android.content.Context;
import android.nfc.Tag;
import android.nfc.TagLostException;
import android.nfc.tech.NfcA;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Adapter boundary for the statically recovered card protocol. No write commands are permitted. */
final class OriginalCardReader {
    private static final String APPLICATION_KEY = "1826sye782717283";
    private static volatile JSONObject catalog;
    private static volatile boolean catalogLoaded;

    private OriginalCardReader() { }

    static void enrich(Context context, Tag tag, JSONObject result) throws Exception {
        NfcA technology = NfcA.get(tag);
        if (technology == null) return;
        JSONObject card = new JSONObject();
        card.put("verified", false);
        result.put("originalCard", card);
        try {
            technology.connect();
            technology.setTimeout(1500);
            // Original NTAG protocol: UID pages, PWD_AUTH, then READ only. No writes.
            byte[] page0 = read(technology, 0);
            byte[] page1 = read(technology, 1);
            String uid = MainActivity.hex(Arrays.copyOf(page0, 3))
                    + MainActivity.hex(Arrays.copyOf(page1, 4));
            card.put("uid", uid);
            byte[] password = md5(uid).substring(0, 4).getBytes(StandardCharsets.US_ASCII);
            byte[] auth = technology.transceive(new byte[] { 0x1b, password[0], password[1], password[2], password[3] });
            card.put("authResponse", MainActivity.hex(auth));
            if (auth.length != 2 || (auth[0] & 255) != 0x90 || auth[1] != 0) {
                card.put("verification", "auth_failed").put("message", "此标签未通过原版卡牌鉴权");
                return;
            }
            byte[][] reads = new byte[23][];
            for (int page = 5; page <= 27; page++) {
                reads[page - 5] = read(technology, page);
            }
            String ciphertext = payloadFromReads(reads);
            String outer = decrypt(ciphertext, md5(uid).substring(0, 16));
            int uidSeparator = outer.indexOf('&');
            if (uidSeparator < 0 || !uid.equals(outer.substring(0, uidSeparator))) {
                card.put("verification", "uid_mismatch").put("message", "卡牌 UID 与加密数据不匹配");
                return;
            }
            String inner = decrypt(outer.substring(uidSeparator + 1), APPLICATION_KEY);
            int cardSeparator = inner.indexOf('&');
            if (cardSeparator < 1) {
                card.put("verification", "invalid_payload").put("message", "卡牌编号无法识别");
                return;
            }
            String catalogId = inner.substring(0, cardSeparator);
            card.put("cardId", catalogId).put("catalogId", catalogId);
            JSONObject known = lookup(context, catalogId);
            if (known == null || !known.has("password")) {
                card.put("verification", "catalog_missing").put("message", "已读取卡牌编号，缺少卡牌密码目录，尚未完成末层验证");
                return;
            }
            String proof = decrypt(inner.substring(cardSeparator + 1), md5(known.getString("password")).substring(0, 16));
            String[] fields = proof.split("::", -1);
            if (fields.length < 2 || !catalogId.equals(fields[0]) || Double.parseDouble(fields[1]) != 1.0) {
                card.put("verification", "proof_failed").put("message", "卡牌校验数据不通过");
                return;
            }
            card.put("cardId", known.optString("card_id", catalogId)).put("verified", true)
                    .put("verification", "verified").put("message", "原版卡牌校验通过");
        } catch (TagLostException error) {
            throw error;
        } catch (IOException error) {
            card.put("verification", "unsupported_or_unreadable").put("message", "标签不支持原版卡牌读取协议，或未保持贴近");
        } catch (Exception error) {
            card.put("verification", "decode_failed").put("message", "卡牌加密数据无法验证");
        } finally {
            try { technology.close(); } catch (IOException ignored) { }
        }
    }

    private static byte[] read(NfcA technology, int page) throws IOException {
        byte[] response = technology.transceive(new byte[] { 0x30, (byte) page });
        if (response == null || response.length != 16) throw new IOException("Invalid NTAG READ response");
        return response;
    }

    private static String payloadFromReads(byte[][] reads) throws IOException {
        if (reads.length != 23) throw new IOException("Expected 23 NTAG READ results");
        ByteArrayOutputStream raw = new ByteArrayOutputStream(104);
        for (int index = 0; index < reads.length; index++) {
            byte[] response = reads[index];
            if (response == null || response.length != 16) throw new IOException("Invalid NTAG READ response");
            if (index == 0) raw.write(response, 0, response.length);
            else raw.write(response, response.length - 4, 4);
        }
        byte[] bytes = raw.toByteArray();
        int end = 3;
        while (end < bytes.length && (bytes[end] & 255) != 0xfe) end++;
        if (end == 3 || end == bytes.length) throw new IOException("Invalid NTAG payload delimiter");
        return new String(bytes, 3, end - 3, StandardCharsets.ISO_8859_1);
    }

    private static String decrypt(String ciphertext, String key) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES"));
        return new String(cipher.doFinal(Base64.decode(ciphertext, Base64.DEFAULT)), StandardCharsets.UTF_8);
    }

    private static String md5(String input) throws Exception {
        byte[] bytes = MessageDigest.getInstance("MD5").digest(input.getBytes(StandardCharsets.UTF_8));
        return MainActivity.hex(bytes).toLowerCase(Locale.ROOT);
    }

    private static JSONObject lookup(Context context, String id) throws Exception {
        if (!catalogLoaded) synchronized (OriginalCardReader.class) {
            if (!catalogLoaded) {
                try (InputStream stream = context.getAssets().open("data/nfc-cards.json")) {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
                    String text = new String(output.toByteArray(), StandardCharsets.UTF_8);
                    if (text.trim().startsWith("[")) {
                        JSONArray entries = new JSONArray(text);
                        catalog = new JSONObject();
                        for (int i = 0; i < entries.length(); i++) {
                            JSONObject item = entries.getJSONObject(i);
                            catalog.put(item.optString("id", item.optString("card_id")), item);
                        }
                    } else catalog = new JSONObject(text);
                } catch (IOException unavailable) { catalog = new JSONObject(); }
                catalogLoaded = true;
            }
        }
        return catalog.optJSONObject(id);
    }
}

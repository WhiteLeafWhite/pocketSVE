package io.pocketsve.app;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/** Cross-language synthetic fixture check of the actual production decoder methods. */
public final class NativeCryptoCheck {
    public static void main(String[] args) throws Exception {
        Class<?> reader = Class.forName("io.pocketsve.app.OriginalCardReader");
        Method md5 = reader.getDeclaredMethod("md5", String.class);
        Method decrypt = reader.getDeclaredMethod("decrypt", String.class, String.class);
        Method payloadFromReads = reader.getDeclaredMethod("payloadFromReads", byte[][].class);
        md5.setAccessible(true);
        decrypt.setAccessible(true);
        payloadFromReads.setAccessible(true);
        String uid = args[0], payload = args[1], password = args[2], expected = args[3];
        String uidHash = (String) md5.invoke(null, uid);
        String authHex = "1B" + MainActivity.hex(uidHash.substring(0, 4).getBytes("US-ASCII"));
        if (!args[4].equals(authHex)) throw new AssertionError("Wrong PWD_AUTH derivation");
        byte[][] reads = new byte[23][];
        for (int i = 0; i < reads.length; i++) reads[i] = fromHex(args[i + 5]);
        String assembled = (String) payloadFromReads.invoke(null, (Object) reads);
        if (!payload.equals(assembled)) throw new AssertionError("Wrong NTAG READ payload assembly");
        String outer = (String) decrypt.invoke(null, assembled, uidHash.substring(0, 16));
        String[] outerParts = outer.split("&", 2);
        if (!uid.equals(outerParts[0])) throw new AssertionError("UID mismatch");
        String middle = (String) decrypt.invoke(null, outerParts[1], "1826sye782717283");
        String[] middleParts = middle.split("&", 2);
        if (!expected.equals(middleParts[0])) throw new AssertionError("Wrong card ID");
        String passwordHash = (String) md5.invoke(null, password);
        String proof = (String) decrypt.invoke(null, middleParts[1], passwordHash.substring(0, 16));
        if (!(expected + "::1").equals(proof)) throw new AssertionError("Wrong card validation proof");
        boolean rejected = false;
        try {
            String wrongHash = (String) md5.invoke(null, "04112233445567");
            String wrong = (String) decrypt.invoke(null, payload, wrongHash.substring(0, 16));
            rejected = !wrong.startsWith("04112233445567&");
        } catch (InvocationTargetException invalid) { rejected = true; }
        if (!rejected) throw new AssertionError("Wrong UID accepted");
        System.out.println("PASS: synthetic NTAG read assembly, PWD_AUTH derivation, three AES layers, card identity, wrong UID rejection.");
        System.out.println("No physical card or Android NFC runtime was used.");
    }

    private static byte[] fromHex(String text) {
        byte[] result = new byte[text.length() / 2];
        for (int i = 0; i < result.length; i++) result[i] = (byte) Integer.parseInt(text.substring(i * 2, i * 2 + 2), 16);
        return result;
    }
}

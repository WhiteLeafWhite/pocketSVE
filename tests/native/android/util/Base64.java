package android.util;

/** Host-test shim only. This directory is never packaged into the application. */
public final class Base64 {
    public static final int DEFAULT = 0;
    public static byte[] decode(String text, int flags) {
        return java.util.Base64.getMimeDecoder().decode(text);
    }
}

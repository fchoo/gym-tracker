package android.content.res;
import java.io.*;
public final class AssetManager {
 public static String config="{}"; public static boolean fail=false;
 public InputStream open(String name) throws IOException {
  if (!name.equals("app.config")) throw new AssertionError("unexpected asset");
  if (fail) throw new IOException("private path");
  return new ByteArrayInputStream(config.getBytes(java.nio.charset.StandardCharsets.UTF_8));
 }
}

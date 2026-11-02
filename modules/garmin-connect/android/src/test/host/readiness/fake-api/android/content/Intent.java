package android.content;
import android.net.Uri;
public class Intent {
 private Uri data;
 public Intent setData(Uri value){data=value;return this;}
 public Uri getData(){return data;}
}

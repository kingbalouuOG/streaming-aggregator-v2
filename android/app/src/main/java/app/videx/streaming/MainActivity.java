package app.videx.streaming;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NavigationBarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

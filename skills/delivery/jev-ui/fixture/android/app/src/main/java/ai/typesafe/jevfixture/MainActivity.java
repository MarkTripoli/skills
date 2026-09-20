package ai.typesafe.jevfixture;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.*;

public final class MainActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL); root.setPadding(32, 48, 32, 32);
    TextView title = new TextView(this); title.setText("Delivery check-in"); title.setTextSize(24); title.setTextColor(Color.BLACK);
    root.addView(title, new LinearLayout.LayoutParams(-1, -2));
    EditText name = new EditText(this); name.setHint("Name"); name.setContentDescription("Name"); String initial = getIntent().getStringExtra("JEV_UI_INITIAL_NAME"); if (initial != null) name.setText(initial); root.addView(name, new LinearLayout.LayoutParams(-1, -2));
    Spinner channel = new Spinner(this); channel.setContentDescription("Channel");
    channel.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"Email", "Phone"})); root.addView(channel, new LinearLayout.LayoutParams(-1, -2));
    Button confirm = new Button(this); confirm.setText("Confirm"); confirm.setContentDescription("Confirm"); root.addView(confirm, new LinearLayout.LayoutParams(-1, -2));
    TextView status = new TextView(this); status.setText("Ready for confirmation."); status.setContentDescription("Status"); status.setGravity(Gravity.CENTER_VERTICAL); root.addView(status, new LinearLayout.LayoutParams(-1, 100));
    confirm.setOnClickListener(v -> { String value = name.getText().toString().trim(); String selected = String.valueOf(channel.getSelectedItem()); status.setText(value.isEmpty() ? "Enter a name before confirming." : "Confirmed " + value + " via " + selected + "."); });
    setContentView(root);
  }
}

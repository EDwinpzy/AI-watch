package com.aiwatch.watch;

import ohos.aafwk.ability.Ability;
import ohos.aafwk.content.Intent;
import ohos.agp.components.Component;
import ohos.agp.components.ComponentContainer;
import ohos.agp.components.DirectionalLayout;
import ohos.agp.components.Text;
import ohos.agp.utils.Color;
import ohos.agp.utils.LayoutAlignment;

public class MainAbility extends Ability {
    @Override
    protected void onStart(Intent intent) {
        super.onStart(intent);

        DirectionalLayout root = new DirectionalLayout(this);
        root.setOrientation(Component.VERTICAL);
        root.setAlignment(LayoutAlignment.CENTER);
        root.setWidth(ComponentContainer.LayoutConfig.MATCH_PARENT);
        root.setHeight(ComponentContainer.LayoutConfig.MATCH_PARENT);

        Text probe = new Text(this);
        probe.setText("NOVA Watch AI\nJava FA probe");
        probe.setTextSize(42);
        probe.setTextColor(Color.WHITE);
        probe.setTextAlignment(LayoutAlignment.CENTER);
        root.addComponent(probe);

        setUIContent(root);
    }
}

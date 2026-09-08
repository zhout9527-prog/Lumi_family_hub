# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class cn.lumi.familyhub.* {
  native <methods>;
}

-keep class cn.lumi.familyhub.WryActivity {
  public <init>(...);

  void setWebView(cn.lumi.familyhub.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class cn.lumi.familyhub.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class cn.lumi.familyhub.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class cn.lumi.familyhub.RustWebChromeClient,cn.lumi.familyhub.RustWebViewClient {
  public <init>(...);
}

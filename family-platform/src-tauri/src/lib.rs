#[cfg(desktop)]
use std::{
    io,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command},
    sync::{atomic::{AtomicBool, Ordering}, Mutex},
    time::Duration,
};

#[cfg(all(desktop, target_os = "windows"))]
use std::os::windows::process::CommandExt;
#[cfg(desktop)]
use tauri::{Emitter, Manager};

#[cfg(desktop)]
struct ServerProcess(Mutex<Option<Child>>);

#[cfg(desktop)]
struct ExitState(AtomicBool);

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn hide_window_to_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不可用".to_string())?;
    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    window.hide().map_err(|error| error.to_string())?;
    if window.is_minimized().unwrap_or(false) {
        window.unminimize().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(desktop)]
fn exit_application(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ExitState>() {
        state.0.store(true, Ordering::SeqCst);
    }
    app.exit(0);
}

#[cfg(desktop)]
#[tauri::command]
fn respond_to_close(app: tauri::AppHandle, action: String) -> Result<(), String> {
    match action.as_str() {
        "exit" => exit_application(&app),
        "minimize" => hide_window_to_tray(&app)?,
        "cancel" => {}
        _ => return Err("未知的关闭方式".to_string()),
    }
    Ok(())
}

#[cfg(all(desktop, target_os = "windows"))]
fn shell_execute(target: &str, parameters: Option<&str>) -> Result<(), String> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt};

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            window: *mut std::ffi::c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show_command: i32,
        ) -> isize;
    }

    let target_name = target;
    let operation: Vec<u16> = OsStr::new("open").encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = OsStr::new(target_name).encode_wide().chain(Some(0)).collect();
    let parameters: Option<Vec<u16>> = parameters
        .map(|value| OsStr::new(value).encode_wide().chain(Some(0)).collect());
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            parameters.as_ref().map_or(std::ptr::null(), |value| value.as_ptr()),
            std::ptr::null(),
            1,
        )
    };
    if result <= 32 {
        return Err(format!("Windows 无法打开 {target_name}"));
    }
    Ok(())
}

#[cfg(all(desktop, target_os = "windows"))]
fn open_bilibili_in_browser(browser: &str) -> Result<String, String> {
    let url = "https://www.bilibili.com/";
    let selected = match browser {
        "edge" => shell_execute(&format!("microsoft-edge:{url}"), None),
        "chrome" => shell_execute("chrome.exe", Some(url)),
        "firefox" => shell_execute("firefox.exe", Some(url)),
        _ => return Err("不支持的浏览器".to_string()),
    };
    if selected.is_ok() {
        return Ok(browser.to_string());
    }
    shell_execute(url, None)?;
    Ok("default".to_string())
}

#[cfg(all(desktop, not(target_os = "windows")))]
fn open_bilibili_in_browser(browser: &str) -> Result<String, String> {
    if !matches!(browser, "edge" | "chrome" | "firefox") {
        return Err("不支持的浏览器".to_string());
    }
    let program = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    Command::new(program)
        .arg("https://www.bilibili.com/")
        .spawn()
        .map(|_| "default".to_string())
        .map_err(|error| error.to_string())
}

#[cfg(desktop)]
#[tauri::command]
fn open_bilibili_login(browser: String) -> Result<String, String> {
    open_bilibili_in_browser(&browser)
}

#[cfg(desktop)]
fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::{
        menu::MenuBuilder,
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let is_server = app.config().identifier.ends_with(".server");
    let menu = MenuBuilder::new(app)
        .text("show", "打开 Lumi")
        .text("quit", "退出")
        .build()?;
    let mut builder = TrayIconBuilder::with_id("lumi-main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(if is_server { "Lumi Server 正在后台运行" } else { "Lumi Client" })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => exit_application(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn server_core_path() -> io::Result<PathBuf> {
    let directory = std::env::current_exe()?
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "application directory is unavailable"))?
        .to_path_buf();
    let core_name = if cfg!(target_os = "windows") {
        "lumi-server-core.exe"
    } else {
        "lumi-server-core"
    };
    let mut candidates = Vec::new();
    if let Some(configured) = std::env::var_os("FAMILYHUB_SERVER_CORE") {
        candidates.push(PathBuf::from(configured));
    }
    // 安装版和便携版都使用这个相对布局：GUI 与 Core 在同一目录下，
    // Core 的依赖文件保留在其自己的 onedir 文件夹中。
    candidates.push(directory.join("lumi-server-core").join(core_name));
    // 兼容早期把 Core 单文件直接放在 GUI 旁边的版本。
    candidates.push(directory.join(core_name));
    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!(
            "Lumi Server core is missing beside {} (expected lumi-server-core\\{})",
            directory.display(),
            core_name
        ),
    ))
}

#[cfg(all(desktop, target_os = "windows"))]
fn report_startup_error(error: &io::Error) {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt};

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            window: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            flags: u32,
        ) -> i32;
    }

    let message = format!(
        "Lumi Server 本机服务没有启动。\n\n{}\n\n请确认 lumi-server-core 文件夹与 Lumi Server 主程序放在一起，然后重新启动。",
        error
    );
    let text: Vec<u16> = OsStr::new(&message).encode_wide().chain(Some(0)).collect();
    let caption: Vec<u16> = OsStr::new("Lumi Server 启动提示").encode_wide().chain(Some(0)).collect();
    // SAFETY: MessageBoxW 只读取以 NUL 结尾的 UTF-16 字符串，指针在调用期间有效。
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10);
    }
}

#[cfg(all(desktop, not(target_os = "windows")))]
fn report_startup_error(error: &io::Error) {
    eprintln!("Lumi Server core failed to start: {error}");
}

#[cfg(desktop)]
fn start_server_core(app: &tauri::App) -> io::Result<Option<Child>> {
    let endpoint = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 8000);
    if TcpStream::connect_timeout(&endpoint, Duration::from_millis(250)).is_ok() {
        return Ok(None);
    }

    let executable = server_core_path()?;
    if !executable.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("Lumi Server core is missing: {}", executable.display()),
        ));
    }
    let data_root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
    std::fs::create_dir_all(&data_root)?;
    let runtime_root = std::env::var_os("FAMILYHUB_RUNTIME_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| data_root.join("runtime"));

    let mut command = Command::new(executable);
    command
        .current_dir(&data_root)
        .env("FAMILYHUB_RUNTIME_ROOT", runtime_root)
        .env("FAMILYHUB_ENVIRONMENT", "production")
        .env("FAMILYHUB_SEED_DEMO", "false")
        .env("FAMILYHUB_API_HOST", "0.0.0.0")
        .env("FAMILYHUB_API_PORT", "8000");
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    command.spawn().map(Some)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![respond_to_close, open_bilibili_login])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let can_exit = app
                    .try_state::<ExitState>()
                    .is_some_and(|state| state.0.load(Ordering::SeqCst));
                if can_exit {
                    return;
                }
                api.prevent_close();
                if app.config().identifier.ends_with(".server") {
                    let _ = hide_window_to_tray(app);
                } else {
                    let _ = window.emit("lumi://close-requested", ());
                }
            }
            if matches!(event, tauri::WindowEvent::Resized(_))
                && window.is_minimized().unwrap_or(false)
            {
                let _ = hide_window_to_tray(window.app_handle());
            }
        });

    let app = builder
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.manage(ExitState(AtomicBool::new(false)));
                let child = if app.config().identifier.ends_with(".server") {
                    match start_server_core(app) {
                        Ok(child) => child,
                        Err(error) => {
                            // 让 GUI 保持打开并显示离线状态，避免 Windows 上只闪退而
                            // 用户无法知道是 Core 缺失还是网络连接问题。
                            report_startup_error(&error);
                            None
                        }
                    }
                } else {
                    None
                };
                app.manage(ServerProcess(Mutex::new(child)));
                install_tray(app)?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Lumi application");

    app.run(|app_handle, event| {
        #[cfg(desktop)]
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(state) = app_handle.try_state::<ServerProcess>() {
                if let Ok(mut child) = state.0.lock() {
                    if let Some(process) = child.as_mut() {
                        let _ = process.kill();
                        let _ = process.wait();
                    }
                    *child = None;
                }
            }
        }
    });
}

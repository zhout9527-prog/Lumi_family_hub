#[cfg(desktop)]
use std::{
    io,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command},
    sync::Mutex,
    time::Duration,
};

#[cfg(all(desktop, target_os = "windows"))]
use std::os::windows::process::CommandExt;
#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
struct ServerProcess(Mutex<Option<Child>>);

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
        .plugin(tauri_plugin_process::init());

    let app = builder
        .setup(|app| {
            #[cfg(desktop)]
            {
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

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
    if let Some(configured) = std::env::var_os("FAMILYHUB_SERVER_CORE") {
        return Ok(PathBuf::from(configured));
    }
    let directory = std::env::current_exe()?
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "application directory is unavailable"))?
        .to_path_buf();
    let core_name = if cfg!(target_os = "windows") {
        "lumi-server-core.exe"
    } else {
        "lumi-server-core"
    };
    let bundled_directory = directory.join("lumi-server-core").join(core_name);
    if bundled_directory.is_file() {
        return Ok(bundled_directory);
    }
    Ok(directory.join(core_name))
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
                    start_server_core(app)?
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

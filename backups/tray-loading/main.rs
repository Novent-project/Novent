#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::Write,
    sync::Mutex,
    process::Child,
    time::{Duration, Instant},
    thread,
};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x00002000;
#[cfg(windows)]
const JobObjectExtendedLimitInformation: u32 = 9;

#[cfg(windows)]
#[repr(C)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[cfg(windows)]
#[repr(C)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[cfg(windows)]
#[repr(C)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[cfg(windows)]
unsafe extern "system" {
    fn CreateJobObjectW(attrs: *mut std::ffi::c_void, name: *const u16) -> *mut std::ffi::c_void;
    fn SetInformationJobObject(
        job: *mut std::ffi::c_void,
        info_class: u32,
        info: *mut std::ffi::c_void,
        info_len: u32,
    ) -> i32;
    fn AssignProcessToJobObject(job: *mut std::ffi::c_void, process: *mut std::ffi::c_void) -> i32;
}

static BACKEND_BYTES: &[u8] = include_bytes!(
    "../binaries/backend-x86_64-pc-windows-msvc.exe"
);

struct BackendProcess(Mutex<Option<Child>>);

#[cfg(windows)]
fn assign_to_job_object(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if job.is_null() { return; }

        let mut info = JobObjectExtendedLimitInformation {
            basic_limit_information: JobObjectBasicLimitInformation {
                per_process_user_time_limit: 0,
                per_job_user_time_limit: 0,
                limit_flags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                minimum_working_set_size: 0,
                maximum_working_set_size: 0,
                active_process_limit: 0,
                affinity: 0,
                priority_class: 0,
                scheduling_class: 0,
            },
            io_info: IoCounters {
                read_operation_count: 0,
                write_operation_count: 0,
                other_operation_count: 0,
                read_transfer_count: 0,
                write_transfer_count: 0,
                other_transfer_count: 0,
            },
            process_memory_limit: 0,
            job_memory_limit: 0,
            peak_process_memory_used: 0,
            peak_job_memory_used: 0,
        };

        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &mut info as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
        );

        AssignProcessToJobObject(job, child.as_raw_handle());
        std::mem::forget(job);
    }
}

fn wait_for_backend(url: &str, timeout_secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if let Ok(response) = ureq::get(url).call() {
            if response.status() < 500 {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("failed to get app data dir");

            fs::create_dir_all(&app_data_dir)
                .expect("failed to create app data dir");

            let backend_path = app_data_dir.join("backend.exe");

            {
                let mut file = fs::File::create(&backend_path)
                    .expect("failed to create backend file");
                file.write_all(BACKEND_BYTES)
                    .expect("failed to write backend bytes");
            }

            let child = {
                let mut cmd = std::process::Command::new(&backend_path);
                #[cfg(windows)]
                cmd.creation_flags(CREATE_NO_WINDOW);
                cmd.spawn().expect("failed to start backend")
            };

            #[cfg(windows)]
            assign_to_job_object(&child);

            *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);

            let ready = wait_for_backend("http://127.0.0.1:8000/laps", 15);
            if !ready {
                eprintln!("Warning: backend did not respond within 15s, continuing anyway");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<BackendProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
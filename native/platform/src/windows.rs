use crate::{ExitOutcome, IsolationMode, ManagedProcess, PlatformBackend, SpawnConfig};
use std::ffi::c_void;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::AsRawHandle;
use std::path::Path;
use std::process::{Child, Command, Stdio};

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

const TOKEN_ASSIGN_PRIMARY: u32 = 0x0001;
const TOKEN_DUPLICATE: u32 = 0x0002;
const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_ADJUST_DEFAULT: u32 = 0x0080;
const TOKEN_INTEGRITY_LEVEL: u32 = 25;
const SE_GROUP_INTEGRITY: u32 = 0x0000_0020;
const MAXIMUM_ALLOWED: u32 = 0x0200_0000;
const SECURITY_IMPERSONATION: u32 = 2;
const TOKEN_PRIMARY: u32 = 1;

const CREATE_SUSPENDED: u32 = 0x0000_0004;
const WAIT_OBJECT_0: u32 = 0x0000_0000;
const STILL_ACTIVE: u32 = 259;

const SDDL_REVISION_1: u32 = 1;
const SE_FILE_OBJECT: u32 = 1;
const LABEL_SECURITY_INFORMATION: u32 = 0x0000_0010;

const HKEY_CURRENT_USER: *mut c_void = 0x8000_0001usize as *mut c_void;
const KEY_WRITE: u32 = 0x0002_0006;
const REG_SZ: u32 = 1;

#[repr(C)]
#[derive(Default)]
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

#[repr(C)]
#[derive(Default)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[repr(C)]
#[derive(Default)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[repr(C)]
struct SidAndAttributes {
    sid: *mut c_void,
    attributes: u32,
}

#[repr(C)]
struct TokenMandatoryLabel {
    label: SidAndAttributes,
}

#[repr(C)]
struct StartupInfoW {
    cb: u32,
    lp_reserved: *mut u16,
    lp_desktop: *mut u16,
    lp_title: *mut u16,
    dw_x: u32,
    dw_y: u32,
    dw_x_size: u32,
    dw_y_size: u32,
    dw_x_count_chars: u32,
    dw_y_count_chars: u32,
    dw_fill_attribute: u32,
    dw_flags: u32,
    w_show_window: u16,
    cb_reserved2: u16,
    lp_reserved2: *mut u8,
    h_std_input: *mut c_void,
    h_std_output: *mut c_void,
    h_std_error: *mut c_void,
}

#[repr(C)]
struct ProcessInformation {
    h_process: *mut c_void,
    h_thread: *mut c_void,
    dw_process_id: u32,
    dw_thread_id: u32,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetCurrentProcess() -> *mut c_void;
    fn CreateJobObjectW(lp_job_attributes: *mut c_void, lp_name: *const u16) -> *mut c_void;
    fn SetInformationJobObject(
        h_job: *mut c_void,
        job_object_information_class: u32,
        lp_job_object_information: *const c_void,
        cb_job_object_information_length: u32,
    ) -> i32;
    fn AssignProcessToJobObject(h_job: *mut c_void, h_process: *mut c_void) -> i32;
    fn TerminateJobObject(h_job: *mut c_void, u_exit_code: u32) -> i32;
    fn TerminateProcess(h_process: *mut c_void, u_exit_code: u32) -> i32;
    fn ResumeThread(h_thread: *mut c_void) -> u32;
    fn WaitForSingleObject(h_handle: *mut c_void, dw_milliseconds: u32) -> u32;
    fn GetExitCodeProcess(h_process: *mut c_void, lp_exit_code: *mut u32) -> i32;
    fn CloseHandle(h_object: *mut c_void) -> i32;
    fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
}

#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(
        process_handle: *mut c_void,
        desired_access: u32,
        token_handle: *mut *mut c_void,
    ) -> i32;
    fn DuplicateTokenEx(
        h_existing_token: *mut c_void,
        dw_desired_access: u32,
        lp_token_attributes: *mut c_void,
        impersonation_level: u32,
        token_type: u32,
        ph_new_token: *mut *mut c_void,
    ) -> i32;
    fn ConvertStringSidToSidW(string_sid: *const u16, sid: *mut *mut c_void) -> i32;
    fn GetLengthSid(p_sid: *mut c_void) -> u32;
    fn SetTokenInformation(
        token_handle: *mut c_void,
        token_information_class: u32,
        token_information: *const c_void,
        token_information_length: u32,
    ) -> i32;
    fn CreateProcessAsUserW(
        h_token: *mut c_void,
        lp_application_name: *const u16,
        lp_command_line: *mut u16,
        lp_process_attributes: *mut c_void,
        lp_thread_attributes: *mut c_void,
        b_inherit_handles: i32,
        dw_creation_flags: u32,
        lp_environment: *mut c_void,
        lp_current_directory: *const u16,
        lp_startup_info: *const StartupInfoW,
        lp_process_information: *mut ProcessInformation,
    ) -> i32;
    fn ConvertStringSecurityDescriptorToSecurityDescriptorW(
        string_security_descriptor: *const u16,
        string_sd_revision: u32,
        security_descriptor: *mut *mut c_void,
        security_descriptor_size: *mut u32,
    ) -> i32;
    fn GetSecurityDescriptorSacl(
        p_security_descriptor: *mut c_void,
        lpb_sacl_present: *mut i32,
        p_sacl: *mut *mut c_void,
        lpb_sacl_defaulted: *mut i32,
    ) -> i32;
    fn SetNamedSecurityInfoW(
        p_object_name: *mut u16,
        object_type: u32,
        security_info: u32,
        psid_owner: *mut c_void,
        psid_group: *mut c_void,
        p_dacl: *mut c_void,
        p_sacl: *mut c_void,
    ) -> u32;
    fn RegCreateKeyExW(
        h_key: *mut c_void,
        lp_sub_key: *const u16,
        reserved: u32,
        lp_class: *mut u16,
        dw_options: u32,
        sam_desired: u32,
        lp_security_attributes: *mut c_void,
        phk_result: *mut *mut c_void,
        lpdw_disposition: *mut u32,
    ) -> u32;
    fn RegSetValueExW(
        h_key: *mut c_void,
        lp_value_name: *const u16,
        reserved: u32,
        dw_type: u32,
        lp_data: *const u8,
        cb_data: u32,
    ) -> u32;
    fn RegCloseKey(h_key: *mut c_void) -> u32;
    fn RegDeleteTreeW(h_key: *mut c_void, lp_sub_key: *const u16) -> u32;
}

fn to_wide_null(s: &str) -> Vec<u16> {
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn path_to_wide_null(p: &Path) -> Vec<u16> {
    p.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn quote_win_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
        return arg.to_string();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                out.extend(std::iter::repeat_n('\\', backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            _ => {
                out.extend(std::iter::repeat_n('\\', backslashes));
                out.push(ch);
                backslashes = 0;
            }
        }
    }
    out.extend(std::iter::repeat_n('\\', backslashes * 2));
    out.push('"');
    out
}

fn build_command_line(program: &Path, args: &[String]) -> Vec<u16> {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(quote_win_arg(&program.to_string_lossy()));
    for a in args {
        parts.push(quote_win_arg(a));
    }
    to_wide_null(&parts.join(" "))
}

/// Applies Low Integrity mandatory label (`S:(ML;OICI;NW;;;LW)`) to a directory so a
/// Low-IL isolated Player process can write ONLY inside its assigned game data folder.
fn set_low_integrity_label(dir: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let sddl = to_wide_null("S:(ML;OICI;NW;;;LW)");
    let mut sd: *mut c_void = std::ptr::null_mut();
    let ok = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut sd,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 || sd.is_null() {
        return Err(io::Error::last_os_error());
    }

    let mut sacl_present: i32 = 0;
    let mut sacl: *mut c_void = std::ptr::null_mut();
    let mut sacl_defaulted: i32 = 0;
    let got =
        unsafe { GetSecurityDescriptorSacl(sd, &mut sacl_present, &mut sacl, &mut sacl_defaulted) };
    if got == 0 || sacl_present == 0 {
        unsafe { LocalFree(sd) };
        return Err(io::Error::last_os_error());
    }

    let mut wide_path = path_to_wide_null(dir);
    let err = unsafe {
        SetNamedSecurityInfoW(
            wide_path.as_mut_ptr(),
            SE_FILE_OBJECT,
            LABEL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            sacl,
        )
    };
    unsafe { LocalFree(sd) };
    if err != 0 {
        return Err(io::Error::from_raw_os_error(err as i32));
    }
    Ok(())
}

struct OwnedHandle(*mut c_void);

unsafe impl Send for OwnedHandle {}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CloseHandle(self.0) };
            self.0 = std::ptr::null_mut();
        }
    }
}

fn create_low_integrity_token() -> io::Result<OwnedHandle> {
    let mut cur_token: *mut c_void = std::ptr::null_mut();
    let ok = unsafe {
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_DUPLICATE | TOKEN_ADJUST_DEFAULT | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY,
            &mut cur_token,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    let cur_token = OwnedHandle(cur_token);

    let mut low_token: *mut c_void = std::ptr::null_mut();
    let ok = unsafe {
        DuplicateTokenEx(
            cur_token.0,
            MAXIMUM_ALLOWED,
            std::ptr::null_mut(),
            SECURITY_IMPERSONATION,
            TOKEN_PRIMARY,
            &mut low_token,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    let low_token = OwnedHandle(low_token);

    // S-1-16-4096 = SECURITY_MANDATORY_LOW_RID (enforces No-Write-Up on all Medium/High IL objects)
    let low_sid_w = to_wide_null("S-1-16-4096");
    let mut low_sid: *mut c_void = std::ptr::null_mut();
    let ok = unsafe { ConvertStringSidToSidW(low_sid_w.as_ptr(), &mut low_sid) };
    if ok == 0 || low_sid.is_null() {
        return Err(io::Error::last_os_error());
    }

    let tml = TokenMandatoryLabel {
        label: SidAndAttributes {
            sid: low_sid,
            attributes: SE_GROUP_INTEGRITY,
        },
    };
    let info_len =
        std::mem::size_of::<TokenMandatoryLabel>() as u32 + unsafe { GetLengthSid(low_sid) };
    let ok = unsafe {
        SetTokenInformation(
            low_token.0,
            TOKEN_INTEGRITY_LEVEL,
            (&tml as *const TokenMandatoryLabel).cast::<c_void>(),
            info_len,
        )
    };
    unsafe { LocalFree(low_sid) };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(low_token)
}

struct JobHandle(OwnedHandle);

impl JobHandle {
    fn create_kill_on_close() -> io::Result<Self> {
        let raw = unsafe { CreateJobObjectW(std::ptr::null_mut(), std::ptr::null()) };
        if raw.is_null() {
            return Err(io::Error::last_os_error());
        }
        let handle = Self(OwnedHandle(raw));
        let mut info = JobObjectExtendedLimitInformation::default();
        info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = unsafe {
            SetInformationJobObject(
                handle.0 .0,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                (&info as *const JobObjectExtendedLimitInformation).cast::<c_void>(),
                std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
            )
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(handle)
    }

    fn assign_process(&self, proc_handle: *mut c_void) -> io::Result<()> {
        let ok = unsafe { AssignProcessToJobObject(self.0 .0, proc_handle) };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    fn terminate(&self, exit_code: u32) -> io::Result<()> {
        let ok = unsafe { TerminateJobObject(self.0 .0, exit_code) };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

pub struct WindowsJobBackend;

struct WindowsJobProcess {
    child: Child,
    job: JobHandle,
}

struct WindowsIsolatedProcess {
    proc_handle: OwnedHandle,
    pid: u32,
    job: JobHandle,
}

impl PlatformBackend for WindowsJobBackend {
    fn name(&self) -> &'static str {
        "windows-job-object"
    }

    fn spawn_managed(&self, cfg: &SpawnConfig) -> io::Result<Box<dyn ManagedProcess>> {
        let job = JobHandle::create_kill_on_close()?;

        if cfg.isolation == IsolationMode::LowIntegrity {
            if let Some(dir) = &cfg.writable_data_dir {
                set_low_integrity_label(dir)?;
            }
            let token = create_low_integrity_token()?;
            let mut cmdline = build_command_line(&cfg.program, &cfg.args);
            let workdir_w = cfg.workdir.as_ref().map(|d| path_to_wide_null(d));
            let mut desktop_w = to_wide_null("winsta0\\default");
            let si = StartupInfoW {
                cb: std::mem::size_of::<StartupInfoW>() as u32,
                lp_reserved: std::ptr::null_mut(),
                lp_desktop: desktop_w.as_mut_ptr(),
                lp_title: std::ptr::null_mut(),
                dw_x: 0,
                dw_y: 0,
                dw_x_size: 0,
                dw_y_size: 0,
                dw_x_count_chars: 0,
                dw_y_count_chars: 0,
                dw_fill_attribute: 0,
                dw_flags: 0,
                w_show_window: 0,
                cb_reserved2: 0,
                lp_reserved2: std::ptr::null_mut(),
                h_std_input: std::ptr::null_mut(),
                h_std_output: std::ptr::null_mut(),
                h_std_error: std::ptr::null_mut(),
            };
            let mut pi = ProcessInformation {
                h_process: std::ptr::null_mut(),
                h_thread: std::ptr::null_mut(),
                dw_process_id: 0,
                dw_thread_id: 0,
            };

            let ok = unsafe {
                CreateProcessAsUserW(
                    token.0,
                    std::ptr::null(),
                    cmdline.as_mut_ptr(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    0,
                    CREATE_SUSPENDED,
                    std::ptr::null_mut(),
                    workdir_w.as_ref().map_or(std::ptr::null(), |w| w.as_ptr()),
                    &si,
                    &mut pi,
                )
            };
            if ok == 0 {
                return Err(io::Error::last_os_error());
            }

            let proc_handle = OwnedHandle(pi.h_process);
            let thread_handle = OwnedHandle(pi.h_thread);

            if let Err(e) = job.assign_process(proc_handle.0) {
                unsafe { TerminateProcess(proc_handle.0, 1) };
                return Err(e);
            }
            unsafe { ResumeThread(thread_handle.0) };

            return Ok(Box::new(WindowsIsolatedProcess {
                proc_handle,
                pid: pi.dw_process_id,
                job,
            }));
        }

        let mut cmd = Command::new(&cfg.program);
        cmd.args(&cfg.args)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        if let Some(dir) = &cfg.workdir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn()?;
        if let Err(e) = job.assign_process(child.as_raw_handle().cast::<c_void>()) {
            let _ = child.kill();
            return Err(e);
        }

        Ok(Box::new(WindowsJobProcess { child, job }))
    }

    fn register_protocol(&self, scheme: &str, exe_path: &Path) -> io::Result<()> {
        let base_key = format!("Software\\Classes\\{scheme}");
        let cmd_key = format!("{base_key}\\shell\\open\\command");
        reg_set_sz(&base_key, "", &format!("URL:PlayHub ({scheme}) Protocol"))?;
        reg_set_sz(&base_key, "URL Protocol", "")?;
        let command = format!("\"{}\" launch-url \"%1\"", exe_path.to_string_lossy());
        reg_set_sz(&cmd_key, "", &command)?;
        Ok(())
    }

    fn unregister_protocol(&self, scheme: &str) -> io::Result<()> {
        let base_key = to_wide_null(&format!("Software\\Classes\\{scheme}"));
        let err = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, base_key.as_ptr()) };
        // ERROR_FILE_NOT_FOUND (2) is idempotent success
        if err != 0 && err != 2 {
            return Err(io::Error::from_raw_os_error(err as i32));
        }
        Ok(())
    }
}

fn reg_set_sz(sub_key: &str, value_name: &str, data: &str) -> io::Result<()> {
    let sub_w = to_wide_null(sub_key);
    let mut hkey: *mut c_void = std::ptr::null_mut();
    let err = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            sub_w.as_ptr(),
            0,
            std::ptr::null_mut(),
            0,
            KEY_WRITE,
            std::ptr::null_mut(),
            &mut hkey,
            std::ptr::null_mut(),
        )
    };
    if err != 0 {
        return Err(io::Error::from_raw_os_error(err as i32));
    }

    let name_w = to_wide_null(value_name);
    let data_w = to_wide_null(data);
    let byte_len = (data_w.len() * std::mem::size_of::<u16>()) as u32;
    let set_err = unsafe {
        RegSetValueExW(
            hkey,
            name_w.as_ptr(),
            0,
            REG_SZ,
            data_w.as_ptr().cast::<u8>(),
            byte_len,
        )
    };
    unsafe { RegCloseKey(hkey) };
    if set_err != 0 {
        return Err(io::Error::from_raw_os_error(set_err as i32));
    }
    Ok(())
}

impl ManagedProcess for WindowsJobProcess {
    fn pid(&self) -> u32 {
        self.child.id()
    }

    fn try_wait(&mut self) -> io::Result<Option<ExitOutcome>> {
        match self.child.try_wait()? {
            Some(status) => Ok(Some(ExitOutcome {
                code: status.code(),
                success: status.success(),
            })),
            None => Ok(None),
        }
    }

    fn terminate(&mut self) -> io::Result<()> {
        let _ = self.job.terminate(137);
        let _ = self.child.kill();
        Ok(())
    }
}

impl ManagedProcess for WindowsIsolatedProcess {
    fn pid(&self) -> u32 {
        self.pid
    }

    fn try_wait(&mut self) -> io::Result<Option<ExitOutcome>> {
        let wait = unsafe { WaitForSingleObject(self.proc_handle.0, 0) };
        if wait != WAIT_OBJECT_0 {
            return Ok(None);
        }
        let mut code: u32 = STILL_ACTIVE;
        let ok = unsafe { GetExitCodeProcess(self.proc_handle.0, &mut code) };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Some(ExitOutcome {
            code: Some(code as i32),
            success: code == 0,
        }))
    }

    fn terminate(&mut self) -> io::Result<()> {
        let _ = self.job.terminate(137);
        unsafe { TerminateProcess(self.proc_handle.0, 137) };
        Ok(())
    }
}

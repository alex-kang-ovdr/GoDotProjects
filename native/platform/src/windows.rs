use crate::{ExitOutcome, ManagedProcess, PlatformBackend, SpawnConfig};
use std::ffi::c_void;
use std::io;
use std::os::windows::io::AsRawHandle;
use std::process::{Child, Command, Stdio};

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

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

#[link(name = "kernel32")]
extern "system" {
    fn CreateJobObjectW(lp_job_attributes: *mut c_void, lp_name: *const u16) -> *mut c_void;
    fn SetInformationJobObject(
        h_job: *mut c_void,
        job_object_information_class: u32,
        lp_job_object_information: *const c_void,
        cb_job_object_information_length: u32,
    ) -> i32;
    fn AssignProcessToJobObject(h_job: *mut c_void, h_process: *mut c_void) -> i32;
    fn TerminateJobObject(h_job: *mut c_void, u_exit_code: u32) -> i32;
    fn CloseHandle(h_object: *mut c_void) -> i32;
}

struct JobHandle(*mut c_void);

// Win32 HANDLEs can safely be moved across threads when synchronized by ownership.
unsafe impl Send for JobHandle {}

impl JobHandle {
    fn create_kill_on_close() -> io::Result<Self> {
        let raw = unsafe { CreateJobObjectW(std::ptr::null_mut(), std::ptr::null()) };
        if raw.is_null() {
            return Err(io::Error::last_os_error());
        }
        let handle = Self(raw);
        let mut info = JobObjectExtendedLimitInformation::default();
        info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = unsafe {
            SetInformationJobObject(
                handle.0,
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
        let ok = unsafe { AssignProcessToJobObject(self.0, proc_handle) };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    fn terminate(&self, exit_code: u32) -> io::Result<()> {
        let ok = unsafe { TerminateJobObject(self.0, exit_code) };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

impl Drop for JobHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                CloseHandle(self.0);
            }
            self.0 = std::ptr::null_mut();
        }
    }
}

pub struct WindowsJobBackend;

struct WindowsJobProcess {
    child: Child,
    job: JobHandle,
}

impl PlatformBackend for WindowsJobBackend {
    fn name(&self) -> &'static str {
        "windows-job-object"
    }

    fn spawn_managed(&self, cfg: &SpawnConfig) -> io::Result<Box<dyn ManagedProcess>> {
        let job = JobHandle::create_kill_on_close()?;
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

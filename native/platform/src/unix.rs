use crate::{ExitOutcome, ManagedProcess, PlatformBackend, SpawnConfig};
use std::io;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};

pub struct UnixProcessBackend;

struct UnixManagedProcess {
    child: Child,
    pgid: i32,
}

impl PlatformBackend for UnixProcessBackend {
    fn name(&self) -> &'static str {
        #[cfg(target_os = "macos")]
        {
            "macos-pgid"
        }
        #[cfg(not(target_os = "macos"))]
        {
            "linux-pdeathsig-pgid"
        }
    }

    fn spawn_managed(&self, cfg: &SpawnConfig) -> io::Result<Box<dyn ManagedProcess>> {
        let mut cmd = Command::new(&cfg.program);
        cmd.args(&cfg.args)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        if let Some(dir) = &cfg.workdir {
            cmd.current_dir(dir);
        }

        unsafe {
            cmd.pre_exec(|| {
                // Place child into its own process group so termination cleans up entire tree.
                if libc::setpgid(0, 0) != 0 {
                    return Err(io::Error::last_os_error());
                }
                #[cfg(target_os = "linux")]
                {
                    // Ensure kernel delivers SIGKILL to child if bootstrapper dies unexpectedly (L5).
                    if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0 {
                        return Err(io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }

        let child = cmd.spawn()?;
        let pgid = child.id() as i32;
        Ok(Box::new(UnixManagedProcess { child, pgid }))
    }

    fn register_protocol(&self, _scheme: &str, _exe_path: &Path) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "protocol registration on macOS/Linux is packaged via Info.plist/.desktop in M1",
        ))
    }

    fn unregister_protocol(&self, _scheme: &str) -> io::Result<()> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "protocol unregistration on macOS/Linux is handled by bundle removal",
        ))
    }
}

impl ManagedProcess for UnixManagedProcess {
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
        unsafe {
            libc::kill(-self.pgid, libc::SIGKILL);
        }
        let _ = self.child.kill();
        Ok(())
    }
}

impl Drop for UnixManagedProcess {
    fn drop(&mut self) {
        if let Ok(None) = self.child.try_wait() {
            let _ = self.terminate();
            let _ = self.child.wait();
        }
    }
}

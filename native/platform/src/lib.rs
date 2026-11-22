use std::io;
use std::path::{Path, PathBuf};

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum IsolationMode {
    #[default]
    None,
    /// Windows: Low Integrity (S-1-16-4096) + Restricted Token (DISABLE_MAX_PRIVILEGE).
    /// Blocks writes to Medium-IL paths (%USERPROFILE%, %APPDATA%, HKCU) while allowing
    /// writes to an explicitly labeled game data directory.
    LowIntegrity,
}

#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub workdir: Option<PathBuf>,
    pub isolation: IsolationMode,
    pub writable_data_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExitOutcome {
    pub code: Option<i32>,
    pub success: bool,
}

pub trait ManagedProcess: Send {
    fn pid(&self) -> u32;
    fn try_wait(&mut self) -> io::Result<Option<ExitOutcome>>;
    fn terminate(&mut self) -> io::Result<()>;
}

pub trait PlatformBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn spawn_managed(&self, cfg: &SpawnConfig) -> io::Result<Box<dyn ManagedProcess>>;
    fn register_protocol(&self, scheme: &str, exe_path: &Path) -> io::Result<()>;
    fn unregister_protocol(&self, scheme: &str) -> io::Result<()>;
}

pub fn default_backend() -> Box<dyn PlatformBackend> {
    #[cfg(windows)]
    {
        Box::new(windows::WindowsJobBackend)
    }
    #[cfg(unix)]
    {
        Box::new(unix::UnixProcessBackend)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn spawns_and_terminates_managed_child() {
        let backend = default_backend();
        #[cfg(windows)]
        let cfg = SpawnConfig {
            program: PathBuf::from("cmd.exe"),
            args: vec![
                "/C".into(),
                "ping".into(),
                "127.0.0.1".into(),
                "-n".into(),
                "15".into(),
            ],
            workdir: None,
            isolation: IsolationMode::None,
            writable_data_dir: None,
        };
        #[cfg(unix)]
        let cfg = SpawnConfig {
            program: PathBuf::from("/bin/sleep"),
            args: vec!["15".into()],
            workdir: None,
            isolation: IsolationMode::None,
            writable_data_dir: None,
        };

        let mut proc = backend.spawn_managed(&cfg).expect("spawn managed child");
        assert!(proc.pid() > 0);
        assert!(proc.try_wait().unwrap().is_none());

        proc.terminate().expect("terminate child");
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut exited = false;
        while Instant::now() < deadline {
            if proc.try_wait().unwrap().is_some() {
                exited = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(exited, "child process should exit promptly after terminate");
    }

    #[cfg(windows)]
    #[test]
    fn spawns_child_in_low_integrity_restricted_token() {
        let backend = default_backend();
        let data_dir =
            std::env::temp_dir().join(format!("playhub-low-il-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&data_dir);
        let cfg = SpawnConfig {
            program: PathBuf::from(r"C:\Windows\System32\cmd.exe"),
            args: vec!["/C".into(), "exit".into(), "0".into()],
            workdir: None,
            isolation: IsolationMode::LowIntegrity,
            writable_data_dir: Some(data_dir.clone()),
        };
        let mut proc = backend
            .spawn_managed(&cfg)
            .expect("spawn low-il managed child");
        assert!(proc.pid() > 0);
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut outcome = None;
        while Instant::now() < deadline {
            if let Some(o) = proc.try_wait().unwrap() {
                outcome = Some(o);
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        let _ = std::fs::remove_dir_all(&data_dir);
        let outcome = outcome.expect("low-il child should exit");
        assert!(outcome.success, "expected exit 0, got {:?}", outcome);
    }

    #[cfg(windows)]
    #[test]
    fn registers_and_unregisters_test_protocol_in_hkcu() {
        let backend = default_backend();
        let scheme = format!("playhub-ut-{}", std::process::id());
        let exe = std::env::current_exe().unwrap();
        backend
            .register_protocol(&scheme, &exe)
            .expect("register hkcu scheme");
        backend
            .unregister_protocol(&scheme)
            .expect("unregister hkcu scheme");
    }
}

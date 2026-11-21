use std::io;
use std::path::PathBuf;

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub workdir: Option<PathBuf>,
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
        };
        #[cfg(unix)]
        let cfg = SpawnConfig {
            program: PathBuf::from("/bin/sleep"),
            args: vec!["15".into()],
            workdir: None,
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
}

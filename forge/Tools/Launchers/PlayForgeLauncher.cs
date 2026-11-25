using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

internal static class PlayForgeLauncher
{
    private const string FrontendPath = "/OfficialGodot/";
    private const string ProductName = "PlayForge Web (Official Godot)";
    private static Form form;
    private static TextBox urlBox;
    private static Label statusLabel;
    private static Button openButton;
    private static Button stopButton;
    private static Process ownedServer;
    private static JobHandle ownedJob;
    private static bool reusedServer;
    private static string resolvedUrl;
    private static string appRoot;
    private static bool smokeMode;

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test") return RunSelfTest();
        if (args.Length == 1 && args[0] == "--smoke-test") return RunSmokeTest();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        BuildWindow();
        Application.Run(form);
        StopOwnedServer();
        return 0;
    }

    private static void BuildWindow()
    {
        appRoot = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
        form = new Form();
        form.Text = ProductName;
        form.StartPosition = FormStartPosition.CenterScreen;
        form.FormBorderStyle = FormBorderStyle.FixedDialog;
        form.MaximizeBox = false;
        form.MinimizeBox = true;
        form.ClientSize = new Size(500, 142);

        Label urlLabel = new Label();
        urlLabel.Text = "Frontend URL";
        urlLabel.AutoSize = true;
        urlLabel.Location = new Point(14, 16);
        form.Controls.Add(urlLabel);

        urlBox = new TextBox();
        urlBox.ReadOnly = true;
        urlBox.Location = new Point(14, 39);
        urlBox.Size = new Size(472, 23);
        form.Controls.Add(urlBox);

        openButton = new Button();
        openButton.Text = "Open";
        openButton.Location = new Point(14, 78);
        openButton.Size = new Size(90, 30);
        openButton.Enabled = false;
        openButton.Click += delegate { OpenBrowser(); };
        form.Controls.Add(openButton);

        stopButton = new Button();
        stopButton.Text = "Stop server";
        stopButton.Location = new Point(112, 78);
        stopButton.Size = new Size(104, 30);
        stopButton.Enabled = false;
        stopButton.Click += delegate { StopFromButton(); };
        form.Controls.Add(stopButton);

        statusLabel = new Label();
        statusLabel.Text = "Starting…";
        statusLabel.AutoEllipsis = true;
        statusLabel.Location = new Point(228, 85);
        statusLabel.Size = new Size(258, 24);
        form.Controls.Add(statusLabel);

        form.Shown += delegate { StartOrReuse(); };
        form.FormClosing += delegate { StopOwnedServer(); };
    }

    private static void StartOrReuse()
    {
        try
        {
            string configuredRemote = Environment.GetEnvironmentVariable("PLAYFORGE_SERVER_URL");
            if (!String.IsNullOrWhiteSpace(configuredRemote))
            {
                resolvedUrl = ResolveRemoteUrl(configuredRemote, FrontendPath);
                SetReady("Using configured remote server");
                return;
            }

            int port = ReadPort(Environment.GetEnvironmentVariable("PORT"));
            resolvedUrl = LocalUrl(port, FrontendPath);
            string existingEngine;
            if (TryReadHealth(port, out existingEngine))
            {
                if (!String.Equals(existingEngine, "Godot", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("A service is already using this port, but its engine is not Godot. Set PORT to a free port.");
                if (TryReadPlatformTemplates(port))
                {
                    reusedServer = true;
                    SetReady("Reusing the running Godot server");
                    return;
                }

                // Older PlayForge servers report the same engine health but
                // do not expose the platform project API. Leave them running
                // and launch this frontend on its own free port.
                port = FindFreePort();
                Environment.SetEnvironmentVariable("PORT", port.ToString());
                resolvedUrl = LocalUrl(port, FrontendPath);
            }

            string node = FindNode();
            if (node == null) throw new InvalidOperationException("Node.js was not found. Install Node.js 22 or add node.exe to PATH.");
            if (!File.Exists(Path.Combine(appRoot, "node_modules", "ws", "package.json")))
                throw new InvalidOperationException("Dependencies are missing. Open a terminal in the GamePlayForge folder and run: npm ci");
            string server = Path.Combine(appRoot, "server.cjs");
            if (!File.Exists(server)) throw new InvalidOperationException("server.cjs was not found next to this launcher.");

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = node;
            start.Arguments = Quote(server);
            start.WorkingDirectory = appRoot;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WindowStyle = ProcessWindowStyle.Hidden;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            start.EnvironmentVariables["PORT"] = port.ToString();
            start.EnvironmentVariables["PLAYFORGE_HEADLESS"] = "1";
            ownedServer = Process.Start(start);
            if (ownedServer == null) throw new InvalidOperationException("The local server could not be started.");
            ownedServer.OutputDataReceived += delegate { };
            ownedServer.ErrorDataReceived += delegate { };
            ownedServer.BeginOutputReadLine();
            ownedServer.BeginErrorReadLine();
            ownedJob = new JobHandle();
            if (!ownedJob.Assign(ownedServer))
            {
                StopOwnedServer();
                throw new InvalidOperationException("Could not safely manage the server process tree.");
            }

            DateTime deadline = DateTime.UtcNow.AddSeconds(12);
            while (DateTime.UtcNow < deadline)
            {
                if (ownedServer.HasExited)
                {
                    int exitCode = ownedServer.ExitCode;
                    StopOwnedServer();
                    string racedEngine;
                    if (TryReadHealth(port, out racedEngine) && String.Equals(racedEngine, "Godot", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!TryReadPlatformTemplates(port))
                            throw new InvalidOperationException("A legacy Godot server took the selected port but does not provide the platform API. It was left running; restart this launcher with PORT set to a free port.");
                        reusedServer = true;
                        SetReady("Reusing the running Godot server");
                        return;
                    }
                    throw new InvalidOperationException("The local server exited before it became ready (code " + exitCode + "). The port may be in use.");
                }
                string engine;
                if (TryReadHealth(port, out engine))
                {
                    if (!String.Equals(engine, "Godot", StringComparison.OrdinalIgnoreCase))
                    {
                        StopOwnedServer();
                        throw new InvalidOperationException("The local health endpoint did not report engine=Godot.");
                    }
                    if (!TryReadPlatformTemplates(port))
                    {
                        StopOwnedServer();
                        throw new InvalidOperationException("The local server started but does not provide the Official Godot platform API.");
                    }
                    SetReady("Local Godot server is ready");
                    return;
                }
                Application.DoEvents();
                System.Threading.Thread.Sleep(200);
            }
            StopOwnedServer();
            throw new InvalidOperationException("The local server did not become ready within 12 seconds.");
        }
        catch (Exception error)
        {
            if (smokeMode) throw;
            urlBox.Text = resolvedUrl ?? "Unavailable";
            statusLabel.Text = "Could not start";
            openButton.Enabled = false;
            stopButton.Enabled = ownedServer != null && !ownedServer.HasExited;
            MessageBox.Show(form, error.Message, ProductName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void SetReady(string status)
    {
        urlBox.Text = resolvedUrl;
        statusLabel.Text = status;
        openButton.Enabled = true;
        stopButton.Enabled = ownedServer != null && !reusedServer;
    }

    private static void OpenBrowser()
    {
        try
        {
            if (!IsAllowedHttpUrl(resolvedUrl)) throw new InvalidOperationException("The URL is not a valid HTTP or HTTPS URL.");
            Process.Start(new ProcessStartInfo(resolvedUrl) { UseShellExecute = true });
        }
        catch (Exception error) { MessageBox.Show(form, error.Message, ProductName, MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private static void StopFromButton()
    {
        StopOwnedServer();
        statusLabel.Text = reusedServer ? "Shared server left running" : "Local server stopped";
        openButton.Enabled = false;
        stopButton.Enabled = false;
    }

    private static void StopOwnedServer()
    {
        if (ownedJob != null)
        {
            ownedJob.Dispose();
            ownedJob = null;
        }
        if (ownedServer != null)
        {
            try { if (!ownedServer.HasExited) ownedServer.Kill(); }
            catch { }
            try { ownedServer.Dispose(); }
            catch { }
            ownedServer = null;
        }
    }

    private static bool TryReadHealth(int port, out string engine)
    {
        engine = null;
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(LocalUrl(port, "/api/health"));
            request.Method = "GET";
            request.Timeout = 650;
            request.ReadWriteTimeout = 650;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                if ((int)response.StatusCode != 200) return false;
                string json = reader.ReadToEnd();
                Match match = Regex.Match(json, "\"engine\"\\s*:\\s*\"([^\"]+)\"", RegexOptions.IgnoreCase);
                if (!match.Success) return false;
                engine = match.Groups[1].Value;
                return true;
            }
        }
        catch { return false; }
    }

    private static bool TryReadPlatformTemplates(int port)
    {
        if (!TryReadOfficialCapabilities(port)) return false;
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(LocalUrl(port, "/api/platform/templates"));
            request.Method = "GET";
            request.Timeout = 650;
            request.ReadWriteTimeout = 650;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                if ((int)response.StatusCode != 200) return false;
                string json = reader.ReadToEnd();
                return Regex.IsMatch(json, "\\\"id\\\"\\s*:\\s*\\\"blank3d\\\"", RegexOptions.IgnoreCase)
                    && Regex.IsMatch(json, "\\\"id\\\"\\s*:\\s*\\\"playground3d\\\"", RegexOptions.IgnoreCase)
                    && Regex.IsMatch(json, "\\\"id\\\"\\s*:\\s*\\\"tappy-chicken\\\"", RegexOptions.IgnoreCase)
                    && Regex.IsMatch(json, "\\\"id\\\"\\s*:\\s*\\\"iron-wood\\\"", RegexOptions.IgnoreCase)
                    && Regex.IsMatch(json, "\\\"id\\\"\\s*:\\s*\\\"brawllabs\\\"", RegexOptions.IgnoreCase);
            }
        }
        catch { return false; }
    }

    private static bool TryReadOfficialCapabilities(int port)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(LocalUrl(port, "/api/health"));
            request.Method = "GET";
            request.Timeout = 650;
            request.ReadWriteTimeout = 650;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                if ((int)response.StatusCode != 200) return false;
                string json = reader.ReadToEnd();
                return Regex.IsMatch(json, "\\\"brawllabsMultiplayer\\\"\\s*:\\s*true", RegexOptions.IgnoreCase)
                    && Regex.IsMatch(json, "\\\"nativeGameIframe\\\"\\s*:\\s*1", RegexOptions.IgnoreCase)
                    && Regex.IsMatch(json, "\\\"multiplayerTestWorkspace\\\"\\s*:\\s*1", RegexOptions.IgnoreCase);
            }
        }
        catch { return false; }
    }

    private static int FindFreePort()
    {
        TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
        try
        {
            listener.Start();
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
        finally { listener.Stop(); }
    }

    private static int ReadPort(string value)
    {
        int port;
        if (String.IsNullOrEmpty(value)) return 4173;
        if (!Int32.TryParse(value, out port) || port < 1 || port > 65535)
            throw new InvalidOperationException("PORT must be an integer from 1 to 65535.");
        return port;
    }

    private static string LocalUrl(int port, string path)
    {
        return "http://127.0.0.1:" + port.ToString() + path;
    }

    private static string ResolveRemoteUrl(string configured, string path)
    {
        Uri uri;
        if (!Uri.TryCreate(configured.Trim(), UriKind.Absolute, out uri) || !IsAllowedHttpUrl(uri.AbsoluteUri))
            throw new InvalidOperationException("PLAYFORGE_SERVER_URL must be an absolute HTTP or HTTPS URL without credentials.");
        return uri.GetLeftPart(UriPartial.Authority) + path;
    }

    private static bool IsAllowedHttpUrl(string value)
    {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri)) return false;
        return (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            && String.IsNullOrEmpty(uri.UserInfo) && !String.IsNullOrEmpty(uri.Host);
    }

    private static string FindNode()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(Path.PathSeparator))
        {
            if (String.IsNullOrWhiteSpace(dir)) continue;
            string candidate = Path.Combine(dir.Trim('"'), "node.exe");
            if (File.Exists(candidate)) return candidate;
        }
        string[] roots = { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) };
        foreach (string root in roots)
        {
            if (String.IsNullOrEmpty(root)) continue;
            string candidate = Path.Combine(root, "nodejs", "node.exe");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }

    private static int RunSelfTest()
    {
        try
        {
            string remote = Environment.GetEnvironmentVariable("PLAYFORGE_SERVER_URL");
            string url = String.IsNullOrWhiteSpace(remote)
                ? LocalUrl(ReadPort(Environment.GetEnvironmentVariable("PORT")), FrontendPath)
                : ResolveRemoteUrl(remote, FrontendPath);
            Uri parsed = new Uri(url);
            if (!parsed.AbsolutePath.Equals(FrontendPath, StringComparison.Ordinal)) throw new InvalidOperationException("Frontend route resolution failed.");
            Console.WriteLine(ProductName + ": " + url);
            Console.WriteLine("frontend=" + FrontendPath + "; remote=" + (!String.IsNullOrWhiteSpace(remote) ? "yes" : "no"));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }

    private static int RunSmokeTest()
    {
        smokeMode = true;
        try
        {
            var reserve = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            reserve.Start();
            int port = ((IPEndPoint)reserve.LocalEndpoint).Port;
            reserve.Stop();
            Environment.SetEnvironmentVariable("PORT", port.ToString());
            Environment.SetEnvironmentVariable("PLAYFORGE_SERVER_URL", null);
            Environment.SetEnvironmentVariable("HOST", "127.0.0.1");
            BuildWindow();
            StartOrReuse();
            if (ownedServer == null || reusedServer) throw new InvalidOperationException("Smoke test did not own its server.");
            var request = (HttpWebRequest)WebRequest.Create(resolvedUrl);
            request.Proxy = null;
            request.Timeout = 3000;
            using (var response = (HttpWebResponse)request.GetResponse())
                if (response.StatusCode != HttpStatusCode.OK) throw new InvalidOperationException("Frontend route failed.");
            StopOwnedServer();
            string engine;
            DateTime deadline = DateTime.UtcNow.AddSeconds(3);
            while (TryReadHealth(port, out engine) && DateTime.UtcNow < deadline) System.Threading.Thread.Sleep(100);
            if (TryReadHealth(port, out engine)) throw new InvalidOperationException("Owned server was not terminated.");
            string output = Path.Combine(appRoot, "Saved", "Tests");
            Directory.CreateDirectory(output);
            File.WriteAllText(Path.Combine(output, Path.GetFileNameWithoutExtension(Application.ExecutablePath) + "-smoke.json"),
                "{\"passed\":true,\"frontend\":\"" + FrontendPath + "\",\"server_started_and_stopped\":true}");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
        finally { StopOwnedServer(); if (form != null) form.Dispose(); }
    }

    private sealed class JobHandle : IDisposable
    {
        private IntPtr handle;
        public JobHandle()
        {
            handle = CreateJobObject(IntPtr.Zero, null);
            if (handle == IntPtr.Zero) throw new InvalidOperationException("Could not create a server process group.");
            JobObjectExtendedLimitInformation info = new JobObjectExtendedLimitInformation();
            info.BasicLimitInformation.LimitFlags = 0x00002000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            int length = Marshal.SizeOf(typeof(JobObjectExtendedLimitInformation));
            IntPtr memory = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(info, memory, false);
                if (!SetInformationJobObject(handle, 9, memory, (uint)length)) throw new InvalidOperationException("Could not configure server process cleanup.");
            }
            finally { Marshal.FreeHGlobal(memory); }
        }
        public bool Assign(Process process) { return AssignProcessToJobObject(handle, process.Handle); }
        public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }

        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
        [StructLayout(LayoutKind.Sequential)]
        private struct BasicLimitInformation
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct JobObjectExtendedLimitInformation
        {
            public BasicLimitInformation BasicLimitInformation;
            public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint infoLength);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
    }
}

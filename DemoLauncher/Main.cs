#nullable enable

using System.Diagnostics;
using System.Text;

namespace DemoLauncher;

public partial class Main : Form
{
    // Fields are declared in Main.Designer.cs

    // Process management
    private Process? backendProcess;
    private Process? aiEngineProcess;
    private Process? frontendProcess;
    private Process? blockchainProcess;

    private bool backendRunning = false;
    private bool aiEngineRunning = false;
    private bool frontendRunning = false;
    private bool blockchainRunning = false;
    private bool autoStarted = false;

    private string backendPath = "";
    private string aiEnginePath = "";
    private string frontendPath = "";
    private string blockchainPath = "";
    private string backendPort = "5000";
    private string aiEnginePort = "5000";
    private string frontendPort = "3000";
    private string blockchainPort = "8090";

    public Main()
    {
        InitializeComponent();
        LoadSettings();
        this.Shown += Main_Shown;
        this.FormClosing += Main_FormClosing;
    }

    private async void Main_Shown(object? sender, EventArgs e)
    {
        if (autoStarted)
        {
            return;
        }

        autoStarted = true;
        await Task.Delay(500);
        BtnStartAll_Click(btnStartAll, EventArgs.Empty);
    }

    private void Main_FormClosing(object? sender, FormClosingEventArgs e)
    {
        StopAllProcesses();
        KillAllProcessesByPort();
    }

    private void KillAllProcessesByPort()
    {
        var ports = new[] { 5000, 3000, 5001, 8000, 8090, 24678 };
        foreach (var port in ports)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/C for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{port}') do taskkill /PID %a /F",
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                var proc = Process.Start(psi);
                proc?.WaitForExit(2000);
            }
            catch { }
        }
    }

    private void LoadSettings()
    {
        backendPath = Path.Combine(GetProjectRoot(), "Backend", "VeriChainIDS.API");
        aiEnginePath = Path.Combine(GetProjectRoot(), "Al-Engine");
        frontendPath = Path.Combine(GetProjectRoot(), "Frontend");
        blockchainPath = Path.Combine(GetProjectRoot(), "Blockchain");
        
        txtBackendPath.Text = backendPath;
        txtAIEnginePath.Text = aiEnginePath;
        txtFrontendPath.Text = frontendPath;
        txtBackendPort.Text = backendPort;
        txtAIEnginePort.Text = aiEnginePort;
        txtFrontendPort.Text = frontendPort;
    }

    protected override void Dispose(bool disposing)
    {
        StopAllProcesses();
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    #region Event Handlers

    private void BtnBackend_Click(object? sender, EventArgs e)
    {
        if (backendRunning)
        {
            StopBackend();
            btnBackend.Text = "\u25B6 Khởi động Backend";
            backendRunning = false;
        }
        else
        {
            StartBackend();
            btnBackend.Text = "\u23F9 Dừng Backend";
            backendRunning = true;
        }
    }

    private void BtnAIEngine_Click(object? sender, EventArgs e)
    {
        if (aiEngineRunning)
        {
            StopAIEngine();
            btnAIEngine.Text = "\u25B6 Khởi động AI Engine";
            aiEngineRunning = false;
        }
        else
        {
            StartAIEngine();
            btnAIEngine.Text = "\u23F9 Dừng AI Engine";
            aiEngineRunning = true;
        }
    }

    private void BtnFrontend_Click(object? sender, EventArgs e)
    {
        if (frontendRunning)
        {
            StopFrontend();
            btnFrontend.Text = "\u25B6 Khởi động Frontend";
            frontendRunning = false;
        }
        else
        {
            StartFrontend();
            btnFrontend.Text = "\u23F9 Dừng Frontend";
            frontendRunning = true;
        }
    }

    private void BtnStartAll_Click(object? sender, EventArgs e)
    {
        KillAllProcessesByPort();
        StartBlockchain();
        StartBackend();
        StartAIEngine();
        StartFrontend();
        OpenFrontendAfterDelay();

        btnBackend.Text = "\u23F9 Dừng Backend";
        btnAIEngine.Text = "\u23F9 Dừng AI Engine";
        btnFrontend.Text = "\u23F9 Dừng Frontend";

        blockchainRunning = blockchainProcess != null && !blockchainProcess.HasExited;
        backendRunning = backendProcess != null && !backendProcess.HasExited;
        aiEngineRunning = aiEngineProcess != null && !aiEngineProcess.HasExited;
        frontendRunning = frontendProcess != null && !frontendProcess.HasExited;
        UpdateStatus();
    }

    private void BtnStopAll_Click(object? sender, EventArgs e)
    {
        StopAllProcesses();

        btnBackend.Text = "\u25B6 Khởi động Backend";
        btnAIEngine.Text = "\u25B6 Khởi động AI Engine";
        btnFrontend.Text = "\u25B6 Khởi động Frontend";

        backendRunning = false;
        aiEngineRunning = false;
        frontendRunning = false;
        blockchainRunning = false;
    }

    private void BtnClearAll_Click(object? sender, EventArgs e)
    {
        txtBackendLog.Clear();
        txtAIEngineLog.Clear();
        txtFrontendLog.Clear();
        LogToBackend("\uD83D\uDDD1\uFE0F Logs cleared");
        LogToBlockchain("\uD83D\uDDD1\uFE0F Blockchain log cleared");
        LogToAIEngine("\uD83D\uDDD1\uFE0F Logs cleared");
        LogToFrontend("\uD83D\uDDD1\uFE0F Logs cleared");
    }

    private void BtnSettings_Click(object? sender, EventArgs e)
    {
        panelSettings.Visible = !panelSettings.Visible;
    }

    private void BtnToggleFrontend_Click(object? sender, EventArgs e)
    {
        if (panelFrontend.Height > 50)
        {
            panelFrontend.Height = 50;
            btnToggleFrontend.Text = "\u2B07\uFE0F Mở rộng";
            txtFrontendLog.Visible = false;
            btnFrontend.Visible = false;
        }
        else
        {
            panelFrontend.Height = 150;
            btnToggleFrontend.Text = "\u2B06\uFE0F Thu gọn";
            txtFrontendLog.Visible = true;
            btnFrontend.Visible = true;
        }
    }

    private void BtnSaveSettings_Click(object? sender, EventArgs e)
    {
        backendPath = txtBackendPath.Text;
        aiEnginePath = txtAIEnginePath.Text;
        frontendPath = txtFrontendPath.Text;
        backendPort = txtBackendPort.Text;
        aiEnginePort = txtAIEnginePort.Text;
        frontendPort = txtFrontendPort.Text;

        // Update port labels
        lblBackendTitle.Text = $"\uD83D\uDD35 Backend API - Port: {backendPort}";
        lblAIEngineTitle.Text = $"\u26A1 AI Engine - Port: {aiEnginePort}";
        lblFrontendTitle.Text = $"\uD83D\uDCA1 Frontend - Port: {frontendPort}";

        panelSettings.Visible = false;
        LogToBackend($"\u2705 Settings saved - Port: {backendPort}");
        LogToAIEngine($"\u2705 Settings saved - Port: {aiEnginePort}");
        LogToFrontend($"\u2705 Settings saved - Port: {frontendPort}");
    }

    private void BtnCloseSettings_Click(object? sender, EventArgs e)
    {
        panelSettings.Visible = false;
    }

    #endregion

    #region Blockchain Methods

    private void StartBlockchain()
    {
        try
        {
            if (!Directory.Exists(blockchainPath))
            {
                LogToBlockchain($"\u274C Blockchain folder not found: {blockchainPath}");
                return;
            }

            var signingKeyPath = Path.Combine(blockchainPath, "wallet", "payment.skey");
            var addressPath = Path.Combine(blockchainPath, "wallet", "payment.addr");
            if (!File.Exists(signingKeyPath) || !File.Exists(addressPath))
            {
                LogToBlockchain("\u26A0\uFE0F Wallet files not found. Need Blockchain\\wallet\\payment.skey and payment.addr.");
            }

            var pythonExe = ResolvePythonExecutable(Path.Combine(blockchainPath, ".venv", "Scripts", "python.exe"));
            LogToBlockchain($"\uD83D\uDE80 Starting Cardano submitter on port {blockchainPort}...");
            LogToBlockchain($"Python: {pythonExe}");
            lblStatus.Text = "Starting Blockchain submitter...";

            blockchainProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = pythonExe,
                    Arguments = $"-m uvicorn Blockchain.submitter:app --host 127.0.0.1 --port {blockchainPort}",
                    WorkingDirectory = GetProjectRoot(),
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                }
            };

            blockchainProcess.OutputDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToBlockchain(e.Data)));
            };

            blockchainProcess.ErrorDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToBlockchain($"[ERROR] {e.Data}")));
            };

            blockchainProcess.Start();
            blockchainProcess.BeginOutputReadLine();
            blockchainProcess.BeginErrorReadLine();

            blockchainRunning = true;
            LogToBlockchain("\u2705 Cardano submitter started successfully");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            blockchainRunning = false;
            LogToBlockchain($"\u274C Failed to start Cardano submitter: {ex.Message}");
        }
    }

    private void StopBlockchain()
    {
        try
        {
            if (blockchainProcess != null)
            {
                KillProcessTree(blockchainProcess);
                blockchainProcess = null;
            }
            KillProcessesOnPort(int.Parse(blockchainPort));
            blockchainRunning = false;
            LogToBlockchain("\uD83D\uDED1 Cardano submitter stopped");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToBlockchain($"\u274C Error stopping Cardano submitter: {ex.Message}");
        }
    }

    #endregion

    #region Backend Methods

    private void StartBackend()
    {
        try
        {
            if (!Directory.Exists(backendPath))
            {
                LogToBackend($"\u274C Backend folder not found: {backendPath}");
                return;
            }

            LogToBackend("\uD83D\uDE80 Starting Backend API...");
            lblStatus.Text = "Starting Backend...";

            backendProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "dotnet",
                    Arguments = "run",
                    WorkingDirectory = backendPath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                }
            };

            backendProcess.OutputDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToBackend(e.Data)));
            };

            backendProcess.ErrorDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToBackend($"[ERROR] {e.Data}")));
            };

            backendProcess.Start();
            backendProcess.BeginOutputReadLine();
            backendProcess.BeginErrorReadLine();

            LogToBackend("\u2705 Backend started successfully");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToBackend($"\u274C Failed to start Backend: {ex.Message}");
        }
    }

    private void StopBackend()
    {
        try
        {
            if (backendProcess != null)
            {
                KillProcessTree(backendProcess);
                backendProcess = null;
            }
            KillProcessesOnPort(5000);
            LogToBackend("\uD83D\uDED1 Backend stopped");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToBackend($"\u274C Error stopping Backend: {ex.Message}");
        }
    }

    #endregion

    #region AI Engine Methods

    private void StartAIEngine()
    {
        try
        {
            if (!Directory.Exists(aiEnginePath))
            {
                LogToAIEngine($"\u274C AI Engine folder not found: {aiEnginePath}");
                return;
            }

            LogToAIEngine("\uD83D\uDE80 Starting AI Engine...");
            lblStatus.Text = "Starting AI Engine...";

            aiEngineProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = ResolvePythonExecutable(Path.Combine(aiEnginePath, ".venv", "Scripts", "python.exe")),
                    Arguments = $"ai_engine.py --backend-url http://localhost:{backendPort}",
                    WorkingDirectory = aiEnginePath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                }
            };

            aiEngineProcess.OutputDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToAIEngine(e.Data)));
            };

            aiEngineProcess.ErrorDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToAIEngine($"[ERROR] {e.Data}")));
            };

            aiEngineProcess.Start();
            aiEngineProcess.BeginOutputReadLine();
            aiEngineProcess.BeginErrorReadLine();

            LogToAIEngine("\u2705 AI Engine started successfully");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToAIEngine($"\u274C Failed to start AI Engine: {ex.Message}");
        }
    }

    private void StopAIEngine()
    {
        try
        {
            if (aiEngineProcess != null)
            {
                KillProcessTree(aiEngineProcess);
                aiEngineProcess = null;
            }
            LogToAIEngine("\uD83D\uDED1 AI Engine stopped");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToAIEngine($"\u274C Error stopping AI Engine: {ex.Message}");
        }
    }

    #endregion

    #region Frontend Methods

    private void StartFrontend()
    {
        try
        {
            if (!Directory.Exists(frontendPath))
            {
                LogToFrontend($"\u274C Frontend folder not found: {frontendPath}");
                return;
            }

            LogToFrontend("\uD83D\uDE80 Starting Frontend...");
            lblStatus.Text = "Starting Frontend...";

            frontendProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = ResolveNpmExecutable(),
                    Arguments = "run dev",
                    WorkingDirectory = frontendPath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                }
            };

            frontendProcess.OutputDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToFrontend(e.Data)));
            };

            frontendProcess.ErrorDataReceived += (s, e) =>
            {
                if (e.Data != null)
                    BeginInvoke(new Action(() => LogToFrontend($"[ERROR] {e.Data}")));
            };

            frontendProcess.Start();
            frontendProcess.BeginOutputReadLine();
            frontendProcess.BeginErrorReadLine();

            LogToFrontend("\u2705 Frontend started successfully");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToFrontend($"\u274C Failed to start Frontend: {ex.Message}");
        }
    }

    private void StopFrontend()
    {
        try
        {
            if (frontendProcess != null)
            {
                KillProcessTree(frontendProcess);
                frontendProcess = null;
            }
            KillProcessesOnPort(3000);
            KillProcessesOnPort(24678);
            LogToFrontend("\uD83D\uDED1 Frontend stopped");
            UpdateStatus();
        }
        catch (Exception ex)
        {
            LogToFrontend($"\u274C Error stopping Frontend: {ex.Message}");
        }
    }

    #endregion

    #region Helper Methods

    private void KillProcessTree(Process process)
    {
        try
        {
            if (process.HasExited) return;

            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/C taskkill /PID {process.Id} /T /F",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            var proc = Process.Start(psi);
            proc?.WaitForExit(3000);
            process.Refresh();
            if (!process.HasExited)
            {
                process.Kill(true);
            }
            process.Dispose();
        }
        catch { }
    }

    private void KillProcessesOnPort(int port)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/C for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{port}') do @taskkill /PID %a /F 2>nul",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true
            };
            var proc = Process.Start(psi);
            proc?.WaitForExit(2000);
        }
        catch { }
    }

    private string GetProjectRoot()
    {
        var appDir = AppDomain.CurrentDomain.BaseDirectory;
        var currentDir = Directory.GetParent(appDir);
        while (currentDir != null)
        {
            var hasProjectShape =
                Directory.Exists(Path.Combine(currentDir.FullName, "Backend", "VeriChainIDS.API")) &&
                Directory.Exists(Path.Combine(currentDir.FullName, "Frontend")) &&
                Directory.Exists(Path.Combine(currentDir.FullName, "Al-Engine"));
            if (hasProjectShape)
            {
                return currentDir.FullName;
            }

            currentDir = currentDir.Parent;
        }
        return appDir;
    }

    private void StopAllProcesses()
    {
        StopBlockchain();
        StopBackend();
        StopAIEngine();
        StopFrontend();
        lblStatus.Text = "All services stopped";
    }

    private void UpdateStatus()
    {
        var running = new List<string>();
        if (blockchainRunning || (blockchainProcess != null && !blockchainProcess.HasExited)) running.Add("Blockchain");
        if (backendRunning || (backendProcess != null && !backendProcess.HasExited)) running.Add("Backend");
        if (aiEngineRunning || (aiEngineProcess != null && !aiEngineProcess.HasExited)) running.Add("AI Engine");
        if (frontendRunning || (frontendProcess != null && !frontendProcess.HasExited)) running.Add("Frontend");

        if (running.Count == 0)
        {
            lblStatus.Text = "Sẵn sàng để khởi động";
        }
        else
        {
            lblStatus.Text = $"Running: {string.Join(", ", running)}";
        }
    }

    private string ResolvePythonExecutable(string preferredPythonPath)
    {
        if (File.Exists(preferredPythonPath))
        {
            return preferredPythonPath;
        }

        var bundledPython = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cache",
            "codex-runtimes",
            "codex-primary-runtime",
            "dependencies",
            "python",
            "python.exe"
        );

        var candidates = new[] { bundledPython, "python", "py" };
        foreach (var candidate in candidates)
        {
            if (IsExecutableAvailable(candidate, "--version"))
            {
                return candidate;
            }
        }

        return "python";
    }

    private bool IsExecutableAvailable(string executable, string arguments)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = executable,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using var proc = Process.Start(psi);
            if (proc == null)
            {
                return false;
            }

            if (!proc.WaitForExit(3000))
            {
                try { proc.Kill(true); } catch { }
                return false;
            }

            return proc.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private string ResolveNpmExecutable()
    {
        var standardPath = "C:\\Program Files\\nodejs\\npm.cmd";
        if (File.Exists(standardPath))
        {
            return standardPath;
        }

        if (IsExecutableAvailable("npm.cmd", "--version"))
        {
            return "npm.cmd";
        }

        return standardPath;
    }

    private void OpenFrontendAfterDelay()
    {
        _ = Task.Run(async () =>
        {
            await Task.Delay(6000);
            try
            {
                BeginInvoke(new Action(OpenFrontendInBrowser));
            }
            catch { }
        });
    }

    private void OpenFrontendInBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = $"http://localhost:{frontendPort}",
                UseShellExecute = true
            });
            LogToFrontend($"\uD83C\uDF10 Opened dashboard: http://localhost:{frontendPort}");
        }
        catch (Exception ex)
        {
            LogToFrontend($"\u26A0\uFE0F Could not open browser: {ex.Message}");
        }
    }

    private void LogToBlockchain(string message)
    {
        LogToBackend($"[BLOCKCHAIN] {message}");
    }

    private void LogToBackend(string message)
    {
        if (txtBackendLog.InvokeRequired)
        {
            txtBackendLog.BeginInvoke(new Action(() => LogToBackend(message)));
            return;
        }
        txtBackendLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\n");
        txtBackendLog.SelectionStart = txtBackendLog.Text.Length;
        txtBackendLog.ScrollToCaret();
    }

    private void LogToAIEngine(string message)
    {
        if (txtAIEngineLog.InvokeRequired)
        {
            txtAIEngineLog.BeginInvoke(new Action(() => LogToAIEngine(message)));
            return;
        }
        txtAIEngineLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\n");
        txtAIEngineLog.SelectionStart = txtAIEngineLog.Text.Length;
        txtAIEngineLog.ScrollToCaret();
    }

    private void LogToFrontend(string message)
    {
        if (txtFrontendLog.InvokeRequired)
        {
            txtFrontendLog.BeginInvoke(new Action(() => LogToFrontend(message)));
            return;
        }
        txtFrontendLog.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}\n");
        txtFrontendLog.SelectionStart = txtFrontendLog.Text.Length;
        txtFrontendLog.ScrollToCaret();
    }

    #endregion
}

namespace DemoLauncher;

partial class Main
{
    private System.ComponentModel.IContainer components = null;

    private void InitializeComponent()
    {
        // Create all controls
        this.panelHeader = new Panel();
        this.panelSettings = new Panel();
        this.panelMainContent = new Panel();
        
        // 3 Row Panels
        this.panelFrontend = new Panel();
        this.panelAIEngine = new Panel();
        this.panelBackend = new Panel();
        
        // Header controls
        this.lblTitle = new Label();
        this.lblStatus = new Label();
        this.btnSettings = new Button();
        this.btnStartAll = new Button();
        this.btnStopAll = new Button();
        this.btnClearAll = new Button();
        
        // Frontend controls
        this.lblFrontendTitle = new Label();
        this.btnFrontend = new Button();
        this.btnToggleFrontend = new Button();
        this.txtFrontendLog = new RichTextBox();
        
        // AI Engine controls
        this.lblAIEngineTitle = new Label();
        this.btnAIEngine = new Button();
        this.txtAIEngineLog = new RichTextBox();
        
        // Backend controls
        this.lblBackendTitle = new Label();
        this.btnBackend = new Button();
        this.txtBackendLog = new RichTextBox();
        
        // Settings controls
        this.lblSettingsTitle = new Label();
        this.lblBackendPath = new Label();
        this.txtBackendPath = new TextBox();
        this.txtBackendPort = new TextBox();
        this.lblAIEnginePath = new Label();
        this.txtAIEnginePath = new TextBox();
        this.txtAIEnginePort = new TextBox();
        this.lblFrontendPath = new Label();
        this.txtFrontendPath = new TextBox();
        this.txtFrontendPort = new TextBox();
        this.btnSaveSettings = new Button();
        this.btnCloseSettings = new Button();
        
        // Suspend layouts
        this.panelHeader.SuspendLayout();
        this.panelSettings.SuspendLayout();
        this.panelMainContent.SuspendLayout();
        this.panelFrontend.SuspendLayout();
        this.panelAIEngine.SuspendLayout();
        this.panelBackend.SuspendLayout();
        this.SuspendLayout();

        // ============================================
        // FORM SETTINGS
        // ============================================
        this.BackColor = Color.FromArgb(15, 23, 42);
        this.ClientSize = new Size(1200, 800);
        this.MinimumSize = new Size(900, 600);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.Text = "VeriChainIDS Demo Launcher";
        
        // ============================================
        // HEADER PANEL
        // ============================================
        this.panelHeader.BackColor = Color.FromArgb(30, 41, 59);
        this.panelHeader.Dock = DockStyle.Top;
        this.panelHeader.Location = new Point(0, 0);
        this.panelHeader.Name = "panelHeader";
        this.panelHeader.Size = new Size(1200, 60);
        this.panelHeader.Padding = new Padding(15, 8, 15, 8);
        
        this.lblTitle.AutoSize = true;
        this.lblTitle.Font = new Font("Segoe UI", 14, FontStyle.Bold);
        this.lblTitle.ForeColor = Color.White;
        this.lblTitle.Location = new Point(15, 8);
        this.lblTitle.Name = "lblTitle";
        this.lblTitle.Text = "\uD83D\uDEE1\uFE0F VeriChainIDS Demo Launcher";
        
        this.lblStatus.AutoSize = true;
        this.lblStatus.Font = new Font("Segoe UI", 9);
        this.lblStatus.ForeColor = Color.FromArgb(148, 163, 184);
        this.lblStatus.Location = new Point(15, 35);
        this.lblStatus.Name = "lblStatus";
        this.lblStatus.Text = "Sẵn sàng để khởi động";
        
        // Header buttons
        this.btnStartAll.BackColor = Color.FromArgb(34, 197, 94);
        this.btnStartAll.Cursor = Cursors.Hand;
        this.btnStartAll.FlatAppearance.BorderSize = 0;
        this.btnStartAll.FlatStyle = FlatStyle.Flat;
        this.btnStartAll.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnStartAll.ForeColor = Color.White;
        this.btnStartAll.Location = new Point(550, 8);
        this.btnStartAll.Name = "btnStartAll";
        this.btnStartAll.Size = new Size(80, 28);
        this.btnStartAll.Text = "\uD83D\uDE80 Start";
        this.btnStartAll.Click += BtnStartAll_Click;
        
        this.btnStopAll.BackColor = Color.FromArgb(239, 68, 68);
        this.btnStopAll.Cursor = Cursors.Hand;
        this.btnStopAll.FlatAppearance.BorderSize = 0;
        this.btnStopAll.FlatStyle = FlatStyle.Flat;
        this.btnStopAll.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnStopAll.ForeColor = Color.White;
        this.btnStopAll.Location = new Point(635, 8);
        this.btnStopAll.Name = "btnStopAll";
        this.btnStopAll.Size = new Size(70, 28);
        this.btnStopAll.Text = "\uD83D\uDED1 Stop";
        this.btnStopAll.Click += BtnStopAll_Click;
        
        this.btnClearAll.BackColor = Color.FromArgb(100, 116, 139);
        this.btnClearAll.Cursor = Cursors.Hand;
        this.btnClearAll.FlatAppearance.BorderSize = 0;
        this.btnClearAll.FlatStyle = FlatStyle.Flat;
        this.btnClearAll.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnClearAll.ForeColor = Color.White;
        this.btnClearAll.Location = new Point(710, 8);
        this.btnClearAll.Name = "btnClearAll";
        this.btnClearAll.Size = new Size(70, 28);
        this.btnClearAll.Text = "\uD83D\uDDD1\uFE0F Clear";
        this.btnClearAll.Click += BtnClearAll_Click;
        
        this.btnSettings.BackColor = Color.FromArgb(168, 85, 247);
        this.btnSettings.Cursor = Cursors.Hand;
        this.btnSettings.FlatAppearance.BorderSize = 0;
        this.btnSettings.FlatStyle = FlatStyle.Flat;
        this.btnSettings.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnSettings.ForeColor = Color.White;
        this.btnSettings.Location = new Point(785, 8);
        this.btnSettings.Name = "btnSettings";
        this.btnSettings.Size = new Size(90, 28);
        this.btnSettings.Text = "\u2699\uFE0F Cấu hình";
        this.btnSettings.Click += BtnSettings_Click;
        
        this.panelHeader.Controls.AddRange(new Control[] {
            lblTitle, lblStatus,
            btnStartAll, btnStopAll, btnClearAll, btnSettings
        });

        // ============================================
        // SETTINGS PANEL
        // ============================================
        this.panelSettings.BackColor = Color.FromArgb(25, 35, 55);
        this.panelSettings.Dock = DockStyle.Top;
        this.panelSettings.Location = new Point(0, 60);
        this.panelSettings.Name = "panelSettings";
        this.panelSettings.Padding = new Padding(15);
        this.panelSettings.Size = new Size(1200, 160);
        this.panelSettings.Visible = false;
        
        this.lblSettingsTitle.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        this.lblSettingsTitle.ForeColor = Color.White;
        this.lblSettingsTitle.Location = new Point(15, 8);
        this.lblSettingsTitle.Name = "lblSettingsTitle";
        this.lblSettingsTitle.Size = new Size(200, 22);
        this.lblSettingsTitle.Text = "\u2699\uFE0F Cấu hình đường dẫn và Port";
        
        // Backend settings row
        this.lblBackendPath.ForeColor = Color.White;
        this.lblBackendPath.Location = new Point(15, 42);
        this.lblBackendPath.Name = "lblBackendPath";
        this.lblBackendPath.Size = new Size(90, 20);
        this.lblBackendPath.Text = "Backend:";
        
        this.txtBackendPath.BackColor = Color.FromArgb(40, 50, 70);
        this.txtBackendPath.ForeColor = Color.White;
        this.txtBackendPath.Location = new Point(110, 40);
        this.txtBackendPath.Name = "txtBackendPath";
        this.txtBackendPath.Size = new Size(550, 23);
        this.txtBackendPath.Text = backendPath;
        
        this.txtBackendPort.BackColor = Color.FromArgb(40, 50, 70);
        this.txtBackendPort.ForeColor = Color.White;
        this.txtBackendPort.Location = new Point(670, 40);
        this.txtBackendPort.Name = "txtBackendPort";
        this.txtBackendPort.Size = new Size(70, 23);
        this.txtBackendPort.Text = backendPort;
        
        // AI Engine settings row
        this.lblAIEnginePath.ForeColor = Color.White;
        this.lblAIEnginePath.Location = new Point(15, 75);
        this.lblAIEnginePath.Name = "lblAIEnginePath";
        this.lblAIEnginePath.Size = new Size(90, 20);
        this.lblAIEnginePath.Text = "AI Engine:";
        
        this.txtAIEnginePath.BackColor = Color.FromArgb(40, 50, 70);
        this.txtAIEnginePath.ForeColor = Color.White;
        this.txtAIEnginePath.Location = new Point(110, 73);
        this.txtAIEnginePath.Name = "txtAIEnginePath";
        this.txtAIEnginePath.Size = new Size(550, 23);
        this.txtAIEnginePath.Text = aiEnginePath;
        
        this.txtAIEnginePort.BackColor = Color.FromArgb(40, 50, 70);
        this.txtAIEnginePort.ForeColor = Color.White;
        this.txtAIEnginePort.Location = new Point(670, 73);
        this.txtAIEnginePort.Name = "txtAIEnginePort";
        this.txtAIEnginePort.Size = new Size(70, 23);
        this.txtAIEnginePort.Text = aiEnginePort;
        
        // Frontend settings row
        this.lblFrontendPath.ForeColor = Color.White;
        this.lblFrontendPath.Location = new Point(15, 108);
        this.lblFrontendPath.Name = "lblFrontendPath";
        this.lblFrontendPath.Size = new Size(90, 20);
        this.lblFrontendPath.Text = "Frontend:";
        
        this.txtFrontendPath.BackColor = Color.FromArgb(40, 50, 70);
        this.txtFrontendPath.ForeColor = Color.White;
        this.txtFrontendPath.Location = new Point(110, 106);
        this.txtFrontendPath.Name = "txtFrontendPath";
        this.txtFrontendPath.Size = new Size(550, 23);
        this.txtFrontendPath.Text = frontendPath;
        
        this.txtFrontendPort.BackColor = Color.FromArgb(40, 50, 70);
        this.txtFrontendPort.ForeColor = Color.White;
        this.txtFrontendPort.Location = new Point(670, 106);
        this.txtFrontendPort.Name = "txtFrontendPort";
        this.txtFrontendPort.Size = new Size(70, 23);
        this.txtFrontendPort.Text = frontendPort;
        
        // Settings buttons
        this.btnSaveSettings.BackColor = Color.FromArgb(34, 197, 94);
        this.btnSaveSettings.Cursor = Cursors.Hand;
        this.btnSaveSettings.FlatAppearance.BorderSize = 0;
        this.btnSaveSettings.FlatStyle = FlatStyle.Flat;
        this.btnSaveSettings.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnSaveSettings.ForeColor = Color.White;
        this.btnSaveSettings.Location = new Point(760, 104);
        this.btnSaveSettings.Name = "btnSaveSettings";
        this.btnSaveSettings.Size = new Size(80, 26);
        this.btnSaveSettings.Text = "\uD83D\uDCBE Lưu";
        this.btnSaveSettings.Click += BtnSaveSettings_Click;
        
        this.btnCloseSettings.BackColor = Color.FromArgb(239, 68, 68);
        this.btnCloseSettings.Cursor = Cursors.Hand;
        this.btnCloseSettings.FlatAppearance.BorderSize = 0;
        this.btnCloseSettings.FlatStyle = FlatStyle.Flat;
        this.btnCloseSettings.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnCloseSettings.ForeColor = Color.White;
        this.btnCloseSettings.Location = new Point(845, 104);
        this.btnCloseSettings.Name = "btnCloseSettings";
        this.btnCloseSettings.Size = new Size(70, 26);
        this.btnCloseSettings.Text = "\u2716\uFE0F Đóng";
        this.btnCloseSettings.Click += BtnCloseSettings_Click;
        
        this.panelSettings.Controls.AddRange(new Control[] {
            lblSettingsTitle,
            lblBackendPath, txtBackendPath, txtBackendPort,
            lblAIEnginePath, txtAIEnginePath, txtAIEnginePort,
            lblFrontendPath, txtFrontendPath, txtFrontendPort,
            btnSaveSettings, btnCloseSettings
        });

        // ============================================
        // MAIN CONTENT - 3 ROWS (Vertical Stack)
        // ============================================
        this.panelMainContent.BackColor = Color.FromArgb(15, 23, 42);
        this.panelMainContent.Dock = DockStyle.Fill;
        this.panelMainContent.Location = new Point(0, 60);
        this.panelMainContent.Name = "panelMainContent";
        this.panelMainContent.Size = new Size(1200, 740);
        this.panelMainContent.Padding = new Padding(10);

        // ----- FRONTEND ROW (Top, smaller, collapsible) -----
        this.panelFrontend.BackColor = Color.FromArgb(50, 20, 40);
        this.panelFrontend.Dock = DockStyle.Top;
        this.panelFrontend.Location = new Point(10, 10);
        this.panelFrontend.Name = "panelFrontend";
        this.panelFrontend.Padding = new Padding(10);
        this.panelFrontend.Size = new Size(1180, 150);
        
        this.lblFrontendTitle.Dock = DockStyle.Top;
        this.lblFrontendTitle.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        this.lblFrontendTitle.ForeColor = Color.FromArgb(236, 72, 153);
        this.lblFrontendTitle.Location = new Point(10, 10);
        this.lblFrontendTitle.Name = "lblFrontendTitle";
        this.lblFrontendTitle.Size = new Size(1160, 25);
        this.lblFrontendTitle.Text = "\uD83D\uDCA1 Frontend - Port: 3000";
        this.lblFrontendTitle.TextAlign = ContentAlignment.MiddleLeft;
        
        this.btnToggleFrontend.Dock = DockStyle.Right;
        this.btnToggleFrontend.BackColor = Color.FromArgb(236, 72, 153);
        this.btnToggleFrontend.Cursor = Cursors.Hand;
        this.btnToggleFrontend.FlatAppearance.BorderSize = 0;
        this.btnToggleFrontend.FlatStyle = FlatStyle.Flat;
        this.btnToggleFrontend.Font = new Font("Segoe UI", 8, FontStyle.Bold);
        this.btnToggleFrontend.ForeColor = Color.White;
        this.btnToggleFrontend.Location = new Point(1080, 10);
        this.btnToggleFrontend.Name = "btnToggleFrontend";
        this.btnToggleFrontend.Size = new Size(90, 25);
        this.btnToggleFrontend.Text = "\u2B06\uFE0F Thu gọn";
        this.btnToggleFrontend.Click += BtnToggleFrontend_Click;
        
        this.btnFrontend.Dock = DockStyle.Left;
        this.btnFrontend.BackColor = Color.FromArgb(236, 72, 153);
        this.btnFrontend.Cursor = Cursors.Hand;
        this.btnFrontend.FlatAppearance.BorderSize = 0;
        this.btnFrontend.FlatStyle = FlatStyle.Flat;
        this.btnFrontend.Font = new Font("Segoe UI", 9, FontStyle.Bold);
        this.btnFrontend.ForeColor = Color.White;
        this.btnFrontend.Location = new Point(10, 35);
        this.btnFrontend.Name = "btnFrontend";
        this.btnFrontend.Size = new Size(140, 28);
        this.btnFrontend.Text = "\u25B6 Khởi động";
        this.btnFrontend.Click += BtnFrontend_Click;
        
        this.txtFrontendLog.BackColor = Color.FromArgb(0, 0, 0);
        this.txtFrontendLog.BorderStyle = BorderStyle.None;
        this.txtFrontendLog.Dock = DockStyle.Fill;
        this.txtFrontendLog.Font = new Font("Consolas", 9);
        this.txtFrontendLog.ForeColor = Color.FromArgb(251, 207, 232);
        this.txtFrontendLog.Location = new Point(10, 63);
        this.txtFrontendLog.Name = "txtFrontendLog";
        this.txtFrontendLog.ReadOnly = true;
        this.txtFrontendLog.Size = new Size(1160, 77);
        this.txtFrontendLog.WordWrap = false;
        
        this.panelFrontend.Controls.AddRange(new Control[] {
            txtFrontendLog, lblFrontendTitle, btnToggleFrontend, btnFrontend
        });

        // ----- AI ENGINE ROW (Middle) -----
        this.panelAIEngine.BackColor = Color.FromArgb(30, 20, 50);
        this.panelAIEngine.Dock = DockStyle.Top;
        this.panelAIEngine.Location = new Point(10, 160);
        this.panelAIEngine.Name = "panelAIEngine";
        this.panelAIEngine.Padding = new Padding(10);
        this.panelAIEngine.Size = new Size(1180, 250);
        
        this.lblAIEngineTitle.Dock = DockStyle.Top;
        this.lblAIEngineTitle.Font = new Font("Segoe UI", 12, FontStyle.Bold);
        this.lblAIEngineTitle.ForeColor = Color.FromArgb(139, 92, 246);
        this.lblAIEngineTitle.Location = new Point(10, 10);
        this.lblAIEngineTitle.Name = "lblAIEngineTitle";
        this.lblAIEngineTitle.Size = new Size(1160, 28);
        this.lblAIEngineTitle.Text = "\u26A1 AI Engine - Port: 5000";
        this.lblAIEngineTitle.TextAlign = ContentAlignment.MiddleLeft;
        
        this.btnAIEngine.Dock = DockStyle.Top;
        this.btnAIEngine.BackColor = Color.FromArgb(139, 92, 246);
        this.btnAIEngine.Cursor = Cursors.Hand;
        this.btnAIEngine.FlatAppearance.BorderSize = 0;
        this.btnAIEngine.FlatStyle = FlatStyle.Flat;
        this.btnAIEngine.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        this.btnAIEngine.ForeColor = Color.White;
        this.btnAIEngine.Location = new Point(10, 38);
        this.btnAIEngine.Name = "btnAIEngine";
        this.btnAIEngine.Size = new Size(160, 35);
        this.btnAIEngine.Text = "\u25B6 Khởi động AI Engine";
        this.btnAIEngine.Click += BtnAIEngine_Click;
        
        this.txtAIEngineLog.BackColor = Color.FromArgb(0, 0, 0);
        this.txtAIEngineLog.BorderStyle = BorderStyle.None;
        this.txtAIEngineLog.Dock = DockStyle.Fill;
        this.txtAIEngineLog.Font = new Font("Consolas", 10);
        this.txtAIEngineLog.ForeColor = Color.FromArgb(196, 181, 253);
        this.txtAIEngineLog.Location = new Point(10, 73);
        this.txtAIEngineLog.Name = "txtAIEngineLog";
        this.txtAIEngineLog.ReadOnly = true;
        this.txtAIEngineLog.Size = new Size(1160, 167);
        this.txtAIEngineLog.WordWrap = false;
        
        this.panelAIEngine.Controls.AddRange(new Control[] {
            txtAIEngineLog, lblAIEngineTitle, btnAIEngine
        });

        // ----- BACKEND ROW (Bottom, largest) -----
        this.panelBackend.BackColor = Color.FromArgb(20, 30, 50);
        this.panelBackend.Dock = DockStyle.Fill;
        this.panelBackend.Location = new Point(10, 410);
        this.panelBackend.Name = "panelBackend";
        this.panelBackend.Padding = new Padding(10);
        this.panelBackend.Size = new Size(1180, 320);
        
        this.lblBackendTitle.Dock = DockStyle.Top;
        this.lblBackendTitle.Font = new Font("Segoe UI", 12, FontStyle.Bold);
        this.lblBackendTitle.ForeColor = Color.FromArgb(59, 130, 246);
        this.lblBackendTitle.Location = new Point(10, 10);
        this.lblBackendTitle.Name = "lblBackendTitle";
        this.lblBackendTitle.Size = new Size(1160, 28);
        this.lblBackendTitle.Text = "\uD83D\uDD35 Backend API - Port: 5000";
        this.lblBackendTitle.TextAlign = ContentAlignment.MiddleLeft;
        
        this.btnBackend.Dock = DockStyle.Top;
        this.btnBackend.BackColor = Color.FromArgb(59, 130, 246);
        this.btnBackend.Cursor = Cursors.Hand;
        this.btnBackend.FlatAppearance.BorderSize = 0;
        this.btnBackend.FlatStyle = FlatStyle.Flat;
        this.btnBackend.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        this.btnBackend.ForeColor = Color.White;
        this.btnBackend.Location = new Point(10, 38);
        this.btnBackend.Name = "btnBackend";
        this.btnBackend.Size = new Size(160, 35);
        this.btnBackend.Text = "\u25B6 Khởi động Backend";
        this.btnBackend.Click += BtnBackend_Click;
        
        this.txtBackendLog.BackColor = Color.FromArgb(0, 0, 0);
        this.txtBackendLog.BorderStyle = BorderStyle.None;
        this.txtBackendLog.Dock = DockStyle.Fill;
        this.txtBackendLog.Font = new Font("Consolas", 10);
        this.txtBackendLog.ForeColor = Color.FromArgb(134, 239, 172);
        this.txtBackendLog.Location = new Point(10, 73);
        this.txtBackendLog.Name = "txtBackendLog";
        this.txtBackendLog.ReadOnly = true;
        this.txtBackendLog.Size = new Size(1160, 237);
        this.txtBackendLog.WordWrap = false;
        
        this.panelBackend.Controls.AddRange(new Control[] {
            txtBackendLog, lblBackendTitle, btnBackend
        });

        // Add rows to main content
        this.panelMainContent.Controls.Add(panelBackend);
        this.panelMainContent.Controls.Add(panelAIEngine);
        this.panelMainContent.Controls.Add(panelFrontend);

        // ============================================
        // ADD ALL TO FORM
        // ============================================
        this.Controls.Add(panelMainContent);
        this.Controls.Add(panelSettings);
        this.Controls.Add(panelHeader);

        // Resume layouts
        this.panelHeader.ResumeLayout(false);
        this.panelHeader.PerformLayout();
        this.panelSettings.ResumeLayout(false);
        this.panelSettings.PerformLayout();
        this.panelMainContent.ResumeLayout(false);
        this.panelFrontend.ResumeLayout(false);
        this.panelAIEngine.ResumeLayout(false);
        this.panelBackend.ResumeLayout(false);
        this.ResumeLayout(false);
    }

    #region Fields
    private Panel panelHeader;
    private Panel panelSettings;
    private Panel panelMainContent;
    private Panel panelFrontend;
    private Panel panelAIEngine;
    private Panel panelBackend;
    
    private Label lblTitle;
    private Label lblStatus;
    private Label lblFrontendTitle;
    private Label lblAIEngineTitle;
    private Label lblBackendTitle;
    private Label lblSettingsTitle;
    private Label lblBackendPath;
    private Label lblAIEnginePath;
    private Label lblFrontendPath;
    
    private Button btnSettings;
    private Button btnStartAll;
    private Button btnStopAll;
    private Button btnClearAll;
    private Button btnFrontend;
    private Button btnAIEngine;
    private Button btnBackend;
    private Button btnToggleFrontend;
    private Button btnSaveSettings;
    private Button btnCloseSettings;
    
    private RichTextBox txtFrontendLog;
    private RichTextBox txtAIEngineLog;
    private RichTextBox txtBackendLog;
    
    private TextBox txtBackendPath;
    private TextBox txtBackendPort;
    private TextBox txtAIEnginePath;
    private TextBox txtAIEnginePort;
    private TextBox txtFrontendPath;
    private TextBox txtFrontendPort;
    #endregion
}

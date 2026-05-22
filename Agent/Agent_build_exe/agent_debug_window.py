#!/usr/bin/env python3
"""
VeriChainIDS Agent Debug Window - Cửa sổ Debug để theo dõi Agent
Chỉ đọc log và hiển thị trạng thái, không can thiệp vào agent_core.py
"""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import threading
import time
import tkinter as tk
from datetime import datetime
from pathlib import Path
from typing import Optional

# Đường dẫn log
LOG_DIR = Path(os.environ.get("LOCALAPPDATA", os.getenv("APPDATA", "."))) / "VeriChainIDS" / "logs"
LOG_FILE = LOG_DIR / "agent.log"
CONFIG_FILE = Path(os.environ.get("APPDATA", ".")) / "VeriChainIDS" / "config.json"

# Trạng thái Agent
class AgentStatus:
    def __init__(self):
        self.uptime_seconds: int = 0
        self.total_sent: int = 0
        self.total_failed: int = 0
        self.total_attacks: int = 0
        self.total_blocked: int = 0
        self.distributed: int = 0
        self.last_error: Optional[str] = None
        self.blocked_ips: list[str] = []
        self.running: bool = False
        self.last_update: Optional[datetime] = None

# Màu sắc
COLORS = {
    "bg": "#1a1a2e",
    "bg2": "#16213e",
    "fg": "#eaeaea",
    "accent": "#4a76fa",
    "danger": "#e84949",
    "warning": "#ffa726",
    "success": "#4caf50",
    "info": "#29b6f6",
    "text_dim": "#888888",
}

class AgentDebugWindow:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("VeriChainIDS Agent - Debug Window")
        self.root.configure(bg=COLORS["bg"])
        self.root.geometry("1000x700")
        
        # Cấu hình cửa sổ
        self.root.minsize(800, 500)
        
        # Icon (nếu có)
        try:
            if platform.system() == "Windows":
                self.root.iconbitmap(default=self._get_icon_path())
        except Exception:
            pass
        
        # Biến trạng thái
        self.status = AgentStatus()
        self.is_reading = True
        self.log_position = 0
        self.last_log_size = 0
        
        # Tạo giao diện
        self._create_widgets()
        
        # Bắt đầu đọc log
        self._start_reading()
        
        # Binding sự kiện đóng cửa sổ
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _get_icon_path(self) -> Optional[str]:
        """Lấy đường dẫn icon nếu có"""
        return None

    def _create_widgets(self):
        """Tạo các widget cho giao diện"""
        
        # ===== HEADER =====
        header_frame = tk.Frame(self.root, bg=COLORS["bg2"], height=60)
        header_frame.pack(fill=tk.X, side=tk.TOP)
        header_frame.pack_propagate(False)
        
        title_label = tk.Label(
            header_frame,
            text="🛡️ VeriChainIDS Agent - Debug Monitor",
            font=("Segoe UI", 16, "bold"),
            fg=COLORS["accent"],
            bg=COLORS["bg2"]
        )
        title_label.pack(pady=15)
        
        # ===== MAIN CONTENT =====
        content_frame = tk.Frame(self.root, bg=COLORS["bg"])
        content_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # LEFT PANEL - Stats
        left_frame = tk.Frame(content_frame, bg=COLORS["bg"])
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # RIGHT PANEL - Log
        right_frame = tk.Frame(content_frame, bg=COLORS["bg"])
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(10, 0))
        
        self._create_stats_panel(left_frame)
        self._create_log_panel(right_frame)
        self._create_blocked_ips_panel(left_frame)

    def _create_stats_panel(self, parent):
        """Tạo panel thống kê trạng thái"""
        
        # Frame trạng thái Agent
        status_frame = tk.LabelFrame(
            parent,
            text="📊 Trạng thái Agent",
            font=("Segoe UI", 11, "bold"),
            fg=COLORS["fg"],
            bg=COLORS["bg"],
            padx=15,
            pady=10
        )
        status_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Trạng thái hoạt động
        self.status_indicator = tk.Label(
            status_frame,
            text="⏳ Đang khởi tạo...",
            font=("Segoe UI", 10),
            fg=COLORS["warning"],
            bg=COLORS["bg"]
        )
        self.status_indicator.pack(anchor=tk.W, pady=(0, 10))
        
        # Grid stats
        stats_grid = tk.Frame(status_frame, bg=COLORS["bg"])
        stats_grid.pack(fill=tk.X)
        
        self.stats_labels = {}
        stats_items = [
            ("uptime", "⏱️ Uptime", "0 giây"),
            ("sent", "📤 Đã gửi", "0"),
            ("failed", "❌ Thất bại", "0"),
            ("attacks", "⚠️ Tấn công", "0"),
            ("blocked", "🚫 Đã chặn", "0"),
            ("distributed", "🌐 DDoS phân tán", "0"),
        ]
        
        for i, (key, label_text, default_val) in enumerate(stats_items):
            row = i // 2
            col = (i % 2) * 2
            
            label = tk.Label(
                stats_grid,
                text=label_text,
                font=("Segoe UI", 9),
                fg=COLORS["text_dim"],
                bg=COLORS["bg"],
                anchor=tk.W
            )
            label.grid(row=row, column=col, sticky=tk.W, padx=5, pady=3)
            
            value_label = tk.Label(
                stats_grid,
                text=default_val,
                font=("Segoe UI", 10, "bold"),
                fg=COLORS["fg"],
                bg=COLORS["bg"],
                anchor=tk.W
            )
            value_label.grid(row=row, column=col+1, sticky=tk.W, padx=5, pady=3)
            
            self.stats_labels[key] = value_label
        
        # Last update
        self.last_update_label = tk.Label(
            status_frame,
            text="Cập nhật: --",
            font=("Segoe UI", 8),
            fg=COLORS["text_dim"],
            bg=COLORS["bg"]
        )
        self.last_update_label.pack(anchor=tk.W, pady=(10, 0))
        
        # ===== ALERTS PANEL =====
        alerts_frame = tk.LabelFrame(
            parent,
            text="🚨 Cảnh báo gần đây",
            font=("Segoe UI", 11, "bold"),
            fg=COLORS["danger"],
            bg=COLORS["bg"],
            padx=15,
            pady=10
        )
        alerts_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # Scrollable alerts list
        alerts_container = tk.Frame(alerts_frame, bg=COLORS["bg"])
        alerts_container.pack(fill=tk.BOTH, expand=True)
        
        self.alerts_listbox = tk.Listbox(
            alerts_container,
            font=("Consolas", 9),
            bg=COLORS["bg2"],
            fg=COLORS["fg"],
            selectbackground=COLORS["accent"],
            selectforeground=COLORS["fg"],
            relief=tk.FLAT,
            activestyle="none"
        )
        self.alerts_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        alerts_scroll = tk.Scrollbar(alerts_container, command=self.alerts_listbox.yview)
        alerts_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.alerts_listbox.config(yscrollcommand=alerts_scroll.set)

    def _create_blocked_ips_panel(self, parent):
        """Tạo panel danh sách IP bị chặn"""
        
        blocked_frame = tk.LabelFrame(
            parent,
            text="🚫 IP bị chặn",
            font=("Segoe UI", 11, "bold"),
            fg=COLORS["danger"],
            bg=COLORS["bg"],
            padx=15,
            pady=10
        )
        blocked_frame.pack(fill=tk.X)
        
        # Scrollable blocked IPs list
        blocked_container = tk.Frame(blocked_frame, bg=COLORS["bg"])
        blocked_container.pack(fill=tk.X)
        
        self.blocked_listbox = tk.Listbox(
            blocked_container,
            font=("Consolas", 9),
            bg=COLORS["bg2"],
            fg=COLORS["success"],
            selectbackground=COLORS["accent"],
            selectforeground=COLORS["fg"],
            relief=tk.FLAT,
            activestyle="none",
            height=6
        )
        self.blocked_listbox.pack(side=tk.LEFT, fill=tk.X, expand=True)
        
        blocked_scroll = tk.Scrollbar(blocked_container, command=self.blocked_listbox.yview)
        blocked_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.blocked_listbox.config(yscrollcommand=blocked_scroll.set)
        
        # Buttons
        btn_frame = tk.Frame(blocked_frame, bg=COLORS["bg"])
        btn_frame.pack(fill=tk.X, pady=(10, 0))
        
        refresh_btn = tk.Button(
            btn_frame,
            text="🔄 Làm mới",
            font=("Segoe UI", 9),
            bg=COLORS["accent"],
            fg=COLORS["fg"],
            relief=tk.FLAT,
            padx=15,
            command=self._refresh_stats
        )
        refresh_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        clear_btn = tk.Button(
            btn_frame,
            text="🗑️ Xóa cảnh báo",
            font=("Segoe UI", 9),
            bg=COLORS["danger"],
            fg=COLORS["fg"],
            relief=tk.FLAT,
            padx=15,
            command=self._clear_alerts
        )
        clear_btn.pack(side=tk.LEFT)

    def _create_log_panel(self, parent):
        """Tạo panel hiển thị log"""
        
        log_frame = tk.LabelFrame(
            parent,
            text="📋 Log Agent",
            font=("Segoe UI", 11, "bold"),
            fg=COLORS["info"],
            bg=COLORS["bg"],
            padx=15,
            pady=10
        )
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        # Toolbar
        toolbar = tk.Frame(log_frame, bg=COLORS["bg"])
        toolbar.pack(fill=tk.X, pady=(0, 10))
        
        self.auto_scroll_var = tk.BooleanVar(value=True)
        auto_scroll_cb = tk.Checkbutton(
            toolbar,
            text="Auto-scroll",
            variable=self.auto_scroll_var,
            font=("Segoe UI", 9),
            fg=COLORS["fg"],
            bg=COLORS["bg"],
            selectcolor=COLORS["bg2"],
            activebackground=COLORS["bg"]
        )
        auto_scroll_cb.pack(side=tk.LEFT)
        
        clear_log_btn = tk.Button(
            toolbar,
            text="🗑️ Xóa hiển thị",
            font=("Segoe UI", 9),
            bg=COLORS["bg2"],
            fg=COLORS["fg"],
            relief=tk.FLAT,
            padx=10,
            command=self._clear_log_display
        )
        clear_log_btn.pack(side=tk.RIGHT)
        
        open_log_btn = tk.Button(
            toolbar,
            text="📂 Mở file log",
            font=("Segoe UI", 9),
            bg=COLORS["bg2"],
            fg=COLORS["fg"],
            relief=tk.FLAT,
            padx=10,
            command=self._open_log_file
        )
        open_log_btn.pack(side=tk.RIGHT, padx=(0, 5))
        
        # Log text area
        log_container = tk.Frame(log_frame, bg=COLORS["bg"])
        log_container.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = tk.Text(
            log_container,
            font=("Consolas", 9),
            bg=COLORS["bg2"],
            fg=COLORS["fg"],
            insertbackground=COLORS["fg"],
            relief=tk.FLAT,
            wrap=tk.WORD,
            state=tk.DISABLED
        )
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        log_scroll = tk.Scrollbar(log_container, command=self.log_text.yview)
        log_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.config(yscrollcommand=log_scroll.set)
        
        # Filter frame
        filter_frame = tk.Frame(log_frame, bg=COLORS["bg"])
        filter_frame.pack(fill=tk.X, pady=(10, 0))
        
        tk.Label(
            filter_frame,
            text="Lọc:",
            font=("Segoe UI", 9),
            fg=COLORS["text_dim"],
            bg=COLORS["bg"]
        ).pack(side=tk.LEFT, padx=(0, 5))
        
        self.filter_entry = tk.Entry(
            filter_frame,
            font=("Consolas", 9),
            bg=COLORS["bg2"],
            fg=COLORS["fg"],
            insertbackground=COLORS["fg"],
            relief=tk.FLAT
        )
        self.filter_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        self.filter_entry.bind("<KeyRelease>", lambda e: self._apply_filter())
        
        # Tag colors cho log
        self.log_text.tag_configure("ERROR", foreground=COLORS["danger"])
        self.log_text.tag_configure("WARNING", foreground=COLORS["warning"])
        self.log_text.tag_configure("INFO", foreground=COLORS["fg"])
        self.log_text.tag_configure("DEBUG", foreground=COLORS["text_dim"])
        self.log_text.tag_configure("DETECT", foreground=COLORS["danger"], font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("BLOCK", foreground=COLORS["danger"], font=("Consolas", 9, "bold"))
        self.log_text.tag_configure("ALERT", foreground=COLORS["warning"], font=("Consolas", 9, "bold"))

    def _start_reading(self):
        """Bắt đầu đọc log trong thread riêng"""
        thread = threading.Thread(target=self._read_log_loop, daemon=True)
        thread.start()
        
        # Timer cập nhật stats
        self.root.after(2000, self._update_stats)

    def _read_log_loop(self):
        """Đọc log file liên tục"""
        while self.is_reading:
            try:
                if LOG_FILE.exists():
                    current_size = LOG_FILE.stat().st_size
                    
                    # File đã bị xoay (size nhỏ hơn)
                    if current_size < self.last_log_size:
                        self.log_position = 0
                        self.last_log_size = 0
                    
                    if current_size > self.last_log_size:
                        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                            f.seek(self.log_position)
                            new_lines = f.readlines()
                            self.log_position = f.tell()
                            self.last_log_size = self.log_position
                            
                            if new_lines:
                                self._process_new_lines(new_lines)
                else:
                    # File chưa tồn tại
                    self.last_log_size = 0
                    self.log_position = 0
                    
            except Exception as e:
                pass
            
            time.sleep(0.5)

    def _process_new_lines(self, lines: list[str]):
        """Xử lý các dòng log mới"""
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Parse và hiển thị
            self._append_log_line(line)
            
            # Parse stats từ heartbeat
            self._parse_stats_from_line(line)
            
            # Parse alerts
            self._parse_alert_from_line(line)

    def _append_log_line(self, line: str):
        """Thêm dòng log vào text area"""
        def _do_append():
            filter_text = self.filter_entry.get().lower()
            
            # Apply filter
            if filter_text and filter_text not in line.lower():
                return
            
            # Enable để insert
            self.log_text.config(state=tk.NORMAL)
            
            # Xác định tag dựa trên nội dung
            tag = "INFO"
            if "[ERROR" in line or "ERROR" in line:
                tag = "ERROR"
            elif "[WARNING" in line or "WARNING" in line:
                tag = "WARNING"
            elif "[DETECT" in line:
                tag = "DETECT"
            elif "[BLOCK" in line or "[UNBLOCK" in line:
                tag = "BLOCK"
            elif "[ALERT" in line:
                tag = "ALERT"
            elif "DEBUG" in line:
                tag = "DEBUG"
            
            self.log_text.insert(tk.END, line + "\n", tag)
            
            # Giới hạn số dòng
            max_lines = 5000
            if int(self.log_text.index(tk.END).split(".")[0]) > max_lines:
                self.log_text.delete("1.0", f"{max_lines}.0")
            
            # Auto scroll
            if self.auto_scroll_var.get():
                self.log_text.see(tk.END)
            
            # Disable lại
            self.log_text.config(state=tk.DISABLED)
        
        self.root.after(0, _do_append)

    def _parse_stats_from_line(self, line: str):
        """Parse stats từ heartbeat log"""
        if "[HEARTBEAT]" in line:
            # Ví dụ: [HEARTBEAT] uptime=120s sent=500 failed=2 attacks=5 blocked=3 distributed=1
            try:
                match = re.search(r"uptime=(\d+)s", line)
                if match:
                    self.status.uptime_seconds = int(match.group(1))
                
                match = re.search(r"sent=(\d+)", line)
                if match:
                    self.status.total_sent = int(match.group(1))
                
                match = re.search(r"failed=(\d+)", line)
                if match:
                    self.status.total_failed = int(match.group(1))
                
                match = re.search(r"attacks=(\d+)", line)
                if match:
                    self.status.total_attacks = int(match.group(1))
                
                match = re.search(r"blocked=(\d+)", line)
                if match:
                    self.status.total_blocked = int(match.group(1))
                
                match = re.search(r"distributed=(\d+)", line)
                if match:
                    self.status.distributed = int(match.group(1))
                
                self.status.last_update = datetime.now()
                self.status.running = True
            except Exception:
                pass

    def _parse_alert_from_line(self, line: str):
        """Parse alert từ log và thêm vào danh sách"""
        if "[DETECT]" in line or "[ALERT]" in line:
            def _add_alert():
                # Giới hạn số alerts
                if self.alerts_listbox.size() > 100:
                    self.alerts_listbox.delete(0, 0)
                
                # Format thời gian
                try:
                    time_match = re.match(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", line)
                    if time_match:
                        time_str = time_match.group(1)[-8:]
                    else:
                        time_str = datetime.now().strftime("%H:%M:%S")
                except Exception:
                    time_str = datetime.now().strftime("%H:%M:%S")
                
                # Trích xuất attack type
                if "[DETECT]" in line:
                    match = re.search(r"\[DETECT\]\s+(\w+)", line)
                    if match:
                        attack_type = match.group(1)
                        self.alerts_listbox.insert(tk.END, f"[{time_str}] {attack_type}")
                        # Màu theo attack type
                        if "DDoS" in attack_type:
                            self.alerts_listbox.itemconfig(tk.END, fg=COLORS["danger"])
                        elif "Brute" in attack_type or "Scan" in attack_type:
                            self.alerts_listbox.itemconfig(tk.END, fg=COLORS["warning"])
                        else:
                            self.alerts_listbox.itemconfig(tk.END, fg=COLORS["fg"])
            
            self.root.after(0, _add_alert)

    def _update_stats(self):
        """Cập nhật hiển thị stats định kỳ"""
        if not self.is_reading:
            return
        
        try:
            # Uptime
            uptime_str = self._format_uptime(self.status.uptime_seconds)
            self.stats_labels["uptime"].config(text=uptime_str)
            
            # Các stats khác
            self.stats_labels["sent"].config(text=str(self.status.total_sent))
            self.stats_labels["failed"].config(text=str(self.status.total_failed))
            self.stats_labels["attacks"].config(text=str(self.status.total_attacks))
            self.stats_labels["blocked"].config(text=str(self.status.total_blocked))
            self.stats_labels["distributed"].config(text=str(self.status.distributed))
            
            # Trạng thái indicator
            if self.status.running:
                self.status_indicator.config(
                    text="✅ Agent đang hoạt động",
                    fg=COLORS["success"]
                )
            else:
                self.status_indicator.config(
                    text="⏸️ Agent chưa khởi động",
                    fg=COLORS["warning"]
                )
            
            # Last update
            if self.status.last_update:
                time_diff = (datetime.now() - self.status.last_update).total_seconds()
                if time_diff < 60:
                    update_str = f"Cập nhật: {int(time_diff)}s trước"
                else:
                    update_str = f"Cập nhật: {int(time_diff // 60)}p trước"
                self.last_update_label.config(text=update_str)
            
            # Update blocked IPs
            self._update_blocked_ips()
            
        except Exception:
            pass
        
        # Tiếp tục cập nhật
        self.root.after(1000, self._update_stats)

    def _update_blocked_ips(self):
        """Cập nhật danh sách IP bị chặn từ log"""
        # Xóa danh sách cũ
        self.blocked_listbox.delete(0, tk.END)
        
        # Tìm IPs từ log
        blocked_ips = set()
        
        try:
            if LOG_FILE.exists():
                with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        if "[BLOCK]" in line and "DA CHAN" in line:
                            match = re.search(r"\[BLOCK\]\s+([\d.]+)", line)
                            if match:
                                blocked_ips.add(match.group(1))
        except Exception:
            pass
        
        # Hiển thị
        for ip in sorted(blocked_ips):
            self.blocked_listbox.insert(tk.END, ip)

    def _format_uptime(self, seconds: int) -> str:
        """Format uptime thành chuỗi đọc được"""
        if seconds < 60:
            return f"{seconds} giây"
        elif seconds < 3600:
            return f"{seconds // 60} phút"
        elif seconds < 86400:
            hours = seconds // 3600
            mins = (seconds % 3600) // 60
            return f"{hours}h {mins}p"
        else:
            days = seconds // 86400
            hours = (seconds % 86400) // 3600
            return f"{days}d {hours}h"

    def _refresh_stats(self):
        """Làm mới stats"""
        self.status.last_update = None  # Force refresh
        self._append_log_line("[DEBUG] Đã làm mới thủ công")

    def _clear_alerts(self):
        """Xóa danh sách cảnh báo"""
        self.alerts_listbox.delete(0, tk.END)

    def _clear_log_display(self):
        """Xóa hiển thị log"""
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete("1.0", tk.END)
        self.log_text.config(state=tk.DISABLED)

    def _apply_filter(self):
        """Áp dụng filter - hiển thị lại log với filter mới"""
        # Reload log từ đầu khi filter thay đổi
        self.log_position = 0
        self.last_log_size = 0
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete("1.0", tk.END)
        self.log_text.config(state=tk.DISABLED)

    def _open_log_file(self):
        """Mở file log trong explorer"""
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            if platform.system() == "Windows":
                subprocess.run(["explorer", str(LOG_DIR)], check=False)
            else:
                subprocess.run(["xdg-open", str(LOG_DIR)], check=False)
        except Exception:
            pass

    def _on_close(self):
        """Xử lý khi đóng cửa sổ"""
        self.is_reading = False
        self.root.destroy()


def main():
    """Entry point"""
    root = tk.Tk()
    app = AgentDebugWindow(root)
    root.mainloop()


if __name__ == "__main__":
    main()

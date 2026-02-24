---
name: system-info
description: Query system information including OS version, disk usage, memory, CPU, network, and processes.
emoji: 🖥️
name_zh: 系统信息
description_zh: 系统信息查询与环境诊断
---

# System Information

## macOS / Linux

- OS: `uname -a`
- Disk: `df -h`
- Memory: `free -h` (Linux) / `vm_stat` (macOS)
- CPU: `top -l 1 | head -10` (macOS) / `top -bn1 | head -10` (Linux)
- Processes: `ps aux --sort=-%mem | head -15`
- Network: `ifconfig` or `ip addr`

## Tips

- Detect OS first with `uname -s` to decide which commands to use.
- For macOS memory, parse `vm_stat` output and multiply page counts by page size (usually 16384).
- Use `sysctl -n hw.memsize` on macOS to get total physical memory in bytes.
- Use `lscpu` on Linux for detailed CPU info.

---
name: linux-admin
description: Linux system administration quick reference for common commands, services, and troubleshooting
emoji: "\U0001F427"
name_zh: Linux 运维
description_zh: Linux 系统管理与运维指南
---

## Linux System Administration Quick Reference

Essential commands and procedures for managing Linux servers effectively.

## System Information

```bash
# OS and kernel info
uname -a                        # Full system info
cat /etc/os-release             # Distribution details
hostnamectl                     # Hostname and OS info

# Hardware info
lscpu                           # CPU details
free -h                         # Memory usage (human-readable)
df -h                           # Disk usage (human-readable)
lsblk                           # Block devices (disks, partitions)
ip addr show                    # Network interfaces and IPs

# System uptime and load
uptime                          # Uptime and load averages
w                               # Who's logged in and what they're doing
```

## User Management

```bash
# Create and manage users
useradd -m -s /bin/bash username    # Create user with home dir and bash shell
passwd username                      # Set password
usermod -aG sudo username           # Add user to sudo group
userdel -r username                 # Delete user and home directory

# View user info
id username                          # UID, GID, groups
groups username                      # List groups
whoami                               # Current user
last                                 # Login history

# SSH key setup
ssh-keygen -t ed25519 -C "email@example.com"    # Generate key pair
ssh-copy-id user@remote-host                     # Copy public key to server

# /etc/sudoers (edit with visudo only!)
username ALL=(ALL:ALL) NOPASSWD: ALL    # Passwordless sudo (use carefully)
```

## File & Permission Management

```bash
# File permissions (rwx = read, write, execute)
chmod 755 file          # rwxr-xr-x (owner: full, group/others: read+execute)
chmod 644 file          # rw-r--r-- (owner: read+write, group/others: read)
chmod +x script.sh      # Add execute permission
chown user:group file   # Change ownership
chown -R user:group dir # Change ownership recursively

# Permission reference
# 7 = rwx  6 = rw-  5 = r-x  4 = r--  0 = ---
# First digit: owner, Second: group, Third: others

# Find files
find /var/log -name "*.log" -mtime -7       # Modified in last 7 days
find / -size +100M -type f                   # Files larger than 100MB
find /home -user username -type f            # Files owned by user
```

## Process Management

```bash
# View processes
ps aux                              # All processes (snapshot)
ps aux | grep nginx                 # Find specific process
top                                 # Interactive process monitor
htop                                # Better interactive monitor (install first)

# Process control
kill PID                            # Graceful termination (SIGTERM)
kill -9 PID                         # Force kill (SIGKILL)
killall process_name                # Kill all by name
nohup command &                     # Run in background, survives logout

# Background jobs
command &                           # Run in background
jobs                                # List background jobs
fg %1                               # Bring job 1 to foreground
bg %1                               # Resume job 1 in background
```

## Service Management (systemd)

```bash
# Service control
systemctl start nginx               # Start service
systemctl stop nginx                # Stop service
systemctl restart nginx             # Restart service
systemctl reload nginx              # Reload config without restart
systemctl status nginx              # Check service status

# Enable/disable on boot
systemctl enable nginx              # Start on boot
systemctl disable nginx             # Don't start on boot
systemctl is-enabled nginx          # Check if enabled

# View logs
journalctl -u nginx                 # All logs for a service
journalctl -u nginx --since today   # Today's logs
journalctl -u nginx -f              # Follow logs (live tail)
journalctl -u nginx --no-pager -n 50  # Last 50 lines

# List all services
systemctl list-units --type=service --state=running
```

## Networking

```bash
# Network configuration
ip addr show                        # List interfaces and IPs
ip route show                       # Routing table
ss -tulpn                           # Listening ports (replaces netstat)
ss -s                               # Socket statistics summary

# DNS
dig example.com                     # DNS lookup
nslookup example.com                # Simple DNS lookup
cat /etc/resolv.conf                # DNS resolver config

# Connectivity testing
ping -c 4 example.com               # Ping (4 packets)
traceroute example.com              # Trace route to host
curl -I https://example.com         # HTTP headers only
curl -o /dev/null -s -w '%{http_code}\n' URL  # Just get status code

# Firewall (UFW - Ubuntu)
ufw status                          # Check firewall status
ufw allow 80/tcp                    # Allow HTTP
ufw allow 443/tcp                   # Allow HTTPS
ufw allow from 10.0.0.0/24         # Allow subnet
ufw deny 3306/tcp                   # Block MySQL port
ufw enable                          # Enable firewall

# Firewall (firewalld - CentOS/RHEL)
firewall-cmd --list-all             # Show current rules
firewall-cmd --permanent --add-port=80/tcp  # Allow port
firewall-cmd --reload               # Apply changes
```

## Disk & Storage

```bash
# Disk usage
df -h                               # Filesystem usage
du -sh /var/log                     # Directory size
du -sh /* | sort -rh | head -10     # Top 10 largest directories
ncdu /                              # Interactive disk usage analyzer

# Mount/unmount
mount /dev/sdb1 /mnt/data          # Mount a partition
umount /mnt/data                    # Unmount
cat /etc/fstab                      # Auto-mount configuration

# LVM basics
pvs                                 # Physical volumes
vgs                                 # Volume groups
lvs                                 # Logical volumes
lvextend -L +10G /dev/vg0/lv0      # Extend logical volume
resize2fs /dev/vg0/lv0             # Resize filesystem after extend
```

## Package Management

```bash
# Debian/Ubuntu (apt)
apt update                          # Update package list
apt upgrade                         # Upgrade installed packages
apt install package                 # Install package
apt remove package                  # Remove package
apt autoremove                      # Remove unused dependencies
apt search keyword                  # Search packages
dpkg -l | grep package              # List installed packages

# RHEL/CentOS (yum/dnf)
yum update                          # Update all packages
yum install package                 # Install package
yum remove package                  # Remove package
yum search keyword                  # Search packages
rpm -qa | grep package              # List installed packages
```

## Log Analysis

```bash
# Common log locations
/var/log/syslog          # System log (Ubuntu)
/var/log/messages        # System log (CentOS)
/var/log/auth.log        # Authentication log
/var/log/nginx/          # Nginx logs
/var/log/apache2/        # Apache logs

# Log analysis commands
tail -f /var/log/syslog             # Follow log in real-time
tail -100 /var/log/syslog           # Last 100 lines
grep "error" /var/log/syslog        # Search for errors
grep -i "fail" /var/log/auth.log    # Failed login attempts
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head  # Top IPs

# Log rotation
cat /etc/logrotate.conf             # Logrotate config
logrotate -f /etc/logrotate.conf    # Force rotation
```

## Security Hardening

```bash
# SSH hardening (/etc/ssh/sshd_config)
PermitRootLogin no                  # Disable root login
PasswordAuthentication no           # Key-based auth only
Port 2222                           # Change default port
MaxAuthTries 3                      # Limit login attempts

# After editing:
systemctl restart sshd

# Fail2ban (brute force protection)
apt install fail2ban
systemctl enable fail2ban
# Config: /etc/fail2ban/jail.local

# Automatic security updates (Ubuntu)
apt install unattended-upgrades
dpkg-reconfigure unattended-upgrades
```

## Backup & Recovery

```bash
# Tar archives
tar -czf backup.tar.gz /path/to/dir     # Create compressed archive
tar -xzf backup.tar.gz                   # Extract archive
tar -tzf backup.tar.gz                   # List archive contents

# Rsync (efficient file sync)
rsync -avz /source/ /destination/        # Local sync
rsync -avz /source/ user@host:/dest/     # Remote sync
rsync -avz --delete /src/ /dest/         # Mirror (delete extra files)

# Automated backup with cron
crontab -e
# Daily backup at 2 AM:
0 2 * * * tar -czf /backup/daily-$(date +\%Y\%m\%d).tar.gz /var/www

# Cron schedule reference
# MIN HOUR DAY MONTH WEEKDAY COMMAND
# *   *    *   *     *       command
# 0   */6  *   *     *       command  (every 6 hours)
# 30  2    1   *     *       command  (2:30 AM on the 1st of each month)
```

## Troubleshooting Checklist

When a service is down:

1. **Check if it's running**: `systemctl status service`
2. **Check logs**: `journalctl -u service --since "5 min ago"`
3. **Check ports**: `ss -tulpn | grep PORT`
4. **Check disk space**: `df -h` (full disk = most common cause)
5. **Check memory**: `free -h` (OOM killer may have killed it)
6. **Check connectivity**: `ping`, `curl`, `telnet host port`
7. **Check config**: Validate configuration files for syntax errors
8. **Check permissions**: File ownership and permissions
9. **Check DNS**: `dig domain` or `nslookup domain`
10. **Check recent changes**: `last`, `history`, git log on config repos

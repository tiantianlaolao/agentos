#!/usr/bin/env python3
"""Upload files to Tencent Cloud server via SOCKS5 proxy + SFTP."""
import sys
import os
import paramiko
import socks

PROXY_HOST = '129.211.168.244'
PROXY_PORT = 1080
PROXY_USER = 'wangsisi'
PROXY_PASS = 'Myu4wubS8b'

SSH_HOST = '129.211.168.244'
SSH_PORT = 22
SSH_USER = 'skingway'
SSH_PASS = '1q2w#E$R%T'

def upload(local_dir, remote_dir):
    sock = socks.socksocket()
    sock.set_proxy(socks.SOCKS5, PROXY_HOST, PROXY_PORT, username=PROXY_USER, password=PROXY_PASS)
    sock.settimeout(30)
    sock.connect((SSH_HOST, SSH_PORT))

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, port=SSH_PORT, username=SSH_USER, password=SSH_PASS, sock=sock, timeout=30)

    sftp = client.open_sftp()

    # Ensure remote dir exists
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        sftp.mkdir(remote_dir)

    # Upload all files in local_dir
    for fname in os.listdir(local_dir):
        local_path = os.path.join(local_dir, fname)
        if os.path.isfile(local_path):
            remote_path = f"{remote_dir}/{fname}"
            print(f"  {fname} -> {remote_path}")
            sftp.put(local_path, remote_path)

    sftp.close()
    client.close()

if __name__ == '__main__':
    local = sys.argv[1]
    remote = sys.argv[2]
    print(f"Uploading {local} -> {remote}")
    upload(local, remote)
    print("Done!")

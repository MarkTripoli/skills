#!/usr/bin/env python3
import os
import stat
import sys

MAX_BYTES = 1024 * 1024


def main():
    if len(sys.argv) != 2 or not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        return 2
    name = sys.argv[1]
    parts = name.split("/")
    if parts[-1] != ".env" and not parts[-1].startswith(".env."):
        return 2
    if os.path.isabs(name) or len(parts) > 128 or any(not part or part in (".", "..") or "\\" in part for part in parts):
        return 2
    opened_dirs = []
    fd = -1
    try:
        parent_fd = 3
        for part in parts[:-1]:
            parent_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
            opened_dirs.append(parent_fd)
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            return 2
        chunks = []
        total = 0
        while True:
            chunk = os.read(fd, min(65536, MAX_BYTES + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > MAX_BYTES:
                return 2
        sys.stdout.buffer.write(b"".join(chunks))
        return 0
    except BaseException:
        return 2
    finally:
        if fd >= 0:
            os.close(fd)
        for directory_fd in reversed(opened_dirs):
            os.close(directory_fd)

if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
import os
import select
import stat
import subprocess
import sys
import tempfile
import time
MAX_METADATA_BYTES = 32 * 1024 * 1024
MAX_METADATA_ENTRIES = 4096
MAX_WORKTREE_ENTRIES = 20_000
MAX_WORKTREE_DEPTH = 128
MAX_GIT_OUTPUT_BYTES = 12 * 1024 * 1024
MAX_METADATA_DEPTH = 128


def copy_tree(source_fd, destination, budget, relative="", depth=0):
    if depth > MAX_METADATA_DEPTH:
        raise ValueError("Git metadata depth limit exceeded")
    try:
        with os.scandir(source_fd) as entries:
            for entry in entries:
                budget["entries"] += 1
                if budget["entries"] > MAX_METADATA_ENTRIES:
                    raise ValueError("Git metadata entry limit exceeded")
                name = entry.name
                if name in (".", "..") or "/" in name or "\\" in name:
                    raise ValueError("unsafe Git metadata name")
                child_relative = f"{relative}/{name}" if relative else name
                if child_relative in ("commondir", "gitdir", "objects/info/alternates", "objects/info/http-alternates"):
                    raise ValueError("Git metadata indirection is unsupported")
                item = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
                if stat.S_ISDIR(item.st_mode):
                    child_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
                    try:
                        held = os.fstat(child_fd)
                        if held.st_dev != item.st_dev or held.st_ino != item.st_ino:
                            raise ValueError("Git metadata changed during snapshot")
                        child_destination = os.path.join(destination, name)
                        os.mkdir(child_destination, 0o700)
                        copy_tree(child_fd, child_destination, budget, child_relative, depth + 1)
                    finally:
                        os.close(child_fd)
                elif stat.S_ISREG(item.st_mode):
                    child_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_fd)
                    try:
                        held = os.fstat(child_fd)
                        if held.st_dev != item.st_dev or held.st_ino != item.st_ino or not stat.S_ISREG(held.st_mode):
                            raise ValueError("Git metadata changed during snapshot")
                        with os.fdopen(child_fd, "rb", closefd=False) as source, open(os.path.join(destination, name), "xb") as target:
                            while True:
                                chunk = source.read(min(65536, MAX_METADATA_BYTES - budget["bytes"] + 1))
                                if not chunk:
                                    break
                                budget["bytes"] += len(chunk)
                                if budget["bytes"] > MAX_METADATA_BYTES:
                                    raise ValueError("Git metadata byte limit exceeded")
                                target.write(chunk)
                    finally:
                        os.close(child_fd)
                else:
                    raise ValueError("unsupported Git metadata entry")
    except OSError as error:
        raise ValueError("Git metadata snapshot failed") from error


def copy_metadata(destination):
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        raise ValueError("safe Git metadata snapshot unavailable")
    budget = {"bytes": 0, "entries": 0}
    copy_tree(4, destination, budget)


def snapshot(destination):
    target = os.lstat(destination)
    if not stat.S_ISDIR(target.st_mode) or target.st_uid != os.getuid() or stat.S_IMODE(target.st_mode) & 0o077:
        return 2
    copy_metadata(destination)
    return 0


def check_worktree_budget(root_fd):
    work = 0

    def visit(directory_fd, depth, is_root=False):
        nonlocal work
        if depth > MAX_WORKTREE_DEPTH:
            raise ValueError("worktree depth limit exceeded")
        with os.scandir(directory_fd) as entries:
            for entry in entries:
                work += 1
                if work > MAX_WORKTREE_ENTRIES:
                    raise ValueError("worktree entry limit exceeded")
                if is_root and entry.name == ".git":
                    continue
                item = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(item.st_mode):
                    child_fd = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
                    try:
                        held = os.fstat(child_fd)
                        if held.st_dev != item.st_dev or held.st_ino != item.st_ino:
                            raise ValueError("worktree changed during enumeration")
                        visit(child_fd, depth + 1)
                    finally:
                        os.close(child_fd)

    visit(root_fd, 0, True)


def run_git(git_dir, args, check_worktree=False):
    os.environ["GIT_DIR"] = git_dir
    os.environ["GIT_WORK_TREE"] = "."
    os.environ["GIT_NO_LAZY_FETCH"] = "1"
    os.environ["GIT_NO_REPLACE_OBJECTS"] = "1"
    os.fchdir(3)
    if check_worktree and args[:1] == ["ls-files"] and "--ignored" in args:
        check_worktree_budget(3)
    process = subprocess.Popen(
        ["git", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + 8
    total = 0
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
            process.kill()
            process.wait()
            return 2
        chunk = os.read(process.stdout.fileno(), 65536)
        if not chunk:
            try:
                return process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                return 2
        total += len(chunk)
        if total > MAX_GIT_OUTPUT_BYTES:
            process.kill()
            process.wait()
            return 2
        sys.stdout.buffer.write(chunk)


def main():
    args = sys.argv[1:]
    if not args:
        return 2
    try:
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE"):
            os.environ.pop(key, None)
        if args[0] == "--snapshot" and len(args) == 2:
            return snapshot(args[1])
        if args[0] == "--git" and len(args) >= 3:
            return run_git(args[1], args[2:], check_worktree=True)
        if args[0] == "--worktree-cwd":
            args = args[1:]
        if not args:
            return 2
        os.fchdir(3)
        with tempfile.TemporaryDirectory(prefix="credential-correlation-git-") as temporary:
            git_dir = os.path.join(temporary, ".git")
            os.mkdir(git_dir, 0o700)
            copy_metadata(git_dir)
            return run_git(git_dir, args, check_worktree=True)
    except BaseException:
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

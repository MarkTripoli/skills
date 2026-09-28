#!/usr/bin/env python3
import os
import stat
import subprocess
import sys
import tempfile

GIT_ENV = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
)
MAX_METADATA_BYTES = 32 * 1024 * 1024
MAX_METADATA_ENTRIES = 4096


def copy_metadata_file(relative, destination, budget):
    parts = relative.split("/")
    parent_fd = 4
    opened_dirs = []
    try:
        try:
            for part in parts[:-1]:
                parent_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
                opened_dirs.append(parent_fd)
            fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        except FileNotFoundError:
            return
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise ValueError("unsafe Git metadata")
            with os.fdopen(fd, "rb", closefd=False) as source, open(destination, "wb") as target:
                while True:
                    chunk = source.read(min(65536, budget[0] + 1))
                    if not chunk:
                        break
                    budget[0] -= len(chunk)
                    if budget[0] < 0:
                        raise ValueError("Git metadata limit exceeded")
                    target.write(chunk)
        finally:
            os.close(fd)
    finally:
        for directory_fd in reversed(opened_dirs):
            os.close(directory_fd)

def snapshot_git_metadata(directory):
    os.mkdir(os.path.join(directory, "objects"))
    os.mkdir(os.path.join(directory, "refs"))
    os.mkdir(os.path.join(directory, "refs", "heads"))
    os.mkdir(os.path.join(directory, "info"))
    with open(os.path.join(directory, "HEAD"), "w", encoding="ascii") as head:
        head.write("ref: refs/heads/credential-scan\n")
    with open(os.path.join(directory, "config"), "w", encoding="ascii") as config:
        config.write("[core]\n\trepositoryformatversion = 0\n\tbare = false\n")
    budget = [MAX_METADATA_BYTES]
    copy_metadata_file("index", os.path.join(directory, "index"), budget)
    copy_metadata_file("info/exclude", os.path.join(directory, "info", "exclude"), budget)
    for count, entry in enumerate(os.scandir(4)):
        if count >= MAX_METADATA_ENTRIES:
            raise ValueError("Git metadata entry limit exceeded")
        name = entry.name
        oid = name.removeprefix("sharedindex.")
        if name.startswith("sharedindex.") and len(oid) in (40, 64) and all(char in "0123456789abcdef" for char in oid):
            copy_metadata_file(name, os.path.join(directory, name), budget)


def main():
    args = sys.argv[1:]
    worktree_cwd = bool(args and args[0] == "--worktree-cwd")
    if worktree_cwd:
        args = args[1:]
    if not args:
        return 2
    for key in GIT_ENV:
        os.environ.pop(key, None)
    try:
        os.fchdir(3)
        os.environ["GIT_NO_LAZY_FETCH"] = "1"
        os.environ["GIT_NO_REPLACE_OBJECTS"] = "1"
        if worktree_cwd:
            with tempfile.TemporaryDirectory(prefix="credential-correlation-git-") as temporary:
                git_dir = os.path.join(temporary, ".git")
                os.mkdir(git_dir)
                snapshot_git_metadata(git_dir)
                os.environ["GIT_DIR"] = git_dir
                os.environ["GIT_WORK_TREE"] = "."
                return subprocess.call(["git", *args], stdout=sys.stdout.buffer, stderr=subprocess.DEVNULL)
        work_tree = os.getcwd()
        os.fchdir(4)
        os.environ["GIT_DIR"] = "."
        os.environ["GIT_WORK_TREE"] = work_tree
        os.execvp("git", ["git", *args])
    except BaseException:
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

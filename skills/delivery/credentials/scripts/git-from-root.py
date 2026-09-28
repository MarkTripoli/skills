#!/usr/bin/env python3
import os
import sys

GIT_ENV = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
)


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
        fd_root = "/proc/self/fd" if sys.platform.startswith("linux") else "/dev/fd"
        if worktree_cwd:
            os.fchdir(4)
            git_dir = os.getcwd()
            os.fchdir(3)
            work_tree = os.getcwd()
            relative_git_dir = os.path.relpath(git_dir, work_tree)
            if os.path.isabs(relative_git_dir) or relative_git_dir == ".." or relative_git_dir.startswith(".." + os.sep):
                return 2
            selected_git_fd = os.open(relative_git_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=3)
            try:
                selected_git = os.fstat(selected_git_fd)
                held_git = os.fstat(4)
                if selected_git.st_dev != held_git.st_dev or selected_git.st_ino != held_git.st_ino:
                    return 2
            finally:
                os.close(selected_git_fd)
            os.environ["GIT_WORK_TREE"] = work_tree
            os.environ["GIT_DIR"] = relative_git_dir
            os.environ["GIT_COMMON_DIR"] = relative_git_dir
        else:
            os.fchdir(4)
            os.environ["GIT_DIR"] = "."
            os.environ["GIT_COMMON_DIR"] = "."
            os.environ["GIT_WORK_TREE"] = os.path.join(fd_root, "3")
        os.environ["GIT_NO_LAZY_FETCH"] = "1"
        os.environ["GIT_NO_REPLACE_OBJECTS"] = "1"
        os.execvp("git", ["git", *args])
    except BaseException:
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

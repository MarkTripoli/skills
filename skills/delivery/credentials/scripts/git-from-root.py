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
    if len(sys.argv) < 2:
        return 2
    for key in GIT_ENV:
        os.environ.pop(key, None)
    try:
        os.fchdir(3)
        work_tree = os.getcwd()
        os.fchdir(4)
        os.environ["GIT_DIR"] = "."
        os.environ["GIT_COMMON_DIR"] = "."
        os.environ["GIT_WORK_TREE"] = work_tree
        os.environ["GIT_NO_LAZY_FETCH"] = "1"
        os.environ["GIT_NO_REPLACE_OBJECTS"] = "1"
        os.execvp("git", ["git", *sys.argv[1:]])
    except BaseException:
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

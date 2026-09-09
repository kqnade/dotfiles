"""Check links in a private, immutable tree on the destination filesystem."""

import os
import stat
import sys


def target_parts(target):
    if target.startswith("/"):
        raise ValueError("link target escapes validation root")
    return target.split("/")[::-1]


def validate_link(ancestors, target):
    stack = []
    try:
        for directory_fd in ancestors:
            stack.append(os.dup(directory_fd))
        pending = target_parts(target)
        followed = 1
        while pending:
            part = pending.pop()
            if part in ("", "."):
                continue
            if part == "..":
                if len(stack) == 1:
                    raise ValueError("link target escapes validation root")
                os.close(stack.pop())
                continue
            try:
                info = os.stat(part, dir_fd=stack[-1], follow_symlinks=False)
            except FileNotFoundError:
                return
            if stat.S_ISLNK(info.st_mode):
                followed += 1
                if followed > 40:
                    raise ValueError("link chain exceeds validation limit")
                pending.extend(target_parts(os.readlink(part, dir_fd=stack[-1])))
            elif stat.S_ISDIR(info.st_mode):
                stack.append(os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=stack[-1]))
            elif stat.S_ISREG(info.st_mode) and not pending:
                return
            else:
                raise ValueError("link target traverses a non-directory or special file")
    finally:
        for directory_fd in reversed(stack):
            os.close(directory_fd)


def validate_tree(root):
    def walk(ancestors):
        directory_fd = ancestors[-1]
        with os.scandir(directory_fd) as entries:
            for entry in entries:
                info = os.stat(entry.name, dir_fd=directory_fd, follow_symlinks=False)
                if stat.S_ISLNK(info.st_mode):
                    validate_link(ancestors, os.readlink(entry.name, dir_fd=directory_fd))
                elif stat.S_ISDIR(info.st_mode):
                    child_fd = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
                    ancestors.append(child_fd)
                    try:
                        walk(ancestors)
                    finally:
                        ancestors.pop()
                        os.close(child_fd)
                elif not stat.S_ISREG(info.st_mode):
                    raise ValueError("validation tree contains a special file")

    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        walk([root_fd])
    finally:
        os.close(root_fd)


if __name__ == "__main__":
    validate_tree(sys.argv[1])
